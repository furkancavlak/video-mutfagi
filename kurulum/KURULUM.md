# Kurulum (yapay zekâ ajanı için adım adım)

Kullanıcı kod bilmiyor olabilir. Ajan her adımı kendisi çalıştırır. Kullanıcıdan yalnız iki şey ister: tarayıcıda yapılacak işler (hesap açma, giriş yapma) ve onaylar. Her adımdan sonra kontrol komutunu çalıştırır. Kontrol geçmeden sonraki adıma geçmez.

Windows'ta denendi. Mac'te komutlar parantez içinde verilmiştir, Mac yolu deneyseldir.

**Ajansız kurulum:** Adım 1-5'i tek seferde yapan betikler var. Windows'ta `kur.cmd` (çift tıkla), Mac/Linux'ta `bash kur.sh`. Ajan da bunları kullanabilir. Ayrıntı en altta: "Tek tık kurulum betikleri".

Her şey hazır mı diye her an şu komutla bakılabilir:

```
node kurulum/doktor.js
```

---

## Adım 1: Temel araçlar

| Araç | Windows (PowerShell) | Mac |
|---|---|---|
| Node.js 22+ (HyperFrames ister) | `winget install OpenJS.NodeJS.LTS` | `brew install node` |
| ffmpeg | `winget install Gyan.FFmpeg` | `brew install ffmpeg` |
| Python 3.12 | `winget install Python.Python.3.12` | `brew install python@3.12` |
| Git | `winget install Git.Git` | Xcode komut satırı araçları ile gelir |

