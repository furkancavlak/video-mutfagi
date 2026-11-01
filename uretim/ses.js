#!/usr/bin/env node
// Step 2: narration. One audio file per script line -> <video>/ses/NN-<rol>.mp3
//
//   node uretim/ses.js <video-klasoru>            show what would be generated and what it costs (spends nothing)
//   node uretim/ses.js <video-klasoru> --onay     generate with ElevenLabs (only lines whose file is missing)
//
// Own voice instead of ElevenLabs: record each line on the phone and drop it in ses/ as 01-<rol>.mp3,
// 02-<rol>.mp3 ... (same numbering and role names as video.json). This script then has nothing to do.
// To redo one line: delete only that line's file and run again.
const fs = require('fs'), path = require('path');
const { videoYukle, anahtar, fail, tonSesAyari, AYAR_DIR } = require('./cekirdek');
const SH = require('./ses-harcama');

const { dir, video, kimlik } = videoYukle(process.argv[2]);
const onay = process.argv.includes('--onay');
const sesDir = path.join(dir, 'ses');
fs.mkdirSync(sesDir, { recursive: true });

const tts = kimlik.tts;
const isler = video.satirlar.map((s, i) => {
  const n = String(i + 1).padStart(2, '0'), dosya = path.join(sesDir, `${n}-${s.rol}.mp3`);
  const ses = (video.anlaticilar || {})[s.rol];
  if (!ses) fail(`satır ${n}: "${s.rol}" rolünün sesi video.json → anlaticilar içinde yok.`);
  return { n, rol: s.rol, metin: s.metin, dosya, ses, var: fs.existsSync(dosya) };
});
const eksik = isler.filter(x => !x.var);
const karakter = eksik.reduce((a, x) => a + x.metin.length, 0);
console.log(`${isler.length} satır, ${isler.length - eksik.length} tanesi hazır. Üretilecek: ${eksik.length} satır, ~${karakter} karakter.`);
if (!eksik.length) process.exit(0);

(async () => {
  const SA = require('./ses-anahtar');
  const liste = SA.anahtarlar(AYAR_DIR);
  if (!liste.length) anahtar('elevenlabs.txt', 'ElevenLabs → Profile → API Keys bölümünden bir anahtar oluştur.');
  const durumlar = [];
  for (const k of liste) durumlar.push(await SA.durumOku(k));
  if (durumlar.every(d => d.gecersiz)) fail('ElevenLabs anahtarı geçersiz. Yeni anahtar oluşturup dosyaya kaydet.');
  for (const d of durumlar) console.log(`ElevenLabs ${d.ad}: ${d.gecersiz ? 'geçersiz anahtar, atlandı' : d.kalan == null ? 'kalan bilinmiyor (anahtarın abonelik okuma izni yok)' : 'kalan karakter ' + d.kalan}`);
  console.log(`Bu iş ~${karakter} harcar.`);
  // eleven_v3 audio tags like [excited] are not spoken but do count as characters
  if (!SA.toplamYeter(durumlar, karakter)) fail('Bu ay kalan karakter yetmiyor. Metni kısalt ya da planı yükselt.');
  if (!onay) { console.log('\nHiçbir şey üretilmedi. Onaylıyorsan aynı komutu sonuna --onay ekleyerek çalıştır.'); return; }
  // the real charge goes to ses/harcama.json (per-request header, else the subscription counter before/after)
  const basliklar = [], kullanilan = new Set();
  try { fs.unlinkSync(SH.dosya(dir)); } catch (e) { }   // never a stale record from an earlier run
  for (const x of eksik) {
    let r, t;
    for (;;) {
      const d = SA.sec(durumlar, x.metin.length);
      if (!d) fail(`${x.n}: Bu ay kalan karakter yetmiyor (bütün ElevenLabs hesapları doldu). Metni kısalt ya da planı yükselt.`);
      r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${x.ses}?output_format=mp3_44100_128`, {
        method: 'POST', headers: { 'xi-api-key': d.key, 'content-type': 'application/json' },
        // a sad or serious story gets the kit's calmer settings for its tone (tts.ton_ayarlari, e.g. higher stability)
        body: JSON.stringify({ text: x.metin, model_id: tts.model, language_code: tts.language_code, voice_settings: tonSesAyari(tts, video.ton) }),
      });
      if (r.ok) {
        const c = SH.basliktanKarakter(r.headers);
        basliklar.push(c); kullanilan.add(d);
        if (d.kalan != null) d.kalan -= c ?? x.metin.length;
        if (durumlar.length > 1) console.log(`  ${x.n}: ${d.ad}`);
        break;
      }
      t = (await r.text()).slice(0, 300);
      if (SA.kotaBitti(r.status, t)) { d.bitti = true; console.log(`  ${d.ad} doldu, sıradaki hesaba geçiliyor`); continue; }
      if (/voice_not_found/.test(t)) fail(`${x.n}: ses bulunamadı (${x.ses}). Paylaşılan (shared) sesler önce ElevenLabs'te "Add to my voices" ile kütüphaneye eklenmeli.`);
      fail(`${x.n}: ElevenLabs hatası ${r.status} (${d.ad}): ${t}`);
    }
    fs.writeFileSync(x.dosya, Buffer.from(await r.arrayBuffer()));
    console.log(`${x.n}-${x.rol} hazır`);
  }
  // the subscription counter is a fallback only when a single readable account did the whole step
  const tek = kullanilan.size === 1 ? [...kullanilan][0] : null, once = tek ? tek.kullanilan : null;
  let sonra = null;
  if (once != null) try { await new Promise(ok => setTimeout(ok, 1500)); const s2 = await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': tek.key } })).json(); sonra = s2.character_count; } catch (e) { }
  const harcama = SH.hesapla({ basliklar, once, sonra, tahmin: karakter });
  fs.writeFileSync(SH.dosya(dir), JSON.stringify({ ...harcama, tahmin: karakter, once, sonra, zaman: new Date().toISOString() }, null, 2));
  console.log(`ElevenLabs gerçek harcama: ${harcama.karakter} karakter (${harcama.kaynak}${harcama.tahmini ? ', tahmini' : ''}; metin uzunluğu ${karakter}).`);
  console.log('\nŞimdi her satırı dinle. Beğenmediğin satırın dosyasını sil, tekrar çalıştır (yalnız o satır yeniden üretilir).');
  console.log('Sonraki adım: python uretim/kelime.py ' + path.relative(process.cwd(), dir));
})();
