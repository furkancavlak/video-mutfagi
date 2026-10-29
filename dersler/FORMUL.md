# Formül: her videonun kendi çizimi

`formul` katmanının kuralları. Bu katmanda video hazır bir şablonu doldurmaz. Yapay zekâ her video için sahneyi
baştan çizer (`sahneler.js`), sonra kendi karelerine bakıp düzeltir.

Neden: hazır şablon ve hazır eşya listesi her videoyu aynı yapıyor. 29.10.2026'daki model testinde yedi modelin
dördü espriyi konudan değil, listede çizimi olan eşyadan kurdu (çay bardağı dört metinde çıktı). Elindeki oyuncak
ne kadar azsa model her hikâyeyi o oyuncaklara uyduruyor.

Örnek video: `videolar/oxygbio-ornek-formul/`. Yalnız yapısı örnektir; nesnelerini başka videoda kullanma.

## Üç katman: mantık repoda, görünüş kanalda, nesneler videoda

| Nerede | Ne | Kim yazar |
|---|---|---|
| Repo (`dersler/FORMUL.md`, `uretim/motor.js`) | Kurallar ve görünmeyen motor: kesme, kelimeye kilitleme, hareketler. Tek bir çizim yok. | Repo |
| Kanal (`kanal/<ad>/kimlik.json` → `gorsel_dil`, `kanal/<ad>/karakter.js`) | Renkler, çizgi tarzı, yazı, tekrar eden karakter, kanalın imza anı | Kanal kurulurken bir kez; sahibi onaylar |
| Video (`videolar/<ad>/sahneler.js`) | Hikâyenin bütün nesneleri ve sahneleri | Her videoda yeniden, yapay zekâ |

## Yedi kural

1. **Her cümle tek kadraj.** Bir an ekranda tek kahraman ve tek nesne olur. Kadrajlar sert kesmeyle değişir. Kadraj
   içinde kamera gezinmez, yalnız yavaşça yaklaşır.
2. **Karakter oynar, dekor değildir.** Kanalın karakteri varsa en az bir sahnede bir şey YAPAR: panikler, koşar,
   stoklar, kafasını uzatır. Konuşma balonu yerine hareket.
3. **Bilgi mekanizmayla gösterilir.** Yüzde çubuğu ya da gösterge yerine olayın kendisi gösterilir. Örnekte
   "orman ürettiği oksijeni kendisi harcıyor" bilgisi, ağaçtan çıkan O₂ baloncuklarının yay çizip mantarlara geri
   girmesiyle gösterildi.
4. **Şaka tanıdık bir davranışın abartısıdır.** Rastgele tuhaf görüntü değil. Test: "bunu bizim mahallede biri
   kesin yapar" denebiliyor mu? Örnekte panikle oksijen tüpü stoklayan dede ve "dedem pandemide de tuvalet kâğıdı
   stoklamıştı".
5. **Nesneler hikâyeye özel çizilir.** Hazır liste yok. Hikâye "tüp" diyorsa tüp, "hurdacı" diyorsa hurdacı
   kamyoneti çizilir.
6. **Eylem kelimeye kilitlenir.** Kelime okunduğu an nesne bir şey yapar. Örnekte "bırakıyor" denince ağaç griye
   döner, "diziyor" boyunca tüpler tek tek düşer.
7. **Kanalın imza anı.** Her kanalın kendine ait tekrar eden bir anı olur (`gorsel_dil.imza`). oxygbio'da koyu tam
   ekranda "1000 YIL SONRA" ve ardından aynı kadrajın bin yıl sonraki hâli.

## Metin tarafı

Metin kuralları `dersler/METIN.md` içinde. Formülü doğrudan etkileyenler:

- **"Bir şey olmaz" bitişi yok.** Gerçek bilgi "beklenen felaket olmuyor" diyorsa, ters köşe asıl etkiyi gösterir.
  Örnekte oksijen yerinde kaldı ama çürüyen ormanların karbondioksidi dünyayı ısıttı. İzleyici "demek bir şey
  olmuyormuş" diye çıkmamalı.
- **Her satır bir kadraja dönüşebilmeli.** Satırda gösterilecek somut bir şey yoksa satır zayıftır.

## Teknik kurallar (sahneler.js)

