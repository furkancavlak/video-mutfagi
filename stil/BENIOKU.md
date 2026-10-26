# Stil kopyalama: bir kanalın kurgu dilini ölçmek

Beğendiğin bir kanalın ya da kendi editörünün videoları nasıl kurgulanıyor? Ne sıklıkla kesiyor, nasıl zoom yapıyor, hangi geçişi seçiyor, altyazısı nasıl, hangi sesi koyuyor? Bu modül bunu **gözle değil, ölçerek** bulur. Terzi gibi: göz kararı değil, mezura.

Sonra aynı ölçüyü **bizim videomuza** da uygular ve farkı gösterir: "Referans 1 kare beyaz flaş kullanıyor, bizde yok."

Her şey senin bilgisayarında, bedava çalışır (ffmpeg + Node). İnternete bir şey gönderilmez, para harcanmaz.

> **Referans kopya değildir** (`AGENTS.md`, kural 8). Ölçülen şey kurgu dilidir: tempo, ritim, geçiş, yazı biçimi. Başkasının görüntüsü, müziği, logosu ve içeriği alınmaz.

## Ne ölçer

| Konu | Ölçülen |
|---|---|
| Kesme | Her geçişin zamanı ve türü: düz kesme, beyaz flaş (kaç kare), kararma, whip (hızlı kaydırma), kesmeden sonra bulanıktan nete giriş. Plan süresi, dakikada geçiş. |
| Zoom | Her çekimde: açılışta "punch-in" (yakın başlayıp hızla geri çekilme: başlangıç ölçeği ve süresi), sonra yavaş zoom ritmi (en geniş 1.00 sayılır; üst ölçek, ne kadar sürede dönüyor). |
| Altyazı | Sabit bant nerede, harf boyu, harf gövdesi (kalınlık), ince + kalın ikilisi ve kalın bloğun yeri (satır başı / sonu), kontur, kart başına kelime ve satır, kart süresi, kart geçişi kaç kare, kutu (kart) üstünde mi. |
| Yazı belirme | Başlık ve etiketler kaç saniyede beliriyor, nasıl (anında, solarak, bulanıktan nete). Paragraf satır satır mı açılıyor, satırlar arası kaç saniye. |
| Renk | Baskın renkler (palet), zemin rengi, vurgu rengi, açık / koyu zemin payı. |
| Ses | Ses yüksekliği (LUFS), efektler ve türleri: **bas** (alçak "bum"), **ton** (ding, çan), **hışırtı** (whoosh), **geniş** (çarpma). Hangi geçişte hangi ses. Konuşma efekt sayılmaz. |
| Konuşma (isteğe bağlı) | `--konusma` ile: dakikada kelime, kesmeler kelime başına mı denk geliyor. Whisper gerekir (kurulumdaki `.venv`). |
| Güven | Kaynak düşük çözünürlüklüyse ya da kare hızı dönüştürülmüşse (ör. 30 fps → 25 fps) **uyarır** ve o videonun yazı ölçülerini ve sürelerini özete katmaz. |

## Komutlar

```
node stil/olc.js <ad>                          stil/<ad>/ornekler/ içindeki bütün videoları ölçer
node stil/olc.js <ad> a.mp4 b.mp4 ...          verilen videoları ölçer
     --konusma                                  konuşmayı da ölçer (Whisper, yavaş)
     --esik 0.3                                 kesme hassasiyeti (küçük = daha çok kesme)
     --en-fazla 300                             her videonun en çok bu kadar saniyesi
node stil/olc.js karsilastir <ad> <video.mp4>   bir videoyu (genelde bizim render) bu stille karşılaştırır
node --test stil/test/olc.test.js               ölçümün doğruluk testi (~30 sn)
```

Bir video ölçümü videonun uzunluğu kadar sürer (1080p, 60 sn video ≈ 1-1,5 dk).

## Nereye ne yazılır