> **Tuzak:** winget ile kurduktan sonra terminal yeni aracı görmez. Terminali (ya da VS Code'u) kapatıp yeniden aç.

## Adım 2: Repo ve npm paketleri

Repoyu kısa bir yola klonla, ör. `C:\Users\<ad>\video-mutfagi` ya da Belgeler. Windows 260 karakterden uzun dosya yollarını açamıyor. Repo çok derin bir klasörde durursa render yarıda kalır.

```
git clone https://github.com/furkancavlakcom/video-mutfagi
cd video-mutfagi
npm install
npx hyperframes browser ensure
node kurulum/gizli-tara.js kur
```

- `gizli-tara.js kur`, her commit'ten önce değişiklikleri tarar. İçinde anahtar ya da token gibi bir şey görürse commit'i durdurur.

- `browser ensure`, video çizerken kullanılan Chrome'u bir kez indirir (~150 MB).
- npm "install-scripts" uyarısı verebilir. Sorun değil: doktor gereken her şeyi ayrıca dener.

## Adım 3: Python ortamı ve Whisper

Repo kendi Python ortamını kurar. Böylece bilgisayardaki başka Python'lar karışmaz.

```
py -3.12 -m venv .venv                                   (Mac: python3.12 -m venv .venv)
.venv\Scripts\python -m pip install -r kurulum/gereksinimler.txt      (Mac: .venv/bin/python -m pip ...)
```

> **Tuzak:** Sürümler bilerek sabitlendi. En yeni `av` paketiyle faster-whisper açılışta çöküyor (`metadata_errors` hatası). `gereksinimler.txt` dosyasını güncelleme.

Whisper modeli (~1,6 GB) ilk kullanımda kendiliğinden iner.

## Adım 4: Kontrol

```
node kurulum/doktor.js
```

"ZORUNLU" bölümünde her satır ✓ olmalı. Olmayan satırın altında ne yapılacağı yazar.

## Adım 5: Kanıt, örnek videoyu üret

Hiçbir hesap ya da anahtar gerekmez. Örnek videonun sesi ve kelime zamanları repoda hazır durur.

```
node uretim/mix.js videolar/oxygbio-v01-ucak
node uretim/kurgu.js videolar/oxygbio-v01-ucak --render
```

- **Sonuç:** `videolar/oxygbio-v01-ucak/cikti/oxygbio-v01-ucak-ucretsiz.mp4`, 76 sn.
- **Süre:** Render orta bir bilgisayarda ~2-4 dk sürer.
- Videoyu kullanıcıya aç. Kurulum çalışıyor demektir.

> İsteğe bağlı: Whisper'ı da denemek için `ses/kelimeler.json` dosyasını başka bir yere taşı, sonra `.venv\Scripts\python uretim/kelime.py videolar/oxygbio-v01-ucak` çalıştır.

## Adım 6: Kanal kimliği

`kanal/KIMLIK-REHBERI.md` adımlarını kullanıcıyla birlikte yap. Sonuç: `kanal/<kanal-adi>/kimlik.json`.

## Adım 7: İsteğe bağlı parçalar (yalnız kullanılacaksa)

### Yapay ses (ElevenLabs)

1. Kullanıcı elevenlabs.io'da hesap açar. Ajan ücretsiz planın şartlarını kullanıcıya açıkça söyler (26.10.2026'da kontrol edildi, `ARACLAR.md`):
   - Ayda 10.000 kredi. Örnek videonun metni ~1.070 karakter.
   - **Ticari kullanım yok.** Kanal para kazanıyorsa ya da marka tanıtıyorsa ücretli plan (Starter ve üstü) gerekir.
   - Ücretsiz planla üretilen ses paylaşılırken başlığa (Instagram'da açıklamaya) "elevenlabs.io" yazılır.
2. Profile → API Keys bölümünden bir anahtar oluşturur.
3. Anahtarı **sohbete yapıştırmaz**. Masaüstünde `elevenlabs.txt` adlı bir dosyaya kaydeder.
4. Ajan dosyayı ev klasörüne taşır, masaüstündeki kopya kalmaz:

   ```
   mkdir ~/.video-mutfagi
   move Desktop\elevenlabs.txt ~/.video-mutfagi\elevenlabs.txt
   ```

5. Kontrol: `node uretim/ses.js videolar/oxygbio-v01-ucak`. Bu komut kalan karakter sayısını gösterir, hiçbir şey harcamaz.

### Ücretli görsel (Higgsfield)

1. Kullanıcı higgsfield.ai'da hesap açar ve kredi alır.
2. Ajan CLI'ı kurar ve kullanıcıyı girişe yönlendirir:

   ```
   npm i -g @higgsfield/cli
   higgsfield auth login
   ```

   İkinci komut tarayıcıyı açar, kullanıcı giriş yapar.
3. Kontrol: `node kurulum/doktor.js` komutu kalan krediyi gösterir.

### Instagram'a otomatik paylaşım

`instagram/REHBER.md` dosyasını adım adım izle. Meta tarafında ince bir tuzak var, rehberde yazıyor.

Ardından paylaşım kuyruğu ve zamanlayıcı: `kuyruk/BENIOKU.md` → Kurulum. Zamanlayıcıyı kurmadan önce kullanıcıya ne yapacağını söyle ve onay al. Ev bilgisayarıysa kullanıcıya şunu açıkça söyle: "Paylaşım saatinde bilgisayarın açık olmalı. Otomasyonun çalıştığını `durum` komutuyla kontrol etmemiz gerekir."

### İkinci beyin

Kanal kimliği bittikten sonra kullanıcıya sor. Önce 2-3 cümleyle anlat, sonra "ekleyelim mi?" de. Şöyle:

> Ben her sohbete sıfırdan başlarım. Dün ne konuştuğumuzu, hangi videonun tuttuğunu, neyi beğenmediğini hatırlamam. İkinci beyin, bilgisayarında duran küçük bir not defteri: kanalın hedefini, kararlarını, düzeltmelerini ve her videonun sonuçlarını oraya yazarım, her oturumun başında okurum. Ayrıntısı bu videoda: https://youtu.be/-z9aGjceXkc. Ekleyelim mi?

- **Evet derse:** `ikinci-beyin/BENIOKU.md` → "Kurulum" adımlarını uygula. Bitince nasıl çalıştığını 3-4 kısa cümleyle anlat: oturum başında okurum, düzeltmeni ve kararını hemen yazarım, video paylaşılınca sonuçlarını birlikte kaydederiz, istersen Obsidian ile açıp okuyabilirsin.
- **Hayır derse:** Üstünde durma. Sonra isterse "ikinci beyin kuralım" demesi yeter.

---

## Tek tık kurulum betikleri (ajansız)

`kur.cmd` (Windows) ve `kur.sh` (Mac/Linux) yukarıdaki Adım 1-5'i sırayla yapar:

1. Node.js 22+, ffmpeg ve Python 3.12'ye bakar. Eksikleri listeler, kuracağı komutu yazar ve **sorar**. Windows'ta `winget`, Mac'te `brew` kullanır. Linux'ta sistem paketleri sudo istediği için yalnız komutları yazar, kendisi kurmaz.
2. `npm install` (paketler varsa atlar).
3. `npx hyperframes browser ensure` (tarayıcı varsa hemen geçer).
4. `.venv` ve `kurulum/gereksinimler.txt` (doğru sürümler varsa atlar).
5. Git klonuysa gizli bilgi kilidi (`gizli-tara.js kur`). ZIP ile indirildiyse atlar.
6. `node kurulum/doktor.js`. Zorunlu bir parça eksikse durur.
7. Örnek videoyu üretir ve açar. Video zaten varsa yeniden çizmez.

- **Var olanı yeniden kurmaz.** İkinci çalıştırma birkaç saniyede biter.
- **Hata olunca durur** ve ne yapılacağını Türkçe yazar. Hiçbir şey silmez.
- **Yönetici izni:** Yalnız winget bir aracı kurarken Windows sorabilir.
- **winget ile araç kurduktan sonra** Windows yeni araçları ancak yeni pencerede görür. Betik bunu söyler ve durur. Pencereyi kapatıp `kur.cmd`'yi yeniden çalıştırmak yeter.
- **Seçenekler:** `--kuru` yalnız bakar, hiçbir şeyi değiştirmez. `--acmadan` sonda videoyu açmaz.
- **Windows'ta denendi** (bu bilgisayarda var olan araçlarla: her adım atlandı ya da tamamlandı, ses karıştırma + render dahil kurulum 97 sn sürdü). Mac ve Linux yolu kuru modda ve sahte araçlarla denendi, gerçek bir Mac'te henüz denenmedi.

## Sunucuya kurmak (Linux, 7/24)

- **Ayrı kullanıcı:** Repo için ayrı bir kullanıcı aç (ör. `useradd -m vmutfak`). Sunucudaki başka uygulamalara dokunma.
- **Node:** Sunucunun Node'u 22'den eskiyse sistem Node'unu **güncelleme**, başka uygulamalar onu kullanıyor olabilir. nodejs.org'dan Node 22 arşivini indir (SHASUMS256 ile doğrula), yalnız bu kullanıcının `~/.local/node` klasörüne aç ve PATH'e ekle.
- **Özel repo:** Repo özelse sunucuya GitHub şifresi koyma. Bilgisayarda `git bundle create vm.bundle main` ile paketle, sunucuya kopyala, `git clone vm.bundle` ile aç.
- **Düşük öncelik:** Sunucuda başka işler de çalışıyorsa ağır işleri (render, Whisper) `nice -n 19` ile çalıştır.
- **Yapay zekâ:** Konu radarı ve otomatik üretim için sunucuda Claude girişi gerekir. Bilgisayarında `claude setup-token` çalıştır. Çıkan uzun kodu sunucuda bu kullanıcının ortamına `CLAUDE_CODE_OAUTH_TOKEN` olarak koy (`~/.video-mutfagi/claude.env`). Sohbete yapıştırma.
- **Paylaşım:** `kuyruk/BENIOKU.md` → "Sunucuya kurmak" (klasor yolu, tünel gerekmez).

## Kurulum bitince ajan kullanıcıya şunu söyler

- Hazır olanlar: ✓ satırları.
- Kurulmayan isteğe bağlı parçalar ve ne işe yaradıkları.
- İlk video için ne gerektiği: konu fikri ve kanal kimliği. Sonra `uretim/TARIF.md`.
