# Kanal kimliği

Kimlik, kanalın her videosunda aynı kalan şeylerdir: konu, ton, anlatıcı sesi, açılış sesi, logo, renkler. Bir kez kurulur ve `kanal/<kanal-adi>/kimlik.json` dosyasına yazılır. Videolar bu dosyayı okur.

Dolu bir örnek `kanal/oxygbio/kimlik.json` dosyasında. Boş şablon `kanal/sablon/kimlik.json` dosyasında.

Ajan aşağıdaki sırayı kullanıcıyla birlikte yürütür. Her adımda kullanıcıya bir şey **dinletir ya da gösterir**, yazılı seçenek listesi okutmaz.

## 1. Konu ve referans

- **Konu:** Kullanıcıya kanalın konusunu sor. Konuyu biraz geniş tut. Örnek kanal "oksijen biterse" diye başladı ama asıl konusu daha geniş: "ne olurdu / nasıl çalışıyor".
- **Referans kanal:** Kullanıcıdan sevdiği bir referans kanal iste. Referanstan yalnız şunları al: kalite çıtası, tempo, açılış sesinin yapısı. Konsepti, karakteri ve görüntüsü kopyalanmaz. İkinci beyin kuruluysa referanstan çıkan ölçülebilir kuralları yaz: `node ikinci-beyin/beyin.js stil "Bir çekim en fazla 2 sn" --neden "referansta 60 sn'de 34 kesme"`.
- **Karakter:** Sabit bir karakter olacak mı? Olmak zorunda değil. Örnek kanalda karakter yok, yıldız konunun kendisi.

## 2. Ton

- **Komedi mi, ciddi mi, karışık mı?** Örnek kanalın tonu: her şaka gerçek bir bilgiye dayanır.
- **Küfür:** Ne kadar olacak, nerede kullanılacak? Örnek kanalda küfür bol, olaya verilen tepki olarak geçer; kişiye hakaret yok.
- **Karışım (`karisim`):** Metnin yüzde kaçı bilgi, kaçı küfür, kaçı absürt şaka olsun? Örnek kanal: %30 bilgi, %25 küfür, %45 absürt. Bilgi oranı düştükçe video eğlenceye kayar; bilgi ne kadar az olursa olsun doğrulanır.

## 3. Anlatıcı sesi (en az 3-4 ses dinlet)

1. **Seçenek:** Kullanıcı kendi sesiyle mi anlatacak, yapay sesle mi? Kendi sesiyse bu adım biter.
2. **Aday sesler:** ElevenLabs ses kütüphanesinde (Voice Library) Türkçe sesleri ara. 6-8 aday seç: yaşlı, genç, çizgi film, sokak ağzı gibi farklı karakterler olsun.
3. **Kütüphaneye ekleme:** Paylaşılan sesler önce "Add to my voices" ile eklenir, yoksa API onları bulamaz. Ses yuvası (slot) harcamazlar.
4. **Örnek üretme:** Her aday için **aynı kanca cümlesini** üret: `eleven_v3`, hız 1.1, bir iki ses etiketiyle. Bir aday için ~150 karakter harcanır, önce kullanıcıya söyle.
5. **Videonun içinde dinletme:** Örnekleri tek başına değil, açılış sesiyle birlikte dinlet. Ses ancak videonun içinde duyulunca yargılanabilir.
6. **Şive:** Şive isteniyorsa o şiveyle konuşan bir ses bul. Metin tek başına şive yapmaz.
7. **Kayıt:** Seçilen sesleri kimliğe yaz. İki ses seçilebilir, videodan videoya dönüşümlü kullanılır ve hangisinin daha iyi gittiği ölçülür.

## 4. Açılış sesi (marka sesi)

1. **Hazır seslerden başla:** `node marka/marka-sesi.js` komutu hazır sesleri listeler. 3-4 tanesini üret: `node marka/marka-sesi.js <ad> deneme.wav`.
2. **Videonun içinde dinlet:** Her birini kanca cümlesinin içine örülmüş hâliyle dinlet. Ses tek başına çalınınca kopuk duyulur.
3. **Hiçbiri olmazsa:** Kullanıcının sevdiği açılış sesini dinle. Yapısını çıkar: kaç saniye yükseliyor, vuruşta ne var (alçak bas, akor, parıltı). `marka/marka-sesi.js` içinde yeni bir hazır ses yaz.
4. **Kayıt:** Seçilen hazır sesin adını `marka.ses` alanına yaz.

