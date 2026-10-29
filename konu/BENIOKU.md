# Konu radarı: internetten video fikri bulmak

Radar, bir gazete bayisini her sabah gezen yardımcı gibi çalışır: forumlarda ve trend sayfalarında bugün ne konuşuluyor, bakar. Kanalın kimliğine (`kanal/<kanal>/kimlik.json`) uyanları seçer ve kanalın biçiminde video fikrine çevirir. Kanal sahibi isterse eşiği geçen fikirden videoyu da kendisi üretir.

Ajan için iş sırası: önce bu sayfayı oku, sonra `dersler/HATALAR.md` §11'i.

## Kısaca

```
node konu/radar.js topla    oxygbio                  # siteleri tara (ücretsiz)
node konu/radar.js puanla   oxygbio                  # konuları puanla, fikir yaz (yapay zekâ, tek çağrı)
node konu/radar.js fikirler oxygbio                  # havuzu göster → kanal/oxygbio/fikirler.html
node konu/radar.js sec      oxygbio f-1a2b3c4d       # fikri seç (reddet: reddet)
node konu/radar.js uret     oxygbio f-1a2b3c4d       # metni yaz + doğrula, ilk para kapısında dur
node konu/radar.js uret     oxygbio f-1a2b3c4d --onay   # para harcayarak devam et
node konu/radar.js calistir oxygbio                  # zamanlayıcı için tek giriş (otomasyon ayarına uyar)
node konu/radar.js durum    oxygbio                  # otomasyon, bütçe, havuz
node --test konu/test/radar.test.js                  # internetsiz testler
```

Kullanıcıya fikirleri gösterirken `kanal/<kanal>/fikirler.html` dosyasını tarayıcıda aç. Yazılı liste okutma.

## Dosyalar

| Yer | Ne |
|---|---|
| `kanal/<kanal>/konu.json` | Kanalın radar ayarı: kaynaklar, anahtar ve yasak kelimeler, puan ağırlıkları, otomasyon, bütçe. Şablon: `kanal/sablon/konu.json` |
| `kanal/<kanal>/fikirler.json` | Fikir havuzu. Her fikrin durumu, puan dökümü ve kaynakları burada. Repoya girmez |
| `kanal/<kanal>/fikirler.md`, `.html` | Aynı havuz, okunur hâli. Her `puanla`, `fikirler`, `sec`, `reddet` komutunda yenilenir |
| `kayit/konu/<kanal>/ham/` | Her taramanın ham listesi |
| `kayit/konu/<kanal>/islenen.json` | Puanlanmış konular. Aynı konu iki hafta boyunca yeniden yapay zekâya gönderilmez |
| `kayit/konu/<kanal>/harcama.jsonl` | Otomasyonun harcama defteri: karakter, kredi, video |
| `kayit/konu/llm.jsonl` | Her yapay zekâ çağrısı: iş, süre, tahmini maliyet |
| `videolar/<video>/uretim.json` | Otomatik üretimin hangi adımda olduğu. Komut tekrar çalışınca kaldığı yerden devam eder |
| `kuyruk/bekleyen/*.json` | Biten videonun paylaşım kuyruğuna bıraktığı iş dosyası |

## Kaynaklar

Her kaynak `konu/kaynaklar/` içinde küçük bir dosyadır ve aynı biçimde liste döndürür: başlık, özet, adres, kaynaktaki ilgi (entry, görüntülenme, arama sayısı), zaman. Yeni kaynak eklemek için aynı biçimde bir dosya yaz ve `konu/topla.js` içindeki listeye ekle.

| Kaynak | Ne alınır | Kural |
|---|---|---|
| **Ekşi Sözlük** | gündem, debe ve kanal sayfalarındaki (ör. `kanal/bilim`) başlıklar ve o günkü entry sayısı. Entry metni ve yazar adı alınmaz | robots.txt her taramada okunur. Sayfalar arasında 4 sn beklenir. Site engellerse Türkçe uyarı verilir, diğer kaynaklar devam eder. İstersen `llm_e_gonder: false` ile başlıkları yapay zekâya göndermeyip yalnız ham liste olarak görebilirsin |
| **Reddit** | seçilen subreddit'lerin günün en iyileri | `rss` (varsayılan): herkese açık akış, tek istek. Beğeni sayısı gelmez, sıra kullanılır. Reddit'in robots.txt dosyası otomatik erişimi genel olarak kapatıyor; akış okuyucu gibi günde birkaç istekle sınırlı tut. Uyumlu yol resmî API'dir: `yontem: "api"` (aşağıda) |
| **Vikipedi** | günün en çok okunan maddeleri (tr, en) ve seçkin madde; görüntülenme ve son 5 günün eğrisi | Wikimedia'nın ücretsiz, kararlı servisi. Her gün okunan "Bilim", "Türkiye" gibi sayfalar düşük, birden yükselenler yüksek puan alır |
| **Google Trends** | ülkenin günlük arama trendleri ve ilgili haber başlıkları | herkese açık RSS |
| **X** | kendi sorgularınla son tweetler (beğeni, repost) | **Kapalı.** Yalnız resmî X API ile ve kendi anahtarınla çalışır (ücretli plan ister). |

