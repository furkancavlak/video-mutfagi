// Measurement maths for stil/olc.js: everything is computed from ffmpeg-decoded raw frames and raw audio, no extra packages.
//   kesmeler(...)  hard cuts from ffmpeg's scene score
//   KareOlcer      one pass over gray frames at the source fps: flashes, whips, blur-in, zoom tracker (punch-in, rhythm),
//                  camera moves, text rows, caption cards, text appearing, frame-rate cadence
//   yaziKirpim(...) / satirDolgu(...) lines, words, letter height, stem width, thin + bold, outline (full-resolution crop)
//   belirmeOlc(...) how text appears (duration, fade or blur, line by line) on full-resolution frames
//   palet(...)     dominant colours (k-means)
//   sesOlaylari(...) sound-effect onsets by frequency band
const { spawn } = require('child_process');

// ---- raw stream reader: ffmpeg writes fixed-size frames to stdout, `bitti` gets each one in order
function akis(args, boyut, bitti, satirIsle) {
  return new Promise((ok, hata) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let tampon = Buffer.alloc(0), err = '', yarim = '';
    p.stdout.on('data', d => {
      tampon = tampon.length ? Buffer.concat([tampon, d]) : d;
      let o = 0;
      while (tampon.length - o >= boyut) { bitti(tampon.subarray(o, o + boyut)); o += boyut; }
      tampon = Buffer.from(tampon.subarray(o));
    });
    p.stderr.on('data', d => {
      if (satirIsle) { const s = (yarim + d).split('\n'); yarim = s.pop(); s.forEach(satirIsle); }
      err += d; if (err.length > 1e6) err = err.slice(-2e5);
    });
    p.on('error', hata);
    p.on('close', c => { if (satirIsle && yarim) satirIsle(yarim); c === 0 ? ok(err) : hata(new Error('ffmpeg ' + c + ': ' + err.slice(-400))); });
  });
}
// plain ffmpeg run: returns the tail of stderr, `satirIsle` sees every stderr line (scene scores, loudness)
const calistir = (args, satirIsle) => akis(args, 1 << 30, () => { }, satirIsle);

const ortanca = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const yuzdelik = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
const yuv = (n, k = 2) => n == null ? null : +(+n).toFixed(k);
const dagilim = a => a.length ? { ortanca: yuv(ortanca(a)), ort: yuv(a.reduce((x, y) => x + y, 0) / a.length), p25: yuv(yuzdelik(a, .25)), p75: yuv(yuzdelik(a, .75)), min: yuv(Math.min(...a)), max: yuv(Math.max(...a)) } : null;

// ---- 1. hard cuts: ffmpeg scene score per frame, a cut is a local peak above the threshold, at least 0.2 s apart
async function kesmeler(dosya, esik, sinirSn) {
  const skor = []; let t = null;
  await calistir(['-hide_banner', '-loglevel', 'info', '-t', String(sinirSn), '-i', dosya, '-map', '0:v:0', '-an',
    '-vf', "setpts=PTS-STARTPTS,scale=320:-2,select='gte(scene\\,0)',metadata=print", '-f', 'null', '-'], s => {
    const m = s.match(/pts_time:([\d.]+)/); if (m) { t = +m[1]; return; }
    const k = s.match(/lavfi\.scene_score=([\d.]+)/); if (k && t != null) { skor.push([t, +k[1]]); t = null; }
  });
  const zaman = [];
  for (let i = 1; i < skor.length - 1; i++) {
    const [ti, s] = skor[i];
    if (s >= esik && s >= skor[i - 1][1] && s >= skor[i + 1][1] && (!zaman.length || ti - zaman[zaman.length - 1] >= .2)) zaman.push(ti);
  }
  return { zaman, skor };
}

// ---- image matching for camera moves: is frame B frame A scaled by s around the centre and shifted by (dx, dy)?
// returns the mean absolute difference over the central 70% of B (gray levels 0-255); tavan caps each pixel's
// difference, so a small region that changes by itself (a caption swap, a hand) cannot outweigh the rest
function fark(A, B, w, h, s, dx, dy, adim, bilinear, tavan = 1e9) {
  const cx = w / 2, cy = h / 2; let top = 0, n = 0;
  for (let y = Math.floor(h * .15); y < h * .85; y += adim) for (let x = Math.floor(w * .15); x < w * .85; x += adim) {
    const xa = cx + (x - cx) / s - dx, ya = cy + (y - cy) / s - dy;
    if (xa < 0 || ya < 0 || xa > w - 2 || ya > h - 2) continue;
    let v;
    if (bilinear) { const x0 = xa | 0, y0 = ya | 0, fx = xa - x0, fy = ya - y0, i = y0 * w + x0; v = (A[i] * (1 - fx) + A[i + 1] * fx) * (1 - fy) + (A[i + w] * (1 - fx) + A[i + w + 1] * fx) * fy; }
    else v = A[Math.round(ya) * w + Math.round(xa)];
    top += Math.min(tavan, Math.abs(B[y * w + x] - v)); n++;
  }
  return n > 20 ? top / n : 1e9;
}
// coarse search on the small thumb, refine on the bigger one; returns scale, shift (fraction of width) and errors
function eslestir(a, b, olcekler, kayma) {
  const { k: Ak, o: Ao } = a, { k: Bk, o: Bo } = b, [kw, kh, ow, oh] = [a.kw, a.kh, a.ow, a.oh];
  const e0 = fark(Ao, Bo, ow, oh, 1, 0, 0, 2, false);
  let en = { e: 1e9 };
  for (const s of olcekler) for (let dy = -kayma; dy <= kayma; dy++) for (let dx = -kayma; dx <= kayma; dx++) {
    const e = fark(Ak, Bk, kw, kh, s, dx, dy, 2, false); if (e < en.e) en = { e, s, dx, dy };
  }
  const r = ow / kw; let ince = { e: 1e9 };
  for (let i = -4; i <= 4; i++) { const s = en.s * Math.exp(i * .005);
    for (let j = -2; j <= 2; j++) for (let l = -2; l <= 2; l++) {
      const dx = en.dx * r + l * .5, dy = en.dy * r + j * .5, e = fark(Ao, Bo, ow, oh, s, dx, dy, 2, true);
      if (e < ince.e) ince = { e, s, dx, dy };
    } }
  return { e0, e: ince.e, s: ince.s, dx: ince.dx / ow, dy: ince.dy / ow };
}
// local search around a prior (log scale, shift in 1/4-thumb pixels) on the 1/4 thumbs, with a parabola fit per axis:
// used by the zoom tracker, where the scale changes a little from frame to frame
function yerelEslestir(a, b, ls0, dx0, dy0) {
  const { o: A, ow, oh } = a, B = b.o, F = (l, x, y) => fark(A, B, ow, oh, Math.exp(l), x, y, 2, true, 30);
  const ADIM = [.004, .5, .5];
  let c = [ls0, dx0, dy0], ec = F(...c);
  for (let it = 0; it < 15; it++) {
    let en = null;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) {
      if (!i && !j && !l) continue;
      const q = [c[0] + i * ADIM[0], c[1] + j * ADIM[1], c[2] + l * ADIM[2]], e = F(...q);
      if (e < ec && (!en || e < en.e)) en = { q, e };
    }
    if (!en) break; c = en.q; ec = en.e;
  }
  const ince = c.slice();
  for (let k = 0; k < 3; k++) {
    const m = c.slice(), p = c.slice(); m[k] -= ADIM[k]; p[k] += ADIM[k];
    const em = F(...m), ep = F(...p), pay = em - 2 * ec + ep;
    if (pay > 1e-9) ince[k] = c[k] + Math.max(-.5, Math.min(.5, (em - ep) / (2 * pay))) * ADIM[k];
  }
  return { ls: ince[0], dx: ince[1], dy: ince[2], e: ec, e0: F(0, 0, 0) };
}
const aralik = (a, b, n) => Array.from({ length: n }, (_, i) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * i / (n - 1)));
const OLCEK_HAREKET = aralik(.8, 1.25, 23);
const OLCEK_ZIPLAMA = aralik(1 / 1.8, 1.8, 41).filter(s => Math.abs(Math.log(s)) > .05);

