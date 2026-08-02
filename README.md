# Casa Aurelia — Sito Web

Tek sayfalık premium restoran sitesi. Build adımı yok; düz HTML/CSS/JS, herhangi bir hosting'e olduğu gibi yüklenebilir.

## Yerelde önizleme

```bash
python3 -m http.server 8000
```

Sonra tarayıcıda `http://localhost:8000` adresini aç.

## Fotoğrafları ekleme

Şu an tüm fotoğraf alanları altın çerçeveli koyu yeşil placeholder kutular — her birinin üzerinde hangi ölçüde ve hangi görselin gideceği yazıyor (ör. "LA CASA — verticale, min 1200×1500").

Fotoğraflar hazır olunca:

1. Görselleri `fotoğraflar/` klasörüne koy (WebP formatı önerilir, ~200-500KB/foto yeterli).
2. Bana söyle — placeholder'ları gerçek `<img>` etiketleriyle değiştirip `loading="lazy"` ve doğru boyutları ekleyeceğim.

## İçerik güncelleme

`index.html` içinde değiştirilmesi gereken her yer `<!-- ===== MODIFICA QUI: ... ===== -->` yorumuyla işaretli:

- **Restoran hikayesi** (La Casa bölümü)
- **Şef biyografisi** (Lo Chef bölümü)
- **Menü** — yemek adları, açıklamalar, fiyatlar (Antipasti/Primi/Secondi/Dolci/Vini)
- **Çalışma saatleri, adres, telefon, e-posta** (Prenotazione bölümü) — şu an örnek/placeholder bilgiler

## WhatsApp numarasını değiştirme

`js/main.js` dosyasının en üstünde:

```js
const WHATSAPP_NUMBER = "390212345678"; // uluslararası format, + veya boşluk yok
const WHATSAPP_MESSAGE = "Buonasera, vorrei prenotare un tavolo da Casa Aurelia.";
```

Bu tek yeri değiştirmek hem sağ alttaki sabit butonu hem de Prenotazione bölümündeki ana butonu günceller.

## Telegram bildirimleri

Her yeni rezervasyonda (ve her iptalde) Telegram'a otomatik mesaj gidiyor. Ayrıca bottan `/bugun`, `/yarin`, `/tarih YYYY-MM-DD` komutlarıyla rezervasyon listesi sorgulanabiliyor; bildirim mesajındaki "❌ İptal Et" butonuyla da (onay adımından geçerek) rezervasyon iptal edilebiliyor.

**Nasıl çalışıyor:**
- Yeni rezervasyon / iptal bildirimleri, Supabase'de `reservations` tablosuna bağlı bir Postgres trigger'ından (`notify_telegram_reservation`, bkz. [supabase/schema.sql](supabase/schema.sql)) `pg_net` ile doğrudan Telegram API'sine gidiyor. Bot token ve chat id, tabloya değil Supabase Vault'a (`telegram_bot_token`, `telegram_chat_id` adlı secret'lar) yazılı.
- Komutlar ve iptal butonu [api/telegram.js](api/telegram.js) adlı Vercel serverless fonksiyonu üzerinden, Telegram'ın webhook mekanizmasıyla çalışıyor.

**Gerekli Vercel env değişkenleri** (Project Settings → Environment Variables):
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_WEBHOOK_SECRET` — rastgele uzun bir dize, webhook'un gerçekten Telegram'dan geldiğini doğrulamak için

**Webhook'u (yeniden) kaydetme** — token değişirse veya domain değişirse:

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<site-domaini>/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

**Bildirim gelmiyorsa:** Supabase SQL Editor'de `select * from net._http_response order by created desc limit 5;` çalıştırıp Telegram'ın döndüğü hatayı (yanlış token/chat id vb.) kontrol et.

## Yapı

```
index.html    tüm içerik ve yapı
css/style.css tasarım sistemi (renkler, tipografi, düzen)
js/main.js    scroll animasyonları, menü sekmeleri, WhatsApp linki
fotoğraflar/  gerçek fotoğraflar buraya
```
