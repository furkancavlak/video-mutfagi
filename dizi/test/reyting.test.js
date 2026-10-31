// Offline tests for the series rating (dizi/reyting.js): pure, synthetic observation rows, no files.
//   node --test "dizi/test/*.test.js"
const test = require('node:test'), assert = require('node:assert');
const Y = require('../reyting');

const SAAT = 3600e3, GUN = 24 * SAAT;
const SIMDI = Date.parse('2026-11-20T12:00:00Z');
// deterministic noise for the synthetic channel
const G = Y.rng(7);
// views of a reel with final size V at age a (h): saturating curve
const egri = (V, a) => Math.round(V * (1 - Math.exp(-a / 14)));
// observation ages by the real cadence (10 min < 6 h, hourly < 72 h, 6 h < 14 d, daily after), up to `kadar` hours
function yaslar(kadar) {
  const out = [];
  for (let a = 1 / 6; a <= kadar + 1e-9;) { out.push(+a.toFixed(4)); a += a < 6 ? 1 / 6 : a < 72 ? 1 : a < 336 ? 6 : 24; }
  return out;
}
// rows of one reel published at t with views fn(age)
function satirlar(id, t, fn, kadar = (SIMDI - t) / SAAT, ages = yaslar(kadar)) {
  return ages.filter(a => t + a * SAAT <= SIMDI).map(a => ({ v: 2, zaman: new Date(t + a * SAAT).toISOString(), media_id: id, yayin: new Date(t).toISOString(), yas_s: Math.round(a * 3600), metrik: { views: fn(a), reach: Math.round(fn(a) * 0.8) } }));
}
// a channel: n reels/day for `gun` days ending ~1 day before SIMDI, final views = V0 × growth^(day/gun) × noise
function kanal({ gun = 21, gunluk = 4, V0 = 1000, buyume = 1, gurultu = 0.5 } = {}) {
  const rows = [], kayit = {};
  for (let i = 0; i < gun * gunluk; i++) {
    const t = SIMDI - (gun + 1) * GUN + i * GUN / gunluk, gunNo = i / gunluk;
    const V = V0 * Math.pow(buyume, gunNo / gun) * Math.exp(gurultu * G.n());
    const id = 'k' + i; kayit[id] = { t: new Date(t).toISOString(), tur: 'reel' };
    rows.push(...satirlar(id, t, a => egri(V, a)));
  }
  return { rows, kayit };
}
const dizi = (id, mids, ek = {}) => ({ id, durum: 'aktif', bolumler: mids.map((m, i) => ({ n: i + 1, media_id: m, paylasildi: new Date(SIMDI - (mids.length - i) * 30 * SAAT).toISOString() })), ...ek });

test('logAt: linear in log1p space between observations, exact at points', () => {
  const pts = [[30, Math.log1p(100)], [31, Math.log1p(10000)]];
  assert.strictEqual(Y.logAt(pts, 30), Math.log1p(100));
  assert.ok(Math.abs(Y.logAt(pts, 30.5) - (Math.log1p(100) + Math.log1p(10000)) / 2) < 1e-12);   // geometric mean of views
  assert.strictEqual(Y.logAt(pts, 31.5), null);                      // never past the newest observation
  assert.ok(Math.abs(Y.logAt([[1 / 6, Math.log1p(60)]], 1 / 12) - Math.log1p(60) / 2) < 1e-12);   // from 0 views at publish
});

test('logAt: a gap longer than 3x the band cadence gives null', () => {
  // under 6 h the cadence is 10 min: a 40 min gap is too long, a 25 min one is fine
  assert.strictEqual(Y.logAt([[1, 1], [1 + 40 / 60, 2]], 1.3), null);
  assert.ok(Y.logAt([[1, 1], [1 + 25 / 60, 2]], 1.2) != null);
  // 24-72 h band is hourly: 2.5 h ok, 4 h not
  assert.ok(Y.logAt([[24, 5], [26.5, 6]], 25) != null);
  assert.strictEqual(Y.logAt([[24, 5], [28, 6]], 26), null);
});

test('fallback: an age with < 3 references uses the nearest age with >= 3, shifted by the pooled difference', () => {
  const r = (id, t, g) => ({ id, t, G: g });
  // 4 references at 1..24 h, only 2 reach 48 h
  const a = [3, 3.5, 4, 4.5], reels = a.map((v, i) => r('x' + i, i * GUN, Y.IZGARA.map((g, k) => k <= 5 ? v + k * 0.1 : k === 6 && i < 2 ? v + 0.5 + 0.3 : null)));
  const E = Y.egriKur(reels, 4 * GUN, null);
  assert.ok(E[5].base != null && E[5].n === 4);
  assert.strictEqual(E[6].yedek, 24);
  assert.ok(Math.abs(E[6].base - (E[5].base + 0.3)) < 1e-9);          // pooled 24->48 difference is 0.3
  assert.strictEqual(E[8].base, null);                                // nothing links to 168 h
});

