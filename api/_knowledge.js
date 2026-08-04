// Chatbot'un bilgi tabanı. index.html'deki JSON-LD bloğu (satır 32-135) ve görünür
// menü HTML'i (satır 241-354) bu dosyayla senkron tutulmalı — menü/fiyat/saat
// değiştiğinde üçünü birden güncelle.

const KNOWLEDGE = `
RESTORAN: Casa Aurelia — Nişantaşı, İstanbul'da fine-dining İtalyan restoranı. 1987'den beri.
Mutfak: İtalyan, Akdeniz. Fiyat seviyesi: ₺₺₺ (yüksek).

ÇALIŞMA SAATLERİ: Salı–Pazar 19:30–23:30. Pazartesi kapalı.
Not: Rezervasyon (masa) saatleri 19:30–22:00 arasında 30 dakikalık dilimlerdir
(19:30, 20:00, 20:30, 21:00, 21:30, 22:00). Restoran 23:30'a kadar açık kalsa da
son rezervasyon alımı 22:00'dir.

ADRES: Abdi İpekçi Caddesi, 12, 34365 Nişantaşı, İstanbul.
TELEFON: +90 212 123 45 67
E-POSTA: info@casaaurelia.it

REZERVASYON KURALLARI:
- En erken yarından, en geç bugünden itibaren 60 gün sonrasına kadar rezervasyon alınır.
- Pazartesi günleri rezervasyon alınmaz (kapalı).
- Saat sadece şu dilimlerden biri olabilir: 19:30, 20:00, 20:30, 21:00, 21:30, 22:00.
- Web formu üzerinden en fazla 12 kişilik rezervasyon yapılabilir.
- Rezervasyon oluşturmak SENİN işin değil — kullanıcıyı sitedeki rezervasyon formuna
  yönlendir ("Masa Ayırt" gibi bir eylemle). Asla kendi başına rezervasyon yaptığını iddia etme.

HİKAYEMİZ: Casa Aurelia, en otantik İtalyan sofrasını, onun ağırbaşlılığına ve
yavaşlığına saygı duyan bir mekâna taşıma isteğinden doğdu. Her tarif kesin bir
bölgesel gelenekten gelir; her akşam ilk kadehten son kaşığa kadar eksiksiz bir
hikâye olarak tasarlanır. Yemek servis etmiyoruz — hafıza servis ediyoruz: Bologna
pazarlarının, Langhe'nin şarap mahzenlerinin, Amalfi kıyısının hafızasını.

ŞEF: Bologna ve Torino arasında yetişen Şef, Michelin yıldızlı mutfaklarda öğrendiği
disiplini Casa Aurelia'ya taşıyor: az sayıda, inatla seçilmiş malzeme, kısayol
olmadan işlenir. "İtalyan mutfağının yeniden icat edilmeye ihtiyacı yok. Saygı
görmeye ihtiyacı var."

ATMOSFER: Sıcak, samimi, akşam yemeği deneyimine odaklı bir salon.

SIKÇA SORULAN SORULAR:
- Park: Kapıda vale hizmetimiz mevcut.
- Kıyafet kuralı: Resmî bir kıyafet kuralımız yok, misafirlerimiz rahatlarına göre gelebilir.
- Diyet/beslenme: Vejetaryen, vegan ve glutensiz seçeneklerimiz menüde mevcuttur.
  Belirli bir alerjen (fındık, deniz ürünü vb.) sorulursa kalem bazında kesin bilgi
  verme — telefonla teyit almalarını söyle.
- Grup / özel etkinlik: Özel etkinlikler için mekânın tamamı kiralanabilir.
  Detaylar (kapasite, fiyat, tarih uygunluğu) için telefonla ulaşmalarını söyle.
  Web formu 12 kişiye kadardır; daha kalabalık gruplar için de telefona yönlendir.
- Çocuk sandalyesi, evcil hayvan kabulü, engelli erişimi, ödeme yöntemleri (nakit/kart):
  Bu konularda kesin bilgin yok. Uydurma — "Bu konuda emin değilim, +90 212 123 45 67
  numaralı telefondan bize ulaşabilirsiniz" de.

MENÜ (fiyatlar TRY / ₺):

ANTIPASTI:
- Carpaccio di Manzo — ₺960 — El ile kesilmiş dana bonfile, 30 aylık Parmigiano
  yongaları, siyah trüf.
- Burrata Pugliese — ₺760 — El yapımı burrata, konfi kiraz domates, fesleğen,
  Puglia'dan sızma zeytinyağı.
- Vitello Tonnato — ₺880 — Ağır ateşte pişmiş dana, klasik ton balığı sosu,
  Pantelleria kapari.
- Capesante Scottate — ₺1040 — Tereyağında mühürlenmiş deniz tarağı, yerelması
  püresi, kavrulmuş fındık, taze soğan.
- Tartare di Tonno — ₺920 — El ile kesilmiş mavi yüzgeçli ton, avokado, misket
  limonu, siyah susam, yuzu sosu.

PRIMI (makarna/risotto):
- Tagliolini al Tartufo — ₺1280 — Taze yumurtalı makarna, alpin tereyağı, masada
  rendelenen kaliteli siyah trüf.
- Risotto alla Milanese — ₺1040 — Carnaroli pirinç, ilik, Navelli safranı, Barolo
  redüksiyonu.
- Agnolotti del Plin — ₺1120 — Üç çeşit kavrulmuş etle doldurulmuş, kızarmış
  tereyağı, adaçayı, olgun Parmigiano.
- Pappardelle al Cinghiale — ₺1080 — Geniş taze makarna, sekiz saat pişmiş yaban
  domuzu ragùsu, ardıç meyvesi.
- Gnocchi di Patate al Gorgonzola — ₺960 — El yapımı patates gnocchi, Gorgonzola
  DOP fondüsü, karamelize ceviz.

SECONDI (ana yemek):
- Branzino in Crosta — ₺1520 — Tuz kabuğunda pişmiş levrek, mevsim sebzeleri,
  Amalfi limonu sosu.
- Tomahawk alla Fiorentina — ₺2720 — Chianina dana, kömürde ızgara, biberiye,
  Toskana sızma zeytinyağı. 2 kişiliktir.
- Ossobuco alla Milanese — ₺1440 — Sekiz saat pişmiş dana incik, gremolata,
  safranlı risotto.
- Costoletta alla Milanese — ₺1360 — Sadeyağda kızartılmış galeta unlu dana
  pirzola, roka salatası.
- Anatra all'Arancia — ₺1560 — Mühürlenmiş ördek göğsü, acı portakal redüksiyonu,
  kereviz kökü püresi.

DOLCI (tatlı):
- Tiramisù della Casa — ₺560 — Kahveye batırılmış kedi dili bisküvi, Lodi
  mascarpone, acı kakao, orijinal 1987 tarifi.
- Panna Cotta ai Frutti di Bosco — ₺480 — Madagaskar vanilyalı panna cotta, taze
  karışık orman meyveli sos.
- Cannoli Siciliani — ₺520 — Çıtır kabuk, koyun sütü ricotta, şekerlenmiş meyve,
  Bronte fıstığı.
- Torta Caprese — ₺520 — Unsuz bitter çikolata ve badem keki, vanilyalı gelato.
- Semifreddo al Torroncino — ₺480 — Cremona nugalı semifreddo, fındık çıtırı,
  karamel sos.

VINI (şarap listesi):
- Barolo DOCG, Langhe — ₺3800 — Saf Nebbiolo, büyük meşe fıçılarda 5 yıl olgunlaştırılmış.
- Franciacorta Brut Riserva — ₺3120 — Klasik metot, Chardonnay ve Pinot Nero,
  geç dégorgement.
- Amarone della Valpolicella — ₺3520 — Kurutulmuş üzüm metodu, gövdeli, olgun
  kiraz ve tatlı baharat notaları.
- Brunello di Montalcino — ₺4400 — Sangiovese Grosso, en az 5 yıl olgunlaştırılmış,
  zarif tanenli.
- Vermentino di Gallura — ₺2080 — Mineralli Sardunya beyazı, narenciye ve Akdeniz
  makisi notaları, soğuk servis edilir.
`.trim();

module.exports = { KNOWLEDGE };
