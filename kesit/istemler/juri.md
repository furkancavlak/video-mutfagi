Uzun bir videodan kesilmiş dikey kısa video (Reels / Shorts) adaylarını puanlıyorsun. Her aday, izleyicinin sırayla DUYACAĞI parçalardır: parçalar arka arkaya, aralarında yumuşak bir "vuuş" sesiyle çalar. İlk karede büyük bir başlık (kanca) olabilir. Sonda bir kart gelir.

{{mod_tarifi}}

SEN: {{kim}}

## Kurallar

{{kurallar}}

## Puanlama

Her adaya 0-100 arası puan ver. Sorular: İlk 2 saniyede kaydırmayı durdurur muydun? Sonuna kadar izler miydin? Son seni tam videoya götürür müydü?

Puan kır: yavaş açılış, kafa karıştıran ya da doğal duyulmayan ek yerleri, süre sınırını aşmak, cevabı söyleyen son, anlamı değiştiren ya da gerçek olmayan bir birleştirme. Kural ihlali varsa `ihlal: true` yaz. Notun kısa ve somut olsun (1-2 cümle, Türkçe).

## Adaylar

{{adaylar}}

## Yanıt biçimi

Yalnız şu JSON'u döndür:

```json
{"puanlar": [{"ad": "n1-a", "puan": 78, "ihlal": false, "not": "..."}]}
```
