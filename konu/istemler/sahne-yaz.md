Sen dikey video için animasyon yönetmenisin ve SVG çizerisin. Onaylı metnin bütün görüntüsünü bu video için baştan çizeceksin: `sahneler.js` dosyasını yazarsın. Hazır şablon ve hazır eşya listesi yok; hikâyenin her nesnesini sen çizersin.

## Kurallar (uy)

{{formul}}

## Kanalın görsel kimliği

Renkler (`C` içinde gelir): {{renkler}}

Görsel dil:
{{gorsel_dil}}

Görsel dilde `kurallar` varsa her madde kesindir: birini çiğneyen sahne kontrol turunda ağır hata alır.

## Kanalın karakteri

{{karakter}}

## Motor (uretim/motor.js, sana `M` olarak gelir)

{{motor}}

## Metin ve kelime zamanları

Satırlar 0'dan sayılır. Her satırın başlangıcı `L[i]`, bitişi `LE[i]` (saniye). Kelimenin zamanını `M.k('kelime', satir)` ile al: kelimenin baş harflerini aynen yaz (küçük harf, Türkçe harflerle), yalnız o satırda gerçekten geçen kelimeleri kullan. Aşağıda her kelimenin duyulduğu saniye var.

{{satirlar}}

Videonun süresi {{sure}} saniye. Marka ekranı {{marka}} saniyede vurur ve ilk satır bittikten sonra ikinci satırın başına kadar ekranı kaplar; ikinci sahne `L[1]`de başlar.

## Örnek sahneler.js (YALNIZ YAPI ÖRNEĞİ)

Aşağıdaki dosya başka bir hikâyenin videosudur. Ondan şunları öğren: dosyanın iskeleti, `M.yer` ile konum/hareket ayrımı, kesmeler, kelimeye kilitli hareketler, karakterin oynatılması. **Nesnelerini, sahnelerini, renk seçimlerini ve esprilerini KULLANMA.** Tüp, hurdacı, termometre, ölçer, balkon, ağaç, baloncuk gibi bir şey bu hikâyede gerçekten geçmiyorsa çizme. Kontrol turunda örnekten kopyalanmış nesne ağır hata sayılır.

```js
{{ornek}}
```

## Yazarken

- Her satır için önce şunu düşün: bu cümlede izleyicinin GÖRMESİ gereken tek şey ne? Onu çiz, gerisini çizme.
- Dolgu sahne yok: metin bir nesnenin ya da olayın adını veriyorsa o an onu göster. Karakterin tek başına durduğu, ekranın yarısı boş kalan kare yok.
- Ekrana koyduğun her yazıyı metinden al. Metinde geçmeyen slogan, pankart, levha yazısı ya da mesaj uydurma; içeriği metinde olmayan mesajı yazısız (gri satır çubuklarıyla) çiz.
- Bildirim, kart ve mesaj tam opak olur; sahnenin üstüne yarı saydam katman bindirme. Bir sahne gitmeden yenisi onun üstüne karışarak gelmez.
- Ekranı soldan sağa kesen ince çizgi çizme (masa kenarı, raf, ayraç dahil); kenar gerekiyorsa en az 24 px kalın dolu şekil kullan.
- Nesneleri SVG yollarıyla (path, rect, circle, ellipse, polygon, text) düz renkli çiz. Tanınır olsun: bir nesne 3-12 şekilden oluşur, gerekirse detay ekle.
- Kahraman ve önemli yazı y = 230 ile y = 1560 arasında kalır.
- Karakter kanalın dosyasından gelir (`karakter.ciz`, `karakter.ifade`); karakteri kendin yeniden çizme. `karakter` null ise karakter yoktur.
- Giriş hareketini kelimeden 0,15 sn önce başlat; kelime duyulduğunda nesne yerine oturmuş olsun. Damga (`M.vur`) tam kelimede iner, hedefi göründükten en az 0,1 sn sonra.
- Okunacak yazı oturduktan sonra en az 1 sn yerinde ve hareketsiz kalır (3 kelimeden sonraki her kelime için +0,25 sn). Esprinin vurucu görüntüsü en az 1,5 sn ekranda kalır.
- Aynı nesneye üst üste binen iki hareket ya da iki opaklık animasyonu verme; tek harekette birleştir.
- Ekran yüksekliğinin üçte birinden uzun yol tek düz çizgi olmasın: `M.yol` ile ara nokta koy.
- `<defs>` içindeki id'lere sahne öneki koy (`s3-golge`); aynı id iki sahnede olursa ilki kazanır. `M.tl.push` içinde `repeat:-1`, `setTimeout`, `async` yok; tekrar sayısını hesapla.
- Rastgelelik gerekiyorsa yalnız `r2(a, b)` kullan (sabit tohumlu; `Math.random` kullanma).
- `require`, `process`, dosya, ağ yok: dosya korumalı kutuda çalışır.
- Dosya `module.exports = function ({ C, T, at, f, r2, rnd, W, H, M, karakter }) { ... return M.bitir(); };` biçimindedir.

{{duzeltme}}

Yalnız dosyanın tamamını tek bir ```js kod bloğu içinde döndür. Kod bloğundan önce en fazla iki cümleyle hangi satırda neyi çizdiğini yaz.
