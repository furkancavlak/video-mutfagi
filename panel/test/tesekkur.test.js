// Panel: a story's thanks list (dizi.tesekkur) for its last episode's closing card. Temp root, ssh stubbed.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawnSync } = require('child_process');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-tesekkur-'));
const yaz = (rel, j) => { const f = path.join(KOK, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof j === 'string' ? j : JSON.stringify(j, null, 2)); };
const DZ = 'kayit/dizi/kanal_a/diziler.json', dizi = id => JSON.parse(fs.readFileSync(path.join(KOK, DZ), 'utf8')).diziler.find(d => d.id === id);
yaz('kanal/kanal_a/konu.json', { dizi: {}, llm: {} });
yaz(DZ, { diziler: [{ id: 'd1', kanal: 'kanal_a', baslik: 'Ornek', durum: 'aktif', bolumler: [{ n: 1, metin: 'a', durum: 'yayinda' }, { n: 2, metin: 'b', durum: 'metin' }] }] });

process.argv.push('--kok', KOK);
const P = require('../panel.js');
const srv = P.sunucuYap();
let port;
test.before(() => new Promise(ok => srv.listen(0, '127.0.0.1', () => { port = srv.address().port; ok(); })));
test.after(() => new Promise(ok => srv.close(() => { fs.rmSync(KOK, { recursive: true, force: true }); ok(); })));   // only this test's own temp root
const istek = (yol, govde) => new Promise((ok, red) => {
  const r = http.request({ host: '127.0.0.1', port, path: yol, method: 'POST', headers: { Host: `127.0.0.1:${port}`, 'X-Panel': P.ANAHTAR, 'Content-Type': 'application/json' } }, res => {
    let t = ''; res.on('data', c => t += c); res.on('end', () => ok({ kod: res.statusCode, j: t ? JSON.parse(t) : null }));
  });
  r.on('error', red); r.write(JSON.stringify(govde)); r.end();
});

test('POST /api/dizi/tesekkur saves cleaned, unique names (newlines, commas, spaces, @; invalid names dropped)', async () => {
  const r = await istek('/api/dizi/tesekkur', { kanal: 'kanal_a', id: 'd1', isimler: ' @ayse.k, mehmet_42\n@@ayse.k  zeynep\ninvalid/name çok-tire ' + 'x'.repeat(31) + ' MEHMET_42' });
  assert.strictEqual(r.kod, 200, JSON.stringify(r.j));
  assert.deepStrictEqual(r.j.tesekkur, ['ayse.k', 'mehmet_42', 'zeynep', 'MEHMET_42']);
  assert.deepStrictEqual(dizi('d1').tesekkur, ['ayse.k', 'mehmet_42', 'zeynep', 'MEHMET_42']);
  // an array works too, and an empty list clears it
  assert.deepStrictEqual((await istek('/api/dizi/tesekkur', { kanal: 'kanal_a', id: 'd1', isimler: ['@a1', 'a1', 'b_2'] })).j.tesekkur, ['a1', 'b_2']);
  assert.deepStrictEqual((await istek('/api/dizi/tesekkur', { kanal: 'kanal_a', id: 'd1', isimler: '' })).j.tesekkur, []);
  assert.deepStrictEqual(dizi('d1').tesekkur, []);
});

test('refusals: unknown story or channel, a non-text list; nothing is written', async () => {
  const once = fs.readFileSync(path.join(KOK, DZ), 'utf8');
  assert.strictEqual((await istek('/api/dizi/tesekkur', { kanal: 'kanal_a', id: 'yok', isimler: 'a' })).kod, 400);
  assert.strictEqual((await istek('/api/dizi/tesekkur', { kanal: 'yok', id: 'd1', isimler: 'a' })).kod, 400);
  assert.strictEqual((await istek('/api/dizi/tesekkur', { kanal: 'kanal_a', id: 'd1', isimler: { x: 1 } })).kod, 400);
  assert.strictEqual(fs.readFileSync(path.join(KOK, DZ), 'utf8'), once);
});

test('a running scheduler holds the lock: 409, nothing written', async () => {
  const kilit = path.join(KOK, 'kayit', 'dizi', 'kanal_a', '.kilit'), once = fs.readFileSync(path.join(KOK, DZ), 'utf8');
  fs.writeFileSync(kilit, JSON.stringify({ pid: process.pid, zaman: new Date().toISOString() }));
  try {
    const r = await istek('/api/dizi/tesekkur', { kanal: 'kanal_a', id: 'd1', isimler: 'ayse' });
    assert.strictEqual(r.kod, 409); assert.match(r.j.hata, /Zamanlayıcı şu an çalışıyor/);
  } finally { fs.unlinkSync(kilit); }
  assert.strictEqual(fs.readFileSync(path.join(KOK, DZ), 'utf8'), once);
});

test('sunucu: goes over ssh with --dizi-tesekkur and the cleaned list; --ozet names the flag', async () => {
  const kayit = [], eski = P.kanca.sunucuda;
  P.kanca.sunucuda = komut => { kayit.push(komut); return '{"ok":true,"tesekkur":["a"]}'; };
  try {
    const r = await istek('/api/dizi/tesekkur', { kanal: 'kanal_a', id: 'd1', isimler: '@a a b;c', makine: 'sunucu' });
    assert.strictEqual(r.kod, 200);
    assert.deepStrictEqual(kayit, [`panel/panel.js --dizi-tesekkur '{"kanal":"kanal_a","id":"d1","isimler":["a"]}'`]);
  } finally { P.kanca.sunucuda = eski; }
  const o = spawnSync(process.execPath, [path.join(__dirname, '..', 'panel.js'), '--kok', KOK, '--ozet'], { encoding: 'utf8', timeout: 20e3 });
  assert.ok(JSON.parse(o.stdout).ozellik.includes('tesekkur'));
});
