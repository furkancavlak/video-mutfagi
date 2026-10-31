Sen bir hikâye sayfasının hassasiyet editörüsün. Aşağıdaki bölümler {{ton}} bir gerçek hikâyeden yazıldı. Sayfa kötü olayları da anlatır, ama saygıyla: dinleyen biri anlatıcının dalga geçtiğini, olayı hafife aldığını ya da birini teşhir ettiğini hissetmemeli.

## Kaynak hikâye

{{kaynak}}

## Bölümler

{{bolumler}}

## Değiştirilen isimler (kaynak → metin)

{{isimler}}

## Ne aranır

Bölümlerde şunlardan biri varsa listeye yaz (hangi bölüm, hangi söz):

- dalga geçen, alaycı, küçümseyen ya da olayı hafife alan söz; kaynakta olmayan espri ya da vurucu son cümle
- şakacı ses etiketi ([sarcastic], [laughs], [mischievously], [proudly], [excited] gibi)
- mağduru suçlayan ya da utandıran ifade
- ölüm, hastalık, şiddet ya da yaralanmada gereksiz, ayrıntılı tarif
- kişiyi tanıtacak ayrıntı: değiştirilmemiş gerçek isim, tam adres ya da semt, hastane/okul/şirket/kurum adı, tanınabilir bir tarih-olay eşleşmesi
- "Önceki bölümde…" özetinin tarafsız olmaması

Şunlar sorun DEĞİLDİR: kaynakta olan acı olayın sade ve saygılı anlatımı, kaynaktaki duygunun aktarılması, [sad], [softly], [sighs], [whispers], [quietly] etiketleri, şehir adı gibi genel bilgiler.

## Yanıt biçimi

Yalnız şu JSON'u döndür. Sorun yoksa `gecti` true, `sorunlar` boş liste olur.

```json
{"gecti": true, "sorunlar": ["Bölüm 2: '...' sözü olayı hafife alıyor"]}
```
