Bu video için yazılmış animasyonun karelerine bak. Kareler şu dosyalarda (her karenin üstünde saniyesi yazar): {{sayfalar}}

Metin (satırlar 0'dan sayılır, köşeli parantezde satırın saniye aralığı):

{{satirlar}}

Kanalın görsel kimliği: {{gorsel_dil}}

Görsel kimlikte `kurallar` varsa her maddesi kesindir: bir kareyi her kurala karşı ayrı ayrı kontrol et. Kural çiğneyen her kare `yuksek` ağırlıklı sorundur ve sahne "tamam" olmaz.

Altyazı kartı (alttaki krem kutu) ve sol üstteki marka etiketi otomatik gelir; onları değerlendirme, yalnız animasyonun onlara binip binmediğine bak.

Her kareyi şu hatalar için kontrol et:
- nesne kadrajdan taşmış, ekranın tepesine ya da köşesine fırlamış, yarısı kesik
- önemli nesneler üst üste binmiş, yazı başka bir nesnenin altında kalmış
- kahraman ya da önemli yazı altyazı bandına (karenin alttan yaklaşık beşte biri) ya da marka etiketine girmiş
- görüntü o anda okunan cümleyi göstermiyor, ilgisiz ya da boş
- nesne tanınmıyor (ne olduğu anlaşılmıyor)
- okunacak yazı okuma anında hâlâ hareket ediyor, yarı saydam ya da sol/sağ kenara 60 pikselden yakın
- damga (vurulan etiket) hedefi görünmeden inmiş
- aynı nesne iki karede farklı görünüyor (renk, oran, yön)
- aynı anda çok fazla şey hareket ediyor, göz nereye bakacağını bilmiyor
- örnek videodan kopyalanmış nesne (oksijen tüpü, hurdacı kamyoneti, termometre, balkon korkuluğu, ölçer kadranı, CO₂/O₂ baloncukları) bu hikâyede geçmediği hâlde çizilmiş
- dolgu kare: metin o an bir nesnenin ya da olayın adını veriyor ama karede o yok; ya da karakter tek başına duruyor ve ekranın yarısı boş
- uydurma yazı: karede okunan her yazıyı (bildirim, balon, levha, pankart, not, etiket) metinle karşılaştır. Metinde geçmeyen slogan, mesaj, isim ya da cümle varsa sorun olarak yaz ve yazıyı aynen alıntıla. Metindeki kelimeler, kişi adları ve grubun adı serbesttir.
- yarı saydam katman: sahnenin üstünde yarı saydam bildirim, kart ya da perde var; ya da iki sahne üst üste karışmış görünüyor
- ekranı soldan sağa kesen ince çizgi (nesneye ait olmayan, karenin bir kenarından öbürüne giden ince yatay ya da dikey çizgi)

Yalnız gerçekten gördüğün sorunları yaz. Her sorun için hangi saniyede olduğunu ve nasıl düzeltileceğini söyle. Kusursuz değil ama izlenebilir bir sahne için "tamam" de; yalnız izleyicinin fark edeceği hatalar "yuksek" ya da "orta" olur.

Yalnız şu JSON'u döndür:

```json
{"tamam": true, "puan": 7, "sorunlar": [{"saniye": 12.5, "sorun": "...", "duzeltme": "...", "agirlik": "yuksek|orta|dusuk"}]}
```
