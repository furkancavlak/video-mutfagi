# Kontrol paneli

Yapay zekâyla konuşmadan yapılan işler için tarayıcıda açılan küçük bir ekran. Yalnız senin bilgisayarında çalışır.

```
node panel/panel.js
```

Terminalde bir link çıkar, tarayıcı kendiliğinden açılır. Kapatmak için terminalde Ctrl+C.

## Sayfalar

| Sayfa | Ne yaparsın |
|---|---|
| Bugün | Bilgisayarının (ve sunucunun) durumu. Senden bekleyen her şey düğmesiyle: onaylar, takılan videolar, okunacak metinler, sıraya girmemiş videolar. |
| Fikirler | Konu radarının bulduğu fikirler. Seç, reddet, kendi fikrini ekle, "Metnini yaz". |
| Üretim | Her video hangi adımda: metin, ses, video, kalite kontrolü. Metni oku, raporu aç, "Onayla ve devam". |
| Sıra | Paylaşım sırası. Saat değiştir, onayla, sıradan çıkar. Sunucu tanımlıysa ikisi arasında geçiş. |
| Takvim | Paylaşılanlar (yeşil) ve planlananlar (sarı). |
| Sonuçlar | Instagram'daki rakamlar ve "Ne öğrendik" kartı. Ders, rakamlardan yapay zekâyla çıkar. "Kaydet": ikinci beyin kuruluysa dersi oraya karar olarak yazar (ajan her oturumda okur), kurulu değilse `kanal/<kanal>/dersler.md` dosyasına. Metin yazan yapay zekâ bu dosyayı kendiliğinden okumaz. |

Uzun işler (konu toplama, metin yazma, üretim, ders çıkarma) arka planda çalışır. Sağ üstteki "iş" düğmesi kayıtlarını gösterir.

## Para harcayan düğmeler

Her ücretli adım önce durur, fiyatını gösterir ve yalnız kendi onayıyla, en fazla o fiyata çalışır:

- **"Onayla ve devam":** sesi üretir. Pencere bu metnin ElevenLabs karakter sayısını gösterir. Metin sonradan uzarsa iş durur, yeniden sorar.
- **"Krediyi onayla":** kanalın görüntü katmanı `ucretli` ise ses bittikten sonra iş Higgsfield adımında durur. Panel Higgsfield'dan alınan kesin fiyatı gösterir. Resimler ve klipler ayrı ayrı sorulur. `sablon` ve `ucretsiz` katmanlarda bu adım yoktur.

Metin yazma, puanlama ve ders çıkarma yapay zekâyı çağırır. Claude Code kuruluysa Claude aboneliğinle çalışır, ek ücret yoktur. Kurulu değilse ve `ANTHROPIC_API_KEY` tanımlıysa kullandıkça ücretli API'ye gider. Panel hangisinin kullanıldığını düğmenin üstünde yazar. Panel Instagram'a kendisi paylaşım yapmaz; paylaşımı zamanlayıcı yapar.

## Sunucu

Videoların 7/24 bir sunucudan paylaşılıyorsa panel onun sırasını da gösterebilir. `panel/ayar-ornek.json` dosyasını `ayarlar/panel.json` olarak kopyala ve doldur. Panel sunucuya senin `ssh` bağlantınla gider, şifre saklamaz; şifresiz (anahtarla) bağlanabiliyor olman gerekir. "Sıraya ekle" penceresinde "Nerede: Sunucu" seçilirse video sunucuya kopyalanır ve oradaki sıraya girer. Saat, bilgisayarının saat dilimiyle gönderilir (ör. `19:00+03:00`); sunucu başka saat diliminde olsa da video seçtiğin saatte çıkar. Saat değiştirmek için sunucudaki repo da güncel olmalı.

## Güvenlik

- Panel yalnız `127.0.0.1` adresinden açılır, ağdaki başka cihazlar göremez.
- Her açılışta yeni bir anahtar üretilir, link onu taşır. Başka siteler paneli kullanamaz.
- Anahtarlar, tokenlar ekranda hiç görünmez.