// ---- 2. one pass over gray frames (540 px wide) at the source fps
class KareOlcer {
  constructor(w, h, fps, kesme) {
    Object.assign(this, { w, h, fps, kesme: kesme.map(t => Math.round(t * fps)) });
    this.G = 40;                                   // gray step that counts as an edge
    this.gw = Math.ceil(w / 10); this.gh = Math.ceil(h / 10);
    this.n = 0; this.lum = []; this.satir = []; this.izgara = [];
    this.L = Math.max(2, Math.round(.4 * fps)); this.ADIM = Math.max(1, Math.round(.2 * fps));
    this.halka = [];                               // recent thumbnails for camera matching
    this.kamera = []; this.ziplama = [];
    this.kesmeSet = new Set(this.kesme);
    this.ex = []; this.ey = []; this.d1 = [];      // per frame: horizontal / vertical gradient energy (mean square; blur lowers it), change from the previous frame
    this.iz = []; this.zincir = 0; this.anahtar = null; this.profil = [];   // zoom tracker: per frame scale against a key frame of the same chain
  }
  kucult(p, f) {                                    // box-average thumbnail, f = factor
    const w = Math.floor(this.w / f), h = Math.floor(this.h / f), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let t = 0; for (let j = 0; j < f; j++) { const r = (y * f + j) * this.w + x * f; for (let i = 0; i < f; i++) t += p[r + i]; } o[y * w + x] = t / (f * f); }
    return { o, w, h };
  }
  kare(p) {
    const { w, h, G, gw } = this, n = this.n++;
    let lum = 0, sx = 0, sy = 0; const satir = new Uint16Array(h), izg = new Uint8Array(gw * this.gh);
    for (let y = 0; y < h; y++) { const r = y * w, son = y < h - 1; let c = 0;
      for (let x = 0; x < w - 1; x++) { const v = p[r + x], d = Math.abs(p[r + x + 1] - v); lum += v; sx += d * d; if (son) { const e = p[r + x + w] - v; sy += e * e; }
        if (d > G) { c++; const g = ((y / 10) | 0) * gw + ((x / 10) | 0); if (izg[g] < 255) izg[g]++; } }
      satir[y] = c; }
    this.lum.push(lum / (w * h)); this.satir.push(satir); this.izgara.push(izg);
    this.ex.push(sx / (w * h)); this.ey.push(sy / (w * h));
    // camera: thumbnails at 1/4 (refine) and 1/8 (coarse) of 540 px
    const o = this.kucult(p, 4), k = this.kucult(p, 8), tb = { o: o.o, k: k.o, ow: o.w, oh: o.h, kw: k.w, kh: k.h, n };
    const onceki = this.halka[this.halka.length - 1];
    if (onceki) { let d = 0; for (let i = 0; i < o.o.length; i++) d += Math.abs(o.o[i] - onceki.o[i]); this.d1.push(d / o.o.length); } else this.d1.push(0);
    // column and row profiles of the 1/4 thumb: how far the picture slides between frames (whip pans)
    const kp = new Float32Array(o.w), sp = new Float32Array(o.h);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) { const v = o.o[y * o.w + x]; kp[x] += v / o.h; sp[y] += v / o.w; }
    this.profil.push([kp, sp]);
    this.halka.push(tb); if (this.halka.length > this.L + 1) this.halka.shift();
    this.izle(tb, n);
    if (this.kesmeSet.has(n) && this.halka.length >= 2) {      // zoom cut: same picture, suddenly bigger or smaller?
      const m = eslestir(this.halka[this.halka.length - 2], tb, OLCEK_ZIPLAMA, 8);
      if (m.e < .55 * m.e0 && m.e < 14) this.ziplama.push({ t: n / this.fps, s: m.s });
    }
    if (n % this.ADIM === 0 && this.halka.length === this.L + 1 && !this.kesme.some(c => c > n - this.L && c <= n)) {
      const m = eslestir(this.halka[0], tb, OLCEK_HAREKET, 4), dt = this.L / this.fps;
      let tur;
      if (m.e0 < 1.2) tur = 'sabit';
      else if (m.e > .7 * m.e0) tur = 'icerik';                 // the picture changes by itself (animation, people), not the camera
      else { const z = Math.log(m.s) / dt, k = Math.hypot(m.dx, m.dy) / dt;
        tur = Math.abs(z) >= .03 ? (z > 0 ? 'zoom_ici' : 'zoom_disi') : Math.abs(z) >= .006 ? 'yavas_itme' : k >= .04 ? 'kaydirma' : 'sabit';
        m.z = z; m.k = k; }
      this.kamera.push({ t: n / this.fps, tur, z: m.z || 0 });
    }
  }
  // zoom tracker: every frame is matched against the key frame of its chain (scale around the centre + shift).
  // A cut, a failed match (animation, flash, whip) starts a new chain; the key moves on after 10% zoom or 2 s.
  izle(tb, n) {
    const yeni = () => { this.zincir++; this.anahtar = { tb, n, ls: 0, dx: 0, dy: 0 }; this.onceki = null; this.sonKare = { tb, n, ls: 0, dx: 0, dy: 0 }; this.iz.push({ n, z: this.zincir, ls: 0, dx: 0, dy: 0 }); };
    if (!this.anahtar || this.kesmeSet.has(n)) return yeni();
    const iyi = m => m.e0 < 1 || m.e < 4 || m.e < .5 * m.e0;
    const genis = K => { const g = eslestir(K.tb, tb, OLCEK_HAREKET, 4); return yerelEslestir(K.tb, tb, Math.log(g.s), g.dx * K.tb.ow, g.dy * K.tb.ow); };
    let K = this.anahtar, o = this.onceki;
    let m = yerelEslestir(K.tb, tb, ...(o ? [o.ls + (o.v || 0), o.dx, o.dy] : [0, 0, 0]));   // prior: last estimate + last speed
    if (!iyi(m)) m = genis(K);
    if (!iyi(m) && this.sonKare && this.sonKare.n === n - 1 && this.sonKare.n !== K.n) {
      // the key no longer matches (part of the picture changed by itself): continue from the previous frame instead
      const q = genis(this.sonKare);
      if (iyi(q)) { K = this.anahtar = this.sonKare; o = null; m = q; }
    }
    if (!iyi(m)) return yeni();
    const ls = K.ls + m.ls, dx = K.dx + m.dx, dy = K.dy + m.dy;
    this.iz.push({ n, z: this.zincir, ls, dx, dy, e: +m.e.toFixed(2) });
    this.onceki = { ls: m.ls, dx: m.dx, dy: m.dy, v: o ? m.ls - o.ls : 0 };
    this.sonKare = { tb, n, ls, dx, dy };
    if (Math.abs(m.ls) > .1 || n - K.n > 2 * this.fps) { this.anahtar = this.sonKare; this.onceki = { ls: 0, dx: 0, dy: 0, v: this.onceki.v }; }
  }
  // brightness flashes (white) and dips (black): frames at least 40 gray levels brighter (darker) than both the shot before
  // and the shot after, for at most 6 frames. Works across a cut (A -> white -> B), which is where editors put them.
  flaslar() {
    const L = this.lum, cik = { flas: [], kararma: [], flas_kare: [], kararma_kare: [] };
    for (let i = 3; i < L.length - 2; i++) {
      for (const [yon, liste, kare] of [[1, cik.flas, cik.flas_kare], [-1, cik.kararma, cik.kararma_kare]]) {
        const once = ortanca(L.slice(Math.max(0, i - 6), i)), d = yon * (L[i] - once);
        if (d < 40 || (yon > 0 ? L[i] < 160 : L[i] > 60)) continue;
        let e = i; while (e + 1 < L.length && e - i < 6 && yon * (L[e + 1] - once) >= 40 && Math.abs(L[e + 1] - L[i]) <= 25) e++;
        if (e - i >= 6 || e + 1 >= L.length) continue;
        const sonra = ortanca(L.slice(e + 1, e + 6)), tepe = yon > 0 ? Math.min(...L.slice(i, e + 1)) : Math.max(...L.slice(i, e + 1));
        if (yon * (tepe - sonra) < 30) continue;
        if (liste.length && i / this.fps - liste[liste.length - 1] < .5) continue;
        liste.push(+(i / this.fps).toFixed(3)); kare.push(e - i + 1); i = e;
      }
    }
    return cik;
  }
  // whip pans: 2-15 frames in which the picture is smeared along one axis (horizontal detail drops far below vertical
  // detail, or the other way), compared with the frames around them
  whipler(disla = new Set()) {
    const N = this.ex.length, r = this.ex.map((x, i) => Math.log((x + 1) / (this.ey[i] + 1))), cik = [];
    // slide between two frames along one axis: the shift (fraction of the size) that best lines up their profiles
    const kayma = (a, b, eksen) => { const A = this.profil[a][eksen], B = this.profil[b][eksen], n = A.length, m = Math.round(n * .45); let en = { e: 1e9, s: 0 };
      for (let s = -m; s <= m; s++) { let t = 0, c = 0; for (let i = Math.max(0, -s); i < Math.min(n, n - s); i++) { t += Math.abs(A[i] - B[i + s]); c++; } if (c > n * .4 && t / c < en.e) en = { e: t / c, s }; }
      return en.s / n; };
    for (let i = 1; i < N; i++) {
      if (disla.has(i)) continue;
      const cevre = [...r.slice(Math.max(0, i - 20), Math.max(0, i - 8)), ...r.slice(i + 9, i + 21)]; if (cevre.length < 6) continue;
      const m = ortanca(cevre), d = r[i] - m;
      if (Math.abs(d) < Math.log(3)) continue;
      const yon = d < 0 ? 'yatay' : 'dikey', eksen = d < 0 ? 0 : 1;
      let a = i, e = i;
      while (a - 1 > 0 && !disla.has(a - 1) && Math.sign(r[a - 1] - m) === Math.sign(d) && Math.abs(r[a - 1] - m) >= Math.log(1.5)) a--;
      while (e + 1 < N && !disla.has(e + 1) && Math.sign(r[e + 1] - m) === Math.sign(d) && Math.abs(r[e + 1] - m) >= Math.log(1.5)) e++;
      const k = e - a + 1;
      // a whip moves: the smeared frames slide along the smear axis (a blur or a flash in place does not)
      const kay = []; for (let j = a; j <= e + 1 && j < N; j++) kay.push(kayma(j - 1, j, eksen));
      const hareket = kay.filter(x => Math.abs(x) >= .02).length, ayni = Math.abs(kay.filter(x => Math.abs(x) >= .02).reduce((t, x) => t + Math.sign(x), 0));
      if (k >= 2 && k <= 15 && hareket >= Math.max(2, kay.length * .5) && ayni >= hareket * .7) cik.push({ t: +(a / this.fps).toFixed(3), n: a, kare: k, yon });
      i = e;
    }
    return cik;
  }
  // blur-to-sharp entrance after a cut: the first frames hold much less detail than the shot a little later
  bulanikGiris(n0) {
    const S = i => this.ex[i] + this.ey[i], N = this.ex.length;
    if (n0 + 14 >= N) return null;
    const hedef = ortanca(Array.from({ length: 6 }, (_, j) => S(n0 + 8 + j)));
    if (!(S(n0) < .6 * hedef)) return null;
    let k = n0; while (k < n0 + 12 && S(k) < .9 * hedef) k++;
    return { kare: k - n0, sn: +((k - n0) / this.fps).toFixed(3) };
  }
  // zoom over each shot from the tracker: relative to the widest frame of the shot (= 1.00).
  //   punch : the shot opens zoomed in and falls back fast (scale at the first frame, time to 90% of the fall)
  //   ritim : the slow zoom after that (largest / smallest scale, time between turning points)
  zoomSeyri(sinir) {
    const fps = this.fps, cekim = [];
    for (let i = 0; i < sinir.length - 1; i++) {
      const [a, b] = [sinir[i], sinir[i + 1]]; if (b - a < Math.round(.6 * fps)) continue;
      const kayit = this.iz.filter(x => x.n >= a && x.n < b), say = {};
      kayit.forEach(x => say[x.z] = (say[x.z] || 0) + 1);
      const z = +Object.keys(say).sort((u, v) => say[v] - say[u])[0], seri = kayit.filter(x => x.z === z);
      if (seri.length < Math.max(8, .4 * (b - a))) { cekim.push({ t: +(a / fps).toFixed(3), sure_sn: +((b - a) / fps).toFixed(2), izlenemedi: true }); continue; }
      // median of 3 against single bad matches
      const ls = seri.map((x, j) => j && j < seri.length - 1 ? ortanca(seri.slice(j - 1, j + 2).map(q => q.ls)) : x.ls);
      const t = seri.map(x => x.n / fps), enAz = Math.min(...ls);
      const c = { t: +(a / fps).toFixed(3), sure_sn: +((b - a) / fps).toFixed(2), izlenen_sn: +(seri.length / fps).toFixed(2), punch: null, ritim: null };
      // punch: the chain starts within 0.15 s of the cut, opens 6%+ above the lowest zoom of its first 1.2 s, and falls fast
      let bas = 0;
      if (seri[0].n - a <= Math.round(.15 * fps)) {
        const ilk = ls.filter((_, j) => t[j] - t[0] <= 1.2), dip = Math.min(...ilk), dj = ilk.indexOf(dip), fark0 = ls[0] - dip;
        if (fark0 >= Math.log(1.06) && dj > 0 && fark0 / (t[dj] - t[0] + 1 / fps) > .25) {
          let j90 = 0; while (j90 < dj && ls[j90] - dip > .1 * fark0) j90++;
          // sub-frame: interpolate where the curve crosses the 10% level
          const y0 = ls[j90 - 1] - dip, y1 = ls[j90] - dip, kes = j90 > 0 && y0 !== y1 ? (y0 - .1 * fark0) / (y0 - y1) : 0;
          c.punch = { bas: yuv(Math.exp(fark0), 3), sure90_sn: yuv((j90 > 0 ? t[j90 - 1] + kes * (t[j90] - t[j90 - 1]) : t[0]) - t[0] + (seri[0].n - a) / fps, 3), bitis_sn: yuv(t[dj] - t[0], 2) };
          bas = dj;
        }
      }
      // rhythm after the punch: range and turning points (a turn must be 2% away from the last one)
      const r = ls.slice(bas), rt = t.slice(bas);
      if (r.length >= 6) {
        const mn = Math.min(...r), mx = Math.max(...r), donus = [];
        let yon = 0, uc = r[0], ut = rt[0];
        for (let j = 1; j < r.length; j++) {
          if (!yon) { if (Math.abs(r[j] - r[0]) > .02) { yon = Math.sign(r[j] - r[0]); uc = r[j]; ut = rt[j]; } }
          else if (yon * (r[j] - uc) > 0) { uc = r[j]; ut = rt[j]; }
          else if (yon * (uc - r[j]) > .02) { donus.push({ t: ut, tur: yon > 0 ? 'tepe' : 'dip' }); yon = -yon; uc = r[j]; ut = rt[j]; }
        }
        if (bas > 0) donus.unshift({ t: rt[0], tur: 'dip' });
        const ara = donus.slice(1).map((d, j) => d.t - donus[j].t);
        c.ritim = { alt: yuv(Math.exp(mn - enAz), 3), ust: yuv(Math.exp(mx - enAz), 3), aralik: yuv(Math.exp(mx - mn), 3), donus: donus.map(d => yuv(d.t, 2)), yari_periyot_sn: ara.length ? yuv(ortanca(ara), 2) : null };
      }
      cekim.push(c);
    }
    return cekim;
  }
  // text appearing over a steady picture (titles, labels, paragraphs), outside the caption band: a cluster of 10 px cells
  // gains edges over 8 frames while few cells lose any. Returns rough windows; olc.js measures them at full resolution.
  yaziBelirmeleri(bant, disla) {
    const N = this.izgara.length, gw = this.gw, gh = this.gh, olay = [], B = 8;
    const bantta = gy => bant && bant.var && gy * 10 + 10 >= bant.ust && gy * 10 <= bant.alt;
    let acik = null;
    for (let n = B; n < N; n++) {
      let yakin = false; for (let j = n - B; j <= n; j++) if (disla.has(j)) { yakin = true; break; }
      const kazan = [], kayip = [];
      if (!yakin) for (let g = 0; g < gw * gh; g++) {
        const gy = (g / gw) | 0; if (bantta(gy)) continue;
        const d = this.izgara[n][g] - this.izgara[n - B][g];
        if (d >= 6) kazan.push(g); else if (d <= -6) kayip.push(g);
      }
      const var_ = kazan.length >= 6 && kayip.length <= .3 * kazan.length && kazan.length < .3 * gw * gh;
      if (var_) {
        if (!acik) acik = { a: n - B, b: n, x0: 1e9, x1: -1, y0: 1e9, y1: -1 };
        acik.b = n;
        for (const g of kazan) { const x = g % gw, y = (g / gw) | 0; acik.x0 = Math.min(acik.x0, x); acik.x1 = Math.max(acik.x1, x); acik.y0 = Math.min(acik.y0, y); acik.y1 = Math.max(acik.y1, y); }
      } else if (acik && n - acik.b > 4) { olay.push(acik); acik = null; }
    }
    if (acik) olay.push(acik);
    return olay.map(o => ({ a: o.a, b: o.b, x0: o.x0 * 10, x1: o.x1 * 10 + 10, y0: o.y0 * 10, y1: o.y1 * 10 + 10 }));
  }
  // frame-rate conversion leaves a beat in moving pictures: a doubled step every few frames (frames dropped, e.g. 30 -> 25)
  // or a frozen one (frames repeated, e.g. 24 -> 30). Measured on the frame-to-frame change while the camera moves.
  kadans(disla) {
    const d = this.d1, N = d.length, r = [];
    for (let i = 4; i < N - 4; i++) {
      if (disla.has(i)) continue;
      const m = ortanca([...d.slice(i - 4, i), ...d.slice(i + 1, i + 5)]);
      if (m >= .8) r.push([i, d[i] / m]);
    }
    let en = null;
    for (let p = 3; p <= 8; p++) for (let f = 0; f < p; f++) {
      const ic = r.filter(([i]) => i % p === f).map(x => x[1]), dis = r.filter(([i]) => i % p !== f).map(x => x[1]);
      if (ic.length < 8) continue;
      const a = ortanca(ic), b = ortanca(dis), puan = Math.abs(Math.log(a / b));
      if (!en || puan > en.puan) en = { p, puan, tur: a > b ? 'atlanan_kare' : 'tekrar_kare', oran: yuv(a / b, 2), ornek: ic.length };
    }
    const kopya = r.filter(x => x[1] < .15).length;
    return { hareketli_kare: r.length, kadans: en && en.puan > Math.log(1.3) ? en : null, kopya_kare: kopya,
      yeniden_orneklenmis: !!(en && en.puan > Math.log(1.3)) || (r.length > 30 && kopya / r.length > .05) };
  }
  // caption band: the rows that hold text in most frames; then card changes inside that band
  altyaziBandi() {
    const { h, w } = this, T = Math.max(14, Math.round(w * .03)), N = this.satir.length, sik = new Float32Array(h);
    for (const s of this.satir) for (let y = 0; y < h; y++) if (s[y] >= T) sik[y]++;
    for (let y = 0; y < h; y++) sik[y] /= N;
    // smooth over 1% of the height, find the most frequent text row
    const r = Math.max(2, Math.round(h * .01)), yum = sik.map((_, y) => { let t = 0, c = 0; for (let j = y - r; j <= y + r; j++) if (j >= 0 && j < h) { t += sik[j]; c++; } return t / c; });
    let ty = 0; for (let y = 0; y < h; y++) if (yum[y] > yum[ty]) ty = y;
    if (yum[ty] < .25) return { var: false, siklik: +yum[ty].toFixed(2), T };
    let ust = ty, alt = ty; const sinir = yum[ty] * .15;
    while (ust > 0 && yum[ust - 1] >= sinir) ust--;
    while (alt < h - 1 && yum[alt + 1] >= sinir) alt++;
    ust = Math.max(0, ust - r); alt = Math.min(h - 1, alt + r);
    return { var: true, ust, alt, siklik: +yum[ty].toFixed(2), T };
  }
  // per frame: text lines (row runs) inside the band, in 540-scale rows
  satirlar(n, bant) {
    const s = this.satir[n], runs = []; let bas = -1, bos = 0;
    for (let y = bant.ust; y <= bant.alt + 1; y++) {
      const dolu = y <= bant.alt && s[y] >= bant.T;
      if (dolu) { if (bas < 0) bas = y; bos = 0; }
      else if (bas >= 0 && ++bos > 2) { const son = y - bos; if (son - bas + 1 >= 4) runs.push([bas, son]); bas = -1; bos = 0; }
    }
    return runs;
  }
  kartlar(bant) {
    const N = this.izgara.length, gw = this.gw, g0 = Math.floor(bant.ust / 10), g1 = Math.ceil(bant.alt / 10);
    const imza = n => this.izgara[n].subarray(g0 * gw, Math.min(this.gh, g1 + 1) * gw);
    const uzak = (a, b) => { let d = 0, t = 1; for (let i = 0; i < a.length; i++) { d += Math.abs(a[i] - b[i]); t += a[i] + b[i]; } return d / t; };
    const d1 = new Float32Array(N), d3 = new Float32Array(N);
    for (let n = 1; n < N; n++) d1[n] = uzak(imza(n), imza(n - 1));
    for (let n = 3; n < N; n++) d3[n] = uzak(imza(n), imza(n - 3));
    const olay = [];
    // a change: the band's edge pattern jumps, well above its own wobble (zoom and noise under the text)
    for (let n = 3; n < N - 2; n++) {
      if (d3[n] < .15 || d3[n] < 4 * ortanca(Array.from(d3.subarray(Math.max(3, n - 20), Math.min(N, n + 21))))) continue;
      let tepe = true; for (let j = n - 3; j <= n + 3; j++) if (j !== n && j > 0 && j < N && d3[j] > d3[n]) tepe = false;
      if (tepe && (!olay.length || n - olay[olay.length - 1] >= 6)) olay.push(n);
    }
    // a change event: the frame where d1 peaks inside the 3-frame window; the motion length = frames with d1 >= 0.06 around it
    const degisim = olay.map(n => { let m = n; for (let j = n - 3; j <= n; j++) if (d1[j] > d1[m]) m = j;
      let a = m, b = m; while (a > 1 && d1[a - 1] >= .06 && m - a < 15) a--; while (b < N - 1 && d1[b + 1] >= .06 && b - m < 15) b++;
      return { n: m, kare: b - a + 1 }; });
    // text in the band: line runs, and the band holds clearly more edges than the same height just above and below it
    // (a busy background fills the band and its surroundings alike)
    const bh = bant.alt - bant.ust + 1, ort = (s, a, b) => { let t = 0, c = 0; for (let y = Math.max(0, a); y <= Math.min(this.h - 1, b); y++) { t += s[y]; c++; } return c ? t / c : 0; };
    const yaziVar = n => { if (!this.satirlar(n, bant).length) return false; const s = this.satir[n];
      const ic = ort(s, bant.ust, bant.alt), dis = Math.max(ort(s, bant.ust - bh - 4, bant.ust - 4), ort(s, bant.alt + 4, bant.alt + bh + 4));
      return ic >= 1.5 * dis + 2; };
    this.yaziVar = yaziVar;
    const kart = [];
    const sinir = [0, ...degisim.map(d => d.n), N];
    for (let i = 0; i < sinir.length - 1; i++) {
      const a = sinir[i], b = sinir[i + 1], orta = (a + b) >> 1;
      if (b - a < Math.max(3, this.fps * .25) || !yaziVar(orta)) continue;
      kart.push({ a, b, orta, satir: this.satirlar(orta, bant) });
    }
    return { degisim, kart };
  }
}

