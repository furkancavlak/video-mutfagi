# Kurulum (yapay zekâ ajanı için adım adım)

Kullanıcı kod bilmiyor olabilir. Ajan her adımı kendisi çalıştırır. Kullanıcıdan yalnız iki şey ister: tarayıcıda yapılacak işler (hesap açma, giriş yapma) ve onaylar. Her adımdan sonra kontrol komutunu çalıştırır. Kontrol geçmeden sonraki adıma geçmez.

Windows'ta denendi. Mac'te komutlar parantez içinde verilmiştir, Mac yolu deneyseldir.

Her şey hazır mı diye her an şu komutla bakılabilir:

```
node kurulum/doktor.js
```

---

## Adım 1: Temel araçlar

| Araç | Windows (PowerShell) | Mac |
|---|---|---|
| Node.js 18+ | `winget install OpenJS.NodeJS.LTS` | `brew install node` |
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
```

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

1. Kullanıcı elevenlabs.io'da hesap açar. Ücretsiz planın ticari kullanım şartlarını ve aylık karakter sınırını sitede kontrol etsin.
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

### İkinci beyin

İsteğe bağlı bir modül. Henüz hazırlanıyor.

---

## Kurulum bitince ajan kullanıcıya şunu söyler

- Hazır olanlar: ✓ satırları.
- Kurulmayan isteğe bağlı parçalar ve ne işe yaradıkları.
- İlk video için ne gerektiği: konu fikri ve kanal kimliği. Sonra `uretim/TARIF.md`.
