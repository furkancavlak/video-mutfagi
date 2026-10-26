# İkinci beyin (isteğe bağlı)

Yapay zekâ her sohbete sıfırdan başlar. Dün ne konuştuğunuzu, hangi videonun tuttuğunu, neyi beğenmediğini hatırlamaz. İkinci beyin bunun çaresi: bilgisayarında duran küçük bir not defteri. Ajan içine kanalın hedefini, verdiğin kararları, yaptığın düzeltmeleri ve her videonun sonuçlarını yazar. Her oturumun başında da okur.

Bir benzetme: yeni gelen bir asistan her sabah masasında bir defter bulur. İlk sayfada "kanal ne, ne karar verdik, patron neye kızdı, dün ne oldu" yazıyor. Asistan aynı soruyu iki kez sormaz, aynı hatayı iki kez yapmaz.

Ayrıntısı bu videoda: https://youtu.be/-z9aGjceXkc

## İçinde ne var

Düz yazı dosyaları (Markdown). Not defteri gibi açılır. İstersen Obsidian ile açıp okuyabilir, elle düzeltebilirsin.

| Dosya | Ne var |
|---|---|
| `BASLA-BURADAN.md` | Dizin ve ajanın yazma kuralları |
| `kanal.md` | Kanalın profili ve hedefi |
| `son-durum.md` | Son oturumda ne oldu, sıradaki iş, bekleyen karar |
| `kararlar.md` | Verilen kararlar. Her biri "karar + neden" |
| `kurallar.md` | Senin düzeltmelerin. Her biri "kural + neden" |
| `stil.md` | Beğendiğin bir videonun stilinden çıkan kurallar |
| `videolar/<video>.md` | Her video için: kanca, paylaşım, sonuç sayıları, ne tuttu, ne tutmadı |

Varsayılan yer `ikinci-beyin/kasa/`. Bu klasör git'e girmez. Notların ve sayıların yalnız senin bilgisayarında durur.

## Nasıl çalışır

1. **Oturum başı:** Ajan `node ikinci-beyin/beyin.js ozet` çıktısını okur. Çıktı kısadır: kanal, son durum, kurallar, son kararlar, son videolar ve sayıları. Ayrıntı gerekirse ajan yalnız ilgili notu açar.
2. **Konuşurken:** "Bunu böyle yapma" dersen ajan sormadan `kurallar.md`'ye yazar. Bir karar verirsen `kararlar.md`'ye yazar.
3. **Video paylaşıldıktan sonra:** Ajan videonun notunu açar. Sonuç sayıları gelince (1 gün ve 7 gün sonra) notu günceller. Seninle birlikte "ne tuttu, ne tutmadı" yazar.
4. **Oturum sonu:** Ajan `son-durum.md`'yi 3-5 satırla yeniden yazar.

## Kurulum (ajan yapar)

1. Kullanıcıya nereye kurulacağını sor. Fikri yoksa varsayılan yer kullanılır.

   ```
   node ikinci-beyin/beyin.js kur --kanal <kanal-adi>
   node ikinci-beyin/beyin.js kur --kanal <kanal-adi> --yol "C:\Users\<ad>\Belgeler\kanal-beyni"     (başka bir yer)
   ```

   - `--kanal` verilirse hesap, konu ve ton `kanal/<kanal-adi>/kimlik.json`'dan alınır. Kimlik henüz yoksa `--kanal` olmadan kur, kimlik bitince `kanal.md`'yi doldur.
   - Komut hiçbir dosyanın üstüne yazmaz. İkinci kez çalışırsa yalnız eksik dosyaları ekler.
   - Seçilen yer `ayarlar/ikinci-beyin.json` dosyasına yazılır.
2. `kanal.md`'yi kullanıcıyla doldur. En önemlisi **hedef** ve **başarı ölçüsü**: "3 ay içinde 10 video, her biri en az 1.000 izlenme" gibi.
3. Repoda daha önce yapılmış videolar varsa her biri için `video-kaydet` çalıştır.
4. Claude Code kullanılıyorsa kancayı öner (aşağıda). Başka bir ajan kullanılıyorsa bir şey yapmaya gerek yok: `AGENTS.md` ajana her oturumda özeti okumasını söyler.
5. Kullanıcıya nasıl çalıştığını anlat (yukarıdaki "Nasıl çalışır" maddeleri, kendi sözlerinle, kısa).

## Oturum başı kancası (Claude Code, isteğe bağlı)

Kanca, Claude Code her oturum açtığında özeti kendisi çalıştırır ve ajanın önüne koyar. Ajanın hatırlamasına gerek kalmaz. Windows'ta ve Mac'te aynı komut:

