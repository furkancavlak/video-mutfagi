// Offline tests for the series scheduler run (fakes, temp root).
//   node --test "dizi/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { calistir, sonucAlYap } = require('../calistir');
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

test('repeat run after production does not create more series', async () => {
  const k = kok();
  let n = 0;
  const yeniDizi = async () => { n++; return { id: 'y' + n, kanal: 'k', durum: 'aktif', bolumler: [bolum(1), bolum(2), bolum(3)] }; };
  const uret = async (cx, d, i) => ({ durum: 'onay-bekliyor', dir: 'videolar/' + d.id });
  const opt = { simdi: SIMDI, kok: k, uretBolum: uret, yeniDizi };
  await calistir(ctx({ onay_donemi: true, onay_gunluk: 2 }), opt);
  assert.strictEqual(n, 2);
  const r = await calistir(ctx({ onay_donemi: true, onay_gunluk: 2 }), opt);
  assert.strictEqual(n, 2);
  assert.strictEqual(r.yeniler, 0);
  assert.deepStrictEqual(r.uretilecek, []);
  assert.strictEqual(yukle(k, 'k').diziler[0].bolumler[0].video, 'videolar/y1');
});

test('stalled uretimde episode: durum written back, budget wait keeps uretimde', async () => {
  const k = kok();
  kaydet(k, 'k', { diziler: [{ id: 'a', kanal: 'k', durum: 'aktif', bolumler: [bolum(1, { durum: 'uretimde' })] }] });
  await calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, uretBolum: async () => ({ durum: 'sirada', mp4: 'a.mp4' }), yeniDizi: async () => null });
  const b = yukle(k, 'k').diziler[0].bolumler[0];
  assert.strictEqual(b.durum, 'sirada');
  assert.strictEqual(b.video, 'a.mp4');
});

test('queue job without any date does not crash the run', async () => {
  const k = kok();
  is(k, 'bekleyen', 'j1', { video: null, hesap: 'dur' });
  await calistir(ctx({ gunluk_hedef: 1 }), { simdi: SIMDI, kok: k, uretBolum: fakeUret(), yeniDizi: async () => null });
});

test('default sonucAl counts continue-keyword comments (tr lowercase)', async () => {
  const yorumlar = ['Devamı ne zaman?', 'harika', '2. BÖLÜM lütfen'];
  const P = (ayar) => ({ sonuc: async () => ({ views: 5 }), readAyar: () => ayar, graph: async () => ({ data: yorumlar.map(text => ({ text })) }) });
  const kel = ['devam', 'bölüm'];
  assert.deepStrictEqual(await sonucAlYap(P({ token: 't' }))('M', 'h', kel), { metrik: { views: 5 }, yorum_devam: 2 });
  assert.strictEqual((await sonucAlYap(P({ token: 't' }))('M', 'h', [])).yorum_devam, 0);
  assert.strictEqual((await sonucAlYap(P(null))('M', 'h', kel)).yorum_devam, 0);
});

test('non-kuru run persists son-kosu.json; kuru does not', async () => {
  const k = kok();
  kaydet(k, 'k', { diziler: [{ id: 'a', kanal: 'k', durum: 'aktif', bolumler: [bolum(1)] }] });
  const f = path.join(k, 'kayit', 'dizi', 'k', 'son-kosu.json');
  await calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, kuru: true, uretBolum: fakeUret(), yeniDizi: async () => null });
  assert.ok(!fs.existsSync(f));
  await calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, sonucAl: async () => ({}), uretBolum: fakeUret(), yeniDizi: async () => null });
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.strictEqual(s.zaman, SIMDI.toISOString());
  assert.deepStrictEqual(s.uretilecek, [{ id: 'a', n: 1 }]);
  assert.ok(Array.isArray(s.notlar) && Array.isArray(s.kararlar));
});