// ---- 3. words and lines on one caption crop (full resolution gray, width w, height h)
function yaziKirpim(p, w, h) {
  const G = 40, T = Math.max(10, Math.round(w * .012)), sat = new Uint16Array(h);   // low enough for a one-word line
  for (let y = 0; y < h; y++) { let c = 0; for (let x = 0; x < w - 1; x++) if (Math.abs(p[y * w + x + 1] - p[y * w + x]) > G) c++; sat[y] = c * 540 / w; }
  const lines = []; let bas = -1, bos = 0;
  for (let y = 0; y <= h; y++) {
    const dolu = y < h && sat[y] >= T * 540 / w;
    if (dolu) { if (bas < 0) bas = y; bos = 0; }
    else if (bas >= 0 && ++bos > 3) { const son = y - bos; if (son - bas + 1 >= 8) lines.push([bas, son]); bas = -1; bos = 0; }
  }
  const sonuc = [];
  for (const [a, b] of lines) {
    if (a <= 1 || b >= h - 2) continue;                 // cut by the crop edge: not a whole line
    const d = satirDolgu(p, w, h, a, b);
    if (d) { sonuc.push(d); continue; }
    const lh = b - a + 1, kol = new Uint16Array(w);
    for (let y = a; y <= b; y++) for (let x = 0; x < w - 1; x++) { const i = y * w + x; if (Math.abs(p[i + 1] - p[i]) > G || (y < h - 1 && Math.abs(p[i + w] - p[i]) > G)) kol[x]++; }
    // ink pieces separated by gaps wider than a letter gap; thin pieces are card borders, not letters
    const esik = Math.max(4, lh * .12), parca = []; let x0 = -1, bosluk = 0;
    for (let x = 0; x <= w; x++) {
      const dolu = x < w && kol[x] > 0;
      if (dolu) { if (x0 < 0) x0 = x; bosluk = 0; }
      else if (x0 >= 0 && (++bosluk >= esik || x === w)) { const x1 = x - bosluk; if (x1 - x0 + 1 >= lh * .25) parca.push([x0, x1]); x0 = -1; bosluk = 0; }
    }
    if (!parca.length) continue;
    // a gap of more than 1.5 line heights separates unrelated things (text and a card edge, two labels): keep the widest group
    const grup = [[parca[0]]];
    for (let i = 1; i < parca.length; i++) { if (parca[i][0] - parca[i - 1][1] > lh * 1.5) grup.push([]); grup[grup.length - 1].push(parca[i]); }
    const g = grup.sort((u, v) => (v[v.length - 1][1] - v[0][0]) - (u[u.length - 1][1] - u[0][0]))[0];
    sonuc.push({ yukseklik: lh, kelime: g.length, sol: g[0][0], sag: g[g.length - 1][1] });
  }
  // a "line" much shorter than the others is a stray mark, not text
  const ana = Math.max(0, ...sonuc.map(s => s.yukseklik));
  return sonuc.filter(s => s.yukseklik >= ana * .6);
}

