# Bizim yaptığımız hatalar (sen yapma)

Bu repo kurulurken ve ilk video (`videolar/oxygbio-v01-ucak`) yapılırken düştüğümüz her tuzak burada yazıyor. Repodaki komutlar bunların çoğunu zaten engelliyor. Yapay zekâ ajanı her aşamaya başlamadan önce o aşamanın bölümünü okur.

Her madde aynı biçimde yazılmıştır: **ne oldu**, ardından **→ ne yap**.

---

## 1. Kurulum

- **Bilgisayarda birden çok Python vardı, Whisper yalnız birinde kuruluydu.** `py` başka bir Python'u açtı, "modül yok" hatası verdi.
  → Repo kendi Python ortamını kurar (`.venv`). Whisper her zaman `.venv` içinden çalıştırılır (bkz. `kurulum/KURULUM.md`).
- **Klasör adında boşluk ve Türkçe harf vardı** (`CLAUDE PROJELER`, `VİDEO`). Bazı araçlar yolu ikiye böldü.
  → Repodaki betikler araçları kabuk (shell) olmadan çağırır, bu sorun çözüldü. Kendi yazdığın yeni betikte de yolu her zaman tırnak içine al.
- **Temiz kurulum testinde render çöktü** (`ENOENT: mkdtemp`). Repo derin bir klasördeydi. Render'ın geçici klasörü Windows'un 260 karakterlik yol sınırını aştı.
  → Render ara dosyasını artık kısa bir geçici yola yazıyor. Yine de repoyu kısa bir yola klonla. Doktor uzun yolu uyarır.
- **Windows'taki bir ffmpeg sürümünde `drawtext` filtresi çöktü.**
  → Videoya yazıyı ffmpeg ile değil, HyperFrames sahnesinin içinde yaz.
- **npm, bazı paketlerin kurulum betiklerini engelledi** ("install-scripts" uyarısı).
  → Uyarı görürsen `node kurulum/doktor.js` çalıştır. Doktor, gereken her parçanın çalışıp çalışmadığını tek tek dener.

## 2. Gizli bilgiler

- **Hesap şifresi sohbete yazıldı.** Sohbet geçmişi saklanır; şifre orada kalıcı olur.
  → Şifre hiçbir zaman sohbete ya da dosyaya yazılmaz. Yazıldıysa hemen değiştir.
- **Anahtarlar (token) dosyada kalıyordu.**
  → Bütün anahtarlar kullanıcının ev klasöründe, `~/.video-mutfagi/` içinde durur. Repoda hiçbir zaman durmaz. Kurulum sırasında masaüstüne geçici bir txt koyduysan, kayıttan sonra o txt'yi sil.

## 3. Instagram (Meta) kurulumu

- **"App roles → Test Users" bölümünden test kullanıcısı açmaya çalıştık, hata verdi.**
  → Doğru yer: **App roles → Roles → Add People → "Instagram Tester"**. Davet Instagram'da şu sayfadan kabul edilir: `instagram.com/accounts/manage_access` → "Tester invites".
- **App Review gerektiğini sandık.**
  → Gerekmiyor. Geliştirme modundaki uygulama, Tester rolü verilmiş kendi hesabına paylaşım yapabilir. Biz denedik, Reels gerçekten yayına çıktı.
- **Hesap profesyonel değildi.**
  → Hesabın Business ya da Creator olması şart. Profesyonele geçmeden önce atılmış gönderilerin istatistiği API'den gelmez.
- **API ile gönderi silmeye çalıştık.**
  → API silme yapamaz. Eski gönderiler elle arşivlenir.
- **Instagram videoyu reddetti ("ERROR"), açıklama vermedi.** Asıl sebep ev internetinin yükleme hızıydı. Instagram videoyu bilgisayardan geçici tünelle çekerken ~40 saniyede kesiyor. Saniyede ~250 KB yükleme hızıyla bu sürede ~9 MB gider; 23-37 MB'lık videolar yarıda kaldı. Aynı gün çok tünel açınca Cloudflare de geçici adres vermeyi bir süre kesti.
  → Kalıcı çözüm: Paylaşımı hızlı internetli bir sunucudan yap. Video sunucuda herkese açık bir adreste durur, `--adres https://...` ile o adres verilir, tünel kullanılmaz.
  → Bilgisayardan paylaşacaksan videoyu ~6 MB'a sığdır. 720p ve iki geçişli kodlamada görüntü farkı neredeyse yok.
  → Betik artık hatada Instagram'ın videoyu ne kadar çekebildiğini yazıyor ("YARIDA KESİLDİ 9.6 MB 38 sn").
- **Yeni bir hesaptan ilk gün çok paylaşım yapmak** spam işaretine yol açabilir.
  → İlk haftalarda günde en fazla 1 paylaşım yap. Gerçekçi yapay zekâ sesi ya da görüntüsü kullandıysan Instagram'ın "AI etiketi"ni aç.

## 4. Kanal kimliği (ses ve marka)

