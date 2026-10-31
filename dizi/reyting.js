// Series rating (TV-ratings style), pure and deterministic: no files, no network, no clock (simdi is an input).
//   reyting({ gozlem, kayit, diziler, sure, simdi }) -> { zaman, gecici, n_olgun, egri, bolumler, diziler, canlanan }
//   gozlem  observation rows of instagram/istatistik.js gozlemler() ({media_id, zaman, yayin, yas_s, metrik})
//   kayit   the account registry medya.json {<media_id>: {t, tur?, dizi?, bolum?}}
//   diziler the channel's series records (diziler.json → diziler); their episodes' media_id win over the registry
//   sure    {<media_id>: video length in seconds} (watch ratio only)
// Every score is relative to the channel itself (log views against a recency-weighted robust baseline): no fixed
// performance multiplier, so the numbers mean the same at 10k and at 1M average views.
//   base(a)   weighted median of log1p(views at age a) over the other reels, weights 2^(-|Δt|/h) by publish time with the
//             half-life h chosen so the effective sample (Σw)²/Σw² is ~20; references are first moved to the scored reel's
//             publish time by the channel's drift (weighted Theil–Sen slope), so a growing channel does not lift every
//             new reel; scale s(a) = weighted MAD × 1.4826, floored at 0.15
//   r = log1p(v) − base(a), z = r / s(a) at the reel's newest observed age (capped at 168 h)
//   slot (posting hour) and episode number (1..n, final) effects: Σr / (n + 5), removed before the series effect
//   series: mu = Σ w r / (Σ w + 5), sd = s_pool / sqrt(Σ w + 5), w = log2(1 + age_h); R = 100 Φ(mu / sd)
//   velocity: Zvel = (Δlog1p views − Δbase) / s_vel over the last 1–3 h; late viral: > 72 h old, Zvel ≥ 2 twice
// Diagnostics (watch ratio, skip rate, shares/reach, saves/reach) are tie-breakers, never part of R.
const IZGARA = [1, 2, 3, 6, 12, 24, 48, 72, 168];
const SAAT = 3600e3, K0 = 5, NEFF = 20, MAX_REF = 200, S_MIN = 0.15, SVEL_MIN = 0.1, OLGUN_SAAT = 24, OLGUN_EN_AZ = 12;
const MC_CEKILIS = 2000, MC_TOHUM = 20261031, TANI_M = 100;   // TANI_M: pseudo-reach a diagnostic is shrunk with
// observation cadence by age (hours), as instagram/istatistik.js KADANS; a gap > 3× the band's cadence is not interpolated
const kadansH = a => a < 6 ? 1 / 6 : a < 72 ? 1 : a < 336 ? 6 : a < 1440 ? 24 : 168;

// ---- maths
// standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7)
function Phi(x) {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? (1 + e) / 2 : (1 - e) / 2;
}
// weighted median: the smallest value whose cumulative weight reaches half (midpoint on an exact tie)
function wMedyan(x, w) {
  const n = x.length; if (!n) return null;
  const ix = x.map((_, i) => i).sort((a, b) => x[a] - x[b]);
  const W = w ? w.reduce((s, v) => s + v, 0) : n;
  let c = 0;
  for (let k = 0; k < n; k++) {
    c += w ? w[ix[k]] : 1;
    if (Math.abs(c - W / 2) < 1e-12 * W && k + 1 < n) return (x[ix[k]] + x[ix[k + 1]]) / 2;
    if (c >= W / 2) return x[ix[k]];
  }
  return x[ix[n - 1]];
}
const neff = w => { let a = 0, b = 0; for (const v of w) { a += v; b += v * v; } return b ? a * a / b : 0; };
// deterministic RNG (mulberry32) and a normal draw (Box–Muller)
function rng(tohum) {
  let s = tohum >>> 0;
  const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { u, n: () => { const a = u() || 1e-12, b = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); } };
}
const yuvarla = (x, d = 4) => x == null || !Number.isFinite(x) ? null : +x.toFixed(d);

