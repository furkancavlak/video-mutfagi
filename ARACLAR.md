# Araçlar: ne işe yarar, bedava mı, ücretli mi

Bu sayfa yöntemin kullandığı her aracı listeler. Fiyatlar ve lisanslar **26 Ekim 2026'da** resmi sayfalardan kontrol edildi.

Fiyatlar sık değişir. Para harcamadan önce aracın kendi sayfasına bak. Repo da para harcayan her adımda önce maliyeti gösterir, sen "evet" demeden harcamaz.

## Kısaca

| Araç | Ne işe yarar | Durum |
|---|---|---|
| Claude Code | Yapay zekâ ajanı: komutları çalıştırır, metni ve sahneyi yazar | Ücretli (Pro, aylık 20 $) |
| Codex CLI | Claude Code'un yerine geçebilecek ajan (OpenAI) | Araç bedava, kullanımı ChatGPT planına bağlı |
| Gemini CLI / Antigravity CLI | Claude Code'un yerine geçebilecek ajan (Google) | Ücretsiz kota küçüldü, aşağıda |
| HyperFrames | Kodla animasyonu videoya çevirir | Bedava, açık kaynak |
| GSAP | Animasyonların zamanlaması | Bedava, ticari kullanım dahil |
| ffmpeg | Ses ve videoyu keser, birleştirir, sıkıştırır | Bedava, açık kaynak |
| yt-dlp | Stil kopyalamada örnek videoyu en yüksek çözünürlükte indirir (isteğe bağlı) | Bedava, açık kaynak |
| faster-whisper | Sesteki her kelimenin zamanını bulur | Bedava, senin bilgisayarında çalışır |
| Node.js | Repodaki betikleri çalıştırır | Bedava |
| Python | Whisper'ı çalıştırır | Bedava |
| ElevenLabs | Yapay ses | Ücretsiz plan var ama **ticari kullanım yok**, aşağıda |
| Higgsfield | Ücretli katmandaki yapay zekâ resim ve klipleri | Kredi ister |
| Suno | Yapay zekâ müziği (isteğe bağlı) | Ücretsiz planda **ticari kullanım yok** |
| Instagram API | Videoyu Instagram'a kendisi paylaşır | Bedava |
| cloudflared | Bilgisayardaki videoyu Instagram'a geçici bir adresle verir | Bedava |
| YouTube Data / Analytics API | Kanal sayılarını çeker (isteğe bağlı) | Bedava, günlük kota var |
| Blender | 3D model (isteğe bağlı) | Bedava |
| three.js | Tarayıcıda 3D sahne (isteğe bağlı) | Bedava |

Ücretsiz yol şunlarla çalışır: kendi sesin, HyperFrames, ffmpeg, Whisper, Instagram API. Tek zorunlu masraf yapay zekâ ajanıdır. Ajansız da kurulum yapılabilir (`kur.cmd` / `kur.sh`), ama yeni video yazmak için ajan gerekir.

---

## 1. Yapay zekâ ajanı

Repoyu kuran, metni yazan, sahneyi kodlayan ve videoyu denetleyen yardımcı. Repo hepsiyle çalışacak şekilde yazıldı (`AGENTS.md`). Biz Claude Code ile denedik.

### Claude Code (Anthropic)
- **Ne:** Terminalde, VS Code'da ya da masaüstü uygulamasında çalışan yapay zekâ ajanı.
- **Durum:** Ücretli. Claude'un ücretsiz planında Claude Code yok. En ucuz yol Pro planı: aylık 20 $ (yıllık ödersen ayı 17 $). Daha çok kullanım için Max planı aylık 100 $'dan başlar.
- **Bağlantı:** https://claude.com/pricing

### Codex CLI (OpenAI)
- **Ne:** OpenAI'ın kodlama ajanı. Kendisi açık kaynak (Apache-2.0).
- **Durum:** Aracın kendisi bedava. Kullanmak için ChatGPT hesabıyla giriş yapılır, kullanım hakkı plana bağlı. OpenAI'ın fiyat sayfası ücretsiz planda Codex'i "kademeli açılıyor" diye gösteriyor. Terminal sürümünün ücretsiz planda çalışıp çalışmadığını net doğrulayamadık. Kendi hesabınla dene.
- **Bağlantı:** https://github.com/openai/codex · https://learn.chatgpt.com/docs/pricing

### Gemini CLI ve Antigravity CLI (Google)
- **Ne:** Google'ın kodlama ajanı. Gemini CLI açık kaynak (Apache-2.0).
- **Durum:** Eskiden kişisel Google hesabıyla günde 1.000 istek bedavaydı. **18 Haziran 2026'da** bu ücretsiz kullanım Gemini CLI'dan yeni Antigravity CLI'a taşındı. Gemini CLI artık API anahtarıyla çalışıyor. Antigravity CLI'ın ücretsiz kotası eskisinden çok daha küçük. Uzun bir video işi için yetmeyebilir.
- **Bağlantı:** https://github.com/google-gemini/gemini-cli

