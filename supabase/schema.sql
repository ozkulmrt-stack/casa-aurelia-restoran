-- ============================================================
-- Casa Aurelia — Reservation System
-- Applied via Supabase MCP (migration: create_reservation_system).
-- Not run by any local tooling (no supabase CLI / config.toml in
-- this repo) — kept here purely as an audit-history reference copy.
-- Project ref: abmvrreeirrczjxzakyb
-- ============================================================

-- ---------- restaurant_settings (singleton row, adjustable capacity) ----------
create table public.restaurant_settings (
  id smallint primary key default 1,
  max_guests_per_slot integer not null default 40 check (max_guests_per_slot > 0),
  updated_at timestamptz not null default now(),
  constraint restaurant_settings_singleton check (id = 1)
);

insert into public.restaurant_settings (id, max_guests_per_slot) values (1, 40);

alter table public.restaurant_settings enable row level security;
revoke all on public.restaurant_settings from anon, authenticated;
-- No RLS policies -> anon/authenticated get zero access. Only the RPC below
-- (SECURITY DEFINER) and the admin API (service_role, bypasses RLS) can read it.

-- ---------- reservations ----------
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 100),
  phone text not null check (char_length(btrim(phone)) between 4 and 30),
  reservation_date date not null,
  reservation_time time not null,
  party_size integer not null check (party_size between 1 and 20),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

-- Speeds up the capacity SUM and the admin list view.
create index reservations_slot_idx
  on public.reservations (reservation_date, reservation_time)
  where status = 'confirmed';

alter table public.reservations enable row level security;
revoke all on public.reservations from anon, authenticated;
-- No RLS policies for anon/authenticated -> direct table access denied.
-- Customer writes go exclusively through create_reservation() below.
-- Admin reads/writes go through the service_role key (bypasses RLS), used
-- only from Vercel serverless functions, never from the browser.

grant usage on schema public to anon;

-- ---------- create_reservation RPC (the only public write path) ----------
create or replace function public.create_reservation(
  p_name text,
  p_phone text,
  p_date date,
  p_time time,
  p_party_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_max_guests integer;
  v_current_total integer;
  v_new_id uuid;
begin
  -- ---- Input validation ----
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    return jsonb_build_object('success', false, 'reason', 'invalid_name');
  end if;

  if char_length(v_phone) < 4 or char_length(v_phone) > 30 then
    return jsonb_build_object('success', false, 'reason', 'invalid_phone');
  end if;

  if p_party_size is null or p_party_size < 1 or p_party_size > 20 then
    return jsonb_build_object('success', false, 'reason', 'invalid_party_size');
  end if;

  if p_date is null or p_date < current_date or p_date > current_date + 60 then
    return jsonb_build_object('success', false, 'reason', 'invalid_date');
  end if;

  -- Closed Mondays. Postgres dow: 0=Sunday .. 6=Saturday, so 1=Monday.
  if extract(dow from p_date) = 1 then
    return jsonb_build_object('success', false, 'reason', 'closed');
  end if;

  -- Must land on a 30-minute seating slot between 19:30 and 22:00 (last seating).
  if p_time is null
     or p_time < time '19:30'
     or p_time > time '22:00'
     or extract(minute from p_time)::int not in (0, 30)
     or extract(second from p_time)::int <> 0 then
    return jsonb_build_object('success', false, 'reason', 'invalid_time');
  end if;

  -- ---- Atomic capacity check ----
  -- Transaction-scoped advisory lock keyed on the exact slot, so two
  -- concurrent bookings for the same date+time can't both read the same
  -- running total before either inserts (READ COMMITTED alone would allow
  -- that race). Released automatically at the end of this call's transaction.
  perform pg_advisory_xact_lock(hashtextextended(p_date::text || '|' || p_time::text, 0));

  select max_guests_per_slot into v_max_guests
  from public.restaurant_settings
  where id = 1;

  if not found then
    raise exception 'restaurant_settings row missing';
  end if;

  select coalesce(sum(party_size), 0) into v_current_total
  from public.reservations
  where reservation_date = p_date
    and reservation_time = p_time
    and status = 'confirmed';

  if v_current_total + p_party_size > v_max_guests then
    return jsonb_build_object('success', false, 'reason', 'full');
  end if;

  insert into public.reservations (customer_name, phone, reservation_date, reservation_time, party_size)
  values (v_name, v_phone, p_date, p_time, p_party_size)
  returning id into v_new_id;

  return jsonb_build_object('success', true, 'id', v_new_id);
end;
$$;

revoke all on function public.create_reservation(text, text, date, time, integer) from public;
grant execute on function public.create_reservation(text, text, date, time, integer) to anon;

-- ============================================================
-- Telegram bildirimleri (migration: telegram_reservation_notifications)
-- Yeni rezervasyon / iptal olduğunda pg_net ile Telegram'a mesaj atar.
-- Token/chat id vault.secrets'ten okunur ('telegram_bot_token',
-- 'telegram_chat_id') — burada asla açık yazılmaz.
-- ============================================================

