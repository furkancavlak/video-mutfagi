# Video Mutfağı

Yapay zekâyla, sıfırdan, dikey video (Reels / Shorts) üreten ve Instagram'a kendisi paylaşan açık kaynak bir mutfak.

Konuyu sen verirsin. Yapay zekâ sırasıyla şunları yapar:
1. metni yazar, bilgileri kaynağıyla doğrular,
2. sesi üretir (ya da senin kaydını kullanır),
3. her hareketi söylenen kelimeye kilitleyerek videoyu kurgular,
4. videoyu ikinci bir yapay zekâya kare kare denetletir,
5. sen onay verince Instagram'a paylaşır.

Kod bilmen gerekmez. Bu repoyu, Furkan Cavlak kanalında kendi videolarını nasıl ürettiğimizi anlattığımız video için hazırladık. İçinde bizim gerçek kanalımızın gerçek videosu var. Onu örnek alıp kendi kanalına göre doldurursun.

## Nasıl kullanılır

1. Bir yapay zekâ kodlama aracı aç: Claude Code, Codex ya da benzeri. Masaüstü uygulaması ya da VS Code eklentisi olabilir.
2. Şunu yaz:

   > https://github.com/furkancavlak/video-mutfagi reposunu kur ve örnek videoyu çıkar.

3. Ajan kurulumu yapar. Senden yalnız tarayıcıda yapılacak işleri (hesap açma, giriş) ve onayları ister. Sonunda örnek videoyu açıp sana izletir.
4. Sonra şunu yaz:

   > Kendi kanalım için kimlik kuralım.

   Ardından:

   > Şu konuda bir video yapalım: …

Yapay zekâsız işler (sıra, takvim, fikir seçme, sonuçlar) için tarayıcıda bir kontrol paneli de var: `node panel/panel.js` ([panel/BENIOKU.md](panel/BENIOKU.md)).

Ajanın okuduğu talimatlar `AGENTS.md` dosyasında. Kurulum adımları `kurulum/KURULUM.md` dosyasında.

## Ajansız kurulum (tek tık)

Yapay zekâ ajanı kullanmadan da kurabilirsin. Repoyu indir (yeşil **Code** düğmesi → **Download ZIP**), kısa bir klasöre aç, sonra:

- **Windows:** `kur.cmd` dosyasına çift tıkla.
- **Mac / Linux:** Terminal'de repo klasörüne gir, `bash kur.sh` yaz.

Betik eksik araçları (Node.js, ffmpeg, Python) bulur, ne kuracağını yazar ve **sana sorar**. Var olanı yeniden kurmaz. Sonunda örnek videoyu üretip açar. Yalnız bakmak, hiçbir şeyi değiştirmemek için: `kur.cmd --kuru` ya da `bash kur.sh --kuru`. Ayrıntı: `kurulum/KURULUM.md`.

Yeni video yazmak için yine bir ajan gerekir.

## Ne bedava, ne ücretli

| Parça | Durum |
|---|---|
| Bu repo | Bedava (MIT) |
| Yapay zekâ kodlama aracı | Claude Code ücretli (Pro, aylık 20 $). Codex ChatGPT planına bağlı; Google'ın ücretsiz kotası Antigravity CLI'a taşındı ve küçük. Güncel durum: `ARACLAR.md` |
| Kurgu: kodla animasyon (HyperFrames), ffmpeg, Whisper | Bedava, senin bilgisayarında çalışır |
| Ses: kendi sesin | Bedava |
| Ses: yapay (ElevenLabs) | Ücretsiz plan ayda 10.000 kredi verir. Ama **ticari kullanım yok** ve paylaşırken başlığa "elevenlabs.io" yazmak zorunlu. Para kazanan ya da marka tanıtan kanal için ücretli plan gerekir (Starter, aylık 6 $'dan başlar) |
| Görsel: ücretli katman (Higgsfield) | Kredi ister. Örnek video 36 kredi harcadı |
| Instagram paylaşımı (resmi Meta API) | Bedava |

Ayrıntılar, bağlantılar ve kontrol tarihi: `ARACLAR.md`.

Her videonun iki yolu var. **Ücretsiz** yolda görüntü kodla çizilir. **Ücretli** yolda yapay zekâ görselleri ve kısa klipleri kullanılır. Örnek videonun iki hâli de repoda, ikisini izleyip karşılaştırabilirsin.

## Örnek: "Evrendeki bütün oksijen yok olursa uçakta ne olur?"

Bu sistemle ürettiğimiz videolar Instagram'da [@oxygbio](https://www.instagram.com/oxygbio/) hesabında.

`videolar/oxygbio-v01-ucak/` klasöründe her adımın çıktısı duruyor:
- metin ve bilgi kontrol tablosu,
- ses dosyaları,
- kelime zamanları,
- ücretsiz sahne kodu,
- ücretli katmanın tarifi.

Kurulum bu videoyu senin bilgisayarında yeniden üretir. Kurulumun çalıştığının kanıtı budur.

## Bizim hatalarımız

`dersler/HATALAR.md`'de bu sistemi kurarken düştüğümüz her tuzak yazıyor. Birkaç örnek:
- Meta'da yanlış menüden test kullanıcısı açmaya çalıştık.
- Python sürümleri birbirini bozdu.
- Açılış sesi ucuz durdu.
- Yapay zekâ boş olması gereken sahneye bir çocuk koydu.

Repodaki komutların çoğu bu hataları zaten engelliyor.

Kapak ve başlıkta A/B testlerimizden çıkan dersler `dersler/KAPAK-BASLIK.md`'de: kazanan kalıp, önce kredisiz taslak, Instagram Reels kapağı ve açıklaması.

## İkinci beyin (isteğe bağlı)

Yapay zekâ her sohbete sıfırdan başlar. İkinci beyin, bilgisayarında duran küçük bir not defteri. Ajan içine kanalın hedefini, kararlarını, düzeltmelerini ve her videonun sonuçlarını yazar, her oturumun başında okur. Aynı şeyi iki kez söylemen gerekmez. Kurulumda ajan sana sorar. İstersen Obsidian ile açıp okuyabilirsin.

Ayrıntısı bu videoda: https://youtu.be/-z9aGjceXkc · Modül: `ikinci-beyin/BENIOKU.md`

## Senin sonuçların

Bu sistemle bir video yayınladın mı? [YouTube kanalımıza](https://www.youtube.com/@furkancavlak) abone ol ve bu repoyu anlattığımız videonun altına yorum olarak yaz: videonun linki, kaç izlenme aldı, ne işe yaradı, ne yaramadı. En çok bunu duymak istiyoruz. Kısa şablon: `BASARI-HIKAYELERI.md`.

## Lisans

Kod MIT lisanslı. Yazı tipleri (Anton, Inter Tight) SIL Open Font License 1.1 ile dağıtılıyor. Örnek videonun sesleri ElevenLabs ile, görselleri Higgsfield ile üretildi.
