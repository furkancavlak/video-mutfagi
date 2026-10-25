#!/usr/bin/env node
// Step 4: audio assembly. Speeds the narration up a little, weaves the brand sting into the hook,
// treats announcer roles (cabin PA filter + chime), adds the closing sting and ducks stings under the voice.
//
//   node uretim/mix.js <video-klasoru>
//
// Writes <video>/ses/mix.wav and <video>/ses/zaman.json (line starts, global word times, sting hits, chimes).
// The sting is not played after the hook: its riser starts under the hook's last words, the hit lands right
// after the sentence, and the voice comes back ~0.75 s later over the ducked tail (like a video transition).
const fs = require('fs'), path = require('path');
const { videoYukle, okuJson, sh, sure, fail, KOK } = require('./cekirdek');
const { hizala } = require('./hizala');

const { dir, video, kimlik } = videoYukle(process.argv[2]);
const SR = 48000, TEMPO = video.hiz || 1;
const sesDir = path.join(dir, 'ses'), tmp = path.join(sesDir, 'tmp');
fs.mkdirSync(tmp, { recursive: true });
const words = okuJson(path.join(sesDir, 'kelimeler.json'), 'ses/kelimeler.json (önce python uretim/kelime.py)');
const lines = Object.keys(words).sort();
if (lines.length !== video.satirlar.length) fail(`video.json'da ${video.satirlar.length} satır var ama kelimeler.json'da ${lines.length}. Eksik satır sesi ya da eski dosya olabilir.`);

// brand sting from the channel identity (riser length = time from file start to the hit)
const sting = path.join(tmp, 'sting.wav');
if (!fs.existsSync(sting)) sh('node', [path.join(KOK, 'marka', 'marka-sesi.js'), kimlik.marka.ses, sting]);
const RISE = kimlik.marka.yukselis || 0.85;

// announcer "bing-bong" chime (two decaying bells)
function chime(file) {
  const n = Math.round(1.6 * SR), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / SR; let s = 0;
    for (const [f0, t0] of [[880, 0], [698.46, 0.45]]) if (t >= t0) { const u = t - t0; s += (Math.sin(2 * Math.PI * f0 * u) + 0.3 * Math.sin(2 * Math.PI * f0 * 2 * u)) * Math.exp(-u * 3.2) * Math.min(1, u / 0.004); }
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * 0.35)) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, b);
}
const chimeWav = path.join(tmp, 'chime.wav');
chime(chimeWav);
const CHIME_LEAD = 0.75;
const anons = new Set(video.anons_rolleri || []);
const rol = f => f.replace(/^\d+-/, '').replace(/\.[^.]+$/, '');

// tempo + per-voice treatment (announcers get a narrow-band PA sound)
const proc = {};
for (const f of lines) {
  const out = path.join(tmp, f.replace(/\.[^.]+$/, '.wav'));
  const pa = anons.has(rol(f)) ? ',highpass=f=380,lowpass=f=3300,acompressor=threshold=-20dB:ratio=4,volume=1.4' : '';
  sh('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(sesDir, f), '-af', `aresample=${SR},atempo=${TEMPO},loudnorm=I=-15:TP=-1.5${pa}`, '-ac', '2', out]);
  proc[f] = { wav: out, d: sure(out) };
}

// timeline
const ev = [], Z = { satirlar: [], kelimeler: [], sting: [], chime: [] };
let t = 0.25;
lines.forEach((f, i) => {
  const kim = rol(f), isA = anons.has(kim);
  if (isA) { ev.push([chimeWav, t, 0.7, 'fx']); Z.chime.push(+t.toFixed(3)); t += CHIME_LEAD; }
  const start = t;
  ev.push([proc[f].wav, start, 1, 'ses']);
  Z.satirlar.push({ dosya: f, kim, bas: +start.toFixed(3), son: +(start + proc[f].d).toFixed(3) });
  // caption text comes from the script; Whisper only supplies the timing (uretim/hizala.js)
  const hizali = hizala(video.satirlar[i].metin, words[f]) || words[f];
  for (const [w, a, b] of hizali) {
    const son = Z.kelimeler[Z.kelimeler.length - 1];
    // Whisper splits Turkish suffixes after an apostrophe ("Karadeniz" + "'in"): glue them back onto the word
    if (/^['’]/.test(w) && son && son.satir === i) { son.w += w.replace('’', "'"); son.b = +(start + b / TEMPO).toFixed(3); continue; }
    Z.kelimeler.push({ w, a: +(start + a / TEMPO).toFixed(3), b: +(start + b / TEMPO).toFixed(3), kim, satir: i });
  }
  const end = start + proc[f].d;
  if (i === 0) {                                  // hook -> woven sting
    const hit = end + 0.1; ev.push([sting, hit - RISE, 0.55, 'fx']); Z.sting.push(+hit.toFixed(3)); t = hit + 0.75;
  } else if (i === lines.length - 1) {            // closing sting after the punchline
    const hit = end + 0.45; ev.push([sting, hit - RISE, 0.55, 'fx']); Z.sting.push(+hit.toFixed(3)); t = hit + 2.4;
  } else t = end + (isA || anons.has(rol(lines[i + 1])) ? 0.35 : 0.22);
});
Z.toplam = +t.toFixed(3);

// narration is the sidechain key, so the sting tail ducks under the voice
const inputs = ev.flatMap(e => ['-i', e[0]]);
const voiceIdx = ev.map((e, i) => (e[3] === 'ses' ? i : -1)).filter(i => i >= 0);
const fxIdx = ev.map((e, i) => (e[3] === 'fx' ? i : -1)).filter(i => i >= 0);
let g = ev.map((e, i) => `[${i}:a]aresample=${SR},aformat=channel_layouts=stereo,volume=${e[2]},adelay=${Math.round(e[1] * 1000)}|${Math.round(e[1] * 1000)},apad=whole_dur=${Z.toplam}[e${i}]`).join(';');
g += `;${voiceIdx.map(i => `[e${i}]`).join('')}amix=inputs=${voiceIdx.length}:normalize=0,asplit[v][vk]`;
g += `;${fxIdx.map(i => `[e${i}]`).join('')}amix=inputs=${fxIdx.length}:normalize=0[fx]`;
g += `;[fx][vk]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[fxd];[v][fxd]amix=inputs=2:normalize=0,atrim=0:${Z.toplam},loudnorm=I=-14:TP=-1.5[o]`;
sh('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', g, '-map', '[o]', '-ar', String(SR), path.join(sesDir, 'mix.wav')]);
fs.writeFileSync(path.join(sesDir, 'zaman.json'), JSON.stringify(Z, null, 1));
console.log(`mix.wav hazır: ${Z.toplam} sn | marka vuruşları ${Z.sting.join(', ')} | anons ${Z.chime.join(', ') || '-'}`);
console.log('Dinle: açılış sesi kancanın son kelimelerinin ALTINDA yükselmeli, cümle biter bitmez vurmalı.');