- **Şiveyi yalnız metne yazarak verdik** (sesi şivesiz bir ses okudu). Sonuç inandırıcı olmadı.
  → Şive istiyorsan o şiveyle konuşan bir ses seç. Metin tek başına şive yapmaz.
- **Bir sesi tek cümleden seçtik, sonra beğenmedik.**
  → En az 3-4 sesi **aynı kanca cümlesiyle, açılış sesi de içinde olacak şekilde** dinle. Sesi videonun içinde duyunca karar ver.
- **Açılış sesi olarak tek bir "dınk" kullandık.** Ucuz durdu. Hazır efektleri karıştırmak da işe yaramadı.
  → Beğendiğin bir kanalın açılış sesini dinle. Müzikal yapısını çıkar: yükseliş + vuruş + akor. Kodla üret (`marka/marka-sesi.js`).
- **Açılış sesini konuşmadan sonra sırayla çaldık** (konuşma biter, ses çalar, konuşma yeniden başlar). Kopuk durdu.
  → Ses konuşmanın **içine örülür**: yükseliş kancanın son kelimelerinin altında başlar, vuruş cümle biter bitmez gelir. `uretim/mix.js` bunu kendisi yapar.
- **Paylaşılan (shared) bir ElevenLabs sesi API'de "bulunamadı" hatası verdi.**
  → Önce ElevenLabs sitesinde "Add to my voices" ile kendi kütüphanene ekle. Paylaşılan sesler ses yuvası (slot) harcamaz.
- **eleven_v3'teki `[excited]`, `[shouting]` gibi etiketler** sesli okunmaz, tonu yönetir. Ama karakter kotasından düşer.

## 5. Metin

- **İlk metin ne bilgi verdi ne güldürdü.** Olay 5 saniyede bitti.
  → Öncül **sürmeli**. "Oksijen bir anlığına gidip geri gelse" değil, "gidiyor ve geri gelmiyor" olmalı. Olaylar tırmanır: önce cam, sonra insan, sonra uçak, sonra yer.
- **Her şaka gerçek bir bilgiye dayanmalı.** Gerçek bilgi olmadan yapılan şaka boş kalıyor.
  → Metnin altına bir bilgi kontrol tablosu koy: cümle, doğru mu, kaynağı (örnek: `videolar/oxygbio-v01-ucak/metin.md`).
- **Küfrü başa ve sona koyduk.** Zorlama durdu.
  → Küfür olayın ortasında, tepki olarak gelir ("Pıt, toz oldu. Hassiktir…").

## 6. Görüntü (ücretsiz, kodla animasyon)

- **İlk sürüm "slayt gibi" oldu**: koyu zemin, sahneler birbirinden kopuk, yazılar ekrana yapıştırılmış kutulardaydı.
  → Kurallar `dersler/KURGU-DILI.md`'de. Özeti: açık zemin, tek dünya, yazı sahnenin içinde, kamera bilgiye gider.
- **Yolcularla koltuklar aynı renkteydi.** İnsanlar kayboldu.
  → Kıyafet, koltuk ve duvar renkleri birbirinden ayrı olmalı.
- **Altyazı harflerinin etrafında beyaz kontur vardı.** Ucuz durdu.
  → Altyazı krem bir kartın üstünde, konturu yok. Konuşulan kelime renk değiştirir.
- **"⅓" gibi kesirli karakterler** ekranda kötü göründü.
  → Yazıyla yaz: "ÜÇTE BİRİ".
- **Bütün videoyu baştan yapıp sonra gösterdik.** Dil yanlış olunca hepsi çöpe gitti.
  → Önce 20-30 saniyelik bir demo yap ve onay al. Onaydan sonra tam videoyu yap.
- **Kod tuzakları:**
  - SVG'de `transform` niteliği olan bir `<g>`'ye GSAP ile `y:` verdik. Grubun yeri sıfırlandı, nesne ekranın tepesine fırladı.
    → Hareket edecek grubu dıştaki boş bir `<g>`'nin içine koy, hareketi dıştakine ver.
  - Ölçek ya da dönüş yanlış noktanın etrafında oldu.
    → `svgOrigin: 'x y'` kullan.

## 7. Görüntü (ücretli, Higgsfield)

- **Yapay zekâ istenmeyen bir insan ekledi** (herkesin yok olduğu dünyaya bir çocuk koydu).
  → Boş olması gereken sahnede açıkça yaz: "absolutely NO people, NO characters". Resimleri klip yapmadan **önce** gözden geçir. Klip pahalıdır, resim ucuzdur.
- **Sahneler birbirine benzemedi** (karakter ya da uçak her sahnede farklı çıktı).
  → İlk resmi referans ver (`ucretli.json` → `referans`). Bütün istemlerin sonuna aynı STYLE bloğunu ekle.
- **Higgsfield'ın sitesindeki sınırsız modeller CLI'da da bedava sanıldı.**
  → CLI her işte kredi düşer. `node uretim/ucretli.js` önce fiyatı gösterir, sonra bütçeyi kontrol eder. `--onay` vermeden hiçbir şey üretmez.