```
node ikinci-beyin/beyin.js kanca kur        kanca kurulsun
node ikinci-beyin/beyin.js kanca durum      kurulu mu?
node ikinci-beyin/beyin.js kanca kaldir     kaldırılsın
```

- Kanca `.claude/settings.local.json` dosyasına yazılır. Bu dosya yalnız bu bilgisayarda durur, git'e girmez. Dosyadaki başka ayarlara dokunulmaz.
- Kanca **yeni oturumda** çalışır. Claude Code kancayı onaylamanı isterse `/hooks` menüsünden onayla.
- İkinci beyin kurulu değilse kanca hiçbir şey yazmaz, oturumu bozmaz.

Elle kurmak istersen `.claude/settings.local.json` içine şunu koy. Yolu kendi repo yolunla değiştir. Windows'ta da `/` kullan:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          { "type": "command", "command": "node \"C:/Users/<ad>/video-mutfagi/ikinci-beyin/beyin.js\" ozet --kanca", "timeout": 15 }
        ]
      }
    ]
  }
}
```

Mac'te yol şöyle olur: `/Users/<ad>/video-mutfagi/ikinci-beyin/beyin.js`.

## Codex ve diğer ajanlar

Kanca gerekmez. `AGENTS.md` dosyası her ajana şunu söyler: oturumun başında `node ikinci-beyin/beyin.js ozet` çalıştır, çıktıyı oku, kurallara uy. Codex ve benzerleri `AGENTS.md`'yi kendiliğinden okur.

## Komutlar

```
node ikinci-beyin/beyin.js kur [--yol <klasör>] [--kanal <ad>]
node ikinci-beyin/beyin.js ozet [--n 5]                             son 5 karar ve video (varsayılan)
node ikinci-beyin/beyin.js video-kaydet videolar/<video>
node ikinci-beyin/beyin.js video-kaydet videolar/<video> --izlenme 1200 --begeni 80 --paylasim 15 --link <adres> --paylasildi 2026-10-26
node ikinci-beyin/beyin.js video-kaydet videolar/<video> --tuttu "..." --tutmadi "..."
node ikinci-beyin/beyin.js kural "..." --neden "..."
node ikinci-beyin/beyin.js karar "..." --neden "..."
node ikinci-beyin/beyin.js stil  "..." --neden "..."
node ikinci-beyin/beyin.js yer                                      klasör nerede?
```

- **video-kaydet:** `video.json`'dan başlığı ve kancayı, `ses/zaman.json`'dan süreyi, kuyruktan paylaşım tarihini, linki ve sonuç sayılarını alır. Video kuyruk dışında, elle paylaşıldıysa sayılar `--izlenme` gibi seçeneklerle verilir. Her ölçüm günü tabloya bir satır olarak eklenir. "Ne tuttu" ve "Ne tutmadı" bölümlerine komut dokunmaz.
- **Kuyrukla birlikte:** `node kuyruk/kuyruk.js sonuclar` çalışınca paylaşılan videoların notları kendiliğinden güncellenir.
- **Her komut** `--yol <klasör>` alır. Başka bir klasördeki ikinci beyni denemek için kullanılır.

## Yazma kuralları (ajan için)

- **Kural + neden.** Nedeni olmayan kural bir sonraki oturumda yanlış yere uygulanır. Komut nedensiz kural kabul etmez.
- **Bir kez.** Aynı kural iki kez yazılmaz. Kural değişirse eskisinin üstü çizilir (`- ~~...~~`), yenisi eklenir. Hiçbir satır silinmez.
- **Tahmin ayrı.** "İzlenme düşük çünkü kanca uzundu" bir tahmindir. "tahmin:" diye başlar. Sayı ve kullanıcının sözü gerçektir. Ajanın yorumu tahmindir.
- **Stil kuralı ölçülebilir olur.** "Hızlı kurgu" değil, "bir çekim en fazla 2 saniye". Referanstan yalnız tempo, yapı ve kalite çıtası alınır. Görüntü, müzik ve içerik kopyalanmaz.
- **Gizli bilgi yazılmaz.** Şifre, anahtar, token, e-posta bu klasöre girmez.
- **Kısa tut.** Özet her oturumda okunur. Uzun not, oturumun hafızasını doldurur. Ayrıntı video notlarında durur.

## Yedek

Klasör git'e girmediği için repo ile birlikte yedeklenmez. Notların kaybolmasın istiyorsan kurarken bir bulut klasörünü (`--yol`) seç ya da klasörü ara ara kendi özel deposuna kopyala.
