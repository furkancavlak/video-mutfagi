// Panel calendar helpers: the tile still (GET /api/kapak) and the follower count (no network, no tokens).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-takvim-'));
const yaz = (rel, icerik) => { const f = path.join(KOK, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, icerik); };
yaz('kanal/kanal_a/konu.json', '{}');
yaz('videolar/v-kare/cikti/kareler-ucretsiz/frame-01-at-9s.png', 'IKINCI');
yaz('videolar/v-kare/cikti/kareler-ucretsiz/frame-00-at-5s.png', 'ILK');
yaz('videolar/v-kare/cikti/son-kare.png', 'SON');
yaz('videolar/v-son/cikti/son-kare.png', 'SON');
fs.mkdirSync(path.join(KOK, 'videolar', 'v-bos', 'cikti'), { recursive: true });
yaz('videolar/v-kare/alt/cikti/son-kare.png', 'ALT');
yaz('disari/cikti/son-kare.png', 'DISARI');

process.argv.push('--kok', KOK);
const P = require('../panel.js');
const srv = P.sunucuYap();
let port;
test.before(() => new Promise(ok => srv.listen(0, '127.0.0.1', () => { port = srv.address().port; ok(); })));
test.after(() => new Promise(ok => srv.close(() => { fs.rmSync(KOK, { recursive: true, force: true }); ok(); })));   // only this test's own temp root
const al = (yol, anahtar = P.ANAHTAR) => new Promise((ok, red) => {
  http.get({ host: '127.0.0.1', port, path: yol, headers: { Host: `127.0.0.1:${port}`, ...(anahtar ? { 'X-Panel': anahtar } : {}) } }, res => {
    const p = []; res.on('data', c => p.push(c)); res.on('end', () => ok({ kod: res.statusCode, tur: res.headers['content-type'], govde: Buffer.concat(p).toString() }));
  }).on('error', red);
});

test('kapak: the first saved frame wins over the end card', async () => {
  const r = await al('/api/kapak?v=' + encodeURIComponent('videolar/v-kare'));
  assert.equal(r.kod, 200); assert.equal(r.tur, 'image/png'); assert.equal(r.govde, 'ILK');
});

test('kapak: without frames the end card is used', async () => {
  const r = await al('/api/kapak?v=videolar/v-son');
  assert.equal(r.kod, 200); assert.equal(r.govde, 'SON');
});

test('kapak: a folder without a still answers 404', async () => {
  assert.equal((await al('/api/kapak?v=videolar/v-bos')).kod, 404);
  assert.equal((await al('/api/kapak?v=videolar/yok')).kod, 404);
});

test('kapak: only a direct video folder under videolar/, never outside or deeper', async () => {
  for (const v of ['disari', '../disari', 'videolar/../disari', 'videolar', 'videolar/v-kare/alt', '', 'videolar/v-kare/cikti/son-kare.png']) {
    const r = await al('/api/kapak?v=' + encodeURIComponent(v));
    assert.equal(r.kod, 404, v); assert.doesNotMatch(r.govde, /DISARI|ALT/);
  }
});

test('kapak: needs the panel key', async () => {
  assert.equal((await al('/api/kapak?v=videolar/v-son', null)).kod, 401);
  assert.equal((await al('/api/kapak?v=videolar/v-son&k=' + encodeURIComponent(P.ANAHTAR), null)).kod, 200);
});

test('takipci: reads followers_count, caches per account, null when the API does not give it', async () => {
  let cagri = 0;
  const sahte = cevap => ({ readAyar: h => ({ token: 't-' + h }), graph: async (m, p, q) => { cagri++; assert.equal(m, 'GET'); assert.equal(p, '/me'); assert.match(q.fields, /followers_count/); return cevap; } });
  const a = await P.takipci('hesap_x', sahte({ followers_count: 1234 }));
  assert.equal(a.bagli, true); assert.equal(a.takipci, 1234);
  await P.takipci('hesap_x', sahte({ followers_count: 9 }));
  assert.equal(cagri, 1, 'second call is served from the cache');
  const b = await P.takipci('hesap_y', sahte({ username: 'u' }));
  assert.equal(b.takipci, null);
  const c = await P.takipci('hesap_z', { readAyar: () => ({ token: 't' }), graph: async () => { throw new Error('ag yok'); } });
  assert.equal(c.bagli, true); assert.equal(c.takipci, null);
  const d = await P.takipci('hesap_w', { readAyar: () => null, graph: async () => { throw new Error('cagrilmamali'); } });
  assert.deepEqual([d.bagli, d.takipci], [false, null]);
  await assert.rejects(() => P.takipci('../kacak', sahte({})));
});
