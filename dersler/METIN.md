# Metin (60-80 saniyelik dikey video)

Yapay zekâ metni bu kurallara göre yazar, kullanıcı onaylar. Metin onaylanmadan ses üretilmez, çünkü ses para harcar.

## Yapı

1. **Kanca, ilk satır (5-8 sn).** Durumu tek cümlede kur ve merakı aç. Selam yok, "bugün size" yok.
   > Lan, on bir bin metredesin, ikram arabası geliyor… ve evrendeki bütün oksijen bir anda yok oluyor.
   Marka açılış sesi bu satırın hemen ardından vurur.
2. **Tırmanış, 4-6 satır.** Her satır bir öncekinden büyük bir sonuç getirir. Örnekte sıra şöyle: cam, insan, uçak, kaptan, yer.
3. **Bilgi, küfür ve absürt şaka karışımı kimlikte yazar** (`kimlik.json` → `karisim`). Örnek kanal %30 bilgi, %25 küfür, %45 absürt örnekle yazar. Karışım yoksa her satırda bir gerçek bilgi olur. Şaka bilginin kendisinden çıkar ("Uçak camı aslında cam değil, akrilik; üçte biri oksijen").
4. **Ters köşe kapanış, son satır.** Beklenmedik ama doğru bir son: "Enkazdan sağlam çıkan tek şey ne? İkram arabası. O da alüminyum."
5. **Kapanış çağrısı.** Bunu marka ekranı yazıyla söyler ("SIRADAKİ YER NE OLSUN? YORUMA YAZ"), ayrıca seslendirilmez.

## Kurallar

- **Öncül sürer.** "Gidiyor ve geri gelmiyor." Kurtuluş yolu (maske, tüp, planör) kapatılır, yoksa hikâye 5 saniyede biter.
- **Komedi ve bilgi birlikte.** Yalnız şaka boş kalır, yalnız bilgi sıkar. Absürt örnek bilginin saçma, somut sonucudur; gerçek bilgi gibi sunulmaz, tabloda "şaka" diye işaretlenir.
- **Sonuna kadar tutma.** Bir absürt öğe başta kurulur, ortada geri döner, kapanışta en büyük hâliyle patlar.
- **Küfür ünlem olarak, olayın ortasında.** Başa ve sona yapıştırılmaz. Kişiye ya da gruba yönelik hakaret olmaz. Ne kadar küfür kullanılacağı `kimlik.json` → `kufur` alanında yazar.
- **İkinci bir ses varsa bir role ver.** Örnekte kaptan anonsu var. Rol `video.json` → `anons_rolleri` alanına yazılırsa hoparlör sesi ve "bing-bong" otomatik eklenir.
- **Bir fikir bir kez anlatılır.** Aynı şeyi iki örnekle tekrar etme.
- **Yapay şok cümlesi yok.** "Meğer çok kötü bir fikirmiş…" gibi cümleler kullanılmaz. Merak içerikten doğar.
- **Ses etiketleri** (`[excited]`, `[shouting]`, `[laughs]`, `[pause]`) tonu yönetir, sesli okunmaz. Satır başına 1-2 tane yeter.

## Bilgi kontrol tablosu (zorunlu)

Metnin altına şu tablo konur:

| Cümle | Doğru mu | Kaynak / hesap |
|---|---|---|
| Uçak penceresi akrilik | ✔ | Yolcu uçağı pencereleri gerilmiş akriliktir (PMMA) |
| Akrilikin üçte biri oksijen | ✔ hesap | C₅H₈O₂: 32/100 ≈ %32 |

Kuralın kendisi:

- Kaynağı bulunamayan bilgi metinden çıkar.
- Öncülün bir sonucu olan ama gerçek bir deneye dayanmayan cümleler ("toz oldu") tabloda öyle yazılır: "öncülün sonucu".

## Bir tur en fazla 10 dakika

Metni 3-4 kez cilalamak 1-2 saat sürer ve kazancı azdır. İlk iyi taslağı göster, kullanıcının notlarını al, düzelt. Bir satırı değiştirirsen sonraki 2-3 satırı da akışa göre yeniden oku.