- **Kısa klip uzun bir cümleye yetmedi**, uçak 8 saniye havada dondu.
  → Klip ağır çekime alınır (`yavas`, ara kare üretilir) ve önemli an kelimeye oturtulur (`baslat`).
- **Bilgi etiketi kahraman nesnenin üstüne bindi** (düşen uçağın burnu, arabanın tepesi).
  → Etiketin geldiği anın karesine bak. Etiketi aşağı al (`ust: 1360`) ya da daha geç bir kelimeye kaydır.

## 8. Ses ve altyazı

- **Whisper birleşik kelimeleri ayırdı, ayrıları birleştirdi.** "Yerkabuğu" kelimesini "Yer kabuğunun" diye ikiye böldü. "yer de" kelimesini "yerde", "için de" kelimesini "içinde" yaptı.
  → `kelime.py` çıktısını metinle karşılaştır. Altyazıda yanlış çıkanları `video.json` → `duzeltme` alanına yaz. Kelimeye bağlanan bir an bulunamazsa kelimenin bir parçasını kullan.

## 9. Denetim

- **Denetçi ajan bazı şeyleri yanlış gördü.** Saniyede 1 kare baktığı için hareket eden şeye "donmuş" dedi. Bazı saniyeleri de yanlış eşledi.
  → Denetçinin her bulgusunu o saniyenin karesini alıp doğrula, sonra düzelt. Kanalın onaylı tasarımını (kimlik) denetçi istedi diye değiştirme.
- **Denetimsiz video gösterdik**, ilk bakışta görülecek hatalar kaldı.
  → Her render'dan sonra denetim çalışır (`denetim/DENETIM.md`). Videoyu kullanıcıya düzeltilmiş hâliyle göster.

## 10. Süreç

- **Bir aşama onaylanmadan sonrakine geçtik**, geri dönmek pahalıya patladı.
  → Sıra şöyle: metin onayı → ses onayı → demo onayı → video onayı → paylaşım onayı. Her aşamanın sonunda kullanıcıya **sonucu** göster (dinlet, izlet). Yazılı plan gösterme.
- **Para harcayan adımlar habersiz yapılmaz.** ElevenLabs karakteri ve Higgsfield kredisi bunlara dahil.
  → Önce maliyeti göster, kullanıcı "evet" desin, sonra `--onay` ile çalıştır.

## 11. Konu radarı (`konu/`)

- **Ekşi Sözlük, Node'un yerleşik `fetch()` isteğine "Just a moment" (403) döndü,** aynı tanıtımla `curl` sayfayı açtı. Sebep `fetch()`'in eklediği tarayıcı tipi `sec-fetch-*` başlıklarıydı.
  → Toplayıcılar sade `node:https` isteği atar, tanıtımı (User-Agent) dürüsttür, tarayıcı taklidi yapılmaz. Site yine engellerse radar Türkçe uyarı verip o kaynağı atlar; ısrar etmez.
- **Ekşi'nin robots.txt dosyası "Content-Signal: ai-input=no" diyor.**
  → Ekşi başlıkları varsayılan olarak yapay zekâya gönderilmez, havuzda "ham konu" olarak durur. Göndermek kanal sahibinin kararıdır (`konu.json` → `eksi.llm_e_gonder`).
- **Reddit'in oturumsuz `.json` adresi 403 veriyor** ve robots.txt otomatik erişimi kapatıyor. Herkese açık RSS akışı çalışıyor.
  → Varsayılan RSS, tek istek, günde birkaç tur. Uyumlu yol resmî API (`yontem: "api"`).
- **X'e tarayıcıyla otomatik giriş yapan eski projede hesap engellendi.**
  → X yalnız resmî API ve kullanıcının kendi anahtarıyla açılır; varsayılan kapalı. Başka projelerdeki çerez ya da oturum dosyaları kullanılmaz.
- **Aynı serinin farklı bölümleri tek fikir sanıldı.** "Evrendeki bütün oksijen yok olursa Everest'te / İstanbul'da…" başlıkları ortak kelimelerden dolayı birleşti, 7 fikir 3'e düştü.
  → Benzerlik ölçülürken kanalın seri kalıbındaki kelimeler (kimlik → konu ve ilk videonun başlığı) sayılmaz.
- **Vikipedi'nin en çok okunanlarında her gün "Bilim", "Türkiye" gibi sayfalar üstte.** Bugünle ilgisiz oldukları hâlde ilgi puanı yüksek çıktı.
  → Son 5 günde yükselmeyen sayfanın ilgi puanı düşürülür, birden yükselen sayfanınki artırılır.
- **`claude -p` kullanıcının kişisel Claude ayarlarıyla çalışınca** kişisel kancalar (hook) her çağrıya karıştı (eski projede).
  → Radar Claude'u boş bir geçici klasörde, `.beyin-yok` işaretiyle, `BEYIN_V3_SKIP=1`, `--setting-sources project,local` ve `--strict-mcp-config` ile çalıştırır.