// The letters themselves (the fill), not their outline or shadow: the extreme gray class (brightest or darkest) that is
// much more common inside the line than just above and below it. Returns letter height, stem width (median horizontal
// run of the fill in the middle rows), outline width, words with their own stem width, and where the bold block sits.
function satirDolgu(p, w, h, a, b) {
  const lh = b - a + 1, deg = [];
  for (let y = a; y <= b; y++) for (let x = 0; x < w; x += 2) deg.push(p[y * w + x]);
  deg.sort((u, v) => u - v);
  const hi = deg[Math.floor(deg.length * .97)], lo = deg[Math.floor(deg.length * .03)];
  if (hi - lo < 60) return null;
  // the line's own width: columns with edges in its rows
  let ex0 = w, ex1 = -1;
  for (let y = a; y <= b; y++) for (let x = 0; x < w - 1; x++) if (Math.abs(p[y * w + x + 1] - p[y * w + x]) > 40) { if (x < ex0) ex0 = x; if (x > ex1) ex1 = x; }
  if (ex1 < ex0) return null;
  const pay = (fn, y0, y1) => { let c = 0, n = 0; for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) for (let x = ex0; x <= ex1; x += 2) { n++; if (fn(p[y * w + x])) c++; } return n ? c / n : 0; };
  // a caption card: one gray level fills the padding just above and below the line and much of the line itself.
  // Then every letter that stands out from the card is text, whatever its colour (highlighted words too).
  const kenar = Math.max(2, Math.round(lh * .35)), hist = new Uint32Array(256);
  for (const [y0, y1] of [[a - kenar, a - 2], [b + 2, b + kenar]]) for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) for (let x = ex0; x <= ex1; x += 2) hist[p[y * w + x]]++;
  let m = 0, enCok = -1; for (let v = 0; v < 256; v++) { let t = 0; for (let j = Math.max(0, v - 12); j <= Math.min(255, v + 12); j++) t += hist[j]; if (t > enCok) { enCok = t; m = v; } }
  const tumu = hist.reduce((x, y) => x + y, 0), kart = tumu > 20 && enCok / tumu >= .75 && pay(v => Math.abs(v - m) <= 12, a, b) >= .4;
  let aday;
  if (kart) {
    // only the columns that lie on the card (its padding is card-coloured above and below the line)
    const ust0 = Math.max(0, a - kenar), alt1 = Math.min(h - 1, b + kenar), uygun = new Uint8Array(w);
    // (either side is enough: the other one may hold the next line of the card)
    for (let x = ex0; x <= ex1; x++) uygun[x] = [[ust0, a - 2], [b + 2, alt1]].some(([y0, y1]) => { let c = 0, n = 0; for (let y = y0; y <= y1; y++) { n++; if (Math.abs(p[y * w + x] - m) <= 12) c++; } return n && c / n >= .8; });
    const fn = (v, x) => uygun[x] && Math.abs(v - m) > 60;
    aday = { fn, ic: pay(v => Math.abs(v - m) > 60, a, b), oran: 99, kart: true, koyu: pay(v => v < m - 60, a, b) >= pay(v => v > m + 60, a, b) };
  }
  else aday = [v => v >= hi - 35, v => v <= lo + 35].map(fn => {
    // the letters' tone is rare just above or below the line (one side may be another line of text),
    // and it comes in strokes: short horizontal runs (an outline merged with a dark background makes long ones)
    const ic = pay(fn, a, b), dis = Math.min(pay(fn, a - Math.round(lh * .7), a - 3), pay(fn, b + 3, b + Math.round(lh * .7)));
    let kisa = 0, top = 0;
    for (let y = a + (lh >> 2); y <= b - (lh >> 2); y++) { let run = 0;
      for (let x = ex0; x <= ex1 + 1; x++) { if (x <= ex1 && fn(p[y * w + x])) run++; else if (run) { top += run; if (run <= lh * .4) kisa += run; run = 0; } } }
    const oran = ic / (dis + .004), cizgi = top ? kisa / top : 0;
    return { fn, ic, oran, cizgi, puan: Math.min(oran, 50) * cizgi * cizgi, koyu: fn(0) };
  }).sort((u, v) => v.puan - u.puan)[0];
  if (aday.oran < 2.5 || aday.ic < .01) return null;
  const M = aday.fn, kol = new Uint16Array(w), sat = new Uint16Array(lh);
  for (let y = a; y <= b; y++) for (let x = 0; x < w; x++) if (M(p[y * w + x], x)) { kol[x]++; sat[y - a]++; }
  // letter rows: rows holding fill, the longest run allowing 2-row gaps
  const esik = Math.max(2, 0.004 * w); let ust = -1, alt = -1, bu = -1, bos = 0, en = 0;
  for (let y = 0; y <= lh; y++) {
    if (y < lh && sat[y] >= esik) { if (bu < 0) bu = y; bos = 0; }
    else if (bu >= 0 && (++bos > 2 || y === lh)) { const son = y - bos; if (son - bu > en) { en = son - bu; ust = bu; alt = son; } bu = -1; bos = 0; }
  }
  if (ust < 0) return null;
  const boy = alt - ust + 1;
  // words: runs of fill columns; a word gap is wider than both 15% of the letter height and 1.6x the typical letter gap
  // (tight fonts put letters almost as far apart as words, so the gap is judged against this line's own letters)
  const kos = []; let x0 = -1;
  for (let x = 0; x <= w; x++) { const d = x < w && kol[x] > 0; if (d && x0 < 0) x0 = x; if (!d && x0 >= 0) { kos.push([x0, x - 1]); x0 = -1; } }
  const bosluk = kos.slice(1).map((k, i) => k[0] - kos[i][1] - 1), esikB = Math.max(3, boy * .15, 1.6 * (ortanca(bosluk.filter(g => g < boy * .6)) || 0));
  const parca = [];
  for (let i = 0; i < kos.length; i++) {
    if (i && bosluk[i - 1] < esikB) parca[parca.length - 1][1] = kos[i][1]; else parca.push(kos[i].slice());
  }
  for (let i = parca.length - 1; i >= 0; i--) if (parca[i][1] - parca[i][0] + 1 < boy * .2) parca.splice(i, 1);
  if (!parca.length) return null;
  // stems: horizontal runs of fill in the middle 50% of the letter rows
  const govde = (xa, xb) => { const r = [];
    for (let y = a + ust + Math.round(boy * .25); y <= a + ust + Math.round(boy * .75); y++) { let run = 0;
      for (let x = xa; x <= xb + 1; x++) { if (x <= xb && M(p[y * w + x], x)) run++; else if (run) { if (run >= 1) r.push(run); run = 0; } } }
    return r.length >= 3 ? ortanca(r) : null; };
  // keep the widest group of words (a gap of 1.5 letter heights separates unrelated things)
  const grup = [[parca[0]]];
  for (let i = 1; i < parca.length; i++) { if (parca[i][0] - parca[i - 1][1] > boy * 1.5) grup.push([]); grup[grup.length - 1].push(parca[i]); }
  const g = grup.sort((u, v) => (v[v.length - 1][1] - v[0][0]) - (u[u.length - 1][1] - u[0][0]))[0];
  const kel = g.map(([xa, xb]) => ({ x0: xa, x1: xb, govde: govde(xa, xb) }));
  const gv = kel.map(k => k.govde).filter(x => x != null), ince = Math.min(...gv), kalin = Math.max(...gv);
  let kalin_konum = null;
  if (gv.length >= 2 && kalin / ince >= 1.5) {
    const sinir = Math.sqrt(ince * kalin), k = kel.map(x => x.govde != null && x.govde >= sinir);
    const ilk = k.indexOf(true), son = k.lastIndexOf(true), blok = k.slice(ilk, son + 1).every(Boolean);
    kalin_konum = !blok ? 'karisik' : son === k.length - 1 && ilk > 0 ? 'son' : ilk === 0 && son < k.length - 1 ? 'bas' : ilk === 0 ? 'hepsi' : 'orta';
  }
  // outline: a thin run of the opposite tone right next to the letters, the same width all around (a background of the
  // outline's tone hides it, for the eye too). Letter gaps, card padding and other words vary, so they do not form a peak.
  const acik = !aday.koyu, zit = v => acik ? v <= Math.min(lo + 60, hi - 120) : v >= Math.max(hi - 60, lo + 120), kr = [];
  if (!aday.kart) for (let y = a + ust + Math.round(boy * .3); y <= a + ust + Math.round(boy * .7); y++) for (const yon of [1, -1]) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x; if (!(M(p[i]) && !M(p[i + yon]))) continue;
      let k = 0; while (k < boy * .25 && x + yon * (k + 1) >= 0 && x + yon * (k + 1) < w && zit(p[i + yon * (k + 1)])) k++;
      const sonraki = x + yon * (k + 1); if (k >= 1 && k < boy * .25 && sonraki >= 0 && sonraki < w && !zit(p[y * w + sonraki]) && !M(p[y * w + sonraki])) kr.push(k);
    }
  }
  const tepe = (() => { if (kr.length < 20) return null; const say = {}; kr.forEach(k => say[k] = (say[k] || 0) + 1);
    const m0 = +Object.keys(say).sort((u, v) => say[v] - say[u])[0], yakin = kr.filter(k => Math.abs(k - m0) <= 1);
    return yakin.length / kr.length >= .6 ? ortanca(yakin) : null; })();
  return { yukseklik: boy, kenar_yukseklik: lh, kontur: tepe, kart: !!aday.kart, kutup: acik ? 'acik' : 'koyu',
    kelime: kel.length, govde: govde(g[0][0], g[g.length - 1][1]), ince_govde: gv.length ? ince : null, kalin_govde: gv.length ? kalin : null,
    kalinlik_orani: gv.length >= 2 ? yuv(kalin / ince, 2) : null, kalin_konum, sol: g[0][0], sag: g[g.length - 1][1] };
}