> **Dürüst özet:** Bugün sorunsuz, ücretsiz bir ajan yolu yok. Ücretsiz kotalar denemeye yeter, bir videoyu baştan sona üretmeye çoğu zaman yetmez.

## 2. Kurgu (hepsi senin bilgisayarında, bedava)

### HyperFrames (HeyGen)
- **Ne:** HTML ve kodla yazılmış animasyonu kare kare çizip videoya çevirir. Ücretsiz katmanın kalbi.
- **Durum:** Bedava, açık kaynak (Apache-2.0). npm paketi `hyperframes`. Repo bilinen çalışan bir sürüme sabitlendi (`package.json`). Video çizmek için bir kez ~150 MB'lık bir Chrome indirir.
- **Bağlantı:** https://github.com/heygen-com/hyperframes

### GSAP
- **Ne:** Animasyonların zamanlaması: neyin ne zaman, nasıl hareket edeceği.
- **Durum:** Bedava, ticari kullanım dahil, bütün eklentileriyle ("Standard No-Charge" lisansı). Tek yasak: Webflow'a rakip, kod yazmadan animasyon yapan bir araç içinde kullanmak. Bu repo için geçerli değil.
- **Bağlantı:** https://gsap.com/licensing/

### ffmpeg
- **Ne:** Ses ve videoyu keser, birleştirir, ses seviyesini ayarlar, sıkıştırır.
- **Durum:** Bedava, açık kaynak (LGPL; bazı derlemeleri GPL).
- **Bağlantı:** https://ffmpeg.org/legal.html

### yt-dlp (isteğe bağlı)
- **Ne:** Stil kopyalamada (`stil/`) ölçülecek örnek videoları en yüksek çözünürlükte, kendi kare hızında indirir: `yt-dlp -f "bv*+ba/b" <link>`. Videolar yalnız ölçüm içindir, paylaşılmaz; platformun kullanım şartlarına uy.
- **Durum:** Bedava, açık kaynak (Unlicense).
- **Bağlantı:** https://github.com/yt-dlp/yt-dlp

### faster-whisper (Whisper)
- **Ne:** Seste hangi kelimenin hangi saniyede söylendiğini bulur. Animasyon bu zamanlara kilitlenir.
- **Durum:** Bedava. Kod da model de MIT lisanslı. İnternete ses göndermez, bilgisayarında çalışır. Model ilk kullanımda bir kez ~1,6 GB iner.
- **Bağlantı:** https://github.com/SYSTRAN/faster-whisper

### Node.js
- **Ne:** Repodaki betikleri çalıştırır.
- **Durum:** Bedava (MIT). **Sürüm 22 ya da üstü** gerekir. Bugün uzun destekli sürümler 24 (etkin) ve 22 (bakımda).
- **Bağlantı:** https://nodejs.org

### Python
- **Ne:** Whisper'ı çalıştırır. Repo kendi Python ortamını kurar (`.venv`), bilgisayarındaki başka Python'lara karışmaz.
- **Durum:** Bedava (PSF lisansı). Repo **3.12** ister.
- **Bağlantı:** https://www.python.org

## 3. Ses

### Kendi sesin
Bedava. Telefonla sessiz bir odada kaydet. Repo kaydını kelime kelime zamanlar.

### ElevenLabs
- **Ne:** Metni yapay sesle okur. Örnek videonun sesi bununla yapıldı.
- **Ücretsiz plan (26.10.2026):**
  - Ayda **10.000 kredi**. Kullandığımız modelde kabaca 1 karakter 1 kredi. Örnek videonun metni ~1.070 karakterdi, yani ayda birkaç kısa video.
  - **Ticari kullanım yok.** ElevenLabs'in kendi sözleriyle: ücretsiz plan "ticari lisans içermez ve hiçbir ticari amaçla kullanılamaz".
  - **Kaynak göstermek zorunlu.** Ücretsiz planla üretilen sesi paylaşırsan başlığa "elevenlabs.io" ya da "11.ai" yazman gerekir. Instagram'da başlık, gönderi açıklamasıdır.
  - Ses klonlama ücretsiz planda yok.
- **Ne zaman ücretli plan gerekir:** Kanal para kazanıyorsa (reklam geliri, sponsor, ürün satışı) ya da bir markayı tanıtıyorsa ticari sayılır. Emin değilsen ticari say. Ticari lisansı olan en ucuz plan **Starter**, aylık 6 $ (ilk ay kampanyaları olabiliyor).
- **Bağlantı (resmi):**
  - Ücretsiz planın kuralları: https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform
  - Fiyatlar: https://elevenlabs.io/pricing

## 4. Görsel

