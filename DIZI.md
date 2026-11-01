# Hikâye dizisi ve web paneli

Bu bölüm, mutfağın en büyük parçasını anlatıyor: internette çok sevilmiş gerçek anıları **bölüm bölüm** Reels dizisi olarak anlatan, kendi kendine çalışan bir kanal. Web paneli de çoğunlukla bunun için yapıldı.

Tek videoluk bir kanal kuruyorsan (bilgi, haber, tek seferlik hikâye) bu bölüm sana gerekmez. Panelin Sıra, Takvim ve Onaylar sayfaları yine işine yarar. Hikâyeler sayfası ise "Bu kanalda hikâye dizisi yok" der ve kenarda durur.

## Neden dizi?

Reels'te tek bir video izlenir ve unutulur. Bir hikâyeyi en heyecanlı yerinde kesip "devamı yarın" dersen, izleyici ertesi gün sayfana kendisi geri gelir, yorumlara "devamı ne zaman?" yazar. Takipçi böyle büyür.

Ama her hikâye tutmaz. Kimsenin izlemediği bir hikâyenin 5 bölümünü üretmek hem para hem izleyici kaybıdır. O yüzden sistem her bölümden sonra rakamlara bakar. Tutan hikâyeye devam eder, tutmayanı erkenden keser. Bir televizyon kanalının reytinge bakıp diziyi uzatması ya da yayından kaldırması gibi.

Amaç, insanın yalnız iki yerde karar verdiği bir kanal: **hikâyenin metnini onaylamak** ve **videoyu onaylamak**. Gerisi (hikâye bulmak, bölmek, seslendirmek, çizmek, paylaşmak, ölçmek) kendiliğinden döner.

## Bir hikâyenin yolculuğu

1. **Havuz.** Sistem her pazartesi sabah, ayarladığın temalarda (aşk, ayrılık, iş hayatı, askerlik...) Ekşi Sözlük'ün en beğenilen anılarını tarar. Reddit de kaynak olabilir. Bulduklarını yaklaşık bir aylık bir hikâye havuzuna koyar. Her aday önce "bu gerçekten bir hikâye mi, yoksa bir yorum ya da film eleştirisi mi?" kontrolünden geçer.
2. **Bölme.** Sırası gelen hikâye, kendi akışına göre **2-5 bölüme** ayrılır. Her bölüm yaklaşık 1 dakika sürer, hikâye uzunsa bölüm sayısı artar. 2. bölümden itibaren her bölüm "Önceki bölümde..." diye tek cümleyle açılır. Bölme sırasında üç kontrol yapılır:
   - **Sadakat:** kaynakta olmayan bir olay, şaka ya da cümle eklendiyse metin geri gönderilir. İsimler değiştirilir.
   - **Ton:** hikâye komik mi, hüzünlü mü, ürkütücü mü, ciddi mi? Ciddi bir hikâye komik bir sesle ya da komik efektlerle anlatılmaz.
   - **Hassasiyet:** ciddi hikâyede alay, mağduru suçlama ve kimliği ele veren ayrıntı aranır.
3. **Metin onayı (sen).** Bölünmüş hikâye panelde **Onaylar → Metin onayı bekleyen hikâyeler** bölümüne düşer. Bölümleri okursun, istersen düzeltirsin, onaylar ya da reddedersin. Onaylanmamış hikâyenin hiçbir bölümü seslendirilmez, yani para harcanmaz. Sistem elinde hep birkaç onaylı hikâye stoku tutmaya çalışır.
4. **Üretim.** Bölümün zamanı gelince ses (ElevenLabs), sahneler, kurgu, altyazı ve kapak üretilir. Her hikâyenin bir rengi ve kısa bir kanca başlığı olur, profil ızgarasında bölümler birbirine benzer. Son bölümün kapanışında yorum yazanların adları teşekkür olarak geçer.
5. **Video onayı (sen).** Bitmiş video **Onaylar → Video onayı bekleyenler** bölümüne düşer. İzler, onaylarsın. Güvendiğin bir hikâye için bu onayı kapatmak da mümkün (hikâyenin kaydında `oto_onay: true`).
6. **Paylaşım.** Video sıraya girer ve saati gelince Instagram'a paylaşılır. Günde birkaç sabit saat vardır (ör. 10:00, 15:00, 20:00). Bir hikâye ilk bölümü kaçta çıktıysa diğer bölümlerinde de o saatte çıkar, izleyici alışsın diye. Aynı saate iki video düşmez.
7. **Ölçüm ve karar.** Bir sonraki bölümün saatinden 3 saat önce önceki bölümün rakamlarına bakılır (izlenme, tutma oranı, yorumlar). Sonra karar verilir:
   - **Devam:** bölüm kanalın kendi ortalamasına yetiyor. Yorumlarda "devam", "2. bölüm" gibi kelimeler yeterince geçiyorsa da hep devam edilir.
   - **Kes:** bölüm ortalamanın belirgin altında kaldı. Hikâyenin kalan bölümleri üretilmez.
   - İlk birkaç hikâye hiç kesilmez, çünkü kanalın henüz kıyas yapacak ortalaması yoktur.

   Karar panelde görünür. Beğenmezsen "Devam ettir" ya da "Kes" diye elle değiştirebilirsin.

## Web paneli

```
node panel/panel.js
```

