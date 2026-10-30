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
const { videoYukle, anahtar, fail } = require('./cekirdek');
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
  const KEY = anahtar('elevenlabs.txt', 'ElevenLabs → Profile → API Keys bölümünden bir anahtar oluştur.');
  const h = { 'xi-api-key': KEY };
  const sub = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: h });
  if (sub.status === 401) fail('ElevenLabs anahtarı geçersiz. Yeni anahtar oluşturup dosyaya kaydet.');
  const s = await sub.json();
  const kalan = s.character_limit - s.character_count;
  console.log(`ElevenLabs kalan karakter: ${kalan}. Bu iş ~${karakter} harcar.`);
  // eleven_v3 audio tags like [excited] are not spoken but do count as characters
  if (karakter > kalan) fail('Bu ay kalan karakter yetmiyor. Metni kısalt ya da planı yükselt.');
  if (!onay) { console.log('\nHiçbir şey üretilmedi. Onaylıyorsan aynı komutu sonuna --onay ekleyerek çalıştır.'); return; }
  // the real charge goes to ses/harcama.json (per-request header, else the subscription counter before/after)
  const once = s.character_count, basliklar = [];
  try { fs.unlinkSync(SH.dosya(dir)); } catch (e) { }   // never a stale record from an earlier run
  for (const x of eksik) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${x.ses}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify({ text: x.metin, model_id: tts.model, language_code: tts.language_code, voice_settings: tts.voice_settings }),
    });
    if (!r.ok) {
      const t = (await r.text()).slice(0, 300);
      if (/voice_not_found/.test(t)) fail(`${x.n}: ses bulunamadı (${x.ses}). Paylaşılan (shared) sesler önce ElevenLabs'te "Add to my voices" ile kütüphaneye eklenmeli.`);
      fail(`${x.n}: ElevenLabs hatası ${r.status}: ${t}`);
    }
    basliklar.push(SH.basliktanKarakter(r.headers));
    fs.writeFileSync(x.dosya, Buffer.from(await r.arrayBuffer()));
    console.log(`${x.n}-${x.rol} hazır`);
  }
  let sonra = null;
  try { await new Promise(ok => setTimeout(ok, 1500)); const s2 = await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: h })).json(); sonra = s2.character_count; } catch (e) { }
  const harcama = SH.hesapla({ basliklar, once, sonra, tahmin: karakter });
  fs.writeFileSync(SH.dosya(dir), JSON.stringify({ ...harcama, tahmin: karakter, once, sonra, zaman: new Date().toISOString() }, null, 2));
  console.log(`ElevenLabs gerçek harcama: ${harcama.karakter} karakter (${harcama.kaynak}${harcama.tahmini ? ', tahmini' : ''}; metin uzunluğu ${karakter}).`);
  console.log('\nŞimdi her satırı dinle. Beğenmediğin satırın dosyasını sil, tekrar çalıştır (yalnız o satır yeniden üretilir).');
  console.log('Sonraki adım: python uretim/kelime.py ' + path.relative(process.cwd(), dir));
})();
