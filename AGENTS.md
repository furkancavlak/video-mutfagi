# Video Mutfağı: yapay zekâ ajanı için talimatlar

Bu repoyu bir kullanıcı sana verdi. Repo, yapay zekâyla sıfırdan dikey video (Reels/Shorts) üretir ve Instagram'a paylaşır. Kullanıcı büyük olasılıkla kod bilmiyor. Komutları sen çalıştırırsın. Kullanıcıyla sade dille, onun dilinde konuşursun, terim yerine benzetme kullanırsın.

## İlk iş

0. **İkinci beyin kuruluysa** (`ayarlar/ikinci-beyin.json` varsa) önce `node ikinci-beyin/beyin.js ozet` çalıştır ve oku. Oradaki kurallara ve kararlara uy. Bağlamda `<ikinci-beyin>` bloğu zaten varsa (Claude Code kancası) tekrar çalıştırma. Kullanıcı "selam" bile dese ilk cevapta kısaca söyle: son durum, sıradaki iş, bekleyen karar.
1. Kuyruk kuruluysa önce `node kuyruk/kuyruk.js durum` çalıştır, uyarı varsa kullanıcıya ilk iş olarak söyle (ev bilgisayarında otomasyon sessizce durabilir).
2. `node kurulum/doktor.js` çalıştır. Komut çalışmıyorsa ya da ✗ varsa `kurulum/KURULUM.md`'yi baştan sona uygula.
3. Kurulum bittiyse örnek videoyu üret (KURULUM adım 5) ve kullanıcıya izlet. Kurulumun çalıştığının kanıtı budur.
4. Kanal kimliği yoksa `kanal/KIMLIK-REHBERI.md`'ye geç. Kimlik varsa video üretimi için `uretim/TARIF.md`'ye geç.

## Değişmez kurallar

1. **Gizli bilgi sohbete ve repoya girmez.** Kurulumda `node kurulum/gizli-tara.js kur` ile commit kilidini kur. Şifre hiç istenmez. Anahtarlar (ElevenLabs, Instagram) kullanıcının masaüstüne koyduğu bir txt'den okunur, `~/.video-mutfagi/` içine taşınır, txt silinir. Anahtarı hiçbir zaman ekrana yazdırma.
2. **Para harcayan her adım önce fiyatını gösterir.** ElevenLabs karakteri ve Higgsfield kredisi bunlara girer. `ses.js` ve `ucretli.js` önce `--onay` olmadan çalıştırılır, maliyet kullanıcıya söylenir. Kullanıcı "evet" demeden `--onay` verilmez. Bütçe `ucretli.json` → `butce` alanındadır, aşılmaz.
3. **Onay kapıları.** Sıra: metin → ses → (yeni görünümse) 20-30 sn demo → video → paylaşım. Her kapıda kullanıcıya **sonucu** göster: dinlet, izlet, karesini göster. Yazılı plan ya da seçenek listesi okutma.
4. **Her render'dan sonra denetim** (`denetim/DENETIM.md`). Kullanıcı videoyu denetlenmiş ve düzeltilmiş hâliyle görür.
5. **Instagram'a kullanıcının açık onayı olmadan hiçbir şey gönderilmez.** `--kuru` ve `--hazirla` denemedir, yayınlamaz.
6. **Bilgi doğruluğu.** Ekranda ve seste geçen her bilgi metnin altındaki bilgi kontrol tablosunda kaynağıyla durur. Kaynağı bulunamayan bilgi metinden çıkar.
7. **Her aşamaya başlamadan önce `dersler/HATALAR.md` dosyasının o aşamaya ait bölümünü oku.** Oradaki hatalar bir kez yaşandı. Tekrarlanmaz.
8. **Referans kopya değildir.** Kullanıcı bir kanalı örnek gösterirse kalite çıtasını, temposunu ve yapısını al. Görüntüsünü, müziğini, logosunu ve içeriğini kopyalama.
9. **Kullanıcının dosyalarını sormadan silme.** Silmeden önce neyin silineceğini adıyla söyle ve onay al.

## Harita

