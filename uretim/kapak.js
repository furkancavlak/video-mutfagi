#!/usr/bin/env node
// Episode cover for the profile grid (Reels cover_url). Only for channels whose kit declares kimlik.json → marka.kapak;
// the look lives in the kit (marka.kapak.dosya, default kapak.js, sandboxed like the closing card). The engine supplies a
// clean scene from the episode itself, the series' colour and hook title (video.json → kapak, dizi/kapak.js), the
// 2-line title split and the account handle, and turns the kit's page into a 1080x1920 JPEG.
//
//   node uretim/kapak.js <video-klasoru>                 -> cikti/<ad>-kapak.jpg
//        [--sahne <png>]  use this scene image instead of a snapshot of the episode's composition
//        [--t <s>]        snapshot the scene at this second instead of the chosen one
//        [--cikti <jpg>]  write the cover here
//
// Scene: the episode's HyperFrames page (cikti/hf-ucretsiz, written by kurgu.js) is copied and snapshotted in cover mode
// (body.kapak: no captions, no top label). The moment is the scene with the most people (kurgu.js marks every
// karakter/kutuphane figure and writes sahne-plan.json; one spot counts once), framed on their faces; else the first
// scene after 3 s with a figure; never 0 s.
// The cover page is snapshotted at t=0 the same way, then encoded by ffmpeg (q 2, full-range BT.601 = plain sRGB JPEG).
// Any failure exits non-zero; konu/uret.js logs it and the episode goes out without a cover.
const fs = require('fs'), path = require('path');

const W = 1080, H = 1920, EN_BUYUK_MB = 8;
const KISI = '<!--kisi-->';      // marks one drawn figure inside a scene's html (comments do not render)

// Anton advance widths (units per 1000 em), measured from uretim/fontlar/Anton-latin(-ext).woff2. Unknown characters
// count as an "O"; lower case is drawn upper-case by the title rule.
const ANTON = { A: 485, B: 479, C: 474, D: 493, E: 412, F: 399, G: 485, H: 499, I: 227, J: 466, K: 472, L: 397, M: 746, N: 498, O: 486,
  P: 472, Q: 494, R: 477, S: 461, T: 396, U: 474, V: 469, W: 712, X: 484, Y: 446, Z: 410, 'Ç': 474, 'Ğ': 485, 'İ': 227, 'Ö': 486, 'Ş': 461,
  'Ü': 474, 'Â': 485, 'Î': 227, 'Û': 474, 0: 494, 1: 331, 2: 494, 3: 494, 4: 494, 5: 494, 6: 494, 7: 494, 8: 494, 9: 494, ' ': 234, '-': 311,
  "'": 214, '’': 214, '.': 229, ',': 236, '!': 229, '?': 492, ':': 242, '&': 520, '%': 1057, '"': 429, '/': 405, '(': 291, ')': 291 };
const genislik = (s, px) => [...String(s)].reduce((t, c) => t + (ANTON[c] ?? ANTON.O), 0) * px / 1000;

// The title in 2 lines at a word boundary: the split with the narrowest widest line; among splits within 5% of it the
// one whose first line is the shorter (a calm pyramid). The size shrinks only when a line would pass `enGenis` px.
function satirla(baslik, { px = 118, satir = 132, enGenis = 900 } = {}) {
  const k = String(baslik || '').trim().split(/\s+/).filter(Boolean);
  if (k.length < 2) return { satirlar: [k.join(' ')], px: Math.min(px, Math.floor(px * enGenis / Math.max(1, genislik(k.join(' '), px)))), satir };
  const adaylar = k.slice(1).map((_, i) => { const a = k.slice(0, i + 1).join(' '), b = k.slice(i + 1).join(' '); return { a, b, wa: genislik(a, px), wb: genislik(b, px) }; })
    .map(x => ({ ...x, en: Math.max(x.wa, x.wb) }));
  const min = Math.min(...adaylar.map(x => x.en));
  const yakin = adaylar.filter(x => x.en <= min * 1.05), piramit = yakin.filter(x => x.wa <= x.wb);
  const s = (piramit.length ? piramit : yakin).reduce((a, x) => x.en < a.en ? x : a);
  const yeni = s.en > enGenis ? Math.floor(px * enGenis / s.en) : px;
  return { satirlar: [s.a, s.b], px: yeni, satir: Math.round(satir * yeni / px) };
}

// kurgu.js: every figure the kit draws (karakter.adam/cocuk, library characters) carries an html comment marker with
// its position when the call tells it (adam: face at y - 300*s, cocuk: head at y), so the cover can find the scene with
// the most people and frame their faces. Wraps in place; anything that is not a function is left alone.
const yer = (ad, a) => {
  const o = a[0];
  if (ad === 'cocuk') return isFinite(a[0]) && isFinite(a[1]) ? [+a[0], +a[1]] : null;
  return o && typeof o === 'object' && isFinite(o.x) && isFinite(o.y) ? [+o.x, +o.y - 300 * (isFinite(o.s) ? +o.s : 1)] : null;
};
function kisiIsaretle(o, adlar = ['adam', 'cocuk']) {
  if (!o) return o;
  for (const k of adlar === null ? Object.keys(o) : adlar) {
    const f = o[k];
    if (typeof f !== 'function') continue;
    o[k] = (...a) => {
      const r = f(...a), p = adlar === null ? null : yer(k, a);
      return typeof r === 'string' ? (p ? `<!--kisi x=${Math.round(p[0])} y=${Math.round(p[1])}-->` : KISI) + r : r;
    };
  }
  return o;
}