test('baseline tracks growth: on a channel growing 10x in 3 weeks a typical new reel stays near R 50', () => {
  const { rows, kayit } = kanal({ buyume: 10, gurultu: 0.4 });
  const t = SIMDI - 2 * GUN, V = 1000 * Math.pow(10, 20 / 21);   // on the trend line at its publish day (day 20 of 21)
  rows.push(...satirlar('yeni', t, a => egri(V, a))); kayit.yeni = { t: new Date(t).toISOString() };
  rows.push(...satirlar('cok', t + 1, a => egri(V * 8, a))); kayit.cok = { t: new Date(t + 1).toISOString() };
  const out = Y.reyting({ gozlem: rows, kayit, diziler: [dizi('tipik', ['yeni']), dizi('guclu', ['cok'])], simdi: SIMDI });
  assert.strictEqual(out.gecici, false);
  const R = out.diziler.tipik.R;
  assert.ok(R > 30 && R < 70, `typical new reel R=${R}`);
  assert.ok(out.diziler.guclu.R > 90, `8x reel R=${out.diziler.guclu.R}`);
  // the channel curve itself has moved with the growth: today's 48 h baseline is well above the start of the period
  assert.ok(out.egri[48].v > 5000, `egri 48h ${out.egri[48].v}`);
});

test('shrinkage: one good episode moves the rating less than four', () => {
  const { rows, kayit } = kanal({ gurultu: 0.3 });
  const ids = [];
  for (let i = 0; i < 4; i++) { const id = 'g' + i, t = SIMDI - (4 - i) * 26 * SAAT; ids.push(id); kayit[id] = { t: new Date(t).toISOString() }; rows.push(...satirlar(id, t, a => egri(1000 * Math.exp(0.25), a))); }
  const t1 = SIMDI - 4 * 26 * SAAT + 60e3; kayit.h0 = { t: new Date(t1).toISOString() }; rows.push(...satirlar('h0', t1, a => egri(1000 * Math.exp(0.25), a)));
  const out = Y.reyting({ gozlem: rows, kayit, diziler: [dizi('bir', ['h0']), dizi('dort', ids)], simdi: SIMDI });
  const b = out.diziler.bir, d = out.diziler.dort;
  assert.strictEqual(b.n_bolum, 1); assert.strictEqual(d.n_bolum, 4);
  assert.ok(b.mu > 0 && d.mu > b.mu, `mu ${b.mu} vs ${d.mu}`);
  assert.ok(d.sd < b.sd);
  assert.ok(d.R > b.R && b.R > 50);
  // the raw residual is ~0.25 log units; the single episode is shrunk well below it
  assert.ok(b.mu < 0.75 * out.bolumler.h0.r);
});

test('velocity: a reel growing much faster than the channel in its last 2 h has a high Zvel', () => {
  const { rows, kayit } = kanal({ gurultu: 0.3 });
  const t = SIMDI - 30 * SAAT;
  rows.push(...satirlar('hizli', t, a => a <= 28 ? egri(1000, a) : Math.round(egri(1000, 28) * (1 + 0.5 * (a - 28) / 2)))); kayit.hizli = { t: new Date(t).toISOString() };
  rows.push(...satirlar('normal', t + 60e3, a => egri(1000, a))); kayit.normal = { t: new Date(t + 60e3).toISOString() };
  const out = Y.reyting({ gozlem: rows, kayit, diziler: [], simdi: SIMDI });
  const h = out.bolumler.hizli, n = out.bolumler.normal;
  assert.ok(h.Zvel > 2 && h.pZvel > 0.97, `hizli Zvel ${h.Zvel}`);
  assert.ok(Math.abs(n.Zvel) < 1.5, `normal Zvel ${n.Zvel}`);
  // the window needs at least 45 min: a 30 min old reel has none
  rows.push(...satirlar('taze', SIMDI - 0.5 * SAAT, a => egri(1000, a))); kayit.taze = { t: new Date(SIMDI - 0.5 * SAAT).toISOString() };
  assert.strictEqual(Y.reyting({ gozlem: rows, kayit, simdi: SIMDI }).bolumler.taze.Zvel, null);
});

