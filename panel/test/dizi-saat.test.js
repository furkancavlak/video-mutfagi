// Panel: hand-set times. A story's own hour (dizi.saat) and one episode pinned to an exact time (bolum.sabit_zaman),
// through the local routes, the --dizi-saat / --dizi-bolum-zaman server flags and the calendar data (planliBolumler).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawnSync } = require('child_process');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-saat-'));
const yaz = (rel, j) => { const f = path.join(KOK, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof j === 'string' ? j : JSON.stringify(j, null, 2)); };
const oku = rel => JSON.parse(fs.readFileSync(path.join(KOK, rel), 'utf8'));
const DZ = 'kayit/dizi/kanal_a/diziler.json', dizi = id => oku(DZ).diziler.find(d => d.id === id);
const b = (n, durum, ek = {}) => ({ n, metin: 'bir iki uc', durum, ...ek });
const taban = () => ({ diziler: [
  { id: 'd1', kanal: 'kanal_a', baslik: 'Bir', baslik_kisa: 'Bir', durum: 'aktif', metin_onay: 'onaylandi', saat: '10:00', bolumler: [b(1, 'yayinda', { video: 'videolar/v1', paylasildi: '2026-10-30T10:00:00Z' }), b(2, 'onay-bekliyor', { video: 'videolar/v2' }), b(3, 'metin')] },
  { id: 'd2', kanal: 'kanal_a', baslik: 'Iki', baslik_kisa: 'Iki', durum: 'kesildi', bolumler: [b(1, 'olculdu', { paylasildi: '2026-10-30T10:00:00Z' }), b(2, 'atlandi')] },
  { id: 'd3', kanal: 'kanal_a', baslik: 'Uc', baslik_kisa: 'Uc', durum: 'aktif', metin_onay: 'onaylandi', bolumler: [b(1, 'yayinda', { paylasildi: '2026-10-30T10:00:00Z' }), b(2, 'metin')] }] });
const sifirla = () => { yaz(DZ, taban()); yaz('kuyruk/bekleyen/job-2.json', { video: 'videolar/v2', mp4: 'a.mp4', onay_gerekli: true, ne_zaman: '2026-11-01T10:00:00Z', sonraki_deneme: 'x' }); };
yaz('kanal/kanal_a/konu.json', { dizi: { saatler: ['12:00'] }, llm: {} });
sifirla();