// ---- text appearance at full resolution: frames = gray crops (w x h) of one window, first = before, last = after.
// A frame is "in transition" while it differs from both the before and the after state by more than 5% of the
// whole change (on the pixels that change). Duration = frames from the last "before" frame to the first "after" frame.
// Each text line is timed on its own (a paragraph that opens line by line). Kind of appearance in the middle frame:
// a plain blend of before and after = fade ("solma"); much less detail than such a blend = blur to sharp.
function belirmeOlc(kareler, w, h, fps) {
  const n = kareler.length, once = kareler[0], sonra = kareler[n - 1], M = new Uint8Array(w * h);
  let mt = 0; for (let i = 0; i < w * h; i++) if (Math.abs(sonra[i] - once[i]) > 30) { M[i] = 1; mt++; }
  if (mt < 50) return null;
  const satirSay = new Uint32Array(h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) satirSay[y] += M[y * w + x];
  const satirlar = []; let bas = -1, bos = 0;
  for (let y = 0; y <= h; y++) {
    if (y < h && satirSay[y] >= 3) { if (bas < 0) bas = y; bos = 0; }
    else if (bas >= 0 && (++bos > 3 || y === h)) { const son = y - bos; if (son - bas + 1 >= 6) satirlar.push([bas, son]); bas = -1; bos = 0; }
  }
  const zamanla = (y0, y1) => {
    let tot = 0, c = 0; const Db = new Float64Array(n), Da = new Float64Array(n);
    for (let y = y0; y <= y1; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!M[i]) continue; c++; tot += Math.abs(sonra[i] - once[i]);
      for (let k = 0; k < n; k++) { const v = kareler[k][i]; Db[k] += Math.abs(v - once[i]); Da[k] += Math.abs(v - sonra[i]); } }
    if (!c) return null;
    let kb = -1, ka = -1; for (let k = 0; k < n; k++) { if (kb < 0 && Db[k] > .05 * tot) kb = k; if (Da[k] > .05 * tot) ka = k; }
    if (kb < 0 || ka < kb - 1) return null;
    return { kb, ka, kare: ka - kb + 2, sn: yuv((ka - kb + 2) / fps, 3) };
  };
  const tum = zamanla(0, h - 1); if (!tum) return null;
  let bx0 = w, bx1 = -1, by0 = h, by1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (M[y * w + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  const sat = satirlar.map(([a, b]) => ({ y0: a, y1: b, z: zamanla(a, b) })).filter(s => s.z);
  // kind: fade or blur, on the middle transition frame
  const km = Math.max(0, Math.min(n - 1, Math.round((tum.kb + tum.ka) / 2))), F = kareler[km];
  let sab = 0, sbb = 0; for (let i = 0; i < w * h; i++) if (M[i]) { const d = sonra[i] - once[i]; sab += (F[i] - once[i]) * d; sbb += d * d; }
  const al = Math.max(0, Math.min(1, sab / sbb)); let res = 0, tot = 0;
  for (let i = 0; i < w * h; i++) if (M[i]) { res += Math.abs(F[i] - (once[i] + al * (sonra[i] - once[i]))); tot += Math.abs(sonra[i] - once[i]); }
  const keskin = K => { let s = 0; for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) { const i = y * w + x; if (M[i]) s += (K[i + 1] - K[i]) ** 2 + (K[i + w] - K[i]) ** 2; } return s; };
  const g0 = keskin(once), g1 = keskin(sonra), gm = keskin(F), kazanc = (gm - g0) / ((g1 - g0) || 1);
  const tur = tum.kare <= 2 ? 'aninda' : kazanc < .6 * al ? 'bulaniktan_nete' : res / tot < .12 ? 'solma' : 'diger';
  const basla = sat.map(s => s.z.kb).sort((a, b) => a - b), ara = basla.slice(1).map((b, i) => b - basla[i]);
  return { kb: tum.kb, ka: tum.ka, kare: tum.kare, sn: tum.sn, tur, karisim: yuv(al, 2), keskinlik_kazanci: yuv(kazanc, 2),
    kutu: { x0: bx0, x1: bx1, y0: by0, y1: by1 }, satir: sat.length, satir_satir: sat.length >= 2 && ara.length > 0 && ortanca(ara) >= 2,
    satir_arasi_sn: ara.length ? yuv(ortanca(ara) / fps, 3) : null, satirlar: sat.map(s => ({ y0: s.y0, y1: s.y1, bas_kare: s.z.kb, sn: s.z.sn })) };
}

