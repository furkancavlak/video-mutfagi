// Offline tests for the series scheduler run (fakes, temp root).
//   node --test "dizi/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { calistir } = require('../calistir');
const { yukle, kaydet } = require('../dizi');

const SIMDI = new Date('2026-10-30T12:00:00Z');
const saatOnce = h => new Date(SIMDI.getTime() - h * 3600e3).toISOString();
const AYAR = { gunluk_hedef: 3, onay_donemi: false, onay_gunluk: 2, bekle_saat: 20, esik_oran: 0.6, ilk_dizi_sayisi: 6, yorum_min: 3, yorum_kelimeleri: ['devam'] };
const ctx = (dizi = {}) => ({ kanal: 'k', kimlik: { hesap: 'dur' }, ayar: { dizi: { ...AYAR, ...dizi } } });

function kok() {
  const k = fs.mkdtempSync(path.join(os.tmpdir(), 'dizi-cal-'));
  for (const d of ['bekleyen', 'paylasilan', 'hatali', 'iptal']) fs.mkdirSync(path.join(k, 'kuyruk', d), { recursive: true });
  return k;
}
const is = (k, dir, ad, o) => fs.writeFileSync(path.join(k, 'kuyruk', dir, ad + '.json'), JSON.stringify(o));
const bolum = (n, ekstra = {}) => ({ n, metin: 'x', durum: 'metin', ...ekstra });
const gecmis = () => Array.from({ length: 7 }, (_, i) => ({ id: 'g' + i, kanal: 'k', durum: i % 2 ? 'bitti' : 'kesildi', bolumler: [bolum(1, { durum: 'olculdu', metrik: { views: 3000 } })] }));
const fakeUret = () => { const c = []; const f = async (cx, d, n) => { c.push(`${d.id}:${n}`); return { durum: 'sirada' }; }; f.calls = c; return f; };

test('21 h old episode far below past average is cut', async () => {
  const k = kok();
  kaydet(k, 'k', { diziler: [...gecmis(), { id: 'a', kanal: 'k', durum: 'aktif', bolumler: [bolum(1, { durum: 'sirada', video: 'v-a' }), bolum(2), bolum(3)] }] });
  is(k, 'paylasilan', 'j1', { video: 'v-a', paylasildi: saatOnce(21), media_id: 'M1', link: 'L', hesap: 'dur' });
  const uret = fakeUret();
  const r = await calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, sonucAl: async () => ({ metrik: { views: 900 }, yorum_devam: 0 }), uretBolum: uret, yeniDizi: async () => null });
  assert.deepStrictEqual(r.kararlar, [{ id: 'a', n: 1, karar: 'kes' }]);
  assert.strictEqual(r.olculen, 1);
  const a = yukle(k, 'k').diziler.find(d => d.id === 'a');
  assert.strictEqual(a.durum, 'kesildi');
  assert.strictEqual(a.bolumler[0].media_id, 'M1');
  assert.deepStrictEqual(a.bolumler.map(b => b.durum), ['olculdu', 'atlandi', 'atlandi']);
  assert.deepStrictEqual(uret.calls, []);
});

test('hatali job with kontrol_et flags the episode and skips the series', async () => {
  const k = kok();
  kaydet(k, 'k', { diziler: [{ id: 'a', kanal: 'k', durum: 'aktif', bolumler: [bolum(1, { durum: 'sirada', video: 'v-a' }), bolum(2)] }, { id: 'b', kanal: 'k', durum: 'aktif', bolumler: [bolum(1)] }] });
  is(k, 'hatali', 'j1', { video: 'v-a', kontrol_et: true, son_hata: 'belirsiz', hesap: 'dur' });
  const uret = fakeUret();
  await calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, sonucAl: async () => ({}), uretBolum: uret, yeniDizi: async () => null });
  const a = yukle(k, 'k').diziler.find(d => d.id === 'a');
  assert.strictEqual(a.bolumler[0].durum, 'kontrol_et');
  assert.deepStrictEqual(uret.calls, ['b:1']);   // series a never produced
});

