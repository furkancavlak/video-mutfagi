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

   > https://github.com/furkancavlakcom/video-mutfagi reposunu kur ve örnek videoyu çıkar.

3. Ajan kurulumu yapar. Senden yalnız tarayıcıda yapılacak işleri (hesap açma, giriş) ve onayları ister. Sonunda örnek videoyu açıp sana izletir.
4. Sonra şunu yaz:

   > Kendi kanalım için kimlik kuralım.

   Ardından:

   > Şu konuda bir video yapalım: …

Yapay zekâsız işler (sıra, takvim, fikir seçme, sonuçlar) için tarayıcıda bir kontrol paneli de var: `node panel/panel.js` ([panel/BENIOKU.md](panel/BENIOKU.md)).

Ajanın okuduğu talimatlar `AGENTS.md` dosyasında. Kurulum adımları `kurulum/KURULUM.md` dosyasında.

## Ne bedava, ne ücretli

| Parça | Durum |
|---|---|
| Bu repo | Bedava (MIT) |
| Yapay zekâ kodlama aracı | Bazılarının ücretsiz planı var, bazıları ücretli |
| Kurgu: kodla animasyon (HyperFrames), ffmpeg, Whisper | Bedava, senin bilgisayarında çalışır |
| Ses: kendi sesin | Bedava |
| Ses: yapay (ElevenLabs) | Ücretsiz planı sınırlı. Ticari kullanım şartlarını sitede kontrol et |
| Görsel: ücretli katman (Higgsfield) | Kredi ister. Örnek video 36 kredi harcadı |
| Instagram paylaşımı (resmi Meta API) | Bedava |

Her videonun iki yolu var. **Ücretsiz** yolda görüntü kodla çizilir. **Ücretli** yolda yapay zekâ görselleri ve kısa klipleri kullanılır. Örnek videonun iki hâli de repoda, ikisini izleyip karşılaştırabilirsin.

## Örnek: "Evrendeki bütün oksijen yok olursa uçakta ne olur?"

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

## Senin sonuçların

Bu sistemle bir video yayınladın ve izlendiyse Discussions'a yaz: kaç izlenme aldı, ne işe yaradı, ne yaramadı. En çok bunu duymak istiyoruz.

## Lisans

Kod MIT lisanslı. Yazı tipleri (Anton, Inter Tight) SIL Open Font License 1.1 ile dağıtılıyor. Örnek videonun sesleri ElevenLabs ile, görselleri Higgsfield ile üretildi.