// ---- 4. dominant colours: k-means on sampled pixels (fixed seed, so the same video gives the same palette)
function palet(px, k = 6) {
  const n = px.length / 3, adim = Math.max(1, Math.floor(n / 40000)), X = [];
  for (let i = 0; i < n; i += adim) X.push([px[i * 3], px[i * 3 + 1], px[i * 3 + 2]]);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const M = [X[Math.floor(rnd() * X.length)].slice()];
  while (M.length < k) { const D = X.map(x => Math.min(...M.map(m => d2(x, m)))), top = D.reduce((a, b) => a + b, 0); let r = rnd() * top, i = 0; while ((r -= D[i]) > 0 && i < D.length - 1) i++; M.push(X[i].slice()); }
  const etiket = new Uint8Array(X.length);
  for (let it = 0; it < 15; it++) {
    X.forEach((x, i) => { let b = 0, bd = 1e12; M.forEach((m, j) => { const d = d2(x, m); if (d < bd) { bd = d; b = j; } }); etiket[i] = b; });
    const T = M.map(() => [0, 0, 0, 0]); X.forEach((x, i) => { const t = T[etiket[i]]; t[0] += x[0]; t[1] += x[1]; t[2] += x[2]; t[3]++; });
    T.forEach((t, j) => { if (t[3]) M[j] = [t[0] / t[3], t[1] / t[3], t[2] / t[3]]; });
  }
  const say = M.map(() => 0); etiket.forEach(e => say[e]++);
  const hex = m => '#' + m.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const doy = m => { const mx = Math.max(...m), mn = Math.min(...m); return mx ? (mx - mn) / mx : 0; };
  const parlak = m => (.2126 * m[0] + .7152 * m[1] + .0722 * m[2]) / 255;
  return M.map((m, j) => ({ hex: hex(m), pay: +(say[j] / X.length).toFixed(3), parlaklik: +parlak(m).toFixed(2), doygunluk: +doy(m).toFixed(2) })).sort((a, b) => b.pay - a.pay);
}

