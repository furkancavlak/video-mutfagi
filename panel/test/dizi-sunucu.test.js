// Diziler on a server: the CLI flags (spawned against a temp root) and the route forwarding (ssh call stubbed).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawnSync } = require('child_process');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-dizi-sv-'));
const yaz = (rel, j) => { const f = path.join(KOK, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof j === 'string' ? j : JSON.stringify(j, null, 2)); };
const oku = rel => JSON.parse(fs.readFileSync(path.join(KOK, rel), 'utf8'));
const DZ = 'kayit/dizi/kanal_a/diziler.json';
const b = (n, durum, ekstra = {}) => ({ n, metin: 'bir iki uc', durum, ...ekstra });
yaz('kanal/kanal_a/konu.json', { dizi: { gunluk_hedef: 3, saatler: ['12:00'] }, llm: {} });
yaz(DZ, { diziler: [{ id: 'd1', kanal: 'kanal_a', baslik: 'Ornek', baslik_kisa: 'Ornek', durum: 'aktif', bolumler: [b(1, 'kontrol_et', { video: 'videolar/v9', link: 'L', media_id: 'M9' }), b(2, 'metin'), b(3, 'metin')] }] });

const PANEL = path.join(__dirname, '..', 'panel.js');
const cli = (...a) => spawnSync(process.execPath, [PANEL, '--kok', KOK, ...a], { encoding: 'utf8', timeout: 30e3 });

test('--diziler prints the same JSON the local route gives', () => {
  const r = cli('--diziler', 'kanal_a');
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.diziler.length, 1); assert.equal(j.diziler[0].id, 'd1'); assert.equal(j.ayar.gunluk_hedef, 3);
});

test('--diziler with an unknown or hostile channel: HATA: and exit 1', () => {
  for (const k of ['yok', '../x', "a'; echo hi #"]) { const r = cli('--diziler', k); assert.equal(r.status, 1); assert.match(r.stderr, /^HATA: kanal yok/m); assert.equal(r.stdout, ''); }
});

test('--dizi-ayar changes only the given keys; bad values exit 1 with HATA:', () => {
  let r = cli('--dizi-ayar', JSON.stringify({ kanal: 'kanal_a', ayar: { gunluk_hedef: 2 } }));
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).ayar.gunluk_hedef, 2);
  assert.deepEqual(oku('kanal/kanal_a/konu.json').dizi.saatler, ['12:00']); assert.deepEqual(oku('kanal/kanal_a/konu.json').llm, {});
  r = cli('--dizi-ayar', JSON.stringify({ kanal: 'kanal_a', ayar: { gunluk_hedef: 99 } }));
  assert.equal(r.status, 1); assert.match(r.stderr, /^HATA: Günlük bölüm sayısı/m);
  assert.equal(oku('kanal/kanal_a/konu.json').dizi.gunluk_hedef, 2);
  r = cli('--dizi-ayar', '{bozuk'); assert.equal(r.status, 1); assert.match(r.stderr, /^HATA: bozuk istek/m);
});

test('--dizi-karar and --dizi-tekrar write the file; bad input is rejected before writing', () => {
  let r = cli('--dizi-karar', JSON.stringify({ kanal: 'kanal_a', id: 'd1', n: 9, karar: 'devam' }));
  assert.equal(r.status, 1); assert.match(r.stderr, /^HATA: bölüm numarası/m);
  r = cli('--dizi-karar', JSON.stringify({ kanal: 'kanal_a', id: 'd1', n: 1, karar: 'sil' }));
  assert.equal(r.status, 1); assert.match(r.stderr, /^HATA: karar/m);
  r = cli('--dizi-tekrar', JSON.stringify({ kanal: 'kanal_a', id: 'd1', n: 1 }));
  assert.equal(r.status, 0); assert.deepEqual(JSON.parse(r.stdout), { ok: true });
  r = cli('--dizi-karar', JSON.stringify({ kanal: 'kanal_a', id: 'd1', n: 1, karar: 'devam', neden: 'deneme' }));
  assert.equal(r.status, 0);
  assert.equal(oku(DZ).diziler[0].bolumler[0].karar, 'devam');
});

test('a busy scheduler lock exits 3 (= 409) with HATA:, nothing written', () => {
  const kilit = path.join(KOK, 'kayit', 'dizi', 'kanal_a', '.kilit'), once = fs.readFileSync(path.join(KOK, DZ), 'utf8');
  fs.writeFileSync(kilit, JSON.stringify({ pid: process.pid, zaman: new Date().toISOString() }));
  try {
    const r = cli('--dizi-tekrar', JSON.stringify({ kanal: 'kanal_a', id: 'd1', n: 1 }));
    assert.equal(r.status, 3); assert.match(r.stderr, /^HATA: Zamanlayıcı şu an çalışıyor/m);
  } finally { fs.unlinkSync(kilit); }
  assert.equal(fs.readFileSync(path.join(KOK, DZ), 'utf8'), once);
});