## 5. Logo, etiket, çağrı, renkler

- **Logo:** İki parçalı bir yazı logosu. İkinci parça vurgu rengindedir. Örnek: `["OXYG", "BIO"]`.
- **Köşe etiketi:** Videonun boyunca köşede duran kısa yazı. Örnek: "NE OLURDU?".
- **Kapanış çağrısı:** İki satır. Örnek: "SIRADAKİ YER NE OLSUN?" / "YORUMA YAZ".
- **Renkler:** `paper` açık zemin, `ink` yazı, `coral` vurgu, `o2` marka rengi. Zemin açık olmalı.
- **Kanalın kendi kapanış kartı (isteğe bağlı, dizi/hikâye kanalları için):** `marka.ses: null` açılış/kapanış marka sesini kapatır. `marka.kapanis: "kapanis.js"` kanal klasöründeki kartı videonun sonuna ekler (`kapanis({ C, at, bas, sonraki, hesap }) -> { html, tl, sure, muzik, gorsel }`, `karakter.js` gibi korumalı alanda çalışır); `marka.kapanis_muzigi` kartla birlikte çalan müzik dosyası, `marka.hesap` kartta yazan hesap adı. Bu durumda köşe etiketi yerine üstte `video.json → etiket · BÖLÜM n` etiketi durur (`bolum`, `toplam_bolum`: son bölümde kart "devamı" demez).
- **Bölüm kapağı (isteğe bağlı, dizi kanalları için):** `marka.kapak: { dosya: "kapak.js", renkler: [{ renk, ad, tonlar }] }` her bölüme profil ızgarası için ayrı bir kapak resmi verir (Reels `cover_url`). `kapak({ C, renk, baslik, satirlar, px, satir, etiket, hesap, sahne, odak }) -> { html, css }` korumalı alanda çalışır; motor bölümün kendi sahnesinden altyazısız ve etiketsiz bir kare (`sahne`), dizinin rengini ve kanca başlığını (`dizi/kapak.js`), iki satıra bölünmüş başlığı ve hesap adını verir; sayfayı 1080x1920 JPEG yapar (`node uretim/kapak.js <video>`). Renk, dizinin ilk üretilen bölümünde bu paletten seçilir: tona uyan girdiler içinden son 20 dizinin renklerinden en uzak olanı.
- **Altyazı görünümü:** `gorsel.altyazi`: `"kutu"` (varsayılan, açık kutu içinde) ya da `"kontur"` (sahnenin üstünde beyaz Anton, kalın koyu kontur, söylenen kelime pembe).

## 6. Görsel katman

- **Ücretsiz:** kodla animasyon. Her video için `sahneler.js` yazılır.
- **Formül (ücretsiz, otomatik):** yapay zekâ her videonun nesnelerini baştan çizer (`dersler/FORMUL.md`). Bunun için kimliğe `gorsel_dil` yazılır: çizgi tarzı, ek renkler, ekrandaki yazı kuralı, kanalın imza anı, kaçınılacaklar. Kanalın tekrar eden bir karakteri varsa kullanıcıyla birlikte tarif edilir, yapay zekâ `kanal/<ad>/karakter.js` dosyasını bir kez çizer (örnek: `kanal/oxygbio/karakter.js`), kullanıcı kareye bakıp onaylar. Karakter her videoda aynı kalır, geri kalan her şey her videoda yeniden çizilir. Başka kanalın karakterini ya da örnek videonun nesnelerini kopyalama.
- **Ücretli:** Higgsfield görsel ve klip. Video başına bütçe belirlenir. Örnek video 36 kredi harcadı, bütçe 50'ydi.

Kullanıcıya örnek videonun iki sürümünü de izlet, sonra seçtir. Örnek kanalda videoların çoğu ücretsiz, yalnız biri ücretli.

## 7. İlk video öncesi son kontrol

- `kimlik.json` geçerli JSON olmalı. Kontrol: `node -e "require('./kanal/<ad>/kimlik.json')"`.
- Kullanıcı ses ve açılış sesi seçimini videonun içinde duyarak onaylamış olmalı.
- Kimlik bitti. Kullanıcıya ikinci beyni öner (`kurulum/KURULUM.md` → "İkinci beyin"). Zaten kuruluysa `kanal.md` dosyasını kimliğe göre güncelle.