| Yer | Ne | Git'e girer mi |
|---|---|---|
| `stil/<ad>/ornekler/` | Örnek videolar (sen koyarsın) | Hayır |
| `stil/<ad>/olcum.json` | Her videonun bütün sayıları + özet (SABİT / SIK / ARA SIRA) | Evet |
| `stil/<ad>/kareler/` | Kontak sayfaları (aşağıda) | Hayır |
| `stil/<ad>/kurallar.md` | Ajanın yazdığı kurallar ve felsefe (adım 4) | Evet |
| `stil/<ad>/karsilastirma/` | Bizim videonun ölçümü ve kareleri | Hayır |

Kontak sayfaları (`kareler/`), `v1` = birinci video:

| Dosya | Ne gösterir |
|---|---|
| `v1-genel.jpg` | Videodan eşit aralıklı 24 kare |
| `v1-kesmeler.jpg` | Her çekimin ilk karesi |
| `v1-gecisler.jpg` | Her geçiş, 2 kare önceden 5 kare sonrasına, kare numaralı (flaş, whip burada görünür) |
| `v1-yazilar.jpg` | Altyazı kartları tam çözünürlükte (font, kontur, ince / kalın) |
| `v1-yazi-hareketi.jpg` | Altyazı değişimleri kare kare |
| `v1-yazi-belirme-1.jpg` … | Başlık / paragraf belirmesi, tam çözünürlükte kare kare, kare numaralı |

## Adım adım

### 1. Örnek topla

- **En az 5 video** aynı kanaldan / aynı editörden. 5'ten azsa kurallar "SABİT mi, tesadüf mü" ayıramaz.
- **En yüksek çözünürlüğü al.** Instagram ve YouTube için ücretsiz `yt-dlp` aracı: `yt-dlp -f "bv*+ba/b" <link>`. Ekran kaydı alma, videoyu yeniden sıkıştırma, başka bir uygulamadan "indir" deme: bunlar çözünürlüğü ve kare hızını bozar. Bazı eski reels yalnız 360p'dir; o zaman aynı editörün daha yeni, 1080p videolarını seç.
- **Mümkünse bir ham çekim** (editörün kurgulamadan önceki hâli). Kendi editörünse ondan iste. Ham çekim olmadan renk ayarı ve sabit kırpma ölçülemez (aşağıda "Ne ölçemez").
- Videoları `stil/<ad>/ornekler/` içine koy. `<ad>`: küçük harf, rakam, tire (ör. `referans-kanal`).
- Platformun kullanım şartlarına uy: videolar yalnız ölçüm içindir, paylaşılmaz, repoya girmez.

### 2. Ölç

```
node stil/olc.js <ad>
```

Önce **uyarılara** bak. `! Kaynak düşük çözünürlüklü` ya da `! Kare hızı dönüştürülmüş` yazıyorsa o video aslı değildir. Aynı videonun daha iyi kopyasını bul ve yeniden ölç. Bu uyarıyı geçiştirme: bir keresinde başlığın belirme süresi 360p, 25 fps'e çevrilmiş bir kopyadan 0,18 sn ölçüldü; aslında 0,35 sn'ydi.

### 3. Kareleri aç, sayıyı gözle doğrula

`stil/<ad>/kareler/` içindeki sayfaları aç ve kullanıcıya da göster. Ölçüm "flaş 1 kare" diyorsa `v1-gecisler.jpg`'de beyaz kareyi gör. "Kalın blok satır sonunda" diyorsa `v1-yazilar.jpg`'de bak. Göz **doğrulamak** içindir, ölçmek için değil: gözün 0,15 sn'lik bir bulanıklığı "efekt yok" diye görür.

Yazı tipini sayfalardan sen bulursun (ölçüm yalnız boy, kalınlık ve kontur verir): en yakın ücretsiz fontu Türkçe harf kapsamıyla seç.

### 4. Kuralları yaz

`stil/<ad>/kurallar.md` dosyasını yaz. Özetteki her özellik zaten bir katmana ayrılmış gelir:

