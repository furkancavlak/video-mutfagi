// In server mode the PC never reads Instagram: /api/instagram and /api/takipci go over ssh (stubbed) to the server's
// snapshots, like /api/istatistik. No network, no tokens.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-ig-sv-'));
fs.mkdirSync(path.join(KOK, 'kanal', 'kanal_a'), { recursive: true });
fs.writeFileSync(path.join(KOK, 'kanal', 'kanal_a', 'konu.json'), '{}');
process.argv.push('--kok', KOK);
const P = require('../panel.js');
const srv = P.sunucuYap();
let port;
test.before(() => new Promise(ok => srv.listen(0, '127.0.0.1', () => { port = srv.address().port; ok(); })));
test.after(() => new Promise(ok => srv.close(() => { fs.rmSync(KOK, { recursive: true, force: true }); ok(); })));   // only this test's own temp root
const al = yol => new Promise((ok, red) => {
  http.get({ host: '127.0.0.1', port, path: yol, headers: { Host: `127.0.0.1:${port}`, 'X-Panel': P.ANAHTAR } }, res => {
    let t = ''; res.on('data', c => t += c); res.on('end', () => ok({ kod: res.statusCode, j: t ? JSON.parse(t) : null }));
  }).on('error', red);
});
const kayit = [];
const durdur = cevap => { kayit.length = 0; P.kanca.sunucuda = komut => { kayit.push(komut); return cevap; }; };

test('sunucu: GET instagram goes over ssh with --instagram and the cleaned account, the answer comes back as is', async () => {
  durdur('{"bagli":true,"kaynak":"anlik","gonderiler":[{"id":"1","views":5}]}');
  const r = await al('/api/instagram?hesap=%40Hesap_B&makine=sunucu&yenile=1');
  assert.strictEqual(r.kod, 200);
  assert.deepStrictEqual(r.j, { bagli: true, kaynak: 'anlik', gonderiler: [{ id: '1', views: 5 }] });
  assert.deepStrictEqual(kayit, [`panel/panel.js --instagram '{"hesap":"hesap_b"}'`]);
});

test('sunucu: GET takipci goes over ssh with --takipci; no account means oxygbio', async () => {
  durdur('{"bagli":true,"takipci":42}');
  const r = await al('/api/takipci?makine=sunucu');
  assert.strictEqual(r.kod, 200); assert.strictEqual(r.j.takipci, 42);
  assert.deepStrictEqual(kayit, [`panel/panel.js --takipci '{"hesap":"oxygbio"}'`]);
});

test('sunucu: a hostile account name is refused before any ssh', async () => {
  durdur('{}');
  for (const h of ['a%20b', '..%2Fx', "a'%3Becho"]) { const r = await al(`/api/instagram?hesap=${h}&makine=sunucu`); assert.strictEqual(r.kod, 400, h); }
  const r = await al('/api/takipci?hesap=a%2Fb&makine=sunucu'); assert.strictEqual(r.kod, 400);
  assert.deepStrictEqual(kayit, []);
});

test('the CLI flags exist and refuse a broken body with HATA: and exit 1 (no Instagram read)', () => {
  const { spawnSync } = require('child_process');
  for (const f of ['--instagram', '--takipci']) {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'panel.js'), '--kok', KOK, f, '{bozuk'], { encoding: 'utf8', timeout: 20e3 });
    assert.strictEqual(r.status, 1, f); assert.match(r.stderr, /^HATA: bozuk istek/m);
  }
});

test('--ozet tells the home panel which server flags this copy knows', () => {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'panel.js'), '--kok', KOK, '--ozet'], { encoding: 'utf8', timeout: 20e3 });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout).ozellik, ['diziler', 'istatistik', 'instagram', 'tesekkur']);
});