| Yer | Ne |
|---|---|
| `kurulum/` | `KURULUM.md` (adım adım), `doktor.js` (her parçayı dener), `gereksinimler.txt` (sabit Python sürümleri). Ajansız kurulum: kökte `kur.cmd` / `kur.sh` |
| `ARACLAR.md` | Her aracın ne işe yaradığı, bedava mı ücretli mi, lisans ve kontrol tarihi. Kullanıcı fiyat sorarsa buradan cevap ver, eskiyse resmi sayfaya bak |
| `kanal/` | Kanal kimlikleri. `KIMLIK-REHBERI.md`, `sablon/`, dolu örnek `oxygbio/` |
| `videolar/` | Her video bir klasör. `_sablon/` yeni video için. `oxygbio-v01-ucak/` tam örnek |
| `uretim/` | `TARIF.md` (iş sırası), `ses.js`, `kelime.py`, `mix.js`, `kurgu.js` (ücretsiz), `ucretli.js` (Higgsfield), `cekirdek.js` (ortak), `motor.js` (formül: zaman ve hareket, çizim yok) |
| `marka/` | `marka-sesi.js`: açılış sesini kodla üretir, hazır sesleriyle |
| `denetim/` | `DENETIM.md`, `kareler.sh`, `kare-denetci.md` (denetçi ajanın kuralları) |
| `instagram/` | `REHBER.md` (Meta kurulumu), `paylas.js` |
| `kuyruk/` | `BENIOKU.md`, `kuyruk.js`: videolar sıraya girer, zamanlayıcı saati gelince paylaşır, sonuçları çeker |
| `dersler/` | `HATALAR.md`, `KURGU-DILI.md`, `METIN.md`, `KAPAK-BASLIK.md` (kapak, başlık, Instagram açıklaması), `FORMUL.md` (her videonun kendi çizimi) |
| `konu/` | Konu radarı: forum ve trend sitelerinden kanala uygun video fikri bulur, isterse otomatik üretir. `BENIOKU.md`, `radar.js` |
| `ikinci-beyin/` | Kanalın hafızası: profil, kararlar, düzeltmeler, video sonuçları. `BENIOKU.md`, `beyin.js`, `sablon/` |
| `kesit/` | Uzun yatay videodan dikey kısa: tanıtım (cevaptan önce kesilir) ya da en iyi an. `BENIOKU.md`, `kesit.js` |
| `stil/` | Stil kopyalama: bir kanalın kurgu dilini (kesme, zoom, geçiş, altyazı, renk, ses) videolarından ölçer, bizim videoyu onunla karşılaştırır. `BENIOKU.md`, `olc.js` |

## İkinci beyin (isteğe bağlı)

Kurulumda kanal kimliğinden sonra kullanıcıya önerilir (`kurulum/KURULUM.md` → "İkinci beyin"). Kuruluysa:

- **Düzeltme gelince** ("bunu böyle yapma", "şöyle istiyorum") sormadan yaz: `node ikinci-beyin/beyin.js kural "..." --neden "..."`.
- **Karar gelince** yaz: `karar "..." --neden "..."`. Bir referansın stilinden ölçülebilir kural çıkınca: `stil "..." --neden "..."`.
- **Video paylaşılınca** `node ikinci-beyin/beyin.js video-kaydet videolar/<video>` çalıştır. 1 gün ve 7 gün sonra `node kuyruk/kuyruk.js sonuclar` çalıştır, notlar kendiliğinden güncellenir. Sayıları kullanıcıya göster, birlikte "ne tuttu, ne tutmadı" yaz (`--tuttu "..." --tutmadi "..."`). Genel bir ders çıkarsa kural ya da karar olarak da yaz.
- **Oturum biterken** kasadaki `son-durum.md`'yi 3-5 satırla yeniden yaz, `ikinci-beyin/sablon/son-durum.md` biçiminde: `- **Son oturum:** ...`, `- **Sıradaki iş:** ...`, `- **Bekleyen karar:** ...`. Üstteki `guncellendi:` tarihini de bugüne çek.
- Tahmini gerçek gibi yazma ("tahmin:" diye başlat). Gizli bilgi yazma. Ayrıntı: `ikinci-beyin/BENIOKU.md`.

## Konu radarı (isteğe bağlı)

Kullanıcı "konu bul", "ne çeksem", "fikir öner" derse: `konu/BENIOKU.md`. Kısaca `node konu/radar.js topla <kanal>` → `puanla <kanal>` → kullanıcıya `kanal/<kanal>/fikirler.html`'i aç. Otomasyon seviyesi (`kanal/<kanal>/konu.json` → `otomasyon`) ve bütçe sınırları kullanıcıyla birlikte yazılır; tam otomatik paylaşımı kullanıcı açıkça istemeden açma.

## Uzun videodan dikey kesit (isteğe bağlı)

Kullanıcı "uzun videomdan kısa çıkar", "tanıtım reels'i", "en iyi anı kes" derse: `kesit/BENIOKU.md`. Kısaca `node kesit/kesit.js yazi <uzun.mp4>` → `sec <uzun.mp4>` → `yap <uzun.mp4> --aday 1 --kare` (karelere bak) → `yap <uzun.mp4> --aday 1`. Çıktılar uzun videonun yanındaki `<ad>-kesit/` klasörüne gider, repoya değil. Kullanıcıya videoyu izlet. Kuyruğa yalnız o isterse ekle (komutu `yap` yazar).

