#!/usr/bin/env node
// Step 4: audio assembly. Speeds the narration up a little, weaves the brand sting into the hook,
// treats announcer roles (cabin PA filter + chime), adds the closing sting and ducks stings under the voice.
//
//   node uretim/mix.js <video-klasoru>
//
// Writes <video>/ses/mix.wav and <video>/ses/zaman.json (line starts, global word times, sting hits, chimes).
// The sting is not played after the hook: its riser starts under the hook's last words, the hit lands right
// after the sentence, and the voice comes back ~0.75 s later over the ducked tail (like a video transition).
// A channel without a sting (kimlik.json → marka.ses: null) gets none; with a closing card (marka.kapanis) the card
// starts 0.5 s after the narration ends (zaman.json → kapanis), its music (marka.kapanis_muzigi) comes in with it, its
// sound effects (the card's sfx → kanal/<kanal>/muzik/<name>.wav, skipped when missing) play and the video ends with the card.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const { videoYukle, okuJson, sh, sure, fail, KOK, kapanisYukle, kapanisSesleri, kapanisMuzigi, tesekkurMuzigi, tesekkurListesi, ciddiTon, palet, at: atS } = require('./cekirdek');
const { hizala } = require('./hizala');

const { dir, video, kimlik, kimlikDir } = videoYukle(process.argv[2]);
const SR = 48000, TEMPO = video.hiz || 1;
const sesDir = path.join(dir, 'ses'), tmp = path.join(sesDir, 'tmp');
fs.mkdirSync(tmp, { recursive: true });
const words = okuJson(path.join(sesDir, 'kelimeler.json'), 'ses/kelimeler.json (önce python uretim/kelime.py)');
const lines = Object.keys(words).sort();
if (lines.length !== video.satirlar.length) fail(`video.json'da ${video.satirlar.length} satır var ama kelimeler.json'da ${lines.length}. Eksik satır sesi ya da eski dosya olabilir.`);

// brand sting from the channel identity (riser length = time from file start to the hit)
const STING = !!kimlik.marka.ses, sting = path.join(tmp, 'sting.wav');
if (STING && !fs.existsSync(sting)) sh('node', [path.join(KOK, 'marka', 'marka-sesi.js'), kimlik.marka.ses, sting]);
const RISE = kimlik.marka.yukselis || 0.85;
// the channel's closing card: only its length and music cue are needed here
const kart = kapanisYukle(kimlik, kimlikDir);
// the story's tone (video.json ton): a serious one gets no comic sound and a softer bed, or none
const TON = video.ton || 'komik', muzikAd = kart ? kapanisMuzigi(kimlik.marka, TON) : null;
const muzik = muzikAd ? path.join(kimlikDir, muzikAd) : null;
if (muzik && !fs.existsSync(muzik)) fail(`kapanış müziği yok: ${muzik} (kimlik.json → marka.${ciddiTon(TON) ? 'kapanis_muzigi_ciddi' : 'kapanis_muzigi'})`);
if (kart && ciddiTon(TON) && !muzik) console.log(`Not: ${TON} hikâye; kitte yumuşak kapanış müziği (marka.kapanis_muzigi_ciddi) yok, kartın altında müzik çalmayacak.`);

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

// Phone recordings carry dead air before/after the line and long hesitations inside it ("sessizlik_kirp": true
// in video.json). Silences come from the audio itself (ffmpeg silencedetect), not from Whisper, whose word
// edges stretch over pauses. Head keeps .15 s, tail .25 s, pauses longer than .7 s shrink to .35 s.
// Word times are shifted by the audio removed before them. Idea from herk-edit-kit's cut-silences (MIT).
function sessizlikler(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-40dB:d=0.5', '-f', 'null', '-'], { encoding: 'utf8' });
  const D = sure(file), out = []; let s0 = null;
  for (const m of (r.stderr || '').matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === 'start') s0 = +m[2]; else if (s0 != null) { out.push([s0, +m[2]]); s0 = null; }
  }
  if (s0 != null) out.push([s0, D]);
  const kes = [];
  for (const [a, b] of out) {
    if (a <= 0.02) { if (b - 0.15 > 0) kes.push([0, b - 0.15]); }
    else if (b >= D - 0.02) kes.push([a + 0.25, D]);
    else if (b - a > 0.7) kes.push([a + 0.175, b - 0.175]);
  }
  return kes.filter(([a, b]) => b - a > 0.05);
}
const kaydir = (kes, x) => x - kes.reduce((t, [a, b]) => t + (x <= a ? 0 : Math.min(x, b) - a), 0);

