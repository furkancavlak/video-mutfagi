#!/usr/bin/env node
// Step 5 (FREE tier): code animation. The story is drawn in <video>/sahneler.js; captions, brand screens
// and the corner tag come from the core so every video of the channel looks like one family.
//
//   node uretim/kurgu.js <video-klasoru>                 stills every 6 s -> cikti/kareler-ucretsiz/ (look before rendering)
//   node uretim/kurgu.js <video-klasoru> --kare 3,12.5   stills at those seconds only
//   node uretim/kurgu.js <video-klasoru> --render        full video -> cikti/<ad>-ucretsiz.mp4
//
// sahneler.js exports ({ C, T, at, f, r2, rnd, W, H, M, karakter }) => ({ html, tl: [gsap lines], css }); it runs sandboxed
// (no require). M = uretim/motor.js, karakter = kanal/<ad>/karakter.js (or null). Rules: dersler/FORMUL.md
// where T = { Z, L, LE, cue, ifade, END } (see uretim/cekirdek.js). Write it with dersler/KURGU-DILI.md open.
const fs = require('fs'), path = require('path');
const K = require('./cekirdek');

const { dir, video, kimlik, kimlikDir, ad } = K.videoYukle(process.argv[2]);
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
// a video either has its own scene code (sahneler.js) or names a data-driven template (video.json → "sablon")
const sahneFile = video.sablon ? path.join(__dirname, 'sablonlar', video.sablon + '.js') : path.join(dir, 'sahneler.js');
if (!fs.existsSync(sahneFile)) K.fail(video.sablon ? `şablon yok: uretim/sablonlar/${video.sablon}.js` : 'sahneler.js yok. Ücretsiz kurgu için bu dosyayı yaz (örnek: videolar/oxygbio-v01-ucak/sahneler.js) ya da video.json dosyasına bir şablon yaz ("sablon": "simulasyon").');

const T = K.zamanlama(dir), C = K.palet(kimlik), { rnd, r2 } = K.tohum(5);
// templates are repo code; a video's own sahneler.js may be written by a language model, so it runs sandboxed and gets
// the motion motor (uretim/motor.js) and the channel's recurring character (kanal/<ad>/karakter.js, also sandboxed)
let S;
if (video.sablon) S = require(sahneFile)({ C, T, at: K.at, f: K.f1, r2, rnd, W: K.W, H: K.H, dir });
else {
  const M = require('./motor')({ T, at: K.at, f: K.f1 });
  const kf = path.join(kimlikDir, ((kimlik.gorsel_dil || {}).karakter || {}).dosya || 'karakter.js');
  const karakter = fs.existsSync(kf) ? K.guvenliYukle(kf)({ C, f: K.f1 }) : null;
  S = K.guvenliYukle(sahneFile)({ C, T, at: K.at, f: K.f1, r2, rnd, W: K.W, H: K.H, M, karakter });
}
const cap = K.altyazi(T, video, C), mk = K.marka(T, kimlik, C);

const cikti = path.join(dir, 'cikti'), hfDir = path.join(cikti, 'hf-ucretsiz');
K.sayfaYaz(hfDir, { C, END: T.END, css: S.css || '', baslik: ad + ' ucretsiz', katmanlar: [S.html, mk.html, cap.html], tl: [...S.tl, ...mk.tl, ...cap.tl] });

if (process.argv.includes('--render')) K.renderEt(hfDir, path.join(dir, 'ses', 'mix.wav'), path.join(cikti, `${ad}-ucretsiz.mp4`));
else {
  const kare = arg('--kare'), sn = kare ? kare.split(',').map(Number) : Array.from({ length: Math.floor(T.END / 6) + 1 }, (_, i) => +(i * 6 + 3).toFixed(1)).filter(x => x < T.END);
  K.kareler(hfDir, sn, path.join(cikti, 'kareler-ucretsiz'));
  console.log('\nKarelere bak (cikti/kareler-ucretsiz/contact-sheet.jpg). Beğenince: --render');
}