// ---- one reel's curve
// log1p(views) at age a (hours): linear in log1p space between observations (publish = 0 views at age 0); null past
// the newest observation or across a gap longer than 3× the cadence of a's age band
function logAt(pts, a) {
  const n = pts.length;
  if (!n || !(a >= 0) || a > pts[n - 1][0] + 1e-9) return null;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m][0] < a - 1e-9) lo = m + 1; else hi = m; }
  const p = pts[lo];
  if (Math.abs(p[0] - a) <= 1e-9) return p[1];
  const q = lo ? pts[lo - 1] : [0, 0];
  const bosluk = p[0] - q[0];
  if (bosluk > 3 * kadansH(a)) return null;
  return q[1] + (p[1] - q[1]) * (a - q[0]) / bosluk;
}

// ---- robust recency-weighted centre of reference values [{x, t}] for a reel published at tc
// -> {m, s, n, neff} or null with fewer than 3 references
function merkez(ref, tc) {
  if (ref.length < 3) return null;
  let r = ref.map(o => ({ ...o, d: Math.abs(o.t - tc) / SAAT })).sort((a, b) => a.d - b.d || a.t - b.t);
  if (r.length > MAX_REF) r = r.slice(0, MAX_REF);
  let w;
  if (r.length <= NEFF) w = r.map(() => 1);
  else {
    // neff grows with the half-life: bisect log h so neff ≈ NEFF
    const agirlik = h => r.map(o => Math.pow(2, -o.d / h));
    let lo = Math.log(0.25), hi = Math.log(1e6);
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (neff(agirlik(Math.exp(m))) < NEFF) lo = m; else hi = m; }
    w = agirlik(Math.exp(hi));
  }
  // drift (log units per hour): weighted Theil–Sen over the 30 heaviest references, pairs at least 12 h apart
  let egim = 0;
  if (r.length >= 6) {
    const ust = r.map((o, i) => ({ o, w: w[i] })).sort((a, b) => b.w - a.w).slice(0, 30), sl = [], sw = [];
    for (let i = 0; i < ust.length; i++) for (let j = i + 1; j < ust.length; j++) {
      const dt = (ust[j].o.t - ust[i].o.t) / SAAT;
      if (Math.abs(dt) >= 12) { sl.push((ust[j].o.x - ust[i].o.x) / dt); sw.push(ust[i].w * ust[j].w); }
    }
    if (sl.length >= 3) egim = wMedyan(sl, sw);
  }
  const x = r.map(o => o.x + egim * (tc - o.t) / SAAT);
  const m = wMedyan(x, w);
  const s = Math.max(S_MIN, 1.4826 * wMedyan(x.map(v => Math.abs(v - m)), w));
  return { m, s, n: r.length, neff: neff(w) };
}

