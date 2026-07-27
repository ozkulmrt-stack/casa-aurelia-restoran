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

## Yapı

```
index.html    tüm içerik ve yapı
css/style.css tasarım sistemi (renkler, tipografi, düzen)
js/main.js    scroll animasyonları, menü sekmeleri, WhatsApp linki
fotoğraflar/  gerçek fotoğraflar buraya
```
