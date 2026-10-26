# Uzun videodan dikey kesit

Yatay, uzun bir videodan Reels / Shorts keser. Sonuç 1080x1920 bir videodur:
- kelimeye kilitli altyazısı vardır,
- sesi -14 LUFS'tur,
- sonunda bir kart ve yavaşça kısılan müzik vardır.

İki tür kısa çıkar:

| Mod | Ne yapar |
|---|---|
| `tanitim` (varsayılan) | Videonun en çarpıcı cümlesiyle açılır. Cevaptan hemen önce kesilir. Ses 20-25 sn sürer. Ardından ~5 sn kart gelir: soru + "CEVAP TAM VİDEODA". |
| `an` | Kendi başına anlaşılan en güçlü an. 20-40 sn. Sonda kısa bir "TAM VİDEO KANALDA" kartı. |

## Komutlar

```
node kesit/kesit.js yazi  <uzun.mp4>                 konuşmayı yazıya döker (Whisper)
node kesit/kesit.js sec   <uzun.mp4> [--mod an] [--adet 3] [--not "..."] [--kanal <ad>] [--llm-yok] [--onay]
node kesit/kesit.js yap   <uzun.mp4> --aday 1 --kare  önce kareler
node kesit/kesit.js yap   <uzun.mp4> --aday 1         sonra video
node kesit/kesit.js hepsi <uzun.mp4>                 üçünü arka arkaya yapar
node kesit/kesit.js dene  <uzun.mp4> liste.json      elle yazılmış listeyi dener
```

Kesme, ses ve görüntü ücretsizdir. Yalnız `sec` (ve `hepsi`) yapay zekâya 11-16 çağrı yapar. Komut ilk çağrıdan önce kaç çağrı yapacağını ve hangi yoldan gideceğini yazar:
- **Claude aboneliği** (`claude -p`): ek ücret yok, aboneliğin kullanım sınırından düşer.
- **Ücretli API** (`ANTHROPIC_API_KEY`, kullandıkça öde): komut durur. Kullanıcı onaylarsa aynı komut `--onay` ile yeniden çalıştırılır.

Yol `--kanal <ad>` verilince o kanalın `konu.json` → `llm.yol` ayarından gelir (konu radarıyla aynı). `--llm-yok` hiç çağrı yapmaz. Repoya hiçbir şey yazılmaz.

## Nereye ne yazılır

Her şey uzun videonun yanındaki `<ad>-kesit/` klasörüne yazılır. Başka bir yer için `--klasor <yol>` ver.

| Dosya | Ne |
|---|---|
| `metin.txt` | Numaralı cümleler ve saniyeleri. Elle liste yazarken buna bakılır. |
| `ses/kelimeler.json` | Whisper'ın kelime zamanları. |
| `adaylar.json` | Seçilen kesitler, en iyisi başta. Jürinin notları da burada. |
| `duzeltme.json` | (isteğe bağlı) Whisper'ın yanlış yazdığı kelimeler: `{"kılahat": "Claude"}`. Yalnız altyazıyı düzeltir. |
| `k1/kareler/` | `--kare` ile alınan kareler. |
| `<ad>-kesit1.mp4` | Bitmiş video (`--aday 1`). Elle listeden yapılan `<ad>-kesitliste1.mp4` olur. Var olan video ezilmez; üstüne yazmak için `--uzerine`. |

## Kesit nasıl seçilir ("nesil nesil")

Bu yöntem ilk tanıtım kısalarımızda denendi ve onaylandı.

1. Üç yazar dökümü okur. Her biri kendi açısından 2 aday yazar: "en çarpıcı cümleyle aç", "soruyla aç", "serbest".
2. Her adayı kod çözer: ifade dökümde var mı, süre sınırın içinde mi? Hatalı aday düzeltilmek üzere yazarına bir kez geri gider.
3. Üç jüri her adayı 0-100 puanlar:
   - hızlı kaydıran bir izleyici,
   - konuyu merak eden ama videoyu izlememiş biri,
   - kurgucu-hakem.
   Kural ihlali 15 puan düşürür.
4. İki yazar puanlı adayları geliştirir. Biri jürinin eleştirdiğini düzeltir. Öteki en iyi açılışla en iyi sonu birleştirir.
5. Yeni adaylar ve ilk neslin en iyi ikisi aynı jüriye yeniden gider. En yüksek puanlı aday kazanır.

Yapay zekâ `konu/llm.js` üzerinden çağrılır: Claude aboneliği (`claude -p`) ya da ücretli API (yukarıda). Bir seçim 11-16 çağrı yapar, birkaç dakika sürer.

