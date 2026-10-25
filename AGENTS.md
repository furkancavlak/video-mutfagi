# Video Mutfağı: yapay zekâ ajanı için talimatlar

Bu repoyu bir kullanıcı sana verdi. Repo, yapay zekâyla sıfırdan dikey video (Reels/Shorts) üretir ve Instagram'a paylaşır. Kullanıcı büyük olasılıkla kod bilmiyor. Komutları sen çalıştırırsın. Kullanıcıyla sade dille, onun dilinde konuşursun, terim yerine benzetme kullanırsın.

## İlk iş

0. Kuyruk kuruluysa önce `node kuyruk/kuyruk.js durum` çalıştır, uyarı varsa kullanıcıya ilk iş olarak söyle (ev bilgisayarında otomasyon sessizce durabilir).
1. `node kurulum/doktor.js` çalıştır. Komut çalışmıyorsa ya da ✗ varsa `kurulum/KURULUM.md`'yi baştan sona uygula.
2. Kurulum bittiyse örnek videoyu üret (KURULUM adım 5) ve kullanıcıya izlet. Kurulumun çalıştığının kanıtı budur.
3. Kanal kimliği yoksa `kanal/KIMLIK-REHBERI.md`'ye geç. Kimlik varsa video üretimi için `uretim/TARIF.md`'ye geç.

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
| `kurulum/` | `KURULUM.md` (adım adım), `doktor.js` (her parçayı dener), `gereksinimler.txt` (sabit Python sürümleri) |
| `kanal/` | Kanal kimlikleri. `KIMLIK-REHBERI.md`, `sablon/`, dolu örnek `oxygbio/` |
| `videolar/` | Her video bir klasör. `_sablon/` yeni video için. `oxygbio-v01-ucak/` tam örnek |
| `uretim/` | `TARIF.md` (iş sırası), `ses.js`, `kelime.py`, `mix.js`, `kurgu.js` (ücretsiz), `ucretli.js` (Higgsfield), `cekirdek.js` (ortak) |
| `marka/` | `marka-sesi.js`: açılış sesini kodla üretir, hazır sesleriyle |
| `denetim/` | `DENETIM.md`, `kareler.sh`, `kare-denetci.md` (denetçi ajanın kuralları) |
| `instagram/` | `REHBER.md` (Meta kurulumu), `paylas.js` |
| `kuyruk/` | `BENIOKU.md`, `kuyruk.js`: videolar sıraya girer, zamanlayıcı saati gelince paylaşır, sonuçları çeker |
| `dersler/` | `HATALAR.md`, `KURGU-DILI.md`, `METIN.md` |
| `konu/` | Konu radarı: forum ve trend sitelerinden kanala uygun video fikri bulur, isterse otomatik üretir. `BENIOKU.md`, `radar.js` |
| `kesit/` | Uzun yatay videodan dikey kısa: tanıtım (cevaptan önce kesilir) ya da en iyi an. `BENIOKU.md`, `kesit.js` |

## Konu radarı (isteğe bağlı)

Kullanıcı "konu bul", "ne çeksem", "fikir öner" derse: `konu/BENIOKU.md`. Kısaca `node konu/radar.js topla <kanal>` → `puanla <kanal>` → kullanıcıya `kanal/<kanal>/fikirler.html`'i aç. Otomasyon seviyesi (`kanal/<kanal>/konu.json` → `otomasyon`) ve bütçe sınırları kullanıcıyla birlikte yazılır; tam otomatik paylaşımı kullanıcı açıkça istemeden açma.

## Uzun videodan dikey kesit (isteğe bağlı)

Kullanıcı "uzun videomdan kısa çıkar", "tanıtım reels'i", "en iyi anı kes" derse: `kesit/BENIOKU.md`. Kısaca `node kesit/kesit.js yazi <uzun.mp4>` → `sec <uzun.mp4>` → `yap <uzun.mp4> --aday 1 --kare` (karelere bak) → `yap <uzun.mp4> --aday 1`. Çıktılar uzun videonun yanındaki `<ad>-kesit/` klasörüne gider, repoya değil. Kullanıcıya videoyu izlet. Kuyruğa yalnız o isterse ekle (komutu `yap` yazar).

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

## Hazır şablonla ücretsiz video (kod yazmadan)

`video.json` → `"sablon": "simulasyon"` yazılırsa sahne kodu gerekmez. Sahneyi `uretim/sablonlar/simulasyon.js` çizer: gökyüzü, kıyı ve deniz kesiti, oksijen göstergeleri, zaman cetveli. Videoya özel bilgi `simulasyon.json` dosyasına yazılır: hangi kelimede hangi yıl, kamera nereye gider, oksijen yüzde kaç, ne değişir. Alanların listesi şablon dosyasının başında yazıyor.

## Yeni sahne kodu yazarken

- **Örnek:** `videolar/oxygbio-v01-ucak/sahneler.js` çalışan, tam bir örnektir. Önce oku.
- **Zaman:** Her hareket bir kelimeye bağlanır: `cue('kelime', L[satır])`. Elle saniye yazma.
- **Çekirdeğe dokunma:** Altyazı, marka ekranları ve köşe etiketi çekirdekten gelir, sahne dosyasında yeniden yazma.
- **Kare al:** Yazdıktan sonra kareleri al (`--kare`) ve kendin bak. Kullanıcıya göstermeden önce düzelt.
