// Real follows typed in the İstatistikler table: POST /api/istatistik/takip writes kayit/istatistik/<hesap>/takip-elle.json
// here, or goes over ssh (stubbed) with --istatistik-takip in server mode; GET /api/istatistik carries it back with the
// episode identity card read from the video folder. Temp root, no network.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawnSync } = require('child_process');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-takip-'));
fs.mkdirSync(path.join(KOK, 'kanal', 'kanal_a'), { recursive: true });
fs.writeFileSync(path.join(KOK, 'kanal', 'kanal_a', 'konu.json'), '{}');
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
const dosya = h => path.join(KOK, 'kayit', 'istatistik', h, 'takip-elle.json');
const oku = h => JSON.parse(fs.readFileSync(dosya(h), 'utf8'));
const kayit = [];
const durdur = cevap => { kayit.length = 0; P.kanca.sunucuda = komut => { kayit.push(komut); return cevap; }; };

test('POST istatistik/takip: sets, accepts a digit string, clears with null; bad values are refused with 400', async () => {
  let r = await istek('POST', '/api/istatistik/takip', { hesap: '@H', media_id: 'R1', takip: 12 });
  assert.strictEqual(r.kod, 200, JSON.stringify(r.j)); assert.strictEqual(r.j.takip, 12);
  assert.strictEqual(oku('h').R1.takip, 12, 'the account name is cleaned like everywhere else');
  r = await istek('POST', '/api/istatistik/takip', { hesap: 'h', media_id: 'R2', takip: ' 7 ' });
  assert.strictEqual(r.kod, 200); assert.strictEqual(oku('h').R2.takip, 7);
  for (const b of [{ media_id: '../x', takip: 1 }, { media_id: 'R1', takip: -3 }, { media_id: 'R1', takip: 10000001 }, { media_id: 'R1', takip: 2.5 }, { media_id: 'R1', takip: 'on' }, { takip: 1 }, { hesap: 'a/b', media_id: 'R1', takip: 1 }]) {
    const x = await istek('POST', '/api/istatistik/takip', { hesap: 'h', ...b });
    assert.strictEqual(x.kod, 400, JSON.stringify(b)); assert.ok(x.j.hata);
  }
  assert.strictEqual(oku('h').R1.takip, 12, 'a refused write changes nothing');
  r = await istek('POST', '/api/istatistik/takip', { hesap: 'h', media_id: 'R1', takip: null });
  assert.strictEqual(r.kod, 200); assert.deepStrictEqual(Object.keys(oku('h')), ['R2']);
  assert.strictEqual((await istek('GET', '/api/istatistik/takip')).kod, 404, 'write only');
});

test('sunucu: the write goes over ssh with --istatistik-takip and only the rebuilt fields; a bad id never reaches ssh', async () => {
  durdur('{"ok":true,"media_id":"R9","takip":5,"zaman":"z"}');
  const r = await istek('POST', '/api/istatistik/takip', { makine: 'sunucu', media_id: 'R9', takip: 5, fazla: "'; rm -rf /" });
  assert.strictEqual(r.kod, 200); assert.strictEqual(r.j.takip, 5);
  assert.deepStrictEqual(kayit, [`panel/panel.js --istatistik-takip '{"hesap":"oxygbio","media_id":"R9","takip":5}'`]);
  assert.ok(!fs.existsSync(dosya('oxygbio')), 'nothing written on this computer');
  durdur('{}');
  assert.strictEqual((await istek('POST', '/api/istatistik/takip', { makine: 'sunucu', media_id: "a'b", takip: 5 })).kod, 400);
  assert.deepStrictEqual(kayit, []);
});

test('the --istatistik-takip flag writes on the server copy; a broken body is HATA: and exit 1', () => {
  const js = path.join(__dirname, '..', 'panel.js');
  let r = spawnSync(process.execPath, [js, '--kok', KOK, '--istatistik-takip', '{"hesap":"sv","media_id":"M1","takip":3}'], { encoding: 'utf8', timeout: 20e3 });
  assert.strictEqual(r.status, 0, r.stderr); assert.strictEqual(JSON.parse(r.stdout).takip, 3); assert.strictEqual(oku('sv').M1.takip, 3);
  r = spawnSync(process.execPath, [js, '--kok', KOK, '--istatistik-takip', '{bozuk'], { encoding: 'utf8', timeout: 20e3 });
  assert.strictEqual(r.status, 1); assert.match(r.stderr, /^HATA: bozuk istek/m);
  r = spawnSync(process.execPath, [js, '--kok', KOK, '--istatistik-takip', '{"hesap":"sv","media_id":"M1","takip":-1}'], { encoding: 'utf8', timeout: 20e3 });
  assert.strictEqual(r.status, 1); assert.match(r.stderr, /^HATA: takip/m);
});

test('GET istatistik: the typed number and the identity card from the video folder come back on the reel', async () => {
  const d = path.join(KOK, 'kayit', 'istatistik', 'kart'), y = Date.now() - 9 * 864e5;
  fs.mkdirSync(d, { recursive: true });
  const sat = [];
  for (let h = 1; h <= 3; h++) sat.push(JSON.stringify({ v: 2, zaman: new Date(y + h * 3600e3).toISOString(), media_id: 'V1', yayin: new Date(y).toISOString(), yas_s: h * 3600, api: 'v', metrik: { views: h }, yok: {} }));
  fs.writeFileSync(path.join(d, `gozlem-${new Date(y).toISOString().slice(0, 7)}.jsonl`), sat.join('\n') + '\n');
  fs.writeFileSync(path.join(d, 'medya.json'), JSON.stringify({ V1: { t: new Date(y).toISOString(), tur: 'reel', baslik: 'V' } }));
  fs.mkdirSync(path.join(KOK, 'kuyruk', 'paylasilan'), { recursive: true });
  fs.writeFileSync(path.join(KOK, 'kuyruk', 'paylasilan', 'j1.json'), JSON.stringify({ hesap: 'kart', media_id: 'V1', video: 'videolar/v1', paylasildi: new Date(y).toISOString() }));
  fs.mkdirSync(path.join(KOK, 'videolar', 'v1'), { recursive: true });
  fs.writeFileSync(path.join(KOK, 'videolar', 'v1', 'video.json'), JSON.stringify({ satirlar: [{ rol: 'anlatici', metin: 'İlk cümle burada. Sonra gelen.' }], anlaticilar: { anlatici: 'SES9' }, video_ek: { bolum: 2, toplam_bolum: 3 } }));
  let r = await istek('GET', '/api/istatistik?hesap=kart&gun=7');
  assert.strictEqual(r.kod, 200, JSON.stringify(r.j));
  let v = r.j.videolar.find(x => x.id === 'V1');
  assert.deepStrictEqual([v.takip, v.takip_elle, r.j.takip_eksik, v.acilis, v.ses, v.bolum, v.toplam_bolum], [null, false, 1, 'İlk cümle burada.', 'SES9', 2, 3]);
  await istek('POST', '/api/istatistik/takip', { hesap: 'kart', media_id: 'V1', takip: 40 });
  r = await istek('GET', '/api/istatistik?hesap=kart&gun=7'); v = r.j.videolar.find(x => x.id === 'V1');
  assert.deepStrictEqual([v ? v.takip : 'gone', r.j.takip_eksik], ['gone', 0], 'with a number the old reel is no longer sent outside the period');
  r = await istek('GET', '/api/istatistik?hesap=kart&gun=14'); v = r.j.videolar.find(x => x.id === 'V1');
  assert.deepStrictEqual([v.takip, v.takip_elle], [40, true]);
});