Bütün isteklerde dürüst bir tanıtım (User-Agent) gönderilir: `video-mutfagi-konu-radari/0.1`. Radar tarayıcı taklidi yapmaz.

### Reddit API (isteğe bağlı)

1. reddit.com/prefs/apps → "create another app" → tür: **script**.
2. Çıkan `client_id` ve `secret` değerlerini sohbete yapıştırma. Masaüstüne bir txt'ye yaz; ajan bunu `~/.video-mutfagi/reddit.json` dosyasına `{"client_id": "...", "client_secret": "..."}` olarak taşır ve txt'yi siler.
3. `konu.json` → `reddit.yontem: "api"`.

### X (isteğe bağlı, önerilmez)

1. developer.x.com'da proje aç, arama izni olan bir plan seç (ücretli).
2. "Bearer token"ı `~/.video-mutfagi/x.json` dosyasına `{"bearer_token": "..."}` olarak koy (sohbete yapıştırma).
3. `konu.json` → `x.aktif: true`, `sorgular` alanına aramaları yaz.

## Puan nasıl verilir

1. **Ön eleme (ücretsiz):** Yasak kelime geçen konu atılır (kanalın konusuyla ilgisiz siyaset, futbol, magazin, ölüm haberi…). Kalanlar anahtar kelime uyumu, kaynaktaki ilgi ve tazeliğe göre sıralanır. En iyi 40 konu yapay zekâya gider. Her kaynağa en az 5 yer ayrılır.
2. **Yapay zekâ (tek çağrı):** Her konuya kanala uyum, merak ve doğrulanabilirlik puanı verir. En iyilerini kanalın biçiminde fikre çevirir: soru başlık, öncül, kanca, 3-5 tırmanış adımı (her birinde doğrulanacak bilgi), ters köşe kapanış, neden uyduğu.
3. **Son puan (10 üzerinden):** uyum %30, merak %25, doğrulanabilirlik %20, kaynaktaki ilgi %15, tazelik %10. Ağırlıklar `konu.json` → `puan.agirlik`.

Aynı fikir ikinci kez gelirse yeni fikir açılmaz, kaynakları birleşir. Reddedilen fikir reddedilmiş kalır ve yapay zekâya "bunun benzerini önerme" diye gösterilir.

**Fikir durumları:** `yeni` → `secildi` → `uretiliyor` → `uretildi`. Ayrıca `reddedildi`, bir de otomasyon insana ihtiyaç duyunca `insan-bekliyor` (sebebi fikrin notlarında yazar).

## Yapay zekâ bağlantısı