test('approval period: yeniDizi called exactly onay_gunluk times', async () => {
  const k = kok();
  let n = 0;
  const yeniDizi = async () => { n++; return { id: 'y' + n, kanal: 'k', durum: 'aktif', bolumler: [bolum(1), bolum(2), bolum(3)] }; };
  const uret = fakeUret();
  const r = await calistir(ctx({ onay_donemi: true, onay_gunluk: 2 }), { simdi: SIMDI, kok: k, sonucAl: async () => ({}), uretBolum: uret, yeniDizi });
  assert.strictEqual(n, 2);
  assert.strictEqual(r.yeniler, 2);
  assert.deepStrictEqual(uret.calls, ['y1:1', 'y2:1']);
});

test('jobs posted today count toward the target; at most 3 active series', async () => {
  const k = kok();
  is(k, 'paylasilan', 'j1', { video: 'x', paylasildi: saatOnce(1), hesap: 'dur' });
  is(k, 'paylasilan', 'j2', { video: 'y', paylasildi: saatOnce(2), hesap: 'oxygbio' });   // other account ignored
  let n = 0;
  const yeniDizi = async () => { n++; return { id: 'y' + n, kanal: 'k', durum: 'aktif', bolumler: [bolum(1)] }; };
  await calistir(ctx({ gunluk_hedef: 10 }), { simdi: SIMDI, kok: k, uretBolum: fakeUret(), yeniDizi });
  assert.strictEqual(n, 3);
});

test('a second concurrent run reports kilit and does nothing', async () => {
  const k = kok();
  let ac; const kapi = new Promise(r => ac = r);
  kaydet(k, 'k', { diziler: [{ id: 'a', kanal: 'k', durum: 'aktif', bolumler: [bolum(1, { durum: 'yayinda', video: 'v', paylasildi: saatOnce(25), media_id: 'M' })] }] });
  const ilk = calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, sonucAl: async () => { await kapi; return { metrik: { views: 10 } }; }, uretBolum: fakeUret(), yeniDizi: async () => null });
  const uret = fakeUret();
  const ikinci = await calistir(ctx({ gunluk_hedef: 3 }), { simdi: SIMDI, kok: k, sonucAl: async () => ({}), uretBolum: uret, yeniDizi: async () => { throw new Error('should not run'); } });
  assert.ok(ikinci.notlar.some(x => x.includes('kilit')));
  assert.strictEqual(ikinci.olculen, 0);
  ac(); await ilk;
  assert.ok(!fs.existsSync(path.join(k, 'kayit', 'dizi', 'k', '.kilit')));
});

test('episode waiting more than 72 h past the mark escalates to kontrol_et', async () => {
  const k = kok();
  kaydet(k, 'k', { diziler: [{ id: 'a', kanal: 'k', durum: 'aktif', bolumler: [bolum(1, { durum: 'yayinda', video: 'v', paylasildi: saatOnce(100), media_id: 'M' })] }] });
  await calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, sonucAl: async () => ({ metrik: { views: null } }), uretBolum: fakeUret(), yeniDizi: async () => null });
  assert.strictEqual(yukle(k, 'k').diziler[0].bolumler[0].durum, 'kontrol_et');
});

test('devam on episode 1 makes episode 2 due; kuru writes nothing', async () => {
  const k = kok();
  const veri = { diziler: [{ id: 'a', kanal: 'k', durum: 'aktif', bolumler: [bolum(1, { durum: 'yayinda', video: 'v', paylasildi: saatOnce(25), media_id: 'M' }), bolum(2), bolum(3)] }] };
  kaydet(k, 'k', veri);
  const ayni = JSON.stringify(yukle(k, 'k'));
  let cagri = 0;
  const kuru = await calistir(ctx({ gunluk_hedef: 1 }), { simdi: SIMDI, kok: k, kuru: true, sonucAl: async () => { cagri++; return {}; }, uretBolum: fakeUret(), yeniDizi: async () => { cagri++; } });
  assert.strictEqual(cagri, 0);
  assert.strictEqual(JSON.stringify(yukle(k, 'k')), ayni);
  assert.strictEqual(kuru.olculen, 1);
  const uret = fakeUret();
  const r = await calistir(ctx({ gunluk_hedef: 1 }), { simdi: SIMDI, kok: k, sonucAl: async () => ({ metrik: { views: 500 } }), uretBolum: uret, yeniDizi: async () => null });
  assert.deepStrictEqual(r.kararlar, [{ id: 'a', n: 1, karar: 'devam' }]);
  assert.deepStrictEqual(uret.calls, ['a:2']);
});