test('budget stop sets bolum.bekleme=butce, shown in the run notes; it clears once production proceeds', async () => {
  const k = kok();
  kaydet(k, 'k', { diziler: [{ id: 'a', kanal: 'k', durum: 'aktif', bolumler: [bolum(1)] }] });
  const butce = async () => ({ durum: 'butce-bekliyor', neden: 'limit' });
  await calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, uretBolum: butce, yeniDizi: async () => null });
  let b = yukle(k, 'k').diziler[0].bolumler[0];
  assert.strictEqual(b.durum, 'uretimde'); assert.strictEqual(b.bekleme, 'butce');
  const s = JSON.parse(fs.readFileSync(path.join(k, 'kayit', 'dizi', 'k', 'son-kosu.json'), 'utf8'));
  assert.ok(s.notlar.some(n => /bütçe bekliyor/.test(n)));
  await calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, uretBolum: fakeUret(), yeniDizi: async () => null });
  b = yukle(k, 'k').diziler[0].bolumler[0];
  assert.strictEqual(b.durum, 'sirada'); assert.ok(!('bekleme' in b));
});

test('account names are normalised when matching queue jobs (@Foo == foo)', async () => {
  const k = kok();
  kaydet(k, 'k', { diziler: [] });
  is(k, 'bekleyen', 'j1', { video: 'v-x', ne_zaman: SIMDI.toISOString(), hesap: 'foo' });
  const c = { kanal: 'k', kimlik: { hesap: ' @Foo ' }, ayar: { dizi: { ...AYAR, gunluk_hedef: 1 } } };
  const r = await calistir(c, { simdi: SIMDI, kok: k, kuru: true });
  assert.strictEqual(r.yeniler, 0, 'the job already fills the daily target');
});

test('elle devam never skips the measurement: ep1 gets its metric and ep2 is decided normally', async () => {
  const k = kok();
  kaydet(k, 'k', { diziler: [...gecmis(), { id: 'a', kanal: 'k', durum: 'aktif', bolumler: [
    bolum(1, { durum: 'yayinda', video: 'v-a1', paylasildi: saatOnce(28), media_id: 'M1', elle: true, karar: 'devam', karar_neden: 'elle' }),
    bolum(2, { durum: 'yayinda', video: 'v-a2', paylasildi: saatOnce(21), media_id: 'M2' }), bolum(3)] }] });
  const gelen = [];
  const r = await calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, sonucAl: async id => { gelen.push(id); return { metrik: { views: id === 'M1' ? 3000 : 2500 }, yorum_devam: 0 }; }, uretBolum: fakeUret(), yeniDizi: async () => null });
  assert.deepStrictEqual(gelen, ['M1', 'M2']);
  const a = yukle(k, 'k').diziler.find(d => d.id === 'a');
  assert.deepStrictEqual(a.bolumler.map(b => b.durum), ['olculdu', 'olculdu', 'sirada']);   // ep3 is produced right after
  assert.strictEqual(a.bolumler[0].metrik.views, 3000);
  assert.strictEqual(a.bolumler[0].elle, true);
  assert.strictEqual(a.bolumler[1].karar, 'devam');
  assert.ok(!/izlenmesi yok|bekle/.test(a.bolumler[1].karar_neden), a.bolumler[1].karar_neden);
  assert.deepStrictEqual(r.kararlar.map(x => x.n), [1, 2]);
});

test('elle episode inside the wait window is not measured yet', async () => {
  const k = kok();
  kaydet(k, 'k', { diziler: [{ id: 'a', kanal: 'k', durum: 'aktif', bolumler: [bolum(1, { durum: 'yayinda', video: 'v', paylasildi: saatOnce(5), media_id: 'M1', elle: true, karar: 'devam' })] }] });
  let cagri = 0;
  await calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, sonucAl: async () => { cagri++; return {}; }, uretBolum: fakeUret(), yeniDizi: async () => null });
  assert.strictEqual(cagri, 0);
});

