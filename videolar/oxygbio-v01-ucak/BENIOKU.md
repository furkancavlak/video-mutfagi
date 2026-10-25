# Örnek: Evrendeki bütün oksijen yok olursa uçakta ne olur?

@oxygbio kanalının ilk videosu, 76 saniye. İki hâli var, ikisi de gerçekten üretildi ve onaylandı.

## Dosyalar

| Dosya | Ne |
|---|---|
| `metin.md` | Onaylanan metin ve bilgi kontrol tablosu |
| `video.json` | Satırlar ve ses etiketleri, iki rol (dayı anlatıcı, kaptan anonsu), hız 1.15, Whisper düzeltmeleri |
| `ses/01-08*.mp3` | ElevenLabs eleven_v3 ile üretilen satırlar. Yaklaşık 1.070 karakter harcandı |
| `ses/kelimeler.json` | Whisper kelime zamanları |
| `sahneler.js` | Ücretsiz katman. Kabin tek nokta perspektifle çizildi; bilgiler monitörde, koltuk ekranında, gövde plakasında ve tarla tabelasında duruyor |
| `ucretli.json` | Ücretli katman: 8 resim, 5 klip, 8 kurgu parçası, 10 bilgi etiketi. 36 kredi harcandı |

## Yeniden üretmek

```
node uretim/mix.js videolar/oxygbio-v01-ucak
node uretim/kurgu.js videolar/oxygbio-v01-ucak --render              # ücretsiz hâli
```

Ücretli hâlin resim ve klipleri repoya konmadı (~55 MB). İki yolu var:

- **İndir:** GitHub'daki **Releases** sayfasından `oxygbio-v01-ucretli-medya.zip` dosyasını indir. İçindeki `gorsel/` ve `klip/` klasörlerini `videolar/oxygbio-v01-ucak/ucretli/` altına koy. Sonra:

  ```
  node uretim/ucretli.js videolar/oxygbio-v01-ucak kurgu --render
  ```

- **Kendin üret:** `node uretim/ucretli.js videolar/oxygbio-v01-ucak gorsel` ile başla. ~36 kredi harcar. Yapay zekâ her seferinde biraz farklı resim üretir.

## Bu videoda öğrendiklerimiz

Hepsi `dersler/HATALAR.md` dosyasında. Kısaca:
- **Metin:** İlk metin "ne bilgi verdi ne güldürdü". Öncül sürünce ("oksijen gidiyor ve geri gelmiyor") çalıştı.
- **Görsel:** İlk görsel dil koyu ve slayt gibiydi. Açık zemin ve "tek dünya" ile düzeldi.
- **Denetim:** Denetçi ajan ücretsiz hâle önce 5/10, sonra 5,5/10 verdi; ücretli hâle 7/10 verdi. Doğrulanan bulgular düzeltildi.