- Sahne kodu korumalı kutuda çalışır: `require`, dosya ve ağ yok. Yalnız metin (SVG ve GSAP satırları) üretir.
- Kare 1080x1920. **Üst 230 piksel** marka etiketinin, **1560 pikselin altı** altyazının. Kahraman ve önemli yazı
  bu iki bandın arasında kalır.
- `M.kesmeler([...])` ile her satırın başında sert kesme. Marka ekranı ilk satır bitince 1 saniye kadar kaplar
  (`kimlik.json` → `marka`); ikinci sahne `L[1]`de başlar.
- **Konumu dış gruba, hareketi iç gruba ver: `M.yer(x, y, ic, { sinif })`.** GSAP `x`/`y` değerini mutlak koyar.
  Kendi `transform`'u olan bir gruba `x`/`y` verirsen nesne ekranın tepesine fırlar (örnek videoda ilk denemede
  tüpler ve baloncuklar böyle kayboldu).
- Hareketler en az 0,25 sn. Zıplayan/elastik yumuşatma yok. Damga 0,3 sn, `power3.out`.
- Aynı anda ikiden fazla nesne hareket etmez. Ortam hareketi (nefes, baloncuk) yavaş ve az.
- Ekrandaki yazılar kanalın yazı kuralına uyar (`gorsel_dil.yazi`). Türkçe karakterler için `AntonTR` yüklü.

## Motor (`uretim/motor.js`)

Çizim yapmaz, yalnız zaman ve hareket. Tam liste dosyanın başında. Özet:
`M.k` (kelimenin zamanı), `M.sahne`, `M.kesmeler`/`M.kes`, `M.yaklas`, `M.yer`, `M.belir`, `M.kaybol`, `M.vur`,
`M.dus`, `M.titre`, `M.zipla`, `M.git`, `M.yol`, `M.renk`, `M.nefes`, `M.bitir`. Daha özel bir hareket gerekirse
`M.tl.push(...)` ile GSAP satırı doğrudan yazılır.

## Kanalın karakteri (`kanal/<ad>/karakter.js`)

Kanalın tekrar eden karakteri bir kez çizilir ve her videoda aynı kalır. Dosya `ciz(id, secenekler)` ve
`ifade(M, id, ad, t)` verir; hangi parçasının oynatılabileceği dosyanın başında yazar. Karakteri olmayan kanalda
bu dosya yoktur ve sahneler `karakter` yerine `null` alır.

## Kontrol turu

Sahne yazıldıktan sonra her satırdan kareler alınır ve yapay zekâ kendi karelerine bakar
(`konu/istemler/sahne-denetim.md`). Aradığı şeyler:

- Kadrajdan taşan, ekranın tepesine fırlamış, üst üste binmiş nesne
- Altyazı bandına ya da marka etiketine giren önemli öğe
- Okunmayan, anlamsız ya da cümleyle ilgisiz görüntü
- Örnek videodan kopyalanmış nesne (tüp, hurdacı, termometre...)
- Satırı gösteren somut bir şey yoksa boş kadraj

Ağır sorun varsa sahne en fazla iki kez düzeltilir. Yine de sorun kalırsa **en yüksek puanlı deneme** kullanılır,
kalan notlar `uretim.json` → `adimlar.sahne.kalan` alanına ve çıktıya yazılır; paylaşmadan önce bakılır. Hazır şablona
düşme yoktur (29.10.2026 kararı): kendi çizimi olan 7/10'luk bir sahne, hazır şablondan iyidir. Üç denemenin
hiçbirinde kod çalışmazsa üretim durur ve insana haber verir.

Seçilen model resim göremiyorsa (yalnız metin okuyan modeller) kontrol yapılamaz: çalışan ilk deneme kontrolsüz
kullanılır ve çıktıya "sahne kontrol edilmedi" notu düşülür. Böyle bir modelle üretilen videoyu paylaşmadan önce baştan sona izle.

Sahne çiziminin düşünme ayarı `konu.json` → `llm.efor_sahne` (varsayılan `high`). Ucuz ve hızlı modeller bütün hakkını
düşünmeye harcayıp cevap yazamayabilir (GLM 5.3 Flash 29.10'da 32.000 token düşünüp boş döndü); onlar için `low`.

Bitmiş videonun ayrıca denetlenmesi (`video-denetim`) bu katmanda yapılmaz: aynı kareler sahne turlarında zaten
kontrol edildi. Son sahne puanı videonun denetim puanı olarak kaydedilir.