// scenes (motor.js M.sahne: <div class="sh" id=..>) with their people and visible window (M.kes: opacity 1 / 0 sets).
// The same person drawn twice at one spot (two expressions swapped on a word) counts once.
function sahnePlani(html, tl) {
  const parca = String(html || '').split(/(?=<div class="sh" id=")/), out = [];
  const t = (tl || []).join('\n');
  for (const p of parca) {
    const m = /^<div class="sh" id="([^"]+)">/.exec(p);
    if (!m) continue;
    const id = m[1], e = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), yerler = new Map();
    let adsiz = 0;
    for (const x of p.matchAll(/<!--kisi(?: x=(-?\d+) y=(-?\d+))?-->/g)) { if (x[1] == null) adsiz++; else yerler.set(x[1] + ',' + x[2], +x[2]); }
    const bas = new RegExp(`tl\\.set\\('#${e}',\\{opacity:1\\},([\\d.]+)\\)`).exec(t), son = new RegExp(`tl\\.set\\('#${e}',\\{opacity:0\\},([\\d.]+)\\)`).exec(t);
    out.push({ id, kisi: yerler.size + adsiz, yuzler: [...yerler.values()], bas: bas ? +bas[1] : null, son: son ? +son[1] : null });
  }
  return out;
}

// The card shows a band of the scene about BANT px tall: the band holding the most whole faces (forehead to shoulders),
// on a tie the one centred nearest their middle -> the band's centre (scene px), or null without faces.
const BANT = 884;
function odakSec(yuzler) {
  const y = (yuzler || []).filter(v => isFinite(v));
  if (!y.length) return null;
  let en = null;
  for (let ust = 0; ust <= 1920 - BANT; ust += 8) {
    const ic = y.filter(v => v - 120 >= ust && v + 200 <= ust + BANT);
    const orta = ic.length ? ic.reduce((a, b) => a + b, 0) / ic.length : 960, fark = Math.abs(ust + BANT / 2 - orta);
    if (!en || ic.length > en.n || (ic.length === en.n && fark < en.fark)) en = { n: ic.length, fark, ust };
  }
  return en.n ? en.ust + BANT / 2 : Math.round(y.reduce((a, b) => a + b, 0) / y.length);
}

// The snapshot moment -> { t, odak }: the scene with the most people, a little past its start so entrances are done;
// else the first scene after 3 s with a figure; else a moment after 3 s. Never 0 s and never inside the closing card.
// odak = where that scene's faces are (odakSec) for the card's framing, or null.
function anSec(plan, { son = null, kapanis = null, satirlar = [] } = {}) {
  const bitis = Math.min(...[kapanis, son].filter(x => x != null && isFinite(x)), Infinity);
  const pencere = s => { const b = s.bas == null ? 0 : s.bas, e = Math.min(s.son == null ? bitis : s.son, bitis); return e - b > .3 ? [b, e] : null; };
  const an = ([b, e]) => +Math.max(1, Math.min(b + Math.max(.4, (e - b) * .6), b + 1.6, e - .2)).toFixed(2);
  const kisili = (plan || []).filter(s => s.kisi > 0 && s.bas != null && pencere(s));
  if (kisili.length) {
    const en = Math.max(...kisili.map(s => s.kisi));
    // a tie goes to the earliest scene after the first 3 s (the hook or the recap opens the episode), else the earliest
    const s = kisili.filter(x => x.kisi === en).sort((a, b) => (a.bas < 3) - (b.bas < 3) || a.bas - b.bas)[0];
    return { t: an(pencere(s)), odak: odakSec(s.yuzler) };
  }
  const sonra = (plan || []).find(s => s.bas != null && s.bas >= 3 && pencere(s));
  if (sonra) return { t: an(pencere(sonra)), odak: null };
  const satir = (satirlar || []).find(s => s.bas >= 3);
  const t = satir ? satir.bas + .8 : 3.5;
  return { t: +Math.max(1, Math.min(t, isFinite(bitis) ? bitis - .5 : t)).toFixed(2), odak: null };
}

const etiket = video => { const n = +video.bolum || null, top = +video.toplam_bolum || null; return n && top && n >= top ? 'FİNAL' : n ? `BÖLÜM ${n}` : ''; };
const hesapAdi = kimlik => { const h = String(kimlik.hesap || (kimlik.marka || {}).hesap || '').trim().replace(/^@+/, ''); return h ? '@' + h : ''; };

