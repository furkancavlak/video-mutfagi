// Offline tests for the series store and the continue/cut decision (pure, no network).
//   node --test "dizi/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { kararVer, elleKarar, yukle, kaydet } = require('../dizi');

const AYAR = { bekle_saat: 20, esik_oran: 0.6, ilk_dizi_sayisi: 6, yorum_min: 3 };
const T0 = Date.parse('2026-10-30T10:00:00Z');
const saatSonra = h => new Date(T0 + h * 3600e3);
const bolum = (n, views, ekstra = {}) => ({ n, metin: 'x', durum: 'olculdu', paylasildi: new Date(T0).toISOString(), metrik: { views, reach: null, likes: null, comments: null, shares: null, saved: null }, ...ekstra });
const dizi = (id, durum, views) => ({ id, kanal: 'k', baslik: id, durum, bolumler: views.map((v, i) => bolum(i + 1, v)) });
// six finished stories; ep1 = 2000, ep2 = 1100 (retention 0.55), ep3 = 600
const gecmis = () => Array.from({ length: 6 }, (_, i) => dizi('g' + i, i % 2 ? 'bitti' : 'kesildi', [2000, 1100, 600]));

test('posted 10 h ago waits for the 20 h mark', () => {
  const d = dizi('a', 'aktif', [1000]);
  const r = kararVer(d, 1, gecmis(), AYAR, saatSonra(10));
  assert.strictEqual(r.karar, 'bekle');
  assert.match(r.neden, /20 saat/);
});

test('missing views at 25 h waits, never cuts', () => {
  const d = dizi('a', 'aktif', [null]);
  assert.strictEqual(kararVer(d, 1, gecmis(), AYAR, saatSonra(25)).karar, 'bekle');
});

test('fewer than 6 finished stories never cuts', () => {
  const d = dizi('a', 'aktif', [200]);
  const r = kararVer(d, 1, gecmis().slice(0, 5), AYAR, saatSonra(25));
  assert.strictEqual(r.karar, 'devam');
});

test('episode 1 below 0.6 x past ep-1 average is cut', () => {
  const d = dizi('a', 'aktif', [1000]);
  assert.strictEqual(kararVer(d, 1, gecmis(), AYAR, saatSonra(25)).karar, 'kes');
});

test('episode 2 retention 0.30 vs past 0.55 is cut', () => {
  const d = dizi('a', 'aktif', [1000, 300]);
  assert.strictEqual(kararVer(d, 2, gecmis(), AYAR, saatSonra(25)).karar, 'kes');
});

test('comment override keeps the story going', () => {
  const d = dizi('a', 'aktif', [1000, 300]);
  d.bolumler[1].yorum_devam = 3;
  const r = kararVer(d, 2, gecmis(), AYAR, saatSonra(25));
  assert.strictEqual(r.karar, 'devam');
  assert.match(r.neden, /yorum/);
});

test('manual decision is returned unchanged and elleKarar sets it', () => {
  const d = dizi('a', 'aktif', [1000, 300]);
  elleKarar(d, 2, 'devam', 'Furkan istedi');
  assert.strictEqual(d.bolumler[1].elle, true);
  const r = kararVer(d, 2, gecmis(), AYAR, saatSonra(25));
  assert.deepStrictEqual(r, { karar: 'devam', neden: 'Furkan istedi' });
});

test('yukle/kaydet round-trip, empty store when missing', () => {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'dizi-'));
  assert.deepStrictEqual(yukle(kok, 'k'), { diziler: [] });
  kaydet(kok, 'k', { diziler: [dizi('a', 'aktif', [1])] });
  assert.strictEqual(yukle(kok, 'k').diziler[0].id, 'a');
  assert.ok(fs.existsSync(path.join(kok, 'kayit', 'dizi', 'k', 'diziler.json')));
});