### Higgsfield
- **Ne:** Ücretli katmandaki yapay zekâ resimleri ve kısa klipler.
- **Durum:** Kredi ister. Örnek videonun ücretli hâli 36 kredi harcadı. Higgsfield'ın kendi blog yazısına göre (24.10.2026): ücretsiz planda kredi yok ve ticari kullanım yok; en ucuz ücretli plan aylık 15 $ ve 200 kredi; bütün ücretli planlar ticari kullanıma izin veriyor. Resmi fiyat sayfası tarayıcıda açılıyor, biz yazıyla doğrulayamadık. Satın almadan önce sayfaya bak.
- **Bağlantı:** https://higgsfield.ai/pricing · https://higgsfield.ai/blog/higgsfield-pricing-explained

Ücretsiz katman bunun yerine her şeyi kodla çizer. Higgsfield olmadan da video çıkar.

## 5. Müzik (isteğe bağlı)

### Suno
- **Ne:** Söz ve stil verince şarkı üretir.
- **Durum:** Ücretsiz planda günde 50 kredi var. Ama ücretsiz planda üretilen şarkılar **Suno'nun malı** kalır ve yalnız ticari olmayan işte kullanılabilir. Sonradan ücretli plana geçmek eski şarkıları ticari yapmaz. Ticari hak ücretli planlarla (Pro ve üstü) gelir.
- **Bağlantı:** https://suno.com/pricing · https://help.suno.com/en/articles/2416769

## 6. Paylaşım ve sayılar

### Instagram API (Instagram Login ile)
- **Ne:** Videoyu Instagram'a Reels olarak kendisi paylaşır (`instagram/paylas.js`).
- **Durum:** Bedava. Hesabın **profesyonel** (İşletme ya da İçerik Üreticisi) olması gerekir. API ile 24 saatte en fazla 100 gönderi paylaşılabilir (yeni hesapta biz günde 1 öneriyoruz, `dersler/HATALAR.md`). Kendi hesabına paylaşmak için Meta'nın uygulama incelemesi (App Review) gerekmez. Kurulumu `instagram/REHBER.md`'de.
- **Bağlantı:** https://developers.facebook.com/docs/instagram-platform/content-publishing

### cloudflared (Cloudflare Tunnel)
- **Ne:** Instagram videoyu bir internet adresinden çeker. Bilgisayardan paylaşırken bu araç videoya geçici bir adres açar.
- **Durum:** Bedava, açık kaynak (Apache-2.0). Geçici adres için hesap bile gerekmez.
- **Bağlantı:** https://github.com/cloudflare/cloudflared

### YouTube Data API ve YouTube Analytics API (isteğe bağlı)
- **Ne:** Video sayılarını, izlenme ve izleyici tutma verisini çeker. Kapak ve başlık denemelerini değerlendirirken işe yarar (`dersler/KAPAK-BASLIK.md`).
- **Durum:** Bedava. Bir Google Cloud projesi açılır. Data API'nin günlük varsayılan kotası 10.000 birim. Okuma işleri birkaç birim tutar, gündelik kullanım kotaya yaklaşmaz. Not: tıklama oranı (CTR) API'den gelmiyor, YouTube Studio'dan bakılır.
- **Bağlantı:** https://developers.google.com/youtube/v3/getting-started · https://developers.google.com/youtube/analytics

## 7. 3D (isteğe bağlı, bu repoda zorunlu değil)

3D sahneli videolarda kullandık. Ücretsiz katman bunlarsız çalışır.

### Blender
- **Ne:** 3D model ve sahne. Ajan Blender'ı komutla da çalıştırabilir.
- **Durum:** Bedava, açık kaynak (GPL). Blender'la yaptığın her şey senindir, ticari kullanım serbest.
- **Bağlantı:** https://www.blender.org/about/license/

### three.js
- **Ne:** Tarayıcıda çalışan 3D sahne. HyperFrames sahnesinin içinde de kullanılabilir.
- **Durum:** Bedava, açık kaynak (MIT).
- **Bağlantı:** https://threejs.org

## 8. Yararlandığımız açık kaynak çalışmalar

Kod kopyalamadık; kuralları okuyup kendi motorumuza ve istemlerimize uyarladık.

- **LottieFiles / motion-design-skill** (MIT): hareket süreleri, giriş-çıkış zamanlaması. https://github.com/LottieFiles/motion-design-skill
- **whaleyxbt / claude-motion** (MIT): kareleri olay anında kontrol etme, okuma süresi kuralı. https://github.com/whaleyxbt/claude-motion
- **nateherkai / herk-edit-kit** (MIT): GSAP `fromTo` tuzağı, kelimeden önce giriş, `<defs>` id çakışması, kendi ses kaydında sessizlik kırpma fikri. https://github.com/nateherkai/herk-edit-kit

---

Bir fiyatın değiştiğini ya da yanlış olduğunu görürsen GitHub'da bir issue aç. Kontrol tarihini de güncelleriz.
