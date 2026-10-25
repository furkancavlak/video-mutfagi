#!/usr/bin/env node
// Step 5 (FREE tier): code animation. The story is drawn in <video>/sahneler.js; captions, brand screens
// and the corner tag come from the core so every video of the channel looks like one family.
//
//   node uretim/kurgu.js <video-klasoru>                 stills every 6 s -> cikti/kareler-ucretsiz/ (look before rendering)
//   node uretim/kurgu.js <video-klasoru> --kare 3,12.5   stills at those seconds only
//   node uretim/kurgu.js <video-klasoru> --render        full video -> cikti/<ad>-ucretsiz.mp4
//
// sahneler.js exports ({ C, T, at, f, r2, rnd, W, H }) => ({ html, tl: [gsap lines], css })
// where T = { Z, L, LE, cue, ifade, END } (see uretim/cekirdek.js). Write it with dersler/KURGU-DILI.md open.
const fs = require('fs'), path = require('path');
const K = require('./cekirdek');

const { dir, video, kimlik, ad } = K.videoYukle(process.argv[2]);
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const sahneFile = path.join(dir, 'sahneler.js');
if (!fs.existsSync(sahneFile)) K.fail('sahneler.js yok. Ücretsiz kurgu için bu dosyayı yaz (örnek: videolar/oxygbio-v01-ucak/sahneler.js).');

const T = K.zamanlama(dir), C = K.palet(kimlik), { rnd, r2 } = K.tohum(5);
const S = require(sahneFile)({ C, T, at: K.at, f: K.f1, r2, rnd, W: K.W, H: K.H });
const cap = K.altyazi(T, video, C), mk = K.marka(T, kimlik, C);

const cikti = path.join(dir, 'cikti'), hfDir = path.join(cikti, 'hf-ucretsiz');
K.sayfaYaz(hfDir, { C, END: T.END, css: S.css || '', baslik: ad + ' ucretsiz', katmanlar: [S.html, mk.html, cap.html], tl: [...S.tl, ...mk.tl, ...cap.tl] });

if (process.argv.includes('--render')) K.renderEt(hfDir, path.join(dir, 'ses', 'mix.wav'), path.join(cikti, `${ad}-ucretsiz.mp4`));
else {
  const kare = arg('--kare'), sn = kare ? kare.split(',').map(Number) : Array.from({ length: Math.floor(T.END / 6) + 1 }, (_, i) => +(i * 6 + 3).toFixed(1)).filter(x => x < T.END);
  K.kareler(hfDir, sn, path.join(cikti, 'kareler-ucretsiz'));
  console.log('\nKarelere bak (cikti/kareler-ucretsiz/contact-sheet.jpg). Beğenince: --render');
}