process.argv.push('--kok', KOK);
const P = require('../panel.js');
const srv = P.sunucuYap();
let port;
test.before(() => new Promise(ok => srv.listen(0, '127.0.0.1', () => { port = srv.address().port; ok(); })));
test.after(() => new Promise(ok => srv.close(() => { fs.rmSync(KOK, { recursive: true, force: true }); ok(); })));   // only this test's own temp root
const istek = (method, yol, govde) => new Promise((ok, red) => {
  const r = http.request({ host: '127.0.0.1', port, path: yol, method, headers: { Host: `127.0.0.1:${port}`, 'X-Panel': P.ANAHTAR, 'Content-Type': 'application/json' } }, res => {
    let t = ''; res.on('data', c => t += c); res.on('end', () => ok({ kod: res.statusCode, j: t ? JSON.parse(t) : null }));
  });
  r.on('error', red); if (govde) r.write(JSON.stringify(govde)); r.end();
});
const saatGonder = (id, saat, ek = {}) => istek('POST', '/api/dizi/saat', { kanal: 'kanal_a', id, saat, ...ek });
const zamanGonder = (id, n, zaman, ek = {}) => istek('POST', '/api/dizi/bolum-zaman', { kanal: 'kanal_a', id, n, zaman, ...ek });
const gelecek = (saat = 30) => new Date(Date.now() + saat * 3600e3);
// the browser's datetime-local with its offset, as ofsetli() builds it
const yerelOfsetli = d => { const p = n => String(n).padStart(2, '0'), o = -d.getTimezoneOffset(), a = Math.abs(o); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}${o < 0 ? '-' : '+'}${p(Math.floor(a / 60))}:${p(a % 60)}`; };

test('POST dizi/saat: sets HH:MM, clears with null or empty, refuses bad values and inactive series', async () => {
  sifirla();
  let r = await saatGonder('d1', '19:30'); assert.equal(r.kod, 200); assert.equal(r.j.saat, '19:30'); assert.equal(dizi('d1').saat, '19:30');
  r = await saatGonder('d1', null); assert.equal(r.kod, 200); assert.equal(r.j.saat, null); assert.ok(!('saat' in dizi('d1')));
  await saatGonder('d1', '21:05'); r = await saatGonder('d1', ''); assert.equal(r.kod, 200); assert.ok(!('saat' in dizi('d1')));
  const once = fs.readFileSync(path.join(KOK, DZ), 'utf8');
  for (const k of ['7:30', '24:00', '19:60', 'abc', 1930, '19:30:00']) assert.equal((await saatGonder('d1', k)).kod, 400, String(k));
  assert.equal((await saatGonder('d2', '10:00')).kod, 400);           // cut series
  assert.equal((await saatGonder('yok', '10:00')).kod, 400);
  assert.equal((await saatGonder('d1', '10:00', { kanal: 'yok' })).kod, 400);
  assert.equal(fs.readFileSync(path.join(KOK, DZ), 'utf8'), once, 'refusals write nothing');
});

test('POST dizi/saat: a series being produced is refused with 409', async () => {
  sifirla();
  const kilit = path.join(KOK, 'kayit', 'dizi', 'kanal_a', '.kilit-d1');
  fs.writeFileSync(kilit, JSON.stringify({ pid: process.pid, zaman: new Date().toISOString() }));
  try { assert.equal((await saatGonder('d1', '11:00')).kod, 409); assert.equal((await saatGonder('d3', '11:00')).kod, 200); }
  finally { fs.unlinkSync(kilit); }
});

test('POST dizi/bolum-zaman: pins a future time, moves the waiting queue job, clears with null', async () => {
  sifirla();
  const t = gelecek(30);
  let r = await zamanGonder('d1', 2, yerelOfsetli(t)); assert.equal(r.kod, 200);
  const beklenen = new Date(Math.floor(t.getTime() / 60e3) * 60e3).toISOString();
  assert.equal(dizi('d1').bolumler[1].sabit_zaman, beklenen); assert.equal(r.j.sabit_zaman, beklenen); assert.equal(r.j.kuyruk_tasindi, true);
  const j = oku('kuyruk/bekleyen/job-2.json'); assert.equal(j.ne_zaman, beklenen); assert.ok(!('sonraki_deneme' in j));
  // an episode without a job: pinned, nothing moved
  r = await zamanGonder('d1', 3, yerelOfsetli(gelecek(50))); assert.equal(r.kod, 200); assert.equal(r.j.kuyruk_tasindi, false);
  // clear: the pin goes, the job keeps its time
  r = await zamanGonder('d1', 2, null); assert.equal(r.kod, 200); assert.equal(r.j.sabit_zaman, null);
  assert.ok(!('sabit_zaman' in dizi('d1').bolumler[1])); assert.equal(oku('kuyruk/bekleyen/job-2.json').ne_zaman, beklenen);
  r = await zamanGonder('d1', 3, ''); assert.equal(r.kod, 200); assert.ok(!('sabit_zaman' in dizi('d1').bolumler[2]));
});

test('POST dizi/bolum-zaman: a past time, a posted or closed episode, bad input and a busy series change nothing', async () => {
  sifirla();
  const once = fs.readFileSync(path.join(KOK, DZ), 'utf8'), job = fs.readFileSync(path.join(KOK, 'kuyruk/bekleyen/job-2.json'), 'utf8');
  const gec = await zamanGonder('d1', 2, yerelOfsetli(new Date(Date.now() - 3600e3)));
  assert.equal(gec.kod, 400); assert.match(gec.j.hata || gec.j.error || JSON.stringify(gec.j), /geçmiş/);
  assert.equal((await zamanGonder('d1', 1, yerelOfsetli(gelecek()))).kod, 400);   // posted
  assert.equal((await zamanGonder('d2', 2, yerelOfsetli(gelecek()))).kod, 400);   // cut series, skipped episode
  for (const z of ['yarın', 12345, '2026-13-45T10:00']) assert.equal((await zamanGonder('d1', 2, z)).kod, 400, String(z));
  assert.equal((await zamanGonder('d1', 6, yerelOfsetli(gelecek()))).kod, 400);
  assert.equal((await zamanGonder('d1', '2', yerelOfsetli(gelecek()))).kod, 400);
  assert.equal(fs.readFileSync(path.join(KOK, DZ), 'utf8'), once); assert.equal(fs.readFileSync(path.join(KOK, 'kuyruk/bekleyen/job-2.json'), 'utf8'), job);
  const kilit = path.join(KOK, 'kayit', 'dizi', 'kanal_a', '.kilit-d1');
  fs.writeFileSync(kilit, JSON.stringify({ pid: process.pid, zaman: new Date().toISOString() }));
  try { assert.equal((await zamanGonder('d1', 2, yerelOfsetli(gelecek()))).kod, 409); } finally { fs.unlinkSync(kilit); }
});

test('sunucu: both routes forward only rebuilt, validated fields over ssh; bad input never reaches ssh', async () => {
  const kayit = [];
  P.kanca.sunucuda = komut => { kayit.push(komut); return '{"ok":true}'; };
  let r = await saatGonder('d1', ' 19:30 ', { makine: 'sunucu', ekstra: '$(rm -rf /)' });
  assert.equal(r.kod, 200); assert.equal(kayit[0], `panel/panel.js --dizi-saat '{"kanal":"kanal_a","id":"d1","saat":"19:30"}'`);
  r = await saatGonder('d1', null, { makine: 'sunucu' }); assert.equal(kayit[1], `panel/panel.js --dizi-saat '{"kanal":"kanal_a","id":"d1","saat":null}'`);
  r = await zamanGonder('d1', 2, '2030-01-05T19:30+03:00', { makine: 'sunucu', ekstra: 1 });
  assert.equal(kayit[2], `panel/panel.js --dizi-bolum-zaman '{"kanal":"kanal_a","id":"d1","n":2,"zaman":"2030-01-05T19:30+03:00"}'`);
  r = await zamanGonder('d1', 2, null, { makine: 'sunucu' }); assert.equal(kayit[3], `panel/panel.js --dizi-bolum-zaman '{"kanal":"kanal_a","id":"d1","n":2,"zaman":null}'`);
  const n = kayit.length;
  for (const [yol, g] of [['saat', { kanal: 'kanal_a', id: 'd1', saat: "19:30'; rm" }], ['saat', { kanal: "a'b", id: 'd1', saat: '19:30' }], ['saat', { kanal: 'kanal_a', id: "d1'x", saat: '19:30' }],
    ['bolum-zaman', { kanal: 'kanal_a', id: 'd1', n: 9, zaman: '2030-01-05T19:30+03:00' }], ['bolum-zaman', { kanal: 'kanal_a', id: 'd1', n: 2, zaman: "x'; rm" }], ['bolum-zaman', { kanal: '../x', id: 'd1', n: 2, zaman: null }]])
    assert.equal((await istek('POST', '/api/dizi/' + yol, { makine: 'sunucu', ...g })).kod, 400, yol + JSON.stringify(g));
  assert.equal(kayit.length, n);
});

test('the --dizi-saat and --dizi-bolum-zaman flags write on this copy; a broken body or a past time is HATA: exit 1', () => {
  sifirla();
  const PANEL = path.join(__dirname, '..', 'panel.js'), cli = (...a) => spawnSync(process.execPath, [PANEL, '--kok', KOK, ...a], { encoding: 'utf8', timeout: 30e3 });
  let r = cli('--dizi-saat', JSON.stringify({ kanal: 'kanal_a', id: 'd1', saat: '18:45' })); assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).saat, '18:45'); assert.equal(dizi('d1').saat, '18:45');
  const z = '2031-03-04T19:30+03:00';
  r = cli('--dizi-bolum-zaman', JSON.stringify({ kanal: 'kanal_a', id: 'd1', n: 2, zaman: z })); assert.equal(r.status, 0);
  assert.equal(dizi('d1').bolumler[1].sabit_zaman, '2031-03-04T16:30:00.000Z'); assert.equal(oku('kuyruk/bekleyen/job-2.json').ne_zaman, '2031-03-04T16:30:00.000Z');
  for (const a of [['--dizi-saat', 'bozuk'], ['--dizi-bolum-zaman', 'bozuk'], ['--dizi-bolum-zaman', JSON.stringify({ kanal: 'kanal_a', id: 'd1', n: 2, zaman: '2020-01-01T10:00+03:00' })]]) {
    r = cli(...a); assert.equal(r.status, 1); assert.match(r.stderr, /^HATA: /m);
  }
});

// ---- calendar data
const D = require('../../dizi/dizi.js');
const AYAR = { olcum_once_saat: 3, bolum_arasi_saat: 12, saatler: ['10:00', '15:00', '20:00'] };
const yerel = (g, s, d = 0) => new Date(2026, 10, g, s, d).toISOString();
const SIMDI = new Date(2026, 10, 1, 12, 0).getTime();
const dz = (bolumler, ek = {}) => ({ id: 'x1', baslik: 'Uzun', baslik_kisa: 'Kisa', durum: 'aktif', metin_onay: 'onaylandi', saat: '10:00', ton: 'komik', konu: null, bolumler, ...ek });

test('planliBolumler: a pinned episode shows its exact time with sabit: true, an automatic one has no marker', () => {
  const yay = { n: 1, durum: 'yayinda', paylasildi: yerel(1, 10, 5), video: 'videolar/v1' };
  const otomatik = P.planliBolumler([dz([yay, { n: 2, durum: 'metin' }])], AYAR, [], SIMDI);
  assert.strictEqual(otomatik[0].slot, yerel(2, 10)); assert.ok(!('sabit' in otomatik[0]));
  const sabit = P.planliBolumler([dz([yay, { n: 2, durum: 'metin', sabit_zaman: yerel(1, 17, 40) }])], AYAR, [], SIMDI);
  assert.strictEqual(sabit.length, 1); assert.strictEqual(sabit[0].slot, yerel(1, 17, 40)); assert.strictEqual(sabit[0].sabit, true);
  assert.strictEqual(sabit[0].karar, yerel(1, 16, 5));   // 3 h before the pin would be 14:40, but never on fewer than 6 h of data (10:05 + 6 h)
});

test('planliBolumler: the pin also holds after a previous episode that still waits; others move around a pin and the pin never moves', () => {
  const bek = [{ id: 'j1', video: 'videolar/v1', ne_zaman: yerel(2, 10), onay_gerekli: true }];
  const onceki = { n: 1, durum: 'onay-bekliyor', video: 'videolar/v1' };
  const L = P.planliBolumler([dz([onceki, { n: 2, durum: 'metin', sabit_zaman: yerel(5, 9, 15) }])], AYAR, bek, SIMDI);
  assert.strictEqual(L[0].slot, yerel(5, 9, 15)); assert.strictEqual(L[0].sabit, true);
  // series y's automatic episode would take 10:00 on the 2nd, but x's pin holds that time: y moves on, x stays
  const yay = { n: 1, durum: 'yayinda', paylasildi: yerel(1, 10, 5), video: 'videolar/v1' };
  const x = dz([yay, { n: 2, durum: 'metin', sabit_zaman: yerel(2, 10) }], { id: 'x' }), y = dz([{ ...yay, video: 'videolar/w1' }, { n: 2, durum: 'metin' }], { id: 'y' });
  const M = P.planliBolumler([y, x], AYAR, [], SIMDI), my = M.find(i => i.dizi_id === 'y'), mx = M.find(i => i.dizi_id === 'x');
  assert.strictEqual(mx.slot, yerel(2, 10)); assert.strictEqual(mx.sabit, true);
  assert.ok(Date.parse(my.slot) > Date.parse(yerel(2, 10)) && !('sabit' in my));
});
