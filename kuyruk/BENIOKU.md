# Paylaşım kuyruğu

Instagram'ın API'sinde "şu saatte yayınla" diye bir ayar yok. Planlama yalnız uygulamanın içinde, elle yapılabiliyor. Bu yüzden videoları biz tutuyoruz. Bilgisayardaki bir zamanlayıcı her 5 dakikada bir kuyruğa bakar ve saati gelen videoyu paylaşır.

## Nasıl çalışır

1. **Video sıraya girer.** Elle de girebilir (`ekle`), konu radarı da otomatik üretip kendisi bırakabilir.
2. **Saat atanır.** Saat verilmezse kuyruk sıradaki boş paylaşım saatini kendisi seçer. Saatler ve günlük sınır `ayarlar/kuyruk.json` dosyasındadır.
3. **Onay beklenir.** "Onay gerekli" işaretli video sen `onayla` diyene kadar paylaşılmaz.
4. **Paylaşılır.** Zamanlayıcı saati geleni paylaşır, sonucu kaydeder. Hata olursa 30 dakika sonra tekrar dener, en fazla 3 kez.
5. **Sonuçlar alınır.** `sonuclar` komutu paylaşılan videoların izlenme, erişim, beğeni ve paylaşım sayılarını çeker.

```
node kuyruk/kuyruk.js ekle video.mp4 --aciklama "..." [--zaman "2026-10-27 19:00"] [--onay-gerekli] [--hesap <ad>]
node kuyruk/kuyruk.js liste
node kuyruk/kuyruk.js onayla <id>        node kuyruk/kuyruk.js iptal <id>
node kuyruk/kuyruk.js durum              ← otomasyon çalışıyor mu?
node kuyruk/kuyruk.js sonuclar
node kuyruk/kuyruk.js zamanlayici kur | kaldir | durum
```

## Birden fazla Instagram hesabı

Her hesabın kendi anahtarı olur: `oxygbio` (varsayılan) `~/.video-mutfagi/instagram.json`, diğerleri `instagram-<ad>.json`. Bağlamak için `node instagram/paylas.js kaydet <token-dosyasi> --hesap <ad>`; `kontrol`, `yenile`, `gonder` komutları da `--hesap <ad>` alır. Kuyruğa `ekle ... --hesap <ad>` ile atanan iş o hesaptan çıkar, `--hesap` yoksa `oxygbio` sayılır. `ayarlar/kuyruk.json` içindeki `hesaplar.<ad>` altına o hesabın `paylasim_saatleri` ve `gunluk_en_fazla` değerleri yazılır; yoksa hesabı o olan dizi kanalının `konu.json → dizi` bölümü (`saatler`, onay döneminde `onay_gunluk`, sonra `gunluk_hedef`), o da yoksa genel değerler geçerli (`kurulum/SUNUCU.md`). Günlük sınır ve boş saat hesabı her hesap için ayrı sayılır; bir hesabın dolması diğerini bekletmez. `durum` komutu bulunan her anahtar dosyası için süre uyarısı verir.

## Kurulum (ajan yapar, kullanıcı onaylar)

1. `kuyruk/ayar-ornek.json` dosyasını `ayarlar/kuyruk.json` olarak kopyala. Kullanıcıya iki şey sor ve dosyaya yaz:
   - hangi saatlerde paylaşılsın,
   - günde en fazla kaç video olsun.
2. Zamanlayıcıyı kurmadan önce kullanıcıya ne olacağını söyle ve onay al: "Bilgisayarına her 5 dakikada bir çalışan bir görev ekleyeceğim. Kuyrukta saati gelen video varsa Instagram'a paylaşır." Onay gelince:

   ```
   node kuyruk/kuyruk.js zamanlayici kur
   ```

   Windows'ta Görev Zamanlayıcı'ya "Video Mutfagi Kuyruk" adlı bir görev eklenir. Mac ve Linux'ta crontab'a bir satır eklenir. Kaldırmak için: `zamanlayici kaldir`.
3. Önce kuru deneme yap. Instagram'a hiçbir şey gitmez:

   ```
   node kuyruk/kuyruk.js ekle deneme.mp4 --aciklama "deneme" --zaman "<şimdi>"
   node kuyruk/kuyruk.js calistir --kuru
   node kuyruk/kuyruk.js iptal <id>
   ```

## Ev bilgisayarı mı, sunucu mu? ⚠️

| | Ev bilgisayarı | Sunucu (7/24) |
|---|---|---|
| Paylaşım saatinde | Bilgisayar **açık ve uyanık** olmalı | Her zaman açık |
| Kaçırılan saat | Bilgisayar açılınca, gecikmeli paylaşılır | Kaçırılmaz |
| İnternet | Yükleme yavaşsa video ~6 MB'a küçültülür (720p) | Sorun yok, video olduğu gibi gider |
| Kontrol | **Her gün `durum`a bak** | Haftada bir `durum` yeter |

**Ev bilgisayarına kurduysan otomasyonu kontrol etmen gerekir.** Bilgisayar uykuya geçerse, kapanırsa, internet giderse ya da Instagram anahtarının süresi dolarsa paylaşım olmaz. Bunu kimse sana kendiliğinden haber vermez. `node kuyruk/kuyruk.js durum` şunları gösterir:

- zamanlayıcı en son ne zaman çalıştı (45 dakikadan eskiyse uyarır),
- zamanını kaçıran videolar,
- onay bekleyen videolar,
- hatalı videolar,
- Instagram anahtarının kalan süresi (10 günden azsa uyarır).

Ajan her oturum açılışında bu komutu çalıştırıp sonucu kullanıcıya söyler.

**Bilgisayarın uykuya geçmesini önlemek için** (Windows): Ayarlar → Sistem → Güç → "Uyku" süresini, paylaşım saatlerinde bilgisayarın açık kalacağı şekilde ayarla.

## Sunucuya kurmak

Sunucuda kurulum aynıdır: repo klonlanır, `npm install` çalıştırılır, Instagram anahtarı kaydedilir, `zamanlayici kur` ile crontab'a eklenir. Fark şurada: sunucunun bir web sunucusu (Caddy, nginx) varsa video tünelsiz, doğrudan verilir. `ayarlar/kuyruk.json` dosyasına şunu yaz:

```json
"makine_turu": "sunucu",
"yayin": { "yol": "klasor", "klasor": "/var/www/vm", "adres": "https://alan-adin.com/vm/" }
```

- Kuyruk videoyu bu klasöre rastgele bir adla kopyalar.
- Instagram oradan çeker.
- Paylaşımdan hemen sonra dosya silinir.
- Klasörün web sunucusunda herkese açık olması gerekir.

## Güvenlik notları

- **Çift paylaşım yok.** "Yayınla" adımında bağlantı koparsa Instagram videoyu yayınlamış da olabilir, yayınlamamış da. Kuyruk bu durumda **asla tekrar denemez**. Videoyu `hatali/` klasörüne "hesaba bak" notuyla ayırır.
- **Günlük sınır.** Bu sınır her şeyin önünde gelir (hesap başına ayrı sayılır). Yeni hesapta günde 1'i geçme.
- **Tek çalışma.** Aynı anda iki çalışma olmaz (kilit dosyası).
- **Kayıt.** Her şey `kayit/kuyruk.log` dosyasına yazılır.