// ---- input → reels
const saatIst = t => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const sayi = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
function reelleriKur({ gozlem = [], kayit = {}, diziler = [], simdi }) {
  const bolumIdx = new Map();
  for (const d of diziler || []) for (const b of d.bolumler || []) if (b.media_id) bolumIdx.set(String(b.media_id), { dizi: d.id, bolum: b.n, toplam: (d.bolumler || []).length });
  const M = new Map();
  for (const g of gozlem || []) {
    if (!g || g.media_id == null) continue;
    const id = String(g.media_id), k = (kayit || {})[id] || {};
    if (k.tur && k.tur !== 'reel') continue;
    const zaman = Date.parse(g.zaman); if (!Number.isFinite(zaman) || zaman > simdi) continue;
    let x = M.get(id);
    if (!x) {
      const t = Date.parse(k.t || g.yayin);
      const e = bolumIdx.get(id) || (k.dizi ? { dizi: k.dizi, bolum: k.bolum ?? null, toplam: null } : null);
      x = { id, t, obs: [], dizi: e ? e.dizi : null, bolum: e ? e.bolum : null, toplam: e ? e.toplam : null, son: {} };
      M.set(id, x);
    }
    const m = g.metrik || {}, v = sayi(m.views);
    for (const [a, b] of Object.entries(m)) if (sayi(b) != null) x.son[a] = b;   // newest known value of each metric
    if (v == null) continue;
    const yas = Number.isFinite(+g.yas_s) && g.yas_s !== null ? g.yas_s / 3600 : (zaman - x.t) / SAAT;
    if (!(yas >= 0)) continue;
    x.obs.push({ yas, L: Math.log1p(Math.max(0, v)), v, zaman });
  }
  const out = [];
  for (const x of M.values()) {
    if (!Number.isFinite(x.t) || !x.obs.length) continue;
    x.obs.sort((a, b) => a.yas - b.yas);
    const ob = []; for (const o of x.obs) { if (ob.length && Math.abs(ob[ob.length - 1].yas - o.yas) < 1e-9) ob[ob.length - 1] = o; else ob.push(o); }
    x.obs = ob; x.pts = ob.map(o => [o.yas, o.L]); x.yas = ob[ob.length - 1].yas;
    x.G = IZGARA.map(a => logAt(x.pts, a));
    out.push(x);
  }
  return out.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

// ---- baseline of one reel (or of the channel at tc when haric is null) on the grid: [{base, s, n, yedek?}]
function egriKur(reels, tc, haric) {
  const ham = IZGARA.map((_, k) => merkez(reels.filter(j => j !== haric && j.G[k] != null).map(j => ({ x: j.G[k], t: j.t })), tc));
  // pooled average age-to-age difference between neighbouring grid ages (other reels having both)
  const fark = IZGARA.slice(0, -1).map((_, k) => {
    let s = 0, c = 0; for (const j of reels) if (j !== haric && j.G[k] != null && j.G[k + 1] != null) { s += j.G[k + 1] - j.G[k]; c++; }
    return c ? s / c : null;
  });
  const kaydir = (k1, k2) => {   // base(k2) − base(k1) through the pooled differences, null on a missing link
    let s = 0; const [a, b, yon] = k1 < k2 ? [k1, k2, 1] : [k2, k1, -1];
    for (let k = a; k < b; k++) { if (fark[k] == null) return null; s += fark[k]; }
    return yon * s;
  };
  return ham.map((h, k) => {
    if (h) return { base: h.m, s: h.s, n: h.n };
    // fewer than 3 references: the nearest age that has them, shifted
    const sira = IZGARA.map((_, i) => i).filter(i => ham[i]).sort((a, b) => Math.abs(a - k) - Math.abs(b - k) || a - b);
    for (const i of sira) { const d = kaydir(i, k); if (d != null) return { base: ham[i].m + d, s: ham[i].s, n: 0, yedek: IZGARA[i] }; }
    return { base: null, s: null, n: 0 };
  });
}
// base and s at an exact age: linear in ln(age) between grid points, linear from (0, 0) below 1 h; null past 168 h or
// when a neighbour is missing
function egriAt(E, a) {
  if (!(a >= 0) || a > IZGARA[IZGARA.length - 1] + 1e-9) return null;
  if (a <= IZGARA[0]) { const e = E[0]; return e.base == null ? null : { base: e.base * a / IZGARA[0], s: e.s }; }
  let k = 0; while (IZGARA[k + 1] < a - 1e-9) k++;
  const e1 = E[k], e2 = E[k + 1];
  if (e1.base == null || e2.base == null) return null;
  const f = (Math.log(a) - Math.log(IZGARA[k])) / (Math.log(IZGARA[k + 1]) - Math.log(IZGARA[k]));
  return { base: e1.base + (e2.base - e1.base) * f, s: e1.s + (e2.s - e1.s) * f };
}

// ---- velocity over one window ending at observation index e of reel x
function pencere(x, e) {
  const o2 = x.obs[e]; let o1 = null;
  for (let i = e - 1; i >= 0; i--) {
    const d = o2.yas - x.obs[i].yas; if (d > 3 + 1e-9) break;
    if (d >= 0.75 - 1e-9 && (!o1 || Math.abs(d - 2) < Math.abs(o2.yas - o1.yas - 2))) o1 = x.obs[i];
  }
  return o1 ? { o1, o2 } : null;
}
function hiz(p, E, komsu) {
  const { o1, o2 } = p, a1 = o1.yas, a2 = o2.yas, d = o2.L - o1.L;
  const b1 = egriAt(E, a1), b2 = egriAt(E, a2);
  // the same growth over the same ages on the reels nearest in publish time
  const q = komsu
    .map(j => { const l1 = logAt(j.pts, a1), l2 = logAt(j.pts, a2); return l1 == null || l2 == null ? null : l2 - l1; }).filter(v => v != null);
  // past the grid (168 h) the expected growth is the references' median growth
  const beklenen = b1 && b2 ? b2.base - b1.base : q.length >= 3 ? wMedyan(q) : 0;
  let sv;
  if (q.length >= 3) { const dev = q.map(v => v - beklenen), md = wMedyan(dev); sv = Math.max(SVEL_MIN, 1.4826 * wMedyan(dev.map(v => Math.abs(v - md)))); }
  else sv = Math.max(SVEL_MIN, (b2 && b2.s) || S_MIN);   // too few references: the cumulative scale, conservative
  const Z = (d - beklenen) / sv;
  return { Z, a1, a2, taze: o2.v > o1.v };
}

// ---- diagnostics: shrunk z against the channel (median / MAD over reels)
const TANI = {
  izlenme_orani: { f: (x, sure) => { const w = sayi(x.son.ig_reels_avg_watch_time), su = sayi(sure[x.id]); return w != null && su ? w / 1000 / su : null; }, alt: 0.02 },
  atlama: { f: x => sayi(x.son.reels_skip_rate), alt: 1 },
  paylasim: { f: x => { const s = sayi(x.son.shares), r = sayi(x.son.reach); return s != null && r ? s / r : null; }, alt: 1e-4 },
  kaydetme: { f: x => { const s = sayi(x.son.saved), r = sayi(x.son.reach); return s != null && r ? s / r : null; }, alt: 1e-4 },
};
function taniKur(reels, sure) {
  const out = new Map(reels.map(x => [x.id, {}]));
  for (const [ad, { f, alt }] of Object.entries(TANI)) {
    const v = reels.map(x => ({ x, v: f(x, sure || {}) })).filter(o => o.v != null && Number.isFinite(o.v));
    if (v.length < 3) continue;
    const md = wMedyan(v.map(o => o.v)), sc = Math.max(alt, 1.4826 * wMedyan(v.map(o => Math.abs(o.v - md))));
    for (const { x, v: val } of v) {
      const n = sayi(x.son.reach) || 0, ic = (n * val + TANI_M * md) / (n + TANI_M);   // few people reached: pulled to the channel
      out.get(x.id)[ad] = yuvarla((ic - md) / sc, 2);
    }
  }
  return out;
}

// ---- the whole rating
function reyting({ gozlem, kayit, diziler = [], sure = {}, simdi = Date.now() } = {}) {
  simdi = +new Date(simdi);
  const reels = reelleriKur({ gozlem, kayit, diziler, simdi });
  const kanal = egriKur(reels, simdi, null);
  const egri = {}; IZGARA.forEach((a, k) => { const e = kanal[k]; egri[a] = { base: yuvarla(e.base), s: yuvarla(e.s), n: e.n, v: e.base == null ? null : Math.round(Math.expm1(e.base)) }; });
  const tani = taniKur(reels, sure);

  // residual of each reel at its newest observed age (capped at the grid end), else the latest grid age it has
  const R = new Map();
  for (const x of reels) {
    const E = egriKur(reels, x.t, x);
    let a = Math.min(x.yas, IZGARA[IZGARA.length - 1]), b = egriAt(E, a), L = logAt(x.pts, a);
    if (!b || L == null) {
      b = null;
      for (let k = IZGARA.length - 1; k >= 0; k--) if (IZGARA[k] <= x.yas + 1e-9 && x.G[k] != null && E[k].base != null) { a = IZGARA[k]; L = x.G[k]; b = { base: E[k].base, s: E[k].s }; break; }
    }
    const r = b ? L - b.base : null;
    // newest window and the late-viral rule (windows ending in the last 48 h, non-overlapping, fresh)
    let vel = null; const canli = [], son = x.obs.length - 1;
    const komsu = reels.filter(j => j !== x).sort((u, v) => Math.abs(u.t - x.t) - Math.abs(v.t - x.t)).slice(0, MAX_REF);
    for (let e = son; e > 0; e--) {
      const o = x.obs[e];
      if (o.zaman < x.obs[son].zaman - 48 * SAAT || (o.yas <= 72 && e < son)) break;
      if (canli.length && o.zaman > canli[canli.length - 1].bas) continue;
      const p = pencere(x, e); if (!p) continue;
      const h = hiz(p, E, komsu);
      if (e === son) vel = h;   // Zvel: the window ending at the newest observation
      // a stale snapshot (same views as the observation before it) never counts
      if (o.yas > 72 && h.Z >= 2 && h.taze && o.v > x.obs[e - 1].v) canli.push({ Z: h.Z, bas: p.o1.zaman });
    }
    const kN = Math.max(0, IZGARA.findIndex(g => g >= a - 1e-9));
    R.set(x.id, { x, E, a, r, s: b ? b.s : null, n: E[kN].n, vel, canli });
  }

  // nuisance effects, heavily shrunk Σr / (n + 5): posting hour, then episode number (1, 2, …, son). A series is never
  // adjusted by its own reels (they would absorb its effect: a series keeps its hour); the episode effect is the mean of
  // within-series deviations (series with >= 2 measured episodes), so one strong series does not set "episode 1"
  const pay = o => o.x.dizi != null ? 'd:' + o.x.dizi : 'm:' + o.x.id;
  const grup = (liste, anahtar, deger) => {
    const g = new Map();
    for (const o of liste) { const k = anahtar(o); if (k == null) continue; const e = g.get(k) || { s: 0, n: 0, p: new Map() }; const v = deger(o); e.s += v; e.n++;
      const q = e.p.get(pay(o)) || { s: 0, n: 0 }; q.s += v; q.n++; e.p.set(pay(o), q); g.set(k, e); }
    const tam = {}; for (const [k, e] of g) tam[k] = e.s / (e.n + K0);
    const birak = o => { const e = g.get(anahtar(o)); if (!e) return 0; const q = e.p.get(pay(o)) || { s: 0, n: 0 }; return (e.s - q.s) / (e.n - q.n + K0); };
    return { tam, birak };
  };
  const olcu = [...R.values()].filter(o => o.r != null);
  const slotK = o => saatIst(o.x.t), bolumK = o => o.x.bolum == null ? null : o.x.toplam && o.x.bolum === o.x.toplam && o.x.bolum > 1 ? 'son' : String(o.x.bolum);
  const slot = grup(olcu, slotK, o => o.r);
  for (const o of olcu) o.rs = o.r - slot.birak(o);
  const ort = new Map(); for (const o of olcu) if (o.x.dizi != null) { const e = ort.get(o.x.dizi) || { s: 0, n: 0 }; e.s += o.rs; e.n++; ort.set(o.x.dizi, e); }
  const bol = grup(olcu.filter(o => o.x.dizi != null && ort.get(o.x.dizi).n >= 2), bolumK, o => o.rs - ort.get(o.x.dizi).s / ort.get(o.x.dizi).n);
  for (const o of olcu) o.radj = o.rs - (o.x.dizi != null ? bol.birak(o) : 0);
  const slotEtki = slot.tam, bolumEtki = bol.tam;

  const bolumler = {}, canlanan = [];
  for (const o of R.values()) {
    const Z = o.vel ? o.vel.Z : null;
    bolumler[o.x.id] = { dizi: o.x.dizi, bolum: o.x.bolum, yas_h: yuvarla(o.x.yas, 2), a_h: yuvarla(o.a, 2), r: yuvarla(o.r), z: o.r == null ? null : yuvarla(o.r / o.s, 3),
      r_duz: yuvarla(o.radj), Zvel: yuvarla(Z, 3), pZvel: Z == null ? null : yuvarla(Phi(Z), 3), tani: tani.get(o.x.id) || {} };
    if (o.x.yas > 72 && o.canli.length >= 2) canlanan.push({ media_id: o.x.id, dizi: o.x.dizi, Zvel: yuvarla(o.canli[0].Z, 3) });
  }

  // series effect: posterior mean/sd with prior N(0, ·), the channel's typical new story
  const sHepsi = [...R.values()].filter(o => o.s != null).map(o => o.s), sKanal = sHepsi.length ? wMedyan(sHepsi) : 1;
  const ds = {};
  for (const d of diziler || []) {
    const ep = [...R.values()].filter(o => o.x.dizi === d.id && o.radj != null);
    let sw = 0, swr = 0, sws = 0, nRef = 0;
    for (const o of ep) { const w = Math.log2(1 + o.a); sw += w; swr += w * o.radj; sws += w * o.s; nRef = Math.max(nRef, o.n); }
    const sPool = sw ? sws / sw : sKanal, mu = swr / (sw + K0), sd = sPool / Math.sqrt(sw + K0);
    const yayin = (d.bolumler || []).filter(b => b.paylasildi).sort((a, b) => Date.parse(b.paylasildi) - Date.parse(a.paylasildi));
    const sonEp = ep.slice().sort((a, b) => (b.x.bolum || 0) - (a.x.bolum || 0) || b.x.t - a.x.t)[0];
    const tn = {}; for (const k of Object.keys(TANI)) { const v = ep.map(o => (tani.get(o.x.id) || {})[k]).filter(z => z != null); if (v.length) tn[k] = yuvarla(v.reduce((s, z) => s + z, 0) / v.length, 2); }
    ds[d.id] = { mu: yuvarla(mu), sd: yuvarla(sd), R: yuvarla(100 * Phi(mu / sd), 1), n_bolum: ep.length, n_ref: nRef, trend: false,
      son_paylasim: yayin.length ? yayin[0].paylasildi : null, pZvel: sonEp && bolumler[sonEp.x.id].pZvel != null ? bolumler[sonEp.x.id].pZvel : null, P_best: null, tani: tn,
      _mu: mu, _sd: sd };
  }
  // P_best among the running series: share of 2000 seeded draws from N(mu, sd) where the series is the highest
  const aktif = (diziler || []).filter(d => d.durum === 'aktif' && d.stok !== true && ds[d.id]).map(d => d.id).sort();
  if (aktif.length) {
    const g = rng(MC_TOHUM), kaz = Object.fromEntries(aktif.map(id => [id, 0]));
    for (let c = 0; c < MC_CEKILIS; c++) {
      let en = null, ev = -Infinity;
      for (const id of aktif) { const v = ds[id]._mu + ds[id]._sd * g.n(); if (v > ev) { ev = v; en = id; } }
      kaz[en]++;
    }
    for (const id of aktif) ds[id].P_best = yuvarla(kaz[id] / MC_CEKILIS, 4);
    const enIyi = aktif.slice().sort((a, b) => ds[b].P_best - ds[a].P_best || a.localeCompare(b))[0];
    if (ds[enIyi].pZvel != null && ds[enIyi].pZvel >= 0.8) ds[enIyi].trend = true;
  }
  for (const v of Object.values(ds)) { delete v._mu; delete v._sd; }

  const nOlgun = reels.filter(x => x.yas >= OLGUN_SAAT).length;
  return { zaman: new Date(simdi).toISOString(), gecici: nOlgun < OLGUN_EN_AZ, n_olgun: nOlgun, n_reel: reels.length, egri,
    etkiler: { slot: Object.fromEntries(Object.entries(slotEtki).map(([k, v]) => [k, yuvarla(v)])), bolum: Object.fromEntries(Object.entries(bolumEtki).map(([k, v]) => [k, yuvarla(v)])) },
    bolumler, diziler: ds, canlanan };
}

module.exports = { reyting, logAt, merkez, egriKur, egriAt, reelleriKur, Phi, wMedyan, rng, IZGARA, kadansH };