- **SABİT** (5/5 videoda): her videoda yapılır. Motor bunu kendiliğinden yapmalı.
- **SIK** (3-4/5): çoğu videoda. Varsayılan ama atlanabilir.
- **ARA SIRA** (1-2/5): bir araç, kural değil.

Her kural bir sayıyla yazılır: "Zoom 1.00 ↔ 1.10 arası gider, bir yönü ~1,8 sn" — "hafif zoom" değil.

Sonra **felsefe**: editör neden böyle kesiyor? Bunun için bir videonun metnini cümle cümle **vuruş tablosu**na dök. Her cümleye bir etiket ver ve o cümlede editörün ne yaptığını yaz:

| Cümle | Etiket | Editör ne yaptı |
|---|---|---|
| "Üç ayda iki katına çıktık." | KANIT | Grafik: büyük rakam, 4 sn |
| "Ama asıl mesele şu." | İLİŞKİ | Kamerada kaldı, punch-in |
| "Önce izledik, sonra ölçtük, sonra kopyaladık." | SÜREÇ | Paragraf satır satır |

Etiketler: **İLİŞKİ** (izleyiciyle konuşma, kamera), **KANIT** (sayı, ekran görüntüsü), **LİSTE**, **SÜREÇ** (adımlar), **KAVRAM** (soyut fikir), **NESNE** (bir şey gösteriliyor). Felsefe bu tablodan çıkan "ne zaman grafik, ne zaman kamera" kararıdır.

İkinci beyin kuruluysa ölçülebilir kuralları oraya da yaz: `node ikinci-beyin/beyin.js stil "Kesmede 1 kare beyaz flaş" --neden "5/5 videoda, olcum.json"`.

### 5. Kendi videomuzu karşılaştır

Render'dan sonra:

```
node stil/olc.js karsilastir <ad> videolar/<video>/cikti/<video>.mp4
```

Her ölçü için ✓ / ✗ ve hedef aralık, her SABİT özellik için "bu videoda var / yok" yazar. ✗ olanları düzelt, yeniden render et, yeniden karşılaştır. Kullanıcıya iki videoyu yan yana izlet.

### 6. (İsteğe bağlı) Kör test

Kuralların işe yarayıp yaramadığını görmek için: aynı metni iki ajan planlasın, biri kuralları görsün, öteki görmesin. Cevap anahtarını (editörün gerçekte ne yaptığını) önceden yaz ve değiştirilemesin diye özetini (sha256) kaydet. Puanı üçüncü, bağımsız bir ajan versin.

## Örnek: gerçek bir editörün reels'i, ölçülerek

Bu yöntem önce elle, gerçek bir editörün reels'i üzerinde uygulandı (kamera karşısında konuşan biri + araya giren grafikler). Gözle bakınca "sabit yakın kırpma, renk ayarı, whoosh sesi" sanıldı. Ölçünce **hiçbiri** çıkmadı. Ölçülen dil:

- **Kamera ilişki, grafik bilgi.** 60 sn'de 4-6 grafik, her biri en az 4 sn. Açılış kancası, çağrı ve son 10-25 sn kamerada.
- **Zoom:** 1.00 ↔ 1.10 ritmi. Açılışta ve kameraya her dönüşte punch-in: 1.22 → 1.00.
- **Geçiş:** kamera → grafik 1 kare beyaz flaş + bulanıktan nete; grafik → kamera ışık sızması; grafik → grafik whip.
- **Ses:** alçak "bum". Müzik yok.
- **Renk ayarı yok, sabit kırpma yok.**
- **Altyazı:** 50 / 68 / 120 px; ince (320) + çok kalın (760) ikili; kalın blok satırın ucuna yaslanır; harflerde ince koyu kontur. Altyazı geçişi animasyonsuz kesme.
- **Yazı belirme:** başlık kelimeleri ~0,35 sn bulanık / soluk kalıp yavaş netleşir; paragraf satır satır, ~0,7 sn'de açılır. (İlk ölçüm 360p'nin 25 fps'e çevrilmiş kopyasından yapılmıştı ve 0,18 sn çıkmıştı: yanlış.)
- **Kör test:** kuralları görmeyen ajan 60 sn'ye 37 grafik koydu, editör 8. Editörü ayıran "ne anlatıldığı" değil, **ölçülülük ve biçim**.

