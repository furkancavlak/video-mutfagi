# Instagram'a otomatik paylaşım: kurulum

Bu rehber Meta'nın resmi yolunu kullanır: **Instagram API, Instagram girişiyle**. Hesap şifresi hiçbir yerde kullanılmaz. Bağlantı, Meta'nın verdiği bir anahtarla (token) kurulur.

Bot gibi taklit yapan araçlardan uzak dur. Bu araçlar şifre ister ve hesabın kapanmasına yol açabilir.

Bu adımlar 25.10.2026'da baştan sona denendi: uygulama geliştirme modunda, App Review olmadan kuruldu ve gerçek bir Reels yayına çıktı.

## Ön şartlar

- **Hesap:** Instagram hesabı **profesyonel** olmalı (Ayarlar → Hesap türü → Creator ya da Business).
- **Hesap ayrımı:** Kendi asıl hesabın yerine ayrı bir kanal hesabı kullanmak daha güvenli.
- **Meta hesabı:** developers.facebook.com'a girebilmek için bir Facebook hesabı gerekir.
- **cloudflared:** Kurulu olmalı. Kurulum komutu: `winget install Cloudflare.cloudflared` (Mac: `brew install cloudflared`). Instagram videoyu herkese açık bir adresten çeker. Bu araç, paylaşım süresince bilgisayarındaki dosyaya geçici bir adres açar ve iş bitince kapatır.

## Adım 1: Meta uygulaması

1. https://developers.facebook.com adresine Facebook hesabınla gir.
2. **Create App**'e bas.
3. İşletme portföyü bağlama sorusu gelirse "henüz bağlamak istemiyorum" seçeneğini seç.
4. **Use case** olarak **Other** seç.
5. **App type** olarak **Business** seç.
6. **App name** alanına bir ad yaz (ör. `kanalim-paylasim`).
7. Uygulamanın modu **Development** görünür. Öyle kalsın, **Live**'a geçirme.
8. Ürün listesinde **Instagram** satırındaki **Set up**'a bas.
9. "API setup with Instagram login" sayfası açılır.

## Adım 2: Hesaba Tester rolü ver ⚠️

> **Tuzak:** Burada "App roles → **Test Users**" bölümünden test kullanıcısı açmaya çalışma, hata verir. Doğru yol aşağıda.

1. Sol menüde **App roles** → **Roles**'a tıkla.
2. **Add People**'a bas ve **Instagram Tester**'ı seç.
3. Kutuya Instagram kullanıcı adını yaz, çıkan hesabı seç ve **Add**'e bas.
4. Daveti kabul et. Bu adım **bilgisayarda, tarayıcıda** yapılır, telefondaki uygulamada görünmeyebilir:
   1. www.instagram.com adresine o hesapla gir.
   2. https://www.instagram.com/accounts/manage_access/ adresine git.
   3. **Tester Invites** sekmesindeki daveti **Accept** ile kabul et.

## Adım 3: Anahtarı al ve kaydet

1. "API setup with Instagram login" sayfasına dön.
2. **1. Generate access tokens** altında **Add account**'a bas, hesapla giriş yap ve izinleri onayla.
3. Hesap listede görününce **Generate token**'a bas.
4. Çıkan uzun kodu **sohbete yapıştırma**. Masaüstünde `ig-token.txt` adlı bir dosyaya kaydet.
5. Ajan anahtarı kaydeder ve dener. Anahtar `~/.video-mutfagi/instagram.json` dosyasına gider, hiçbir zaman ekrana yazdırılmaz:

   ```
   node instagram/paylas.js kaydet ~/Desktop/ig-token.txt
   node instagram/paylas.js kontrol
   ```

6. `kontrol` hesabın adını gösteriyorsa **masaüstündeki `ig-token.txt` dosyasını sil.**

Şu bölümlere dokunma, paylaşım için gerekmiyor:
- 2. Webhooks
- 3. Set up Instagram business login
- 4. App review

## Adım 4: Deneme

```
node instagram/paylas.js gonder video.mp4 --kuru
node instagram/paylas.js gonder video.mp4 --hazirla
node instagram/paylas.js gonder video.mp4 --aciklama "..."
```

- **`--kuru`:** Yalnız geçici adresi dener. Instagram'a hiçbir şey gitmez.
- **`--hazirla`:** Instagram videoyu indirip işler ama **yayınlamaz**.
- **Açıklamalı komut:** Gerçek paylaşımdır. Kullanıcı onay vermeden çalıştırılmaz.

Her paylaşım `kayit/paylasimlar.jsonl` dosyasına yazılır.

## Bilmen gerekenler

- **Paylaşım sınırı:** 24 saatte en fazla 100 paylaşım. Ama yeni bir hesapta ilk haftalarda **günde 1** paylaşımı geçme.
- **Silme:** API gönderi silemez. Silme ve arşivleme elle yapılır.
- **İstatistik:** Hesabı profesyonele geçirmeden önce atılmış gönderilerin istatistiği gelmez.
- **Anahtar süresi:** Anahtar 60 gün geçerlidir. Süre dolmadan yenile: `node instagram/paylas.js yenile`.
- **Bilgisayar açık olmalı:** Video paylaşım sırasında bu bilgisayardan sunulur, bilgisayar kapalıyken paylaşım yapılamaz.
- **AI etiketi:** Gerçekçi yapay zekâ sesi ya da görüntüsü kullanıyorsan paylaşırken Instagram'ın AI etiketini aç.