// ---- route forwarding: makine=sunucu goes through sunucuda() (stubbed), makine omitted stays local
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
const kayit = [];
const durdur = (cevap = '{"ok":true}') => { kayit.length = 0; P.kanca.sunucuda = komut => { kayit.push(komut); if (cevap instanceof Error) throw cevap; return cevap; }; };

test('sunucu: GET diziler forwards with --diziler and the quoted channel', async () => {
  durdur('{"diziler":[],"ayar":{},"ayar_var":false,"son_kosu":null}');
  const r = await istek('GET', '/api/diziler?kanal=kanal_a&makine=sunucu');
  assert.equal(r.kod, 200); assert.deepEqual(r.j.diziler, []);
  assert.deepEqual(kayit, ["panel/panel.js --diziler 'kanal_a'"]);
});

test('sunucu: POST routes forward only validated fields, single-quoted JSON', async () => {
  durdur();
  let r = await istek('POST', '/api/dizi/karar', { makine: 'sunucu', kanal: 'kanal_a', id: 'd1', n: 2, karar: 'kes', neden: "o'neden   x", ekstra: '$(rm -rf /)' });
  assert.equal(r.kod, 200);
  assert.equal(kayit[0], `panel/panel.js --dizi-karar '{"kanal":"kanal_a","id":"d1","n":2,"karar":"kes","neden":"o'\\''neden x"}'`);
  r = await istek('POST', '/api/dizi/tekrar', { makine: 'sunucu', kanal: 'kanal_a', id: 'd1', n: 3 });
  assert.equal(kayit[1], `panel/panel.js --dizi-tekrar '{"kanal":"kanal_a","id":"d1","n":3}'`);
  r = await istek('POST', '/api/dizi/ayar', { makine: 'sunucu', kanal: 'kanal_a', ayar: { gunluk_hedef: 2, saatler: ['17:00', '12:00'] } });
  assert.equal(kayit[2], `panel/panel.js --dizi-ayar '{"kanal":"kanal_a","ayar":{"gunluk_hedef":2,"saatler":["12:00","17:00"]}}'`);
});

test('sunucu: invalid input is rejected with 400 before any ssh call', async () => {
  durdur();
  const kotu = [
    ['/api/dizi/karar', { kanal: "kanal_a'; id #", id: 'd1', n: 1, karar: 'kes' }],
    ['/api/dizi/karar', { kanal: 'kanal_a', id: "d1'; rm", n: 1, karar: 'kes' }],
    ['/api/dizi/karar', { kanal: 'kanal_a', id: 'd1', n: 4, karar: 'kes' }],
    ['/api/dizi/karar', { kanal: 'kanal_a', id: 'd1', n: 1, karar: 'sil' }],
    ['/api/dizi/tekrar', { kanal: '../x', id: 'd1', n: 1 }],
    ['/api/dizi/tekrar', { kanal: 'kanal_a', id: 'd1', n: '1' }],
    ['/api/dizi/ayar', { kanal: 'kanal_a', ayar: { gunluk_hedef: 99 } }],
    ['/api/dizi/ayar', { kanal: 'kanal_a', ayar: { tehlike: 1 } }]];
  for (const [yol, g] of kotu) { const r = await istek('POST', yol, { makine: 'sunucu', ...g }); assert.equal(r.kod, 400, yol + JSON.stringify(g)); }
  assert.equal((await istek('GET', '/api/diziler?kanal=a%27%3Bb&makine=sunucu')).kod, 400);
  assert.equal(kayit.length, 0);
});

test('sunucu: a 409 from the server is passed on, and a plain error is 400', async () => {
  durdur(Object.assign(new Error('Zamanlayıcı şu an çalışıyor'), { kod: 409 }));
  assert.equal((await istek('POST', '/api/dizi/tekrar', { makine: 'sunucu', kanal: 'kanal_a', id: 'd1', n: 1 })).kod, 409);
  durdur(new Error('sunucu komutu başarısız'));
  assert.equal((await istek('POST', '/api/dizi/tekrar', { makine: 'sunucu', kanal: 'kanal_a', id: 'd1', n: 1 })).kod, 400);
});

test('without makine=sunucu nothing goes to ssh', async () => {
  durdur();
  const r = await istek('GET', '/api/diziler?kanal=kanal_a');
  assert.equal(r.kod, 200); assert.equal(r.j.diziler.length, 1); assert.equal(kayit.length, 0);
});

test('--ozet reports ozellik: diziler (the home panel gates the server toggle on it); dizi hops get a short timeout', async () => {
  const r = cli('--ozet');
  assert.equal(r.status, 0); assert.ok(JSON.parse(r.stdout).ozellik.includes('diziler'));
  const sureler = [];
  P.kanca.sunucuda = (komut, sure) => { sureler.push(sure); return '{"ok":true}'; };
  await istek('POST', '/api/dizi/tekrar', { makine: 'sunucu', kanal: 'kanal_a', id: 'd1', n: 1 });
  assert.deepEqual(sureler, [20e3]);
});
