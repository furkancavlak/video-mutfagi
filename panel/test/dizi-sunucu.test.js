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
    ['/api/dizi/karar', { kanal: 'kanal_a', id: 'd1', n: 6, karar: 'kes' }],
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

// ---- server video preview: GET /api/sunucu-video?yol=videolar/... (scp stubbed), cache kayit/sunucu-onizleme (max 5)
const ham = (yol) => new Promise((ok, red) => {
  const r = http.request({ host: '127.0.0.1', port, path: yol, method: 'GET', headers: { Host: `127.0.0.1:${port}`, 'X-Panel': P.ANAHTAR } }, res => {
    const c = []; res.on('data', x => c.push(x)); res.on('end', () => ok({ kod: res.statusCode, tur: res.headers['content-type'], govde: Buffer.concat(c).toString() }));
  });
  r.on('error', red); r.end();
});
const scpKayit = [];
const scpDurdur = () => { scpKayit.length = 0; P.kanca.scp = args => { scpKayit.push(args); fs.writeFileSync(args[args.length - 1], 'VIDEO:' + args[args.length - 2]); return { status: 0, stderr: '' }; }; };
const ONIZ = path.join(KOK, 'kayit', 'sunucu-onizleme');

test('sunucu-video: bad paths are refused before any scp', async () => {
  yaz('ayarlar/panel.json', { sunucu: { ad: 'S', ssh: 'u@h', kok: '/srv/vm' } });
  scpDurdur();
  for (const y of ['../x.mp4', 'videolar/../x.mp4', 'videolar/a/../../x.mp4', 'videolar/a b.mp4', 'videolar/a.mov', 'kayit/x.mp4', '/etc/x.mp4', 'videolar//x.mp4', 'videolar/./x.mp4', "videolar/a';rm.mp4", 'videolar/x.mp4.mov', '']) {
    const r = await ham('/api/sunucu-video?yol=' + encodeURIComponent(y));
    assert.equal(r.kod, 400, y);
  }
  assert.equal(scpKayit.length, 0);
});

test('sunucu-video: fetched once with the ssh settings, then streamed from the cache', async () => {
  scpDurdur();
  let r = await ham('/api/sunucu-video?yol=' + encodeURIComponent('videolar/k-a-b1/cikti/k-a-b1-ucretsiz.mp4'));
  assert.equal(r.kod, 200); assert.equal(r.tur, 'video/mp4'); assert.equal(r.govde, 'VIDEO:u@h:/srv/vm/videolar/k-a-b1/cikti/k-a-b1-ucretsiz.mp4');
  assert.deepEqual(scpKayit[0].slice(0, 5), ['-q', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8']);
  r = await ham('/api/sunucu-video?yol=' + encodeURIComponent('videolar/k-a-b1/cikti/k-a-b1-ucretsiz.mp4'));
  assert.equal(r.kod, 200); assert.equal(scpKayit.length, 1, 'second view comes from the cache');
  assert.ok(!fs.readdirSync(ONIZ).some(f => f.endsWith('.part')), 'no partial file left');
});

test('sunucu-video: a failed scp is 400 and leaves nothing behind', async () => {
  P.kanca.scp = args => { fs.writeFileSync(args[args.length - 1], 'yarim'); return { status: 1, stderr: 'Permission denied' }; };
  const once = fs.readdirSync(ONIZ).sort();
  const r = await ham('/api/sunucu-video?yol=' + encodeURIComponent('videolar/yok/x.mp4'));
  assert.equal(r.kod, 400); assert.match(JSON.parse(r.govde).hata, /alınamadı/);
  assert.deepEqual(fs.readdirSync(ONIZ).sort(), once);
});

test('sunucu-video: the cache keeps at most 5 files and deletes only its own oldest ones', async () => {
  scpDurdur();
  fs.writeFileSync(path.join(ONIZ, 'baska.txt'), 'x'); fs.writeFileSync(path.join(ONIZ, 'elle.mp4'), 'x');
  const eski = Date.now() / 1000 - 3600;
  for (const f of ['baska.txt', 'elle.mp4']) fs.utimesSync(path.join(ONIZ, f), eski - 9999, eski - 9999);
  const ilk = P.onizlemeAd('videolar/k-a-b1/cikti/k-a-b1-ucretsiz.mp4');
  fs.utimesSync(path.join(ONIZ, ilk), eski - 100, eski - 100);
  const yollar = Array.from({ length: 6 }, (_, i) => `videolar/v${i}/cikti/v${i}.mp4`);
  for (const [i, y] of yollar.entries()) {
    assert.equal((await ham('/api/sunucu-video?yol=' + encodeURIComponent(y))).kod, 200);
    const f = path.join(ONIZ, P.onizlemeAd(y)); fs.utimesSync(f, eski + i, eski + i);   // a clear age order
  }
  const kalan = fs.readdirSync(ONIZ).filter(f => /^[0-9a-f]{12}-/.test(f));
  assert.equal(kalan.length, 5);
  assert.ok(!kalan.includes(ilk) && !kalan.includes(P.onizlemeAd(yollar[0])), 'the two oldest cache files went first');
  for (const y of yollar.slice(1)) assert.ok(kalan.includes(P.onizlemeAd(y)), y);
  assert.ok(fs.existsSync(path.join(ONIZ, 'baska.txt')) && fs.existsSync(path.join(ONIZ, 'elle.mp4')), 'other files are never touched');
});

test('--dizi-metin: bad input is rejected before writing; a series not waiting is refused', () => {
  let r = cli('--dizi-metin', JSON.stringify({ kanal: 'kanal_a', id: 'd1', karar: 'sil' }));
  assert.equal(r.status, 1); assert.match(r.stderr, /^HATA: karar onayla ya da reddet/m);
  r = cli('--dizi-metin', JSON.stringify({ kanal: 'kanal_a', id: 'd1', karar: 'onayla' }));
  assert.equal(r.status, 1); assert.match(r.stderr, /^HATA: Bu hikâyenin metni onay beklemiyor/m);
});