Panel senin bilgisayarında tarayıcıda açılır. Videolar 7/24 bir sunucudan paylaşılıyorsa sunucunun durumunu da gösterir (kurulumu [panel/BENIOKU.md](panel/BENIOKU.md)'de).

| Sayfa | Ne için |
|---|---|
| **Onaylar** | Senden bekleyen her şey tek yerde: metin onayı bekleyen hikâyeler, video onayı bekleyenler, havuzdaki sıradaki hikâyeler ve kontrolde takılıp sana bırakılanlar. Boş vakit buldukça açıp onaylamak için yapıldı. Onayladığın şey listeden çıkar, pencere kendiliğinden sıradakine geçer. |
| **Hikâyeler** | Her hikâye bir kart: teması, tonu, bölümleri, her bölümün durumu ve izlenmesi. Karta tıklayınca hikâyenin penceresi açılır. Orada bölümleri izler, devam/kes kararını görür, teşekkür listesine isim ekler ve saatleri ayarlarsın (aşağıda). |
| **Takvim** | Paylaşılan ve planlanan bölümler, haftalık ya da aylık görünüm. Elle sabitlenen saatler 🔒 ile işaretlidir. |
| **İstatistikler** | Hesabın ve her videonun rakamları (izlenme, erişim, beğeni, kaydetme, paylaşım, izlenme süresi, kaydırıp geçme oranı), seçilebilir dönemlerle. Hangi hikâyenin neden tuttuğunu burada görürsün. |
| **Sıra** | Paylaşılmayı bekleyen videolar. Saatini değiştirebilir, onaylayabilir, sıradan çıkarabilirsin. |
| **Ayarlar** | Günde kaç bölüm çıkacağı, paylaşım saatleri, ölçümün yayından kaç saat önce yapılacağı, bölümler arası en uzun ara, video onayının kaç gün süreceği, kesilmeyecek ilk hikâye sayısı ve "devam" sayılacak yorum kelimeleri. |

### Saati kendin seçmek

Saatleri sistem kendisi seçer ama son söz senindir. Hikâyenin penceresindeki **Saat** bölümünde iki şey yapabilirsin:

- **Hikâyenin saati:** "bu hikâye bundan sonra 21:00'de çıksın" dersin. Kalan bütün bölümler o saate geçer, ölçüm de ona göre kayar. "Otomatiğe dön" ile sisteme geri bırakırsın.
- **Bir bölümü sabitlemek:** henüz yayınlanmamış bir bölüme belirli bir gün ve saat verirsin (🔒). Sistem o bölümü bir daha oynatmaz, diğer bölümler onun etrafında yer değiştirir.

### Reyting ve plan (deneme)

Her hikâyeye, kanalın kendi ortalamasına göre bir reyting puanı verilir. Puan, televizyon reytingi gibi "bu hikâye kanalın normaline göre ne kadar iyi gidiyor" sorusunu cevaplar. Bu puanla önümüzdeki 48 saatin slotlarına hangi bölümün gireceği planlanır. Şimdilik **deneme modunda**: plan panelde görünür ama kendisi bir şey değiştirmez. Yeterince veri birikince kararlarıyla gerçekte olanı karşılaştırıp açmak için yapıldı.

## Kendi kanalında açmak için

Hikâye dizisi bir kanal kitine bağlıdır. Kit `kanal/<kanal>/` klasöründedir; örneği `kanal/sablon/`, rehberi `kanal/KIMLIK-REHBERI.md`.

- `konu.json` içine bir `dizi` bölümü: temalar ve Ekşi başlıkları, paylaşım saatleri, günde kaç bölüm, kesme eşiği. Bu bölüm yoksa kanal tek videoluk kanal sayılır.
- `kimlik.json` içinde anlatıcı sesleri (`anlaticilar`): her ses için cinsiyet ve yaş. Sistem her hikâyeye uygun sesler arasından birini verir, hikâyenin bütün bölümleri aynı sesle gider. Birden fazla ElevenLabs hesabın varsa anahtarları `~/.video-mutfagi/elevenlabs.txt`, `elevenlabs-2.txt`... diye koy. Önce ilki harcanır, bitince sıradakine geçilir.
- Saatlik çalışmayı başlatmak için: `node dizi/zamanlayici.js kur <kanal>`. Bilgisayarında ya da bir sunucuda her saat başı bakar, haftada bir havuzu doldurur.
- Ekşi Sözlük bazı sunucu adreslerini engelleyebilir. Öyle olursa havuzu kendi bilgisayarından doldur: `node dizi/havuz.js doldur <kanal>`.

Teknik ayrıntılar (dosyalar, alanlar, kurallar) [dizi/BENIOKU.md](dizi/BENIOKU.md) dosyasında.

## Bizden notlar

- İlk 6-10 videoyu kendin izleyerek onayla, sonra yavaş yavaş serbest bırak.
- Bölüm uzunluğunu kelime sayısıyla sınırlama. Hikâyeyi doğal dönüş noktalarından böl; uzun hikâye daha uzun bölüm değil, daha çok bölüm alır.
- Kancayı uydurma. İlk cümlede "kim + tuhaf durum" olsun: "Tanımadığı bir numara onu veli grubuna ekledi, çocuğu yok bile" tipi bir açılış, "İki yıl önceydi..." tipi bir açılıştan çok daha az kaydırılıyor. Bunu kendi rakamlarımızda gördük.
- Ciddi hikâyeyi saygıyla anlat: hüzünlü ses, komik efekt yok.