**Yapay zekâ yoksa** (ya da `--llm-yok` verilirse) basit bir seçici çalışır. Cümleleri soru, rakam ve güçlü kelimelere göre puanlar. Tanıtımı bir soruyla bitirir; sorunun cevabı videoda sonra gelmelidir. Sonucu yapay zekâ kadar iyi değildir. Yine de çalışır.

## Elle liste yazmak

`metin.txt`'ye bak ve bir dosya yaz:

```json
{"parcalar": [["cumle", 41, 41], ["ses", "peki bu kadar", 319.5, "güvenilir mi", 322.8]],
 "kanca": "28 SAATTE KOPYA", "soru": "GÜVENİLİR Mİ?"}
```

- `["cumle", 41, 43]`: 41'den 43'e kadar olan cümleler.
- `["ses", "başlangıç", sn, "bitiş", sn]`: bir ifadeden bir ifadeye. Saniye, ifadenin `metin.txt`'deki yeridir. Bitiş, son kelimenin sonunda kesilir.
- `kanca`: ilk 2,4 saniyede üstte duran büyük başlık. Boşsa çıkmaz.
- `soru`: karttaki soru. Boşsa son cümleden çıkarılır.

`dene` komutu her parçanın tam metnini ve süresini yazar. Sonra: `yap <uzun.mp4> --liste liste.json`.

## Görüntü

- **`--cerceve bulanik`** (varsayılan): Yatay görüntünün tamamı ortada durur. Arkasını aynı görüntünün bulanık ve karartılmış hâli doldurur. Ekrandaki yazılar ve grafikler kesilmez.
- **`--cerceve kirp`**: Görüntü ekranı doldurur, kenarları kesilir. `--odak 0.3` kadrajı sola, `0.7` sağa kaydırır. Kameraya konuşan tek kişi için uygundur.
- **`--yakin 1.2`**: Bulanık modda ortadaki görüntüyü %20 büyütür.

Altyazı çekirdekten gelir (`uretim/cekirdek.js`). Krem kart üstünde, konuşulan kelime vurgu rengine döner. `--kanal <ad>` verilirse renkler ve karttaki logo o kanalın `kimlik.json`'undan gelir.

## Ses

- **Konuşma:** Uzun videonun kendi sesinden kesilir. Kesitlerin arasında 0,22 sn nefes ve yumuşak bir "vuuş" vardır.
- **Kart müziği:** Kodla üretilen sakin bir akor. Kart başında hafif bir zil çalar. Son 1,8 sn'de yavaşça kısılır, hiç birden kesilmez.
- **`--muzik <dosya>`:** Kendi müziğin. Kısaysa başa sarıp tekrar çalar. Konuşmanın altında kısık çalar, kartta yükselir, sonda 1,8 sn'de kısılır.
- **Ses düzeyi:** -14 LUFS (iki geçişli loudnorm).

Dosya küçük tutulur: libx264 crf 22, en fazla 6 Mbit/sn, AAC 160k. 30 sn'lik video ~10-20 MB olur.

## Bitince

Videoyu izle, kareleri denetle (`denetim/DENETIM.md`). Komut sonda paylaşım kuyruğu satırını yazar. Kuyruğa kendiliğinden eklemez:

```
node kuyruk/kuyruk.js ekle "<video>" --aciklama "..." --onay-gerekli
```

## Dersler

- **İlk sürüm reddedildi.** Kısalar 46-67 sn sürüyordu. Cevabı söylüyorlardı. Müzik birden kesiliyordu. Dosyalar 180 MB'tı.
  → Ses 20-25 sn. Cevaptan önce kes. Müzik en az 1,4 sn'de kısılsın. Kodlama küçük.
- **Whisper bazı sözcükleri böler** ("1 .5", "TL 'lik"). Kod bunları yeniden birleştirir. Yanlış duyduğu sözcükler için `duzeltme.json` yaz.
- **Kesit sonu bir sonraki kelimeye taşarsa** başka bir kelimenin ilk harfi duyulur. Kesim son kelimeden 0,12 sn sonra biter, sonraki kelimeye 0,05 sn kala durur. Kelimeler bitişikse (aralarında 0,08 sn'den az boşluk) son kelimenin bitişinden 0,03 sn sonra kesilir ve son 0,05 sn yumuşakça kısılır. Yine de bir ses duyulursa o parçayı `"ses"` türüyle bir kelime önce bitir.
