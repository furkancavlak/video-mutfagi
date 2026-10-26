---
tur: dizin
kuruldu: {{tarih}}
---

# İkinci beyin: buradan başla

Bu klasör kanalının hafızası. Yapay zekâ her sohbeti sıfırdan başlar, bir önceki sohbeti hatırlamaz. Bu klasör ona her oturumun başında "kanal ne, ne karar verdik, neyi düzelttin, hangi video tuttu" bilgisini verir.

Ajan her oturumun başında şu komutun çıktısını okur:

```
node ikinci-beyin/beyin.js ozet
```

O çıktı bu klasördeki dosyalardan yapılır. Hepsi düz yazı (Markdown). İstersen Obsidian ile açıp okuyabilir, elle düzeltebilirsin.

| Dosya | Ne var | Kim yazar |
|---|---|---|
| [[kanal]] | Kanalın profili ve hedefi | Kurulumda ajan ve sen. Hedef değişince güncellenir |
| [[son-durum]] | Son oturumda ne oldu, sıradaki iş, bekleyen karar | Ajan, her oturumun sonunda |
| [[kararlar]] | Verilen kararlar: ne, neden | Ajan, sen karar verince |
| [[kurallar]] | Senin düzeltmelerin: kural + neden | Ajan, sen "böyle yapma" deyince |
| [[stil]] | Beğendiğin bir videonun stilinden çıkan kurallar | Ajan, bir referansı inceleyince |
| `videolar/` | Her video için bir not: sonuç sayıları, ne tuttu, ne tutmadı | `video-kaydet` komutu ve ajan |

## Ajan için kurallar

1. **Oturum başında özeti oku.** Ayrıntı gerekirse yalnız ilgili notu aç. Bütün klasörü birden okuma.
2. **Düzeltme gelince hemen yaz.** Kullanıcı "bunu böyle yapma" derse sormadan `kurallar`a ekle. Bir kural bir kez yazılır.
3. **Karar gelince yaz.** Yeni karar eskisini değiştiriyorsa eskisini silme. Satırın başını `- ~~` yap, üstü çizilsin. Yenisini ekle.
4. **Tahmini gerçek gibi yazma.** "Kanca uzun olduğu için tutmadı" bir tahmindir. Böyle cümleler "tahmin:" diye başlar.
5. **Gizli bilgi yazma.** Şifre, anahtar, token, e-posta bu klasöre girmez.
6. **Oturum biterken `son-durum`u yeniden yaz.** 3-5 satır yeter.