## Stil kopyalama (isteğe bağlı)

Kullanıcı "şu kanal gibi kurgula", "editörümün stilini kopyala", "bu videolar gibi olsun" derse: `stil/BENIOKU.md`. Kısaca: aynı kanaldan 5+ videoyu en yüksek çözünürlükte `stil/<ad>/ornekler/` içine koy → `node stil/olc.js <ad>` → uyarı varsa (düşük çözünürlük, kare hızı dönüştürülmüş) daha iyi kopya bul ve yeniden ölç → `stil/<ad>/kareler/` sayfalarını aç, sayıları gözle doğrula → `stil/<ad>/kurallar.md`'yi yaz (SABİT / SIK / ARA SIRA + felsefe ve vuruş tablosu) → render'dan sonra `node stil/olc.js karsilastir <ad> <video.mp4>`. Gözle ölçme, ölçerek bul. Referans kopya değildir (kural 8).

## Bir video klasörü

```
videolar/<kanal>-v01-<konu>/
  video.json      satırlar, roller, sesler, Whisper düzeltmeleri, Instagram açıklaması
  metin.md        okunur metin + bilgi kontrol tablosu
  ses/            01-<rol>.mp3 … · kelimeler.json (Whisper) · mix.wav + zaman.json (mix.js)
  sahneler.js     ücretsiz katman: videoya özel çizim ve hareket
  ucretli.json    ücretli katman: resimler, klipler, kurgu parçaları, bilgi etiketleri
  ucretli/        üretilen resim ve klipler (repoya girmez)
  cikti/          kareler ve videolar (repoya girmez)
```

## Formül: her videonun kendi çizimi (ücretsiz, otomatik)

`konu.json` → `otomasyon.katman: "formul"` seçilirse yapay zekâ her videonun sahnesini baştan çizer (`sahneler.js`), kendi karelerine bakıp en fazla iki kez düzeltir; olmazsa hazır şablona düşer. Kurallar `dersler/FORMUL.md`. Repo yalnız mantığı ve görünmeyen motoru (`uretim/motor.js`) verir, tek bir hazır çizim yoktur. Kanalın görünüşü `kimlik.json` → `gorsel_dil` ve `kanal/<ad>/karakter.js` içindedir; nesneler her videoda yeniden çizilir. Örnek: `videolar/oxygbio-ornek-formul/` (yalnız yapısı örnek, nesneleri kopyalanmaz). Sahne kodu korumalı kutuda çalışır (`require`, dosya, ağ yok).

## Hazır şablonla ücretsiz video (kod yazmadan)

`video.json` → `"sablon": "simulasyon"` yazılırsa sahne kodu gerekmez. Sahneyi `uretim/sablonlar/simulasyon.js` çizer: gökyüzü, kıyı ve deniz kesiti, oksijen göstergeleri, zaman cetveli. Videoya özel bilgi `simulasyon.json` dosyasına yazılır: hangi kelimede hangi yıl, kamera nereye gider, oksijen yüzde kaç, ne değişir. Metindeki her espri bir **eşyayla** ekranda gösterilir (dolmuş, dilekçe, damga, fabrika, tekne…: adımdaki `esya` alanı; çizimler `uretim/sablonlar/esya.js`'de). Alanların listesi şablon dosyasının başında yazıyor.

## Yeni sahne kodu yazarken

- **Örnek:** `videolar/oxygbio-v01-ucak/sahneler.js` çalışan, tam bir örnektir. Önce oku.
- **Zaman:** Her hareket bir kelimeye bağlanır: `cue('kelime', L[satır])`. Elle saniye yazma.
- **Çekirdeğe dokunma:** Altyazı, marka ekranları ve köşe etiketi çekirdekten gelir, sahne dosyasında yeniden yazma.
- **Kare al:** Yazdıktan sonra kareleri al (`--kare`) ve kendin bak. Kullanıcıya göstermeden önce düzelt.

## Kontrol paneli

Kullanıcı "panel", "sıraya bakayım", "takvim" ya da "sonuçlar" derse paneli başlat: `node panel/panel.js` (arka planda çalışır, terminaldeki linki kullanıcıya ver). Ayrıntı: panel/BENIOKU.md. Sunucu kullanan biri için `ayarlar/panel.json` dosyasını panel/ayar-ornek.json'dan birlikte doldurun.