- **Varsayılan: Claude aboneliği** (`claude -p`). Claude Code kuruluysa ayrıca anahtar gerekmez. Radar, Claude'u kullanıcının kişisel ayarlarından ayrı çalıştırır: boş bir geçici klasör, `.beyin-yok` işareti, `BEYIN_V3_SKIP=1`, `--setting-sources project,local`, `--strict-mcp-config`. Böyle yapılmazsa kullanıcının kişisel kancaları (hook) her çağrıya karışır.
- **Alternatif: API anahtarı.** `ANTHROPIC_API_KEY` tanımla, repo klasöründe `npm i @anthropic-ai/sdk` çalıştır, `konu.json` → `llm.yol: "api"`. Kullandıkça ödenir. Bu yol yazıldı ama bizim makinede denenmedi.
- **Maliyet:** Bir puanlama turu tek çağrıdır, bizim denemede 1,5-2 dakika sürdü (abonelikte ek ücret yok; Claude'un kendi tahminiyle API karşılığı 0,15-0,30 $). Bir videonun metni + internette doğrulama + görsel tarifi 3-7 çağrıdır. Denemede metin 3 tur doğrulandı: 7 çağrı, ~13 dakika, API karşılığı ~3 $. Aboneliğin kullanım sınırından düşer.

## Otomasyon (kanal başına, `konu.json` → `otomasyon`)

| Seviye | Ne yapar |
|---|---|
| `kapali` | Zamanlayıcı hiçbir şey yapmaz. Şablonda varsayılan budur |
| `fikir` | Yalnız konu toplar ve puanlar. Para harcamaz |
| `uret` | Eşiği geçen fikirden videoyu baştan sona üretir, paylaşım kuyruğuna **onay bekleyen** iş bırakır |
| `tam` | Üretir ve kuyruğa **onaysız** bırakır. İki ayrı onay ister: dosyada `tam_otomatik: true` **ve** komutta `--tam-otomatik`. Biri eksikse `uret` gibi davranır. Her turda uyarı basar |

- **Eşik:** `esik.puan` (ör. 8), `esik.etkilesim_min` (kaynaktaki ilgi, 0-1), isteğe bağlı `esik.kaynak_metrik` (ör. `{"eksi.entry_bugun": 50, "vikipedi.goruntulenme": 5000}`: fikrin kaynaklarından biri bu sayıyı geçmeli). Kullanıcının `sec` ile seçtiği fikir eşiğe bakılmadan önce üretilir.
- **Günlük video sınırı:** `gunluk_en_fazla_video` (yeni hesapta 1, bkz. HATALAR §3).
- **Katman:** `ucretli` (Higgsfield resim + klip) ya da `ucretsiz`. Bkz. aşağıdaki "Dürüst not".
- **Bütçe:** `butce.video_basi_kredi`, `gunluk_kredi`, `aylik_kredi`, `gunluk_karakter`, `aylik_karakter`. **0 = harcama izni yok.** Otomasyon ancak bu sınırlar sıfırdan büyükse ElevenLabs karakteri ve Higgsfield kredisi harcar. Sınır dolunca durur, ertesi gün kaldığı yerden devam eder. Elle `uret --onay` kullanıldığında yalnız yazılmış (sıfırdan büyük) sınırlar uygulanır.
- `uret` ya da `tam` seviyesini açmak, bu sınırlar içinde kullanıcının "evet"i sayılır (AGENTS.md kural 2). Bunu kullanıcıya açıkça söyle, sınırları birlikte yaz.

### Zamanlayıcı

`calistir` tek giriş noktasıdır: topla → puanla → (seviyeye göre) üret. Aynı kanalda iki tur aynı anda çalışmaz (kilit dosyası). Windows'ta günde bir kez:

```
schtasks /Create /SC DAILY /ST 09:00 /TN "video-mutfagi-konu-oxygbio" /TR "cmd /c cd /d C:\yol\video-mutfagi && node konu/radar.js calistir oxygbio >> kayit\konu\zamanlayici.log 2>&1"
```

Mac/Linux: `crontab -e` → `0 9 * * * cd /yol/video-mutfagi && node konu/radar.js calistir oxygbio >> kayit/konu/zamanlayici.log 2>&1`.

Zamanlayıcıyı kullanıcının onayı olmadan kurma. Reddit akışı yüzünden günde birkaç turdan fazlası gereksiz.

## Otomatik üretim (`uret`)

Sıra `uretim/TARIF.md` ile aynıdır, araya yapay zekâ kontrolleri girer:

1. `videolar/<kanal>-vNN-<konu>/` klasörü `_sablon`'dan açılır.
2. **Metin:** yapay zekâ `dersler/METIN.md` kurallarına ve örnek videoya bakarak `video.json` satırlarını yazar. Anlatıcılar videodan videoya dönüşümlü seçilir.
3. **Doğrulama:** ikinci bir yapay zekâ çağrısı her bilgiyi internette arar (WebSearch/WebFetch). Yanlış ya da kaynaksız bilgi varsa metin en fazla iki kez düzeltilir. Yine geçmezse durur, fikir `insan-bekliyor` olur. `metin.md`'nin altındaki bilgi kontrol tablosu kaynak adresleriyle yazılır.
4. **Görsel tarifi:** ücretli katmanda yapay zekâ örnekteki biçimde `ucretli.json` yazar. Program tutarlılığını kontrol eder.
5. 💳 **Ses** (`uretim/ses.js`): karakter sayısı ve görüntünün tahmini kredisi gösterilir. `--onay` yoksa **burada durur**, hiçbir şey harcanmaz. Kullanıcı önce `metin.md`'yi okur. Metni beğenmezse `uret <kanal> <fikir-id> --not "..."` ile notunu verir; metin o notla yeniden yazılır ve yeniden doğrulanır (yalnız sesten önce).
6. Kelime zamanları (`kelime.py`, `.venv` ile) ve ses karışımı (`mix.js`).
7. Whisper'ın duymadığı kelimeye bağlı zaman ipucu satır başına çekilir.
8. 💳 **Resimler** (`ucretli.js gorsel`): Higgsfield'ın kesin fiyatı, bütçe kontrolü, sonra üretim. Ardından yapay zekâ temas sayfasına bakar (fazladan insan, yazı, bozuk el, tutarsız karakter). Sorun varsa klip üretilmez, durur.
9. 💳 **Klipler**, sonra **render** (`ucretli.js kurgu --render`).
10. **Denetim:** saniyede 1 kare sayfaları, `denetim/kare-denetci.md` kurallarıyla yapay zekâ puanlar. Puan `denetim_esik`'in (varsayılan 7) altındaysa durur. Rapor: `cikti/denetim/rapor.md`.
11. **Kuyruk:** `kuyruk/bekleyen/<YYYYMMDD-HHMM>-<video>.json` yazılır. Paylaşımı kuyruk yapar, radar Instagram'a hiçbir şey göndermez.

Kuyruk iş dosyası (kuyruk modülüyle sözleşme):

```json
{ "video": "videolar/<ad>", "mp4": "videolar/<ad>/cikti/<ad>-ucretli.mp4", "aciklama": "...", "ne_zaman": null, "kaynak": "konu-radari", "onay_gerekli": true }
```

`ne_zaman: null` = sıradaki boş saat. `onay_gerekli` yalnız `tam` seviyede iki onay da verilmişse `false` olur.

### Dürüst not: hangi katman otomatik çalışır

- **Ücretli katman otomatik çalışır.** Yapay zekânın yazdığı `ucretli.json` örnekle aynı biçimde, zamanlar satır sonlarına bağlı; resimler klipten önce kontrol edilir.
- **Formül katmanı otomatik çalışır, ama en genç katmandır (29.10.2026).** Yapay zekâ sahneyi bu videoya özel çizer, her satırdan iki kare alıp kendine bakar, en fazla iki kez düzeltir; sorun kalırsa en yüksek puanlı denemeyi kullanır ve kalan notları yazar. Hazır şablona düşmez; sahne kodu üç denemede de hiç çalışmazsa üretim durur ve insana haber verir. Sonucu paylaşmadan önce izle.
- **Ücretsiz katman (kodla animasyon) otomatik çalışmaz.** `sahneler.js` ancak kare kare bakıp düzelterek iyi oluyor (HATALAR §6). Ücretsiz seçildiğinde radar ses ve karışımı hazırlar, sonra `insan-bekliyor` der. Sahneleri ajan ya da insan TARIF 5a ile yazar.
- Yapay zekâ denetimi de yanılabilir (HATALAR §9). `uret` seviyesinde video paylaşılmadan önce insan izler; `tam` seviyede bu güvence yoktur.

## Örnek çıktı (oxygbio, 25.10.2026, gerçek tarama)

Tarama: Ekşi 267 başlık, Reddit 50, Vikipedi 80, Google Trends 10. Yasak kelimeyle 26 konu elendi, 40 konu yapay zekâya gitti, 6 fikir çıktı. İlk beşi:

| Puan | Fikir | Kaynak |
|---|---|---|
| 8.8 | Evrendeki bütün oksijen yok olursa Everest'in zirvesinde ne olur? | Reddit r/todayilearned (helikopterle Everest'e iniş) |
| 8.3 | Evrendeki bütün oksijen yok olursa İstanbul'da ne olur? | Vikipedi (tr) en çok okunanlar |
| 8.0 | Bir canlı nasıl görünmez olur? | Reddit r/todayilearned (deniz safiri) |
| 7.1 | Evrendeki bütün oksijen yok olursa gümüş ve altına ne olur? | Google Trends TR ("gümüş") |
| 6.8 | DNA'nı onaran sistem bir gün durursa ne olur? | Vikipedi (tr) en çok okunanlar |

Aynı gün ikinci tur (`calistir`): önceki 40 konu yeniden gönderilmedi, yalnız yeni gelenler puanlandı, 6 fikir daha eklendi (ör. 8.7 "Bir kara deliğe el feneri tutarsan ne olur?", 8.7 "Möbius şeridinin üstünde yaşasaydın ne olurdu?").

İlk fikirle `uret` denemesi (`--onay` yok): metin yazıldı, 30 bilgi internette doğrulandı (21 doğru, 9 öncülün sonucu; iki düzeltme turu), `ucretli.json` yazıldı (8 resim, 5 klip, 50 kredi bütçe). Radar ses kapısında durdu: ~1.641 ElevenLabs karakteri ve tahmini ~38 kredi gösterdi, hiçbir şey harcamadı. Bu denemeden sonra metin uzunluğu sınırı istemlere eklendi (örnek 1.070 karakterdi, deneme metni daha uzun çıktı).
