# Kurgu dili (dikey, 9:16)

Her kural, reddedilmiş bir taslaktan çıktı. `sahneler.js` yazılırken bu sayfa açık durur. Denetçi ajan da aynı kurallara göre puan verir (`denetim/kare-denetci.md`).

## Temel kurallar

1. **Açık zemin.** Krem, açık gökyüzü, açık duvar. Siyah ya da çok koyu tam ekran sahne yok. Gerekiyorsa tek istisna kokpit ya da gece sahnesidir.
2. **Tek dünya.** Sahneler ayrı ayrı kartlar gibi değil, kameranın içinde dolaştığı tek bir yer gibi hissettirir. Örnek videoda bu yer uçak kabini: pencere, koltuk, dış görünüm, kokpit, yer.
3. **Yazı sahnenin içinde.** Bilgi ekranın üstüne yapıştırılmış bir kutuda değil, sahnedeki bir nesnede durur: kabin monitörü, koltuk ekranı, gövde plakası, tarla tabelası, damga.
4. **Kamera bilgiye gider.** Bilgi kameraya gelmez. Rakam söylendiğinde kamera o rakamı taşıyan nesneye yaklaşır.
5. **Her karede tek kahraman nesne.** Kalabalık kadraj yok. Hiçbir şey durduğu yüzeyden taşmaz, başka bir şeyin üstüne binmez.
6. **Çevrede küçük hareketler.** Sahne başına 2-4 tane yeter: emniyet kemeri ışığının nefes alması, camda kayan bulut, çaydan çıkan buhar. Yavaş ve düşük kontrastlı olur, hiçbir yazıya değmez.
7. **Sarsıntı ve lastik gibi sekme yok.** Aynı anda tek kamera hareketi. Yazılar tek ve yumuşak bir hareketle yerine oturur.
8. **Her an kelimeye kilitli.** Kart, rakam ve sahne geçişi saniyeye göre değil, söylenen kelimeye göre gelir: `cue('pıt', L[1])`. Elle saniye yazılmaz.
9. **Yeni bir dil denenecekse önce 20-30 saniyelik demo.** Onay gelmeden tam videoya geçilmez.
10. **Kolaya kaçma.** "Fotoğraf koy, üstüne yazı yapıştır" kalıbı reddedildi. Her vuruşun kendi grafik fikri olur.

## Üç dil, birbirine karışarak

- **A, sahnenin içindeki yazı.** Varsayılan dil budur. Monitör, tabela, damga, plaka.
- **P, büyük cümle.** Yalnız gerçekten büyük anlarda kullanılır: 2-4 kelime, kutusuz, iri. Örnek: "TEK SAĞ KALAN: İKRAM ARABASI".
- **Bilgi etiketi (yalnız ücretli katmanda).** Yapay zekâ görüntüsünün üstünde, söylenen rakamla gelen tek satırlık krem kart. Kahraman nesnenin üstüne binmez.

## Renk ve yazı

- **Renk:** Tek palet, tek vurgu rengi. Örnek kanalda vurgu mercan kırmızısı (`#E8553A`), marka rengi oksijen camgöbeği (`#1FA9BE`).
- **İnsanlar ve nesneler:** Kıyafet, koltuk ve duvar renkleri birbirinden ayrı olmalı.
- **Yazı tipi:** AntonTR (başlık ve altyazı), Inter Tight (küçük etiket). İkisi de Türkçe harfleri kapsar ve OFL lisanslıdır (`uretim/fontlar/`).
- **Kesirler:** "⅓" gibi karakterler kullanılmaz, yazıyla yazılır.
- **Altyazı:** Krem kart üstünde, kontursuz. Konuşulan kelime vurgu rengine döner. Anons yapan rolün (örnekte kaptan) satırları koyu bir kartta, rol adıyla birlikte görünür.

## Marka

- **Açılış:** Kancadan hemen sonra gelir. Krem ekran, ortada bir nokta, halka patlaması ve logo. Açılış sesiyle aynı anda vurur.
- **Kapanış:** Son cümleden sonra logo ve çağrı ("SIRADAKİ YER NE OLSUN? / YORUMA YAZ").
- **Köşe etiketi:** İkisinin arasında sol üstte durur.

Bunların hepsini çekirdek (`uretim/cekirdek.js`) çizer ve `kimlik.json`'dan okur. Videoya özel kod yazılmaz.

## Ses

- **Hız:** Anlatım 1.15 kat hızlandırılır. Dikey videoda tempo kazandırır, ses doğallığını kaybetmez.
- **Seviye:** Son karışım -14 LUFS'tur. Efektler konuşmanın altında kısılır.
- **Anons:** Anons yapan rol dar bantlı bir hoparlör sesiyle çalar, öncesinde "bing-bong" duyulur.