// ---- 5. sound-effect onsets: spectral flux per band on 22.05 kHz mono
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) { const u = i + j, v = u + len / 2, tr = re[v] * cr - im[v] * ci, ti = re[v] * ci + im[v] * cr;
        re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
// Speech is the loudest thing in most videos, so "a sudden sound" is not enough. Tested on a render whose effects are
// known (brand stings, chimes): speech onsets must not count. An effect is
//   bas   : the sound jumps 6+ dB and the sub-bass band (20-150 Hz) carries almost all of it for 70 ms  -> boom, kick, hit
//   ton   : one pitch between 0.9 and 6 kHz stands 20+ dB above its band for 90 ms                    -> ding, chime, bell
//   genis : the sound jumps 6+ dB into a noise-like spectrum that is loud in low, mid and high bands  -> impact, hit
//   hisirti: a noise-like swell (8+ dB over 150 ms) whose high bands lead, for 120 ms+                -> whoosh, swish
const BANTLAR = [[20, 150], [150, 400], [400, 2500], [2500, 6000], [6000, 11000]];
function sesOlaylari(x, sr) {
  const N = 1024, H = 256, dt = H / sr, hann = Float32Array.from({ length: N }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / N));
  const kutu = BANTLAR.map(([a, b]) => [Math.max(1, Math.floor(a * N / sr)), Math.min(N / 2, Math.ceil(b * N / sr))]);
  const k9 = Math.floor(900 * N / sr), k6 = Math.ceil(6000 * N / sr);
  const F = Math.max(0, Math.floor((x.length - N) / H)), R = [];
  for (let f = 0; f < F; f++) {
    const re = new Float32Array(N), im = new Float32Array(N); let e = 0;
    for (let i = 0; i < N; i++) { const v = x[f * H + i]; re[i] = v * hann[i]; e += v * v; }
    fft(re, im);
    const pw = new Float32Array(N / 2); let top = 0; for (let k = 1; k < N / 2; k++) { pw[k] = re[k] * re[k] + im[k] * im[k]; top += pw[k]; }
    const db = kutu.map(([a, c]) => { let t = 0; for (let k = a; k < c; k++) t += pw[k]; return 10 * Math.log10(t + 1e-10); });
    let mx = 0, s = 0; for (let k = k9; k < k6; k++) { s += pw[k]; if (pw[k] > mx) mx = pw[k]; }
    let lg = 0, ar = 0, n = 0; for (let k = kutu[1][0]; k < kutu[4][1]; k++) { lg += Math.log(pw[k] + 1e-12); ar += pw[k]; n++; }
    const tot = 10 * Math.log10(top + 1e-10);
    R.push({ tot, rms: Math.sqrt(e / N), sub: db[0] - tot, db, ton: 10 * Math.log10(mx / (s / (k6 - k9) + 1e-12) + 1e-12), duz: Math.exp(lg / n) / (ar / n + 1e-12) });
  }
  const sesli = R.filter(r => r.tot > 20).map(r => r.tot), orta = ortanca(sesli) ?? 0;
  const surer = (i, fn, n) => { for (let j = i; j < i + n; j++) if (!R[j] || !fn(R[j])) return false; return true; };
  const olay = []; let son = -9;
  for (let i = 3; i < F - 12; i++) {
    const r = R[i], ziplama = r.tot - Math.min(R[i - 2].tot, R[i - 3].tot);
    let tur = null;
    if (ziplama >= 6 && surer(i, q => q.sub >= -1 && q.tot >= orta - 3, 6)) tur = 'bas';
    else if (R[i - 3].ton < 20 && surer(i, q => q.ton >= 20, 8)) tur = 'ton';
    else if (ziplama >= 6 && surer(i, q => q.duz >= .3 && q.tot >= orta && Math.min(q.db[1], q.db[2], q.db[3]) >= Math.max(...q.db) - 10, 6)) tur = 'genis';
    // whoosh: swells (no sharp attack), so the rise is taken against the quietest moment of the last 150 ms;
    // then 120 ms of loud noise whose high bands outweigh the low-mid band (speech hiss is far quieter than vowels)
    const once = Math.min(...R.slice(Math.max(0, i - 13), i - 1).map(q => q.tot));
    if (!tur && r.tot - once >= 8 && surer(i, q => q.duz >= .25 && Math.max(q.db[3], q.db[4]) >= q.db[1] && q.tot >= orta - 3, 10)) tur = 'hisirti';
    if (tur && i * dt - son > .3) {
      let j = i; while (j > Math.max(1, i - 15) && R[j - 1].tot > once + 3) j--;         // back to where the sound starts rising
      const t = j * dt + N / 2 / sr;                                                      // window centre
      olay.push({ t: +t.toFixed(3), tur, guc: +Math.max(0, ziplama, r.tot - once).toFixed(1) }); son = i * dt;
    }
  }
  const sessiz = R.filter(r => r.rms < Math.pow(10, -45 / 20)).length / (R.length || 1);
  return { olay, sessizlik: +sessiz.toFixed(3) };
}

module.exports = { akis, calistir, kesmeler, KareOlcer, yaziKirpim, satirDolgu, belirmeOlc, palet, sesOlaylari, fft, ortanca, yuzdelik, dagilim, yuv };
