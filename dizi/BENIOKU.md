# dizi

Hikâye dizisi deposu ve devam/kes kararı.

- Depo: `kayit/dizi/<kanal>/diziler.json` (`{ diziler: [] }`), `yukle(kok, kanal)` / `kaydet(kok, kanal, veri)`.
- `kararVer(dizi, n, tumDiziler, ayar, simdi)` -> `{karar: devam|kes|bekle, neden}`.
  - Paylaşımdan `bekle_saat` geçmeden veya izlenme yoksa: `bekle`.
  - Biten dizi sayısı `ilk_dizi_sayisi`ten azsa: hep `devam`.
  - `yorum_devam >= yorum_min`: hep `devam`.
  - 1. bölüm geçmiş 1. bölüm ortalamasıyla, 2-3. bölüm tutma oranıyla (N / N-1) kıyaslanır; ortalamanın `esik_oran` katının altı: `kes`.
- `elleKarar(dizi, n, karar, neden)` kararı elle koyar (`elle:true`); `kararVer` bunu ezmez.

Test: `node --test "dizi/test/*.test.js"`

## Kaynaklar (kaynak.js)

- `adaylar(ctx, {simdi, getir, kok}) -> {ogeler, notlar}`: Ekşi (debe + `kaynak.eksi_basliklar`) ve Reddit (`kaynak.subredditler`) tam metinli adaylar. Ayarlar `ctx.ayar.dizi.kaynak`: `eksi_min_fav` (300), `min_kelime` (250, bol.js ile aynı), `aralik_ms`. Hikaye id: `eksi-<entry>` / `reddit-<post>`; kullanılmış id (`dizi.id` veya `dizi.kaynak.id`) elenir. Kaynak hatası not olur, fırlatmaz.

## Bölüm üretimi (uret-bolum.js)

- `uretBolum(ctx, dizi, n, {onayGerekli, calistir, kok})`: bölüm metnini paragraf sınırlarından 2-4 satıra böler, `konu/uret.js`'i hazır metinle (`hazir`) çalıştırır: klasör `videolar/<kanal>-<dizi.id>-b<n>/`, `video.json` → `bolum`, `toplam_bolum`, `etiket` ("BAŞLIK · BÖLÜM n"), anlatıcı sesi `dizi.anlatici.ses`. Sonrası (ses → kelime → karışım → sahne → render → kuyruk) aynı.
- Bölüm durumu: bitti → `onay-bekliyor` (onay döneminde) ya da `sirada`; bütçe yok → `uretimde` (video boş kalır, sonraki tur kaldığı yerden sürer); insan gerekiyor → `kontrol_et`. `bolum.video` kuyruk işinin `video` alanıyla aynıdır.
- Harcama `konu.json → otomasyon.butce` sınırlarına bağlı: sınır 0 ise hiçbir şey harcanmaz, bölüm bütçe bekler.

## Bölme (bol.js)

- `bol(ctx, hikaye)`: hikâyeyi kendi akışına göre **2-5 bölüme** böler (bölüm başı yaklaşık 1 dakika; uzun hikâye daha çok bölüm alır). Uzunluk ret sebebi değildir. Ret: kaynak 250 kelimenin altındaysa `kisa`; biçim bozuksa (bölüm sayısı, boş bölüm, özet kuralı) bir kez düzeltilip yine bozuksa `bicim`; uydurma iki denemede de varsa `sadakat`.
- 2. ve sonraki bölümler "Önceki bölümde…" ile açılan tek cümlelik özet paragrafıyla başlar (hedef en fazla 15 kelime; 2 cümleyi ya da 25 kelimeyi geçen özet reddedilip yeniden istenir).
- Dizinin bölüm sayısı her yerde dizinin kendisinden okunur: son bölüm `n === bolumler.length`, kapanış kartı `toplam_bolum`, açıklama "Final." yalnız son bölümde, panel 1-5.

## Temalar ve haftalık hikâye havuzu (tema.js, havuz.js)

- `konu.json → dizi.kaynak.konular: [{ad, basliklar: ['/slug--id']}]`: sabit temalar ve Ekşi hikâye başlıkları. Başlığın en beğenilenler sayfası (`?a=nice`, girişsiz çalışır) okunur; tema içinde yalnız favori sırası, eski entry de olur.
- Yeni dizinin teması: en uzun süredir kullanılmayan tema; aynı gün (İstanbul) kullanılmış tema yeniden seçilmez. Dizi temasını `konu` alanında taşır.
- `node dizi/havuz.js doldur <kanal>` (zamanlayıcı her pazartesi 04:00 İstanbul): temaları tarayıp `kayit/dizi/<kanal>/havuz.json`'u ~1 aylık stoğa (`dizi.havuz.hedef`, 60) doldurur. Her hikâye `hikayeMi` kontrolünden geçer (2-3 cümlelik özetle); geçmeyen `elendi` olarak kalır. Kullanılmış/reddedilmiş/havuzdaki id yeniden eklenmez. 403/429'da durur, istekler arası `kaynak.aralik_ms`.
- `calistir` yeni diziyi önce havuzdan alır (tema sırası + favori); havuz boşsa "havuz azaldı" notuyla canlı aramaya düşer.
- Panel: `GET /api/dizi/havuz?kanal=` (tema başına stok, sıradaki hikâyeler), `POST /api/dizi/havuz/ele {kanal, id, neden}` (kilitli). Arayüzü ayrı iş.

## Metin onayı (hikâye düzeyinde)

- Yeni dizi bölündüğünde (sadakat geçmiş) `metin_onay: 'bekliyor'` alır; Furkan bütün bölüm metinlerini onaylayana kadar hiçbir bölümü seslendirilmez/üretilmez. Ayar: `konu.json → dizi.metin_onayi` (varsayılan true; false = eski davranış).
- Bekleyen dizi aktif dizi sınırına sayılmaz; aynı anda en fazla 2 hikâye metin onayı bekler, daha fazlası açılmaz.
- Panel: `POST /api/dizi/metin {kanal, id, karar: 'onayla'|'reddet', metinler?: {n: metin}}` (kilitli). Düzeltilen metinde yalnız özet kuralı yeniden denetlenir (tek cümle, en fazla 15 kelime). `reddet`: dizi `kesildi` ("metin reddedildi"), hikâye `reddedilen.json`'a. Liste API'si `metin_onay`'ı ve bekleyen dizilerin metinlerini verir. Sunucu: `--dizi-metin`.
- Bu özellikten önceki diziler (alan yok) `onaylandi` sayılır; `calistir` ilk koşuda alanı açıkça yazar.