create extension if not exists pg_net;

create or replace function public.notify_telegram_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  v_token text;
  v_chat_id text;
  v_source text;
  v_day_name text;
  v_month_name text;
  v_date_tr text;
  v_time_str text;
  v_slot_total integer;
  v_action text;
  v_emoji text;
  v_text text;
  v_reply_markup jsonb;
  v_row public.reservations%rowtype;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  select decrypted_secret into v_chat_id from vault.decrypted_secrets where name = 'telegram_chat_id';

  if v_token is null or v_chat_id is null then
    return new;
  end if;

  v_row := new;
  v_action := case when tg_op = 'INSERT' then 'insert' else 'cancel' end;

  v_source := case coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '')
    when 'service_role' then 'Admin paneli'
    when 'anon' then 'Web sitesi'
    else 'Bilinmiyor'
  end;

  v_day_name := (array['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'])[extract(dow from v_row.reservation_date)::int + 1];
  v_month_name := (array['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'])[extract(month from v_row.reservation_date)::int];
  v_date_tr := extract(day from v_row.reservation_date)::text || ' ' || v_month_name || ' ' || extract(year from v_row.reservation_date)::text || ' ' || v_day_name;
  v_time_str := to_char(v_row.reservation_time, 'HH24:MI');

  select coalesce(sum(party_size), 0) into v_slot_total
  from public.reservations
  where reservation_date = v_row.reservation_date
    and reservation_time = v_row.reservation_time
    and status = 'confirmed';

  if v_action = 'insert' then
    v_emoji := '🍝';
    v_text := v_emoji || ' *Yeni Rezervasyon*' || E'\n\n'
      || '👤 ' || v_row.customer_name || E'\n'
      || '📞 ' || v_row.phone || E'\n'
      || '📅 ' || v_date_tr || E'\n'
      || '🕗 ' || v_time_str || E'\n'
      || '👥 ' || v_row.party_size || ' kişi' || E'\n'
      || '📍 Kaynak: ' || v_source || E'\n'
      || '📊 Bu slotta toplam: ' || v_slot_total || ' kişi';
    v_reply_markup := jsonb_build_object(
      'inline_keyboard', jsonb_build_array(
        jsonb_build_array(
          jsonb_build_object('text', '❌ İptal Et', 'callback_data', 'cancel:' || v_row.id::text)
        )
      )
    );
  else
    v_emoji := '🚫';
    v_text := v_emoji || ' *Rezervasyon İptal Edildi*' || E'\n\n'
      || '👤 ' || v_row.customer_name || E'\n'
      || '📞 ' || v_row.phone || E'\n'
      || '📅 ' || v_date_tr || E'\n'
      || '🕗 ' || v_time_str || E'\n'
      || '👥 ' || v_row.party_size || ' kişi' || E'\n'
      || '📍 Kaynak: ' || v_source;
    v_reply_markup := null;
  end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object(
      'chat_id', v_chat_id,
      'text', v_text,
      'parse_mode', 'Markdown',
      'reply_markup', v_reply_markup
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_notify_telegram_insert on public.reservations;
create trigger trg_notify_telegram_insert
  after insert on public.reservations
  for each row
  execute function public.notify_telegram_reservation();

drop trigger if exists trg_notify_telegram_cancel on public.reservations;
create trigger trg_notify_telegram_cancel
  after update of status on public.reservations
  for each row
  when (old.status is distinct from new.status and new.status = 'cancelled')
  execute function public.notify_telegram_reservation();

-- ============================================================
-- Rezervasyona e-posta alanı (migration: add_reservation_email)
-- ⚠️ HENÜZ CANLIYA UYGULANMADI — yalnızca hazırlanmış SQL. Deploy kararı
-- verildiğinde Supabase MCP ile uygulanacak, sonra bu uyarı satırı silinecek.
--
-- create_reservation() bir aşırı yükleme (overload) olarak değil, tamamen
-- yeniden yaratılıyor: `create or replace` parametre eklemeye izin vermez —
-- eski 5 parametreli imzayı bırakırsa PostgREST hâlâ ona çözümleyip
-- e-postasız çağrıları sessizce kabul etmeye devam eder. Bu yüzden önce
-- `drop function`, sonra yeni imzayla `create function`, sonra `grant`i
-- yeni argüman listesiyle tekrar yazıyoruz.
-- ============================================================

alter table public.reservations
  add column email text
  check (email is null or (
    char_length(btrim(email)) between 3 and 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ));

drop function public.create_reservation(text, text, date, time, integer);

create function public.create_reservation(
  p_name text,
  p_phone text,
  p_email text,
  p_date date,
  p_time time,
  p_party_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_max_guests integer;
  v_current_total integer;
  v_new_id uuid;
begin
  -- ---- Input validation ----
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    return jsonb_build_object('success', false, 'reason', 'invalid_name');
  end if;

  if char_length(v_phone) < 4 or char_length(v_phone) > 30 then
    return jsonb_build_object('success', false, 'reason', 'invalid_phone');
  end if;

  if char_length(v_email) < 3 or char_length(v_email) > 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('success', false, 'reason', 'invalid_email');
  end if;

  if p_party_size is null or p_party_size < 1 or p_party_size > 20 then
    return jsonb_build_object('success', false, 'reason', 'invalid_party_size');
  end if;

  if p_date is null or p_date < current_date or p_date > current_date + 60 then
    return jsonb_build_object('success', false, 'reason', 'invalid_date');
  end if;

  -- Closed Mondays. Postgres dow: 0=Sunday .. 6=Saturday, so 1=Monday.
  if extract(dow from p_date) = 1 then
    return jsonb_build_object('success', false, 'reason', 'closed');
  end if;

  -- Must land on a 30-minute seating slot between 19:30 and 22:00 (last seating).
  if p_time is null
     or p_time < time '19:30'
     or p_time > time '22:00'
     or extract(minute from p_time)::int not in (0, 30)
     or extract(second from p_time)::int <> 0 then
    return jsonb_build_object('success', false, 'reason', 'invalid_time');
  end if;

  -- ---- Atomic capacity check ----
  -- Transaction-scoped advisory lock keyed on the exact slot, so two
  -- concurrent bookings for the same date+time can't both read the same
  -- running total before either inserts (READ COMMITTED alone would allow
  -- that race). Released automatically at the end of this call's transaction.
  perform pg_advisory_xact_lock(hashtextextended(p_date::text || '|' || p_time::text, 0));

  select max_guests_per_slot into v_max_guests
  from public.restaurant_settings
  where id = 1;

  if not found then
    raise exception 'restaurant_settings row missing';
  end if;

  select coalesce(sum(party_size), 0) into v_current_total
  from public.reservations
  where reservation_date = p_date
    and reservation_time = p_time
    and status = 'confirmed';

  if v_current_total + p_party_size > v_max_guests then
    return jsonb_build_object('success', false, 'reason', 'full');
  end if;

  insert into public.reservations (customer_name, phone, email, reservation_date, reservation_time, party_size)
  values (v_name, v_phone, v_email, p_date, p_time, p_party_size)
  returning id into v_new_id;

  return jsonb_build_object('success', true, 'id', v_new_id);
end;
$$;

revoke all on function public.create_reservation(text, text, text, date, time, integer) from public;
grant execute on function public.create_reservation(text, text, text, date, time, integer) to anon;

-- ---- Telegram trigger: e-posta satırı eklendi ----
-- coalesce ile NULL-safe (e-posta yoksa mesaj tamamen boşalmasın diye —
-- fonksiyon `exception when others then return new` ile sarılı, düz `||`
-- birleştirmede bir NULL tüm mesajı NULL yapar ve hata da görünmez).
-- E-posta backtick içine alınıyor: alt çizgi içeren adresler (ali_veli@x.com)
-- Markdown'ı bozup Telegram'ın mesajın tamamını reddetmesine yol açabilir.
create or replace function public.notify_telegram_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  v_token text;
  v_chat_id text;
  v_source text;
  v_day_name text;
  v_month_name text;
  v_date_tr text;
  v_time_str text;
  v_slot_total integer;
  v_action text;
  v_emoji text;
  v_text text;
  v_reply_markup jsonb;
  v_row public.reservations%rowtype;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  select decrypted_secret into v_chat_id from vault.decrypted_secrets where name = 'telegram_chat_id';

  if v_token is null or v_chat_id is null then
    return new;
  end if;

  v_row := new;
  v_action := case when tg_op = 'INSERT' then 'insert' else 'cancel' end;

  v_source := case coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '')
    when 'service_role' then 'Admin paneli'
    when 'anon' then 'Web sitesi'
    else 'Bilinmiyor'
  end;

  v_day_name := (array['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'])[extract(dow from v_row.reservation_date)::int + 1];
  v_month_name := (array['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'])[extract(month from v_row.reservation_date)::int];
  v_date_tr := extract(day from v_row.reservation_date)::text || ' ' || v_month_name || ' ' || extract(year from v_row.reservation_date)::text || ' ' || v_day_name;
  v_time_str := to_char(v_row.reservation_time, 'HH24:MI');

  select coalesce(sum(party_size), 0) into v_slot_total
  from public.reservations
  where reservation_date = v_row.reservation_date
    and reservation_time = v_row.reservation_time
    and status = 'confirmed';

  if v_action = 'insert' then
    v_emoji := '🍝';
    v_text := v_emoji || ' *Yeni Rezervasyon*' || E'\n\n'
      || '👤 ' || v_row.customer_name || E'\n'
      || '📞 ' || v_row.phone || E'\n'
      || '📧 `' || coalesce(v_row.email, '—') || '`' || E'\n'
      || '📅 ' || v_date_tr || E'\n'
      || '🕗 ' || v_time_str || E'\n'
      || '👥 ' || v_row.party_size || ' kişi' || E'\n'
      || '📍 Kaynak: ' || v_source || E'\n'
      || '📊 Bu slotta toplam: ' || v_slot_total || ' kişi';
    v_reply_markup := jsonb_build_object(
      'inline_keyboard', jsonb_build_array(
        jsonb_build_array(
          jsonb_build_object('text', '❌ İptal Et', 'callback_data', 'cancel:' || v_row.id::text)
        )
      )
    );
  else
    v_emoji := '🚫';
    v_text := v_emoji || ' *Rezervasyon İptal Edildi*' || E'\n\n'
      || '👤 ' || v_row.customer_name || E'\n'
      || '📞 ' || v_row.phone || E'\n'
      || '📧 `' || coalesce(v_row.email, '—') || '`' || E'\n'
      || '📅 ' || v_date_tr || E'\n'
      || '🕗 ' || v_time_str || E'\n'
      || '👥 ' || v_row.party_size || ' kişi' || E'\n'
      || '📍 Kaynak: ' || v_source;
    v_reply_markup := null;
  end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object(
      'chat_id', v_chat_id,
      'text', v_text,
      'parse_mode', 'Markdown',
      'reply_markup', v_reply_markup
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  return new;
exception when others then
  return new;
end;
$$;