// tempo + per-voice treatment (announcers get a narrow-band PA sound)
const proc = {};
for (const f of lines) {
  const out = path.join(tmp, f.replace(/\.[^.]+$/, '.wav'));
  const pa = anons.has(rol(f)) ? ',highpass=f=380,lowpass=f=3300,acompressor=threshold=-20dB:ratio=4,volume=1.4' : '';
  const kes = video.sessizlik_kirp ? sessizlikler(path.join(sesDir, f)) : [];
  const sec = kes.length ? `aselect='not(${kes.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+')})',asetpts=N/SR/TB,` : '';
  sh('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(sesDir, f), '-af', `${sec}aresample=${SR},atempo=${TEMPO},loudnorm=I=-15:TP=-1.5${pa}`, '-ac', '2', out]);
  proc[f] = { wav: out, d: sure(out), kes };
  if (kes.length) console.log(`${f}: ${kes.reduce((t, [a, b]) => t + b - a, 0).toFixed(2)} sn sessizlik kırpıldı`);
}

// timeline
const ev = [], Z = { satirlar: [], kelimeler: [], sting: [], chime: [] };
let kartSfx = 0;
let t = 0.25;
lines.forEach((f, i) => {
  const kim = rol(f), isA = anons.has(kim);
  if (isA) { ev.push([chimeWav, t, 0.7, 'fx']); Z.chime.push(+t.toFixed(3)); t += CHIME_LEAD; }
  const start = t;
  ev.push([proc[f].wav, start, 1, 'ses']);
  Z.satirlar.push({ dosya: f, kim, bas: +start.toFixed(3), son: +(start + proc[f].d).toFixed(3) });
  // caption text comes from the script; Whisper only supplies the timing (uretim/hizala.js)
  const kes = proc[f].kes, ham = kes.length ? words[f].map(([w, a, b]) => [w, kaydir(kes, a), kaydir(kes, b)]) : words[f];
  const hizali = hizala(video.satirlar[i].metin, ham) || ham;
  for (const [w, a, b] of hizali) {
    const son = Z.kelimeler[Z.kelimeler.length - 1];
    // Whisper splits Turkish suffixes after an apostrophe ("Karadeniz" + "'in"): glue them back onto the word
    if (/^['’]/.test(w) && son && son.satir === i) { son.w += w.replace('’', "'"); son.b = +(start + b / TEMPO).toFixed(3); continue; }
    Z.kelimeler.push({ w, a: +(start + a / TEMPO).toFixed(3), b: +(start + b / TEMPO).toFixed(3), kim, satir: i });
  }
  const end = start + proc[f].d;
  if (i === 0 && STING) {                         // hook -> woven sting
    const hit = end + 0.1; ev.push([sting, hit - RISE, 0.55, 'fx']); Z.sting.push(+hit.toFixed(3)); t = hit + 0.75;
  } else if (i === lines.length - 1) {
    if (STING) {                                  // closing sting after the punchline
      const hit = end + 0.45; ev.push([sting, hit - RISE, 0.55, 'fx']); Z.sting.push(+hit.toFixed(3)); t = hit + 2.4;
    } else if (kart) {                            // channel closing card + its outro music (ends on its own)
      // a series' last episode thanks its commenters (video.json → tesekkur); earlier episodes get the plain card
      const sonBolum = !video.toplam_bolum || +video.bolum >= +video.toplam_bolum;
      const bas = end + 0.5, k = kart({ C: palet(kimlik), at: atS, bas, sonraki: null, hesap: kimlik.marka.hesap, ton: TON, tesekkur: sonBolum ? tesekkurListesi(video) : [] });
      const m = k.muzik || { bas: bas - 0.1, ses: 0.7 };
      const tm = k.tesekkur && tesekkurMuzigi(kimlik.marka, TON), tmYol = tm ? path.join(kimlikDir, tm) : null;
      if (tmYol && fs.existsSync(tmYol)) ev.push([tmYol, Math.max(0, m.bas), m.ses, 'fx', { dongu: k.sure + 0.1 }]);   // looped, faded out at the end
      else if (muzik) ev.push([muzik, Math.max(0, m.bas), m.ses, 'fx']);
      for (const [f, t0, v] of kapanisSesleri(k, kimlikDir, TON)) { ev.push([f, t0, v, 'fx']); kartSfx++; }   // the card's own whoosh/pop/tick
      Z.kapanis = +bas.toFixed(3); t = bas + k.sure;
    } else t = end + 1;
  } else t = end + (isA || anons.has(rol(lines[i + 1])) ? 0.35 : 0.22);
});
Z.toplam = +t.toFixed(3);

// narration is the sidechain key, so the sting tail ducks under the voice
const inputs = ev.flatMap(e => e[4] && e[4].dongu ? ['-stream_loop', '-1', '-i', e[0]] : ['-i', e[0]]);
const voiceIdx = ev.map((e, i) => (e[3] === 'ses' ? i : -1)).filter(i => i >= 0);
const fxIdx = ev.map((e, i) => (e[3] === 'fx' ? i : -1)).filter(i => i >= 0);
let g = ev.map((e, i) => `[${i}:a]aresample=${SR},aformat=channel_layouts=stereo,${e[4] && e[4].dongu ? `atrim=0:${e[4].dongu.toFixed(2)},afade=t=out:st=${Math.max(0, e[4].dongu - 1.5).toFixed(2)}:d=1.5,` : ''}volume=${e[2]},adelay=${Math.round(e[1] * 1000)}|${Math.round(e[1] * 1000)},apad=whole_dur=${Z.toplam}[e${i}]`).join(';');
if (fxIdx.length) {
  g += `;${voiceIdx.map(i => `[e${i}]`).join('')}amix=inputs=${voiceIdx.length}:normalize=0,asplit[v][vk]`;
  g += `;${fxIdx.map(i => `[e${i}]`).join('')}amix=inputs=${fxIdx.length}:normalize=0[fx]`;
  g += `;[fx][vk]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[fxd];[v][fxd]amix=inputs=2:normalize=0,atrim=0:${Z.toplam},loudnorm=I=-14:TP=-1.5[o]`;
} else g += `;${voiceIdx.map(i => `[e${i}]`).join('')}amix=inputs=${voiceIdx.length}:normalize=0,atrim=0:${Z.toplam},loudnorm=I=-14:TP=-1.5[o]`;   // no sting, chime or music
sh('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', g, '-map', '[o]', '-ar', String(SR), path.join(sesDir, 'mix.wav')]);
fs.writeFileSync(path.join(sesDir, 'zaman.json'), JSON.stringify(Z, null, 1));
console.log(`mix.wav hazır: ${Z.toplam} sn | marka vuruşları ${Z.sting.join(', ') || '-'} | anons ${Z.chime.join(', ') || '-'}${Z.kapanis != null ? ` | kapanış kartı ${Z.kapanis}${kartSfx ? ` (${kartSfx} efekt)` : ''}` : ''}`);
if (STING) console.log('Dinle: açılış sesi kancanın son kelimelerinin ALTINDA yükselmeli, cümle biter bitmez vurmalı.');
