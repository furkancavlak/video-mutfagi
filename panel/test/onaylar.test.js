// Panel "Onaylar" page data: stories held for Furkan, the pool's "Öne al", and queue hold notes (temp root, ssh stubbed).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-onaylar-'));
const yaz = (rel, j) => { const f = path.join(KOK, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof j === 'string' ? j : JSON.stringify(j, null, 2)); };
const oku = rel => JSON.parse(fs.readFileSync(path.join(KOK, rel), 'utf8'));
yaz('kanal/kanal_a/konu.json', { dizi: { kaynak: { konular: [{ ad: 'aşk', basliklar: ['/ask--1'] }] } }, llm: {} });
yaz('kanal/kanal_a/kimlik.json', { hesap: 'ornek' });
yaz('kayit/dizi/kanal_a/diziler.json', { diziler: [] });
yaz('kayit/dizi/kanal_a/reddedilen.json', { reddedilen: [
  { kaynak: 'eksi', id: 'eksi-10', neden: 'hassasiyet', ayrinti: '["kişiyi tanıtıyor"]', furkan_baksin: true, url: 'https://eksisozluk.com/entry/10', zaman: '2026-10-31T01:00:00Z' },
  { kaynak: 'eksi', id: 'eksi-11', neden: 'bölünemedi', zaman: '2026-10-31T01:00:00Z' },
  { kaynak: 'eksi', id: 'eksi-12', neden: 'metin reddedildi', zaman: '2026-10-31T01:00:00Z' }] });
yaz('kayit/dizi/kanal_a/havuz.json', { hikayeler: [{ id: 'eksi-1', konu: 'aşk', fav: 900, durum: 'havuzda' }, { id: 'eksi-2', konu: 'aşk', fav: 3, durum: 'havuzda' }] });
yaz('kuyruk/bekleyen/j-not.json', { mp4: 'videolar/v/cikti/a.mp4', ne_zaman: '2026-11-02T10:00:00Z', hesap: 'ornek', onay_gerekli: true, not: '  Instagram kimlik doğrulaması bekleniyor  ', sonraki_deneme: '2026-11-02T11:00:00Z' });

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

test('GET /api/diziler lists the stories held by the sensitivity check, only their safe fields', async () => {
  const r = await istek('GET', '/api/diziler?kanal=kanal_a');
  assert.strictEqual(r.kod, 200);
  assert.deepStrictEqual(r.j.furkan_baksin, [{ id: 'eksi-10', url: 'https://eksisozluk.com/entry/10', neden: 'hassasiyet', ayrinti: '["kişiyi tanıtıyor"]', zaman: '2026-10-31T01:00:00Z' }]);
  assert.strictEqual(r.j.reddedilen_toplam, 3);
});

test('POST /api/dizi/havuz/one marks a pooled story next for its theme; bad input is 400 and writes nothing', async () => {
  let r = await istek('POST', '/api/dizi/havuz/one', { kanal: 'kanal_a', id: '../x' });
  assert.strictEqual(r.kod, 400); assert.match(r.j.hata, /id geçersiz/);
  r = await istek('POST', '/api/dizi/havuz/one', { kanal: 'yok', id: 'eksi-2' });
  assert.strictEqual(r.kod, 400);
  assert.ok(!oku('kayit/dizi/kanal_a/havuz.json').hikayeler.some(x => x.oncelik));
  r = await istek('POST', '/api/dizi/havuz/one', { kanal: 'kanal_a', id: 'eksi-2' });
  assert.strictEqual(r.kod, 200); assert.deepStrictEqual(r.j, { ok: true });
  const h = await istek('GET', '/api/dizi/havuz?kanal=kanal_a');
  assert.deepStrictEqual(h.j.siradaki.map(x => x.id), ['eksi-2', 'eksi-1']);
});

test('sunucu: Öne al goes over ssh with --dizi-havuz-one and the rebuilt, quoted body', async () => {
  const kayit = [];
  P.kanca.sunucuda = komut => { kayit.push(komut); return '{"ok":true}'; };
  const r = await istek('POST', '/api/dizi/havuz/one', { kanal: 'kanal_a', id: 'eksi-1', makine: 'sunucu', fazla: 'x' });
  assert.strictEqual(r.kod, 200);
  assert.deepStrictEqual(kayit, [`panel/panel.js --dizi-havuz-one '{"kanal":"kanal_a","id":"eksi-1"}'`]);
});

test('the queue summary carries a job hold note (trimmed) and its next try', () => {
  const j = P.kuyrukOzet('kanal_a').kuyruk.find(x => x.id === 'j-not');
  assert.strictEqual(j.not, 'Instagram kimlik doğrulaması bekleniyor');
  assert.strictEqual(j.sonraki_deneme, '2026-11-02T11:00:00Z');
});
