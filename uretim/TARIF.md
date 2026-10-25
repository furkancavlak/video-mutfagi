# Tarif: konudan yayına bir dikey video

Bu sayfa yapay zekâ ajanının iş sırasıdır. 🔒 işaretli adımlarda ajan durur, kullanıcıya **sonucu** gösterir ve onay bekler. 💳 işaretli adımlar para harcar: önce fiyatı gösterir, kullanıcı "evet" demeden `--onay` ile çalıştırılmaz.

Örnek olarak her adımın çıktısı `videolar/oxygbio-v01-ucak/` klasöründe duruyor.

## 0. Hazırlık (kanal başına bir kez)

- **Kanal kimliği** `kanal/<kanal>/kimlik.json` dosyasında durmalı. Yoksa `kanal/KIMLIK-REHBERI.md` adımlarını izle.
- **Video klasörü:** `videolar/_sablon/` klasörünü `videolar/<kanal>-v<NN>-<konu>/` adıyla kopyala.

## 0.5. Konu fikri (isteğe bağlı)

- **Konu yoksa:** `node konu/radar.js topla <kanal>` ve `node konu/radar.js puanla <kanal>`. Fikirler `kanal/<kanal>/fikirler.html` dosyasında puanıyla durur. Kullanıcı birini seçer (`sec`).
- **Otomatik yol:** `node konu/radar.js uret <kanal> <fikir-id>` aşağıdaki 1-7. adımları sırayla yürütür, ilk para kapısında durur, bitince videoyu paylaşım kuyruğuna bırakır. Ayrıntı: `konu/BENIOKU.md`.

## 1. Konu ve metin 🔒

- **Okunacaklar:** `dersler/METIN.md` ve `dersler/HATALAR.md` §5.
- **Metin:** Ajan `metin.md` dosyasını yazar: satırlar ve altında bilgi kontrol tablosu.
- **Satırlar:** Ajan aynı satırları `video.json` → `satirlar` alanına koyar. Her satırın `rol` ve `metin` alanı olur, ses etiketleri içinde kalır.
- 🔒 Kullanıcı metni okur ve onaylar.

## 2. Ses 💳🔒

```
node uretim/ses.js videolar/<video>            # karakter sayısı ve kalan kota, hiçbir şey harcamaz
node uretim/ses.js videolar/<video> --onay     # ElevenLabs ile üretir
```

- **Kendi sesiyle anlatacak kullanıcı** her satırı telefonda kaydeder. Dosyaları `ses/01-<rol>.mp3`, `02-<rol>.mp3`… adıyla koyar; bu adımı atlar.
- 🔒 Kullanıcı satırları dinler. Beğenmediği satırın dosyası silinir ve komut tekrar çalıştırılır. Yalnız o satır yeniden üretilir.

## 3. Kelime zamanları

```
.venv/Scripts/python uretim/kelime.py videolar/<video>      (Mac: .venv/bin/python)
```

- **Kontrol:** Çıktıyı metinle karşılaştır. Altyazıda yanlış çıkacak kelimeleri `video.json` → `duzeltme` alanına yaz.

## 4. Ses karışımı 🔒

```
node uretim/mix.js videolar/<video>
```

- **Çıktı:** `ses/mix.wav` ve `ses/zaman.json`.
- 🔒 Kullanıcı `mix.wav`'ı dinler. Açılış sesi kancanın içine örülmüş olmalı.

## 5a. Görüntü, ücretsiz (kodla animasyon)

- **Okunacaklar:** `dersler/KURGU-DILI.md` ve `HATALAR.md` §6.
- **Sahneler:** Ajan `sahneler.js` dosyasını yazar. Örnek: `videolar/oxygbio-v01-ucak/sahneler.js`.
- **Kanal için yeni bir görünümse,** önce yalnız ilk 20-30 saniyeyi yapar:

```
node uretim/kurgu.js videolar/<video> --kare 3,8,12,20,26     # o saniyelerin kareleri
```

- **Ön izleme:** Demo için `--render` alınır ve videonun başı kullanıcıya izletilir. 🔒 Demo onayı gelmeden tam videoya geçilmez.
- **Tam video:** Bittiğinde `node uretim/kurgu.js videolar/<video>` komutu 6 saniyede bir kare alır. Ajan karelere bakar, sorunları düzeltir, sonra `--render` alır.

## 5b. Görüntü, ücretli (Higgsfield) 💳

- **Okunacak:** `HATALAR.md` §7.
- **Tarif:** Ajan `ucretli.json` dosyasını yazar: resimler, klipler, kurgu parçaları, bilgi etiketleri. Örnek: `videolar/oxygbio-v01-ucak/ucretli.json`.
- **Bütçe:** Örnek video 36 kredi harcadı (8 resim ~9 kredi, 5 klip ~27 kredi).

```
node uretim/ucretli.js videolar/<video> gorsel          # fiyat
node uretim/ucretli.js videolar/<video> gorsel --onay   # resimler (ucuz) → ucretli/gorseller.jpg'ye bak
node uretim/ucretli.js videolar/<video> klip            # fiyat
node uretim/ucretli.js videolar/<video> klip --onay     # klipler (pahalı)
node uretim/ucretli.js videolar/<video> kurgu           # kareler
node uretim/ucretli.js videolar/<video> kurgu --render
```

- **Resimlerden sonra dur:** Klip üretmeden önce resimlere bak. Fazladan bir insan, yazı ya da tutarsız karakter varsa o resmi sil ve yeniden üret.

## 6. Denetim (her render'dan sonra, zorunlu)

- `denetim/DENETIM.md` adımlarını izle.
- Bulguları karelerle doğrula, düzelt, yeniden render al.

## 7. Kullanıcıya göster 🔒

- **Video:** Videoyu aç, kısa bir rapor ver: ne yapıldı, denetim ne buldu, neler düzeltildi.
- 🔒 Kullanıcı onaylamadan paylaşım yapılmaz.

## 8. Paylaş

Kuyruğa koy, zamanlayıcı saati gelince paylaşır (`kuyruk/BENIOKU.md`):

```
node kuyruk/kuyruk.js ekle videolar/<video>/cikti/<ad>-ucretsiz.mp4 --aciklama "..."
```

Hemen paylaşmak için: `node instagram/paylas.js gonder <mp4> --aciklama "..."`.

- **Açıklama:** `video.json` → `aciklama_instagram` alanında hazır durur.
- **İlk kez paylaşıyorsan:** Önce `instagram/REHBER.md`.

## 9. Sonuçları kaydet (ikinci beyin kuruluysa)

```
node ikinci-beyin/beyin.js video-kaydet videolar/<video>      # paylaşımdan hemen sonra
node kuyruk/kuyruk.js sonuclar                                # 1 gün ve 7 gün sonra; video notları kendiliğinden güncellenir
```

- **Sayıları göster:** İzlenme, erişim, paylaşım. Önceki videolarla karşılaştır (`node ikinci-beyin/beyin.js ozet`).
- **Ne tuttu, ne tutmadı:** Kullanıcıyla birlikte yaz: `video-kaydet videolar/<video> --tuttu "..." --tutmadi "..."`. Yorumun tahminse "tahmin:" diye başlat.
- **Ders:** Bir sonraki videoyu değiştirecek bir şey çıktıysa kural ya da karar olarak yaz (`ikinci-beyin/BENIOKU.md`).
