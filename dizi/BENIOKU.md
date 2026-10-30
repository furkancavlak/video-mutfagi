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

- `adaylar(ctx, {simdi, getir, kok}) -> {ogeler, notlar}`: Ekşi (debe + `kaynak.eksi_basliklar`) ve Reddit (`kaynak.subredditler`) tam metinli adaylar. Ayarlar `ctx.ayar.dizi.kaynak`: `eksi_min_fav` (300), `min_kelime` (420), `aralik_ms`. Hikaye id: `eksi-<entry>` / `reddit-<post>`; kullanılmış id (`dizi.id` veya `dizi.kaynak.id`) elenir. Kaynak hatası not olur, fırlatmaz.