module.exports = { satirla, genislik, kisiIsaretle, sahnePlani, odakSec, anSec, etiket, hesapAdi, KISI };
if (require.main !== module) return;

// ---- CLI
const K = require('./cekirdek');
const { dir, video, kimlik, kimlikDir, ad } = K.videoYukle(process.argv[2]);
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const kart = K.kapakYukle(kimlik, kimlikDir);
if (!kart) K.fail('bu kanalın kapağı yok (kimlik.json → marka.kapak)');
const kp = video.kapak || {};
if (!/^#[0-9a-fA-F]{6}$/.test(kp.renk || '') || !String(kp.baslik || '').trim()) K.fail('video.json → kapak { renk, baslik } yok (dizi/kapak.js doldurur)');
const cikti = path.join(dir, 'cikti'), jpg = path.resolve(arg('--cikti') || path.join(cikti, `${ad}-kapak.jpg`));
const tmp = path.join(cikti, 'kapak-tmp');
// the browser can hold a file for a moment after a snapshot (Windows): clean-up retries and never fails the cover
const temizle = () => { try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch (e) { } };
temizle();
fs.mkdirSync(tmp, { recursive: true });
const tekKare = (hfDir, t, ne) => {
  const o = path.join(tmp, ne);
  K.kareler(hfDir, [t], o);
  const f = fs.readdirSync(o).find(x => /^frame-.*\.png$/.test(x));
  if (!f) K.fail(`${ne}: kare alınamadı`);
  return path.join(o, f);
};

// 1. the clean scene
let sahne = arg('--sahne') && path.resolve(arg('--sahne')), odak = null;
if (!sahne) {
  const kaynak = path.join(cikti, 'hf-ucretsiz');
  if (!fs.existsSync(path.join(kaynak, 'index.html'))) K.fail('cikti/hf-ucretsiz/index.html yok: önce `node uretim/kurgu.js <klasör> --render`');
  const hfS = path.join(tmp, 'hf-sahne');
  fs.cpSync(kaynak, hfS, { recursive: true });
  const idx = path.join(hfS, 'index.html');
  fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace('<body>', '<body class="kapak">'));
  let plan = []; try { plan = JSON.parse(fs.readFileSync(path.join(kaynak, 'sahne-plan.json'), 'utf8')).sahneler || []; } catch (e) { }
  let Z = {}; try { Z = JSON.parse(fs.readFileSync(path.join(dir, 'ses', 'zaman.json'), 'utf8')); } catch (e) { }
  const sec = anSec(plan, { son: Z.toplam, kapanis: Z.kapanis, satirlar: Z.satirlar });
  // --t: that second, framed on the faces of the scene showing then
  const elle = arg('--t') ? +arg('--t') : null, o = elle == null ? null : plan.find(x => x.bas != null && x.bas <= elle && (x.son == null || elle < x.son));
  const t = elle == null ? sec.t : elle;
  odak = elle == null ? sec.odak : o ? odakSec(o.yuzler) : null;
  console.log(`Kapak sahnesi: ${t} sn${odak != null ? `, yüzler y≈${odak}` : ''}`);
  sahne = tekKare(hfS, t, 'sahne');
} else if (!fs.existsSync(sahne)) K.fail('sahne resmi yok: ' + sahne);

// 2. the cover page (the kit's look) at t=0
const C = K.palet(kimlik), baslik = String(kp.baslik).trim().toLocaleUpperCase('tr'), b = satirla(baslik);
const s = kart({ C, renk: kp.renk, baslik, satirlar: b.satirlar, px: b.px, satir: b.satir, etiket: etiket(video), hesap: hesapAdi(kimlik), sahne: 'assets/sahne.png', odak });
if (!s || typeof s.html !== 'string') K.fail('kapak dosyası { html, css } döndürmeli');
const hfK = path.join(tmp, 'hf-kapak');
K.sayfaYaz(hfK, { C, END: 1, css: K.KISA_FONT + '\n' + (s.css || ''), katmanlar: [s.html], tl: [], baslik: ad + ' kapak' });
fs.copyFileSync(sahne, path.join(hfK, 'assets', 'sahne.png'));
const png = tekKare(hfK, 0, 'kapak');

// 3. JPEG, checked
fs.mkdirSync(path.dirname(jpg), { recursive: true });
K.sh('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-frames:v', '1', '-vf', `scale=${W}:${H}:out_range=full,format=yuvj444p`, '-q:v', '2', jpg]);
const [w, h] = K.sh('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', jpg]).trim().split(',').map(Number);
const mb = fs.statSync(jpg).size / 1048576;
if (w !== W || h !== H || !(mb < EN_BUYUK_MB)) { fs.rmSync(jpg, { force: true }); K.fail(`kapak ${w}x${h}, ${mb.toFixed(1)} MB (1080x1920 ve 8 MB altı olmalı)`); }
temizle();
console.log(`KAPAK: ${jpg} (${mb.toFixed(2)} MB)`);
