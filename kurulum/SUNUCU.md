# Sunucuya kurulum (7/24 üretim ve paylaşım)

Bu belge genel adımları anlatır. `ornek_kanal` yerine kendi kanal klasörünün adını yaz. Sunucu adresi, kullanıcı adı ve anahtarlar bu depoya yazılmaz.

Sunucuda Node 22, `ffmpeg` ve bu deponun bir kopyası olmalı. Sunucuda **kendi servis kullanıcın** ile çalış (root ile değil): zamanlayıcı o kullanıcının crontab'ına yazılır, token dosyaları onun ev klasöründe durur.

## 1. Kodu sunucuya götür (bundle)

Bilgisayarında, depo klasöründe:

```
git bundle create vm.bundle main
scp vm.bundle <sunucu>:~/vm.bundle
```

Sunucuda, servis kullanıcısı olarak:

```
cd ~/video-mutfagi
git pull ~/vm.bundle main
npm ci          # yalnızca package.json değiştiyse
```

Yerelde değişmiş bir dosya varsa (ör. `package-lock.json`) `git stash` ile sakla. `git reset --hard` ya da `git clean` kullanma: izlenmeyen `videolar/` klasörü silinir.

## 2. Özel dosyaları kopyala

Bunlar `.gitignore` içinde, depoyla gitmez:

- Kanal kiti: bilgisayarındaki `kanal/ornek_kanal/` klasörünü sunucudaki `~/video-mutfagi/kanal/ornek_kanal/` altına kopyala (`rsync -a` ya da `scp -r`).
- Instagram anahtarı: `~/.video-mutfagi/instagram-<hesap>.json` dosyasını sunucudaki `~/.video-mutfagi/` altına kopyala. İzin `600` olsun, sahibi servis kullanıcısı olsun:

```
chmod 600 ~/.video-mutfagi/instagram-<hesap>.json
```

Yapay zekâ (Claude girişi) ve ses anahtarları da aynı klasörde durur. Dosya içeriklerini hiçbir yere yazdırma, sohbete yapıştırma.

## 3. Önce kuru koşu

Hiçbir şey harcanmaz, hiçbir şey paylaşılmaz:

```
node dizi/calistir.js ornek_kanal --kuru
node kuyruk/kuyruk.js calistir --kuru
```

Planlanan üretimler listelenmeli. Hata varsa zamanlayıcıyı kurma.

## 4. Zamanlayıcıları kur

```
node dizi/zamanlayici.js kur ornek_kanal     # her saat 20. dakikada dizi üretimi
node kuyruk/kuyruk.js zamanlayici kur        # her 5 dakikada kuyruk paylaşımı
node dizi/zamanlayici.js durum ornek_kanal   # iki satırı da göstermeli
```

İkisi de crontab satırına `TZ=Europe/Istanbul nice -n 19` ekler: saatler İstanbul saatiyle, işlem düşük öncelikle çalışır. Her kanalın satırı ayrıdır; bir kanalı kurmak ya da kaldırmak (`node dizi/zamanlayici.js kaldir ornek_kanal`) diğer kanalın satırına ve kuyruk satırına dokunmaz.

Onay dönemi açıkken her bölüm panelde onay bekler, kendiliğinden paylaşılmaz.

## 5. Panelden bağla

Bilgisayarındaki `ayarlar/panel.json` içine `sunucu` bölümünü ekle (örnek: `panel/ayar-ornek.json`). Panel sunucuya senin kendi `ssh` bağlantınla ulaşır; parola saklamaz. Bağlanınca Sıra ve Diziler sayfalarında "Bu bilgisayar / Sunucu" seçici çıkar.