`stil/test/sentetik.js` bu sayıların aynısıyla yapay test videoları üretir; ölçüm aracı bunlarda doğrulanır.

## Doğruluk (sentetik test, 26.10.2026)

Kurgusu bilerek kurulmuş 12 sn'lik 1080x1920 videolar (30 fps ve 25 fps) ölçüldü:

| Ölçü | Doğru | Ölçülen |
|---|---|---|
| Geçişler | 4,0 flaş · 8,0 whip · 10,0 düz | aynı, türleriyle |
| Beyaz flaş | 1 kare | 1 kare |
| Punch-in | 1.22, %90'ı 0,214 sn | 1.22, 0,22 sn |
| Zoom ritmi | 1.10, yarım tur 1,8 sn | 1.10, 1,8 sn |
| Altyazı harf boyu / kontur | 50 px / 3 px | 50 / 3 |
| İnce / kalın gövde | 6 / 12 px (oran 2,0), kalın sonda | 6 / 11 (1,83), sonda |
| Başlık belirme | 0,367 sn, bulanıktan nete | 0,367 sn, bulanıktan nete |
| Paragraf | 3 satır, 0,267 sn arayla, 0,7 sn | 3 satır, 0,25 sn, 0,7 sn |
| Ses | bum 4,0 ve 10,0 · whoosh 7,95 | bum 3,98 ve 9,99 · hışırtı 7,93 |

Aynı videonun 360p / 25 fps kopyasında geçişler, zoom ve ses yine doğru çıkar; harf ölçüleri bozulur (gövde 6 / 12 yerine 3 / 9, kalınlık oranı 2,0 yerine 3,0, kontur 3 yerine 5). Araç bu kopyayı "düşük çözünürlük" ve "her 5 karede bir atlanmış kare" diye uyarır ve yazı ölçülerini ve sürelerini özete katmaz. Testi kendin çalıştır: `node --test stil/test/olc.test.js`.

## Ne ölçemez (dürüstçe)

- **Müzik var mı yok mu:** konuşmayla müziği ayırmaz. Efektin ne olduğunu değil, türünü (bum / ton / hışırtı / geniş) söyler. Kulakla doğrula.
- **Renk ayarı ve sabit kırpma:** kurgulanmış videodan tek başına ölçülemez; ham çekimle yan yana kare gerekir. Araç yalnız paleti verir.
- **Işık sızması** geçişini tanımaz (düz kesme ya da başka bir şey görünür). Kareden bak.
- **Hareketli görüntü üstünde beliren yazının** süresini ölçmez (altındaki her şey değişir). Atlanan sayısı `yazi_belirme.hareketli_zeminde_olculmedi`'de yazar.
- **Yazı tipinin adı:** yalnız boy, kalınlık, kontur. Font eşlemesi karelerden yapılır.
- **Kart başına kelime ±1:** sıkışık fontlarda kelime arası harf arasına çok yakındır. Kesin sayı için `--konusma`.
- **Sürekli hareket eden animasyon** (ör. bizim simülasyon şablonu): zoom izlenemez, `izlenemedi` yazar. Zoom ölçümü kamera çekimi ve durağan grafik için yapılmıştır.
- **Punch'ın merkezi:** yüze doğru zoom, ölçek + kayma olarak görünür; ölçek doğrudur, merkez ayrıca raporlanmaz.
- **Punch süresi** "%90'ının bittiği an"dır (yavaşlayarak biten hareketin sonu belirsizdir).
- Altyazı bandı yoksa (yazı her yerde) altyazı ölçüleri çıkmaz; başlıklar yine "yazı belirme" olarak ölçülür.
