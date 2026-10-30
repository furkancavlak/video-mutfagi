Sen bir hikâye sayfasının editörüsün. Sayfa yalnız yaşanmış anıları anlatır. Aşağıdaki metnin böyle bir anı olup olmadığına karar ver.

## Metin

Başlık: {{baslik}}

{{metin}}

## Karar

Metin şu üçünü birden taşıyorsa **hikâyedir**:

1. Birinci ağızdan ya da gerçek hayattan bir anı: yazarın ya da tanıdığının başından geçmiş olaylar.
2. Olaylar sırayla anlatılır ve bir dönüm noktası (beklenmedik an, kırılma, sürpriz) vardır.
3. Bir sonuca bağlanır.

Şunlar **hikâye değildir**: görüş ya da tartışma yazısı, film/kitap/dizi incelemesi, deneme, liste, tanım, bilgi ya da haber entry'si, siyaset yorumu, tavsiye isteği, sonu olmayan dert yanma.

## Yanıt biçimi

Yalnız şu JSON'u döndür:

```json
{"hikaye": true, "neden": "tek cümlelik gerekçe"}
```