test('late viral: an old reel growing again in two separate windows is canlanan; stale snapshots do not count', () => {
  const { rows, kayit } = kanal({ gurultu: 0.3 });
  const t = SIMDI - 6 * GUN, V = 1000, duz = egri(V, 120);
  // flat for days, then hourly observations in the last 8 h with strong growth
  const eskiYas = yaslar(138).filter(a => a < 138 - 8), sonYas = Array.from({ length: 9 }, (_, i) => 138 - 8 + i);
  const fn = a => a <= 130 ? egri(V, Math.min(a, 120)) : Math.round(duz * Math.pow(1.6, a - 130));
  rows.push(...satirlar('canli', t, fn, 138, [...eskiYas, ...sonYas])); kayit.canli = { t: new Date(t).toISOString(), dizi: 'eski' };
  // one jump, then the same snapshot repeated hourly (no views change)
  const fn2 = a => a <= 134 ? egri(V, Math.min(a, 120)) : Math.round(duz * 5);
  rows.push(...satirlar('bayat', t + 60e3, fn2, 138, [...eskiYas, ...sonYas])); kayit.bayat = { t: new Date(t + 60e3).toISOString() };
  const out = Y.reyting({ gozlem: rows, kayit, diziler: [], simdi: SIMDI });
  const ids = out.canlanan.map(c => c.media_id);
  assert.deepStrictEqual(ids, ['canli']);
  assert.strictEqual(out.canlanan[0].dizi, 'eski');
  assert.ok(out.canlanan[0].Zvel >= 2);
});

test('determinism: the same input gives the same output, P_best included', () => {
  const { rows, kayit } = kanal({ gun: 10, gurultu: 0.5 });
  const ds = [dizi('a', ['k30', 'k31']), dizi('b', ['k32']), dizi('c', ['k33', 'k34', 'k35'])];
  const a = Y.reyting({ gozlem: rows, kayit, diziler: ds, simdi: SIMDI }), b = Y.reyting({ gozlem: rows, kayit, diziler: ds, simdi: SIMDI });
  assert.deepStrictEqual(a, b);
  const p = ['a', 'b', 'c'].map(k => a.diziler[k].P_best);
  assert.ok(Math.abs(p.reduce((s, v) => s + v, 0) - 1) < 1e-9);
  assert.strictEqual(['a', 'b', 'c'].filter(k => a.diziler[k].trend).length <= 1, true);
});

test('small data: 3 reels never throw, everything is provisional and series sit at the prior', () => {
  const rows = [], kayit = {};
  for (let i = 0; i < 3; i++) { const t = SIMDI - (30 - i) * SAAT; kayit['s' + i] = { t: new Date(t).toISOString() }; rows.push(...satirlar('s' + i, t, a => egri(500 * (i + 1), a))); }
  const out = Y.reyting({ gozlem: rows, kayit, diziler: [dizi('d', ['s0', 's1']), dizi('bos', [])], simdi: SIMDI });
  assert.strictEqual(out.gecici, true); assert.strictEqual(out.n_olgun, 3);
  assert.strictEqual(out.diziler.d.R, 50); assert.strictEqual(out.diziler.bos.R, 50);
  assert.strictEqual(out.bolumler.s0.r, null);                        // only 2 references for each reel
  assert.ok(out.egri[24].base != null);                               // the channel curve (all 3) exists
  // a 4th reel gives every reel 3 references: residuals appear
  kayit.s3 = { t: new Date(SIMDI - 27 * SAAT).toISOString() }; rows.push(...satirlar('s3', SIMDI - 27 * SAAT, a => egri(800, a)));
  const o4 = Y.reyting({ gozlem: rows, kayit, diziler: [dizi('d', ['s0', 's1'])], simdi: SIMDI });
  assert.ok(o4.bolumler.s0.r != null && o4.diziler.d.n_bolum === 2);
  // nothing at all
  const bos = Y.reyting({ gozlem: [], kayit: {}, diziler: [dizi('x', [])], simdi: SIMDI });
  assert.strictEqual(bos.diziler.x.R, 50); assert.deepStrictEqual(bos.canlanan, []);
});

test('diagnostics are reported but never change R', () => {
  const { rows, kayit } = kanal({ gun: 8, gurultu: 0.3 });
  const ds = [dizi('a', ['k20', 'k21'])];
  const a = Y.reyting({ gozlem: rows, kayit, diziler: ds, simdi: SIMDI });
  for (const r of rows) if (r.media_id === 'k20') Object.assign(r.metrik, { shares: 500, saved: 300, reels_skip_rate: 10, ig_reels_avg_watch_time: 9000 });
  const b = Y.reyting({ gozlem: rows, kayit, diziler: ds, sure: { k20: 10 }, simdi: SIMDI });
  assert.strictEqual(a.diziler.a.R, b.diziler.a.R);
  assert.ok(b.bolumler.k20.tani.paylasim === undefined || typeof b.bolumler.k20.tani.paylasim === 'number');
});