test('son-kosu.json is also written when the run throws or the lock refuses it', async () => {
  const k = kok(), f = path.join(k, 'kayit', 'dizi', 'k', 'son-kosu.json');
  fs.mkdirSync(path.join(k, 'kayit', 'dizi', 'k'), { recursive: true });
  fs.writeFileSync(path.join(k, 'kayit', 'dizi', 'k', 'diziler.json'), '{ bozuk');
  await assert.rejects(() => calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, uretBolum: fakeUret(), yeniDizi: async () => null }));
  assert.ok(JSON.parse(fs.readFileSync(f, 'utf8')).notlar.some(n => /çalışma hatası/.test(n)));
  assert.ok(!fs.existsSync(path.join(k, 'kayit', 'dizi', 'k', '.kilit')), 'lock released');
  fs.unlinkSync(f);
  fs.writeFileSync(path.join(k, 'kayit', 'dizi', 'k', '.kilit'), JSON.stringify({ pid: process.pid, zaman: new Date().toISOString() }));
  await calistir(ctx(), { simdi: SIMDI, kok: k });
  assert.ok(JSON.parse(fs.readFileSync(f, 'utf8')).notlar.some(n => /kilit/.test(n)));
});

test('a failed comments fetch still measures the episode: yorum_devam 0 and a run note', async () => {
  const P = { sonuc: async () => ({ views: 500 }), readAyar: () => ({ token: 't' }), graph: async () => { throw new Error('GET /M/comments: 500'); } };
  const r0 = await sonucAlYap(P)('M', 'h', ['devam']);
  assert.strictEqual(r0.yorum_devam, 0); assert.deepStrictEqual(r0.metrik, { views: 500 }); assert.match(r0.not, /yorum/);
  const k = kok();
  kaydet(k, 'k', { diziler: [{ id: 'a', kanal: 'k', durum: 'aktif', bolumler: [bolum(1, { durum: 'yayinda', video: 'v', paylasildi: saatOnce(25), media_id: 'M' }), bolum(2), bolum(3)] }] });
  const r = await calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, sonucAl: sonucAlYap(P), uretBolum: fakeUret(), yeniDizi: async () => null });
  const b = yukle(k, 'k').diziler[0].bolumler[0];
  assert.strictEqual(b.durum, 'olculdu'); assert.strictEqual(b.yorum_devam, 0);
  assert.ok(r.notlar.some(n => /a bölüm 1: .*yorum/.test(n)), r.notlar.join(' | '));
});

test('measurement that keeps failing past bekle_saat + 72 h goes to kontrol_et with the reason; earlier it stays yayinda', async () => {
  const k = kok();
  kaydet(k, 'k', { diziler: [
    { id: 'a', kanal: 'k', durum: 'aktif', bolumler: [bolum(1, { durum: 'yayinda', video: 'v', paylasildi: saatOnce(93), media_id: 'M' })] },
    { id: 'b', kanal: 'k', durum: 'aktif', bolumler: [bolum(1, { durum: 'yayinda', video: 'w', paylasildi: saatOnce(30), media_id: 'N' })] },
    { id: 'c', kanal: 'k', durum: 'aktif', bolumler: [bolum(1, { durum: 'yayinda', video: 'x', paylasildi: saatOnce(93) })] }] });
  await calistir(ctx({ gunluk_hedef: 0 }), { simdi: SIMDI, kok: k, sonucAl: async () => { throw new Error('token süresi doldu'); }, uretBolum: fakeUret(), yeniDizi: async () => null });
  const [a, b, c] = yukle(k, 'k').diziler.map(d => d.bolumler[0]);
  assert.strictEqual(a.durum, 'kontrol_et'); assert.match(a.karar_neden, /ölçüm.*token süresi doldu/);
  assert.strictEqual(b.durum, 'yayinda');
  assert.strictEqual(c.durum, 'kontrol_et'); assert.match(c.karar_neden, /media_id/);
});
