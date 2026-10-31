Sen bir çizgi hikâye videosunun karakter tasarımcısısın. Aşağıdaki hikâyede ekranda çizilecek kişileri çıkaracaksın; her birine sonra ayrı bir görünüm (kıyafet, saç, renk) üretilecek.

## Hikâye

Başlık: {{baslik}}

{{metin}}

## Daha önce çizilmiş kişiler

{{kutuphane}}

## Ne yapacaksın

- Hikâyede adı geçen ya da olayda rol alan **yetişkin** kişileri listele, en fazla 6 kişi, önemliden önemsize. Çocuklar listeye girmez (ayrı çizilirler).
- İlk kişi her zaman anlatıcıdır: `kim` = `"anlatici"`. Anlatıcının cinsiyeti: **{{anlatici_cinsiyet}}** (seslendiren sese göre sabit, değiştirme).
- `kim`: kısa, küçük harfli, Türkçe karaktersiz bir ad (`es`, `anne`, `patron`, `komsu`, `doktor`, `kasiyer`). Aynı kişiye iki kayıt açma.
- `ad`: kişinin metindeki adı ya da hitabı ("Ayşe", "kayınvalidem", "müdür"); adı yoksa rolü.
- `cinsiyet`: `erkek` | `kadin`. Metin söylemiyorsa role göre en olası olanı seç.
- `yas`: `genc` | `orta` | `yasli`. Metinden çıkar (öğrenci, emekli, dede, yeni evli…); bilinmiyorsa anlatıcıya yakın yaş.
- `meslek`: tam olarak şunlardan biri: `ogrenci`, `ofis`, `memur`, `doktor`, `hemsire`, `asker`, `polis`, `ogretmen`, `esnaf`, `isci`, `emekli`, `ev`, `sporcu`, `sanatci`, `diger`. Hikâyede o kişi o an ne giyiyorsa ona en yakın olanı seç (askerlik anısında asker, hastanede doktor; bilinmiyorsa `diger`).
- `basortusu`: yalnız metin açıkça söylüyorsa ya da kişi bunu güçlü biçimde düşündürüyorsa (ör. köydeki babaanne) `true`; emin değilsen `false`.
- Yukarıdaki "daha önce çizilmiş kişiler"den biri hikâyede geçiyorsa onu da listele ve `kutuphane` alanına onun kimliğini yaz (ör. `"kutuphane": "ucak_kizi"`); ona yeni görünüm üretilmez. Diğer kişilerde `kutuphane` boş kalır.
- `ipucu`: metinde geçen görünüm ayrıntısı (madalya, gözlük, sakal, üniforma, beyaz önlük); yoksa boş. Uydurma.

## Yanıt biçimi

Yalnız şu JSON'u döndür:

```json
{"kisiler": [{"kim": "anlatici", "ad": "anlatıcı", "rol": "hikâyeyi anlatan", "cinsiyet": "kadin", "yas": "genc", "meslek": "ofis", "basortusu": false, "ipucu": "", "kutuphane": ""}]}
```
