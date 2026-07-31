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
