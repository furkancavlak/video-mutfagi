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
| Sonuçlar | Instagram'daki rakamlar ve "Ne öğrendik" kartı. Ders, rakamlardan yapay zekâyla çıkar; "İkinci beyne kaydet" onu `kanal/<kanal>/dersler.md` dosyasına yazar. |

Uzun işler (konu toplama, metin yazma, üretim, ders çıkarma) arka planda çalışır. Sağ üstteki "iş" düğmesi kayıtlarını gösterir.

## Para harcayan tek düğme

"Onayla ve devam" sesi üretir, ElevenLabs karakteri harcar (bir video ~1.000-1.500). Panel önce sorar. Higgsfield'ı panel hiç çalıştırmaz. Panel Instagram'a kendisi paylaşım yapmaz; paylaşımı zamanlayıcı yapar.

## Sunucu

Videoların 7/24 bir sunucudan paylaşılıyorsa panel onun sırasını da gösterebilir. `panel/ayar-ornek.json` dosyasını `ayarlar/panel.json` olarak kopyala ve doldur. Panel sunucuya senin `ssh` bağlantınla gider, şifre saklamaz; şifresiz (anahtarla) bağlanabiliyor olman gerekir. "Sıraya ekle" penceresinde "Nerede: Sunucu" seçilirse video sunucuya kopyalanır ve oradaki sıraya girer.

## Güvenlik

- Panel yalnız `127.0.0.1` adresinden açılır, ağdaki başka cihazlar göremez.
- Her açılışta yeni bir anahtar üretilir, link onu taşır. Başka siteler paneli kullanamaz.
- Anahtarlar, tokenlar ekranda hiç görünmez.
