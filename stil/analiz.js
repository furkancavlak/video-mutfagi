// Measurement maths for stil/olc.js: everything is computed from ffmpeg-decoded raw frames and raw audio, no extra packages.
//   kesmeler(...)  hard cuts from ffmpeg's scene score
//   KareOlcer      one pass over gray frames at the source fps: brightness flashes, camera zoom/pan, text rows, caption cards
//   yaziKirpim(...) words and lines on a caption card (full-resolution crop)
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
    '-vf', "scale=320:-2,select='gte(scene\\,0)',metadata=print", '-f', 'null', '-'], s => {
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
// returns the mean absolute difference over the central 70% of B (gray levels 0-255)
function fark(A, B, w, h, s, dx, dy, adim, bilinear) {
  const cx = w / 2, cy = h / 2; let top = 0, n = 0;
  for (let y = Math.floor(h * .15); y < h * .85; y += adim) for (let x = Math.floor(w * .15); x < w * .85; x += adim) {
    const xa = cx + (x - cx) / s - dx, ya = cy + (y - cy) / s - dy;
    if (xa < 0 || ya < 0 || xa > w - 2 || ya > h - 2) continue;
    let v;
    if (bilinear) { const x0 = xa | 0, y0 = ya | 0, fx = xa - x0, fy = ya - y0, i = y0 * w + x0; v = (A[i] * (1 - fx) + A[i + 1] * fx) * (1 - fy) + (A[i + w] * (1 - fx) + A[i + w + 1] * fx) * fy; }
    else v = A[Math.round(ya) * w + Math.round(xa)];
    top += Math.abs(B[y * w + x] - v); n++;
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
  }
  kucult(p, f) {                                    // box-average thumbnail, f = factor
    const w = Math.floor(this.w / f), h = Math.floor(this.h / f), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let t = 0; for (let j = 0; j < f; j++) { const r = (y * f + j) * this.w + x * f; for (let i = 0; i < f; i++) t += p[r + i]; } o[y * w + x] = t / (f * f); }
    return { o, w, h };
  }
  kare(p) {
    const { w, h, G, gw } = this, n = this.n++;
    let lum = 0; const satir = new Uint16Array(h), izg = new Uint8Array(gw * this.gh);
    for (let y = 0; y < h; y++) { const r = y * w; let c = 0;
      for (let x = 0; x < w - 1; x++) { lum += p[r + x]; if (Math.abs(p[r + x + 1] - p[r + x]) > G) { c++; const g = ((y / 10) | 0) * gw + ((x / 10) | 0); if (izg[g] < 255) izg[g]++; } }
      satir[y] = c; }
    this.lum.push(lum / (w * h)); this.satir.push(satir); this.izgara.push(izg);
    // camera: thumbnails at 1/4 (refine) and 1/8 (coarse) of 540 px
    const o = this.kucult(p, 4), k = this.kucult(p, 8), tb = { o: o.o, k: k.o, ow: o.w, oh: o.h, kw: k.w, kh: k.h, n };
    this.halka.push(tb); if (this.halka.length > this.L + 1) this.halka.shift();
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
  // brightness flashes (white) and dips (black): a jump of 40 gray levels that comes back within 8 frames
  flaslar() {
    const L = this.lum, cik = { flas: [], kararma: [] };
    for (let i = 5; i < L.length - 1; i++) {
      const once = ortanca(L.slice(i - 5, i)), d = L[i] - once;
      if (Math.abs(d) < 40) continue;
      const geri = L.slice(i + 1, i + 9).some(v => Math.abs(v - once) < 15);
      const liste = d > 0 ? cik.flas : cik.kararma;
      if (geri && (!liste.length || i / this.fps - liste[liste.length - 1] > .5)) liste.push(+(i / this.fps).toFixed(2));
    }
    return cik;
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
    for (let n = 3; n < N - 2; n++) {
      if (d3[n] < .3) continue;
      let tepe = true; for (let j = n - 3; j <= n + 3; j++) if (j !== n && j > 0 && j < N && d3[j] > d3[n]) tepe = false;
      if (tepe && (!olay.length || n - olay[olay.length - 1] >= 6)) olay.push(n);
    }
    // a change event: the frame where d1 peaks inside the 3-frame window; the motion length = frames with d1 >= 0.06 around it
    const degisim = olay.map(n => { let m = n; for (let j = n - 3; j <= n; j++) if (d1[j] > d1[m]) m = j;
      let a = m, b = m; while (a > 1 && d1[a - 1] >= .06 && m - a < 15) a--; while (b < N - 1 && d1[b + 1] >= .06 && b - m < 15) b++;
      return { n: m, kare: b - a + 1 }; });
    const yaziVar = n => this.satirlar(n, bant).length > 0;
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
  const G = 40, T = Math.max(14, Math.round(w * .03)), sat = new Uint16Array(h);
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
//   genis : the sound jumps 6+ dB into a noise-like spectrum that is loud in low, mid and high bands  -> whoosh, impact
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
    if (tur && i * dt - son > .3) { olay.push({ t: +(i * dt).toFixed(3), tur, guc: +Math.max(0, ziplama).toFixed(1) }); son = i * dt; }
  }
  const sessiz = R.filter(r => r.rms < Math.pow(10, -45 / 20)).length / (R.length || 1);
  return { olay, sessizlik: +sessiz.toFixed(3) };
}

module.exports = { akis, calistir, kesmeler, KareOlcer, yaziKirpim, palet, sesOlaylari, fft, ortanca, yuzdelik, dagilim, yuv };
