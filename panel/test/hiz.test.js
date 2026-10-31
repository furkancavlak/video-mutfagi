// Fast open: the short server cache (TTL, one ssh run per identical call, writes empty it), the warm-up on ozet,
// and episode covers as calendar stills (path rule, cache key, API fields, the server copy). ssh/scp/ffmpeg stubbed.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-hiz-'));
const yaz = (rel, icerik) => { const f = path.join(KOK, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof icerik === 'string' ? icerik : JSON.stringify(icerik)); };
yaz('kanal/kanal_a/konu.json', { dizi: {} });
yaz('kanal/kanal_a/kimlik.json', { hesap: '@hesap_a' });
yaz('ayarlar/panel.json', { sunucu: { ad: 'S', ssh: 'u@h', kok: '/srv/vm' } });
yaz('videolar/v1/cikti/v1-kapak.jpg', 'KAPAK1');
yaz('videolar/v1/cikti/kareler-ucretsiz/frame-00-at-1s.png', 'KARE');
yaz('videolar/v2/cikti/son-kare.png', 'SON');
yaz('kuyruk/bekleyen/is1.json', { mp4: 'videolar/v1/cikti/v1.mp4', video: 'videolar/v1', kapak: 'videolar/v1/cikti/v1-kapak.jpg', hesap: 'hesap_a', ne_zaman: '2026-11-01T10:00:00Z' });
yaz('kuyruk/bekleyen/is2.json', { mp4: 'videolar/v2/cikti/v2.mp4', video: 'videolar/v2', hesap: 'hesap_a', ne_zaman: '2026-11-01T11:00:00Z' });
yaz('kayit/dizi/kanal_a/diziler.json', { diziler: [{ id: 'd1', kanal: 'kanal_a', baslik: 'B', durum: 'aktif', bolumler: [{ n: 1, durum: 'paylasildi', video: 'videolar/v1' }, { n: 2, durum: 'metin', video: 'videolar/v2' }] }] });

process.argv.push('--kok', KOK);
const P = require('../panel.js');
const srv = P.sunucuYap();
let port;
test.before(() => new Promise(ok => srv.listen(0, '127.0.0.1', () => { port = srv.address().port; ok(); })));
test.after(() => new Promise(ok => srv.close(() => { fs.rmSync(KOK, { recursive: true, force: true }); ok(); })));   // only this test's own temp root
const istek = (method, yol, govde) => new Promise((ok, red) => {
  const r = http.request({ host: '127.0.0.1', port, path: yol, method, headers: { Host: `127.0.0.1:${port}`, 'X-Panel': P.ANAHTAR, 'Content-Type': 'application/json' } }, res => {
    const p = []; res.on('data', c => p.push(c)); res.on('end', () => { const t = Buffer.concat(p).toString(); let j = null; try { j = JSON.parse(t); } catch { } ok({ kod: res.statusCode, tur: res.headers['content-type'], govde: t, j }); });
  });
  r.on('error', red); if (govde) r.write(JSON.stringify(govde)); r.end();
});
const bekle = ms => new Promise(ok => setTimeout(ok, ms));
// a slow fake ssh that numbers its runs
function sahteSsh(gecikme = 30) {
  const kayit = [];
  P.kanca.sunucuda = async komut => { kayit.push(komut); await bekle(gecikme); return JSON.stringify({ n: kayit.length }); };
  return kayit;
}

test('cache: identical calls in flight share one ssh run; a repeat within the TTL needs none; taze=1 goes again', async () => {
  const kayit = sahteSsh();
  const [a, b] = await Promise.all([istek('GET', '/api/diziler?kanal=kanal_a&makine=sunucu'), istek('GET', '/api/diziler?kanal=kanal_a&makine=sunucu')]);
  assert.equal(kayit.length, 1); assert.deepStrictEqual(a.j, { n: 1 }); assert.deepStrictEqual(b.j, { n: 1 });
  assert.deepStrictEqual((await istek('GET', '/api/diziler?kanal=kanal_a&makine=sunucu')).j, { n: 1 });
  assert.equal(kayit.length, 1);
  assert.deepStrictEqual((await istek('GET', '/api/diziler?kanal=kanal_a&makine=sunucu&taze=1')).j, { n: 2 });
  // a different command is its own entry
  await istek('GET', '/api/takipci?hesap=hesap_a&makine=sunucu');
  assert.equal(kayit.length, 3); assert.match(kayit[2], /--takipci/);
});

test('cache: an entry older than the TTL is read again', async () => {
  const kayit = sahteSsh(1), asil = Date.now;
  await P.sunucuOku('panel/panel.js --ttl-deneme');
  await P.sunucuOku('panel/panel.js --ttl-deneme');
  assert.equal(kayit.length, 1);
  try {
    Date.now = () => asil() + P.SUNUCU_TTL + 1000;
    await P.sunucuOku('panel/panel.js --ttl-deneme');
    assert.equal(kayit.length, 2);
  } finally { Date.now = asil; }
});

test('cache: a write empties it, and a read that started before the write is not kept', async () => {
  const kayit = sahteSsh(40);
  await istek('GET', '/api/diziler?kanal=kanal_a&makine=sunucu');
  assert.equal(kayit.length, 1);
  const r = await istek('POST', '/api/dizi/karar', { makine: 'sunucu', kanal: 'kanal_a', id: 'd1', n: 1, karar: 'devam' });
  assert.equal(r.kod, 200); assert.match(kayit[1], /--dizi-karar/);
  await istek('GET', '/api/diziler?kanal=kanal_a&makine=sunucu');
  assert.equal(kayit.length, 3, 'read again after the write');
  // read in flight while a write lands: its answer goes back to its caller but is not cached
  const okuma = istek('GET', '/api/istatistik?hesap=hesap_a&gun=7&makine=sunucu');
  await bekle(5);
  await istek('POST', '/api/kuyruk/onayla', { makine: 'sunucu', id: 'is1' });
  await okuma;
  const once = kayit.length;
  await istek('GET', '/api/istatistik?hesap=hesap_a&gun=7&makine=sunucu');
  assert.equal(kayit.length, once + 1);
});

test('cache: a failure is never cached', async () => {
  let n = 0;
  P.kanca.sunucuda = async () => { n++; if (n === 1) throw new Error('ağ yok'); return '{"ok":true}'; };
  assert.equal((await istek('GET', '/api/takipci?hesap=hesap_a&makine=sunucu')).kod, 400);
  assert.deepStrictEqual((await istek('GET', '/api/takipci?hesap=hesap_a&makine=sunucu')).j, { ok: true });
  assert.equal(n, 2);
});

test('ozet starts the opening server reads at once, and the page\'s own calls join them', async () => {
  const kayit = sahteSsh(40);
  const o = await istek('GET', '/api/ozet?kanal=kanal_a');
  assert.equal(o.kod, 200);
  await bekle(5);
  assert.equal(kayit.length, 5);
  for (const b of ['--ozet --kanal', '--diziler', '--instagram', '--takipci', '--istatistik']) assert.ok(kayit.some(k => k.includes(b)), b);
  await Promise.all([istek('GET', '/api/sunucu?kanal=kanal_a'), istek('GET', '/api/diziler?kanal=kanal_a&makine=sunucu'), istek('GET', '/api/instagram?hesap=hesap_a&makine=sunucu'),
    istek('GET', '/api/takipci?hesap=hesap_a&makine=sunucu'), istek('GET', '/api/istatistik?hesap=hesap_a&gun=7&makine=sunucu')]);
  assert.equal(kayit.length, 5, 'no second ssh run');
});

test('cover path rule: only videolar/<ad>/cikti/<ad>-kapak.jpg', () => {
  assert.equal(P.kapakJpgYolu('videolar/a-b.1/cikti/a-b.1-kapak.jpg'), 'videolar/a-b.1/cikti/a-b.1-kapak.jpg');
  for (const y of ['videolar/a/cikti/b-kapak.jpg', 'videolar/../cikti/..-kapak.jpg', 'videolar/a/cikti/a-kapak.png', 'videolar/a/x/cikti/a-kapak.jpg', '/etc/videolar/a/cikti/a-kapak.jpg',
    'videolar/a/cikti/a-kapak.jpg/../../x', '../videolar/a/cikti/a-kapak.jpg', 'videolar/a b/cikti/a b-kapak.jpg', 'videolar/a/cikti/a-kapak.jpg;rm', '', null])
    assert.throws(() => P.kapakJpgYolu(y), /kapak yolu/, String(y));
});

test('cover cache key: folder + remote stamp; a redrawn cover gets a new file', () => {
  const y = 'videolar/v1/cikti/v1-kapak.jpg';
  assert.equal(P.kucukAd(y, '1-2'), P.kucukAd(y, '1-2'));
  assert.notEqual(P.kucukAd(y, '1-2'), P.kucukAd(y, '1-3'));
  assert.notEqual(P.kucukAd(y, '1-2'), P.kucukAd('videolar/v9/cikti/v9-kapak.jpg', '1-2'));
  assert.match(P.kucukAd(y, '1-2'), /^[0-9a-f]{12}-v1-kapak\.jpg$/);
});

test('API: queue jobs and episodes carry kapak_jpg + kapak_imza only when the cover exists', async () => {
  const st = fs.statSync(path.join(KOK, 'videolar/v1/cikti/v1-kapak.jpg')), imza = `${Math.round(st.mtimeMs)}-${st.size}`;
  const K = P.kuyrukOzet('kanal_a');
  const j1 = K.kuyruk.find(x => x.id === 'is1'), j2 = K.kuyruk.find(x => x.id === 'is2');
  assert.equal(j1.kapak_jpg, 'videolar/v1/cikti/v1-kapak.jpg'); assert.equal(j1.kapak_imza, imza);
  assert.ok(!('kapak_jpg' in j2) && !('kapak_imza' in j2));
  const d = (await istek('GET', '/api/diziler?kanal=kanal_a')).j.diziler[0];
  assert.equal(d.bolumler[0].kapak_jpg, 'videolar/v1/cikti/v1-kapak.jpg'); assert.equal(d.bolumler[0].kapak_imza, imza);
  assert.ok(!('kapak_jpg' in d.bolumler[1]));
  assert.deepStrictEqual(P.kapakAlan('videolar/../kanal'), {}); assert.deepStrictEqual(P.kapakAlan('baska/v1'), {});
});

test('local /api/kapak: the episode cover wins over frames, as a small copy; ffmpeg missing keeps the original', async () => {
  const cagri = [];
  P.kanca.ffmpeg = async args => { cagri.push(args); fs.writeFileSync(args[args.length - 1], 'KUCUK'); return 0; };
  const r = await istek('GET', '/api/kapak?v=videolar/v1');
  assert.equal(r.kod, 200); assert.equal(r.tur, 'image/jpeg'); assert.equal(r.govde, 'KUCUK');
  assert.ok(cagri[0].join(' ').includes('scale=216:384'));
  await istek('GET', '/api/kapak?v=videolar/v1');
  assert.equal(cagri.length, 1, 'served from the small-copy cache');
  const s = await istek('GET', '/api/kapak?v=videolar/v2');
  assert.equal(s.tur, 'image/png'); assert.equal(s.govde, 'SON');   // no cover: the old still
  // a redrawn cover without ffmpeg: the full image is kept
  P.kanca.ffmpeg = async () => 1;
  const t = new Date(Date.now() + 5000); fs.writeFileSync(path.join(KOK, 'videolar/v1/cikti/v1-kapak.jpg'), 'KAPAK1-YENI'); fs.utimesSync(path.join(KOK, 'videolar/v1/cikti/v1-kapak.jpg'), t, t);
  assert.equal((await istek('GET', '/api/kapak?v=videolar/v1')).govde, 'KAPAK1-YENI');
});

test('server /api/sunucu-kapak: one scp per cover+stamp (shared while in flight), cached on disk; bad input never reaches scp', async () => {
  const scp = [];
  P.kanca.ffmpeg = async args => { fs.copyFileSync(args[args.indexOf('-i') + 1], args[args.length - 1]); return 0; };
  P.kanca.scp = async args => { scp.push(args); await bekle(20); fs.writeFileSync(args[args.length - 1], 'SV:' + args[args.length - 2]); return { status: 0, stderr: '' }; };
  const y = 'videolar/v7/cikti/v7-kapak.jpg', url = i => `/api/sunucu-kapak?yol=${encodeURIComponent(y)}&i=${i}`;
  const [a, b] = await Promise.all([istek('GET', url('100-5')), istek('GET', url('100-5'))]);
  assert.equal(a.kod, 200); assert.equal(a.tur, 'image/jpeg'); assert.equal(a.govde, 'SV:u@h:/srv/vm/' + y); assert.equal(b.govde, a.govde);
  assert.equal(scp.length, 1);
  await istek('GET', url('100-5'));
  assert.equal(scp.length, 1, 'disk cache');
  await istek('GET', url('200-5'));
  assert.equal(scp.length, 2, 'a new stamp fetches again');
  for (const [yol, i] of [['videolar/../x/cikti/x-kapak.jpg', '1-1'], ['videolar/v7/cikti/v8-kapak.jpg', '1-1'], [y, 'abc'], [y, ''], [y, '1-1;rm']]) {
    const r = await istek('GET', `/api/sunucu-kapak?yol=${encodeURIComponent(yol)}&i=${encodeURIComponent(i)}`);
    assert.equal(r.kod, 400, yol + ' ' + i);
  }
  assert.equal(scp.length, 2);
  // a failed copy answers an error and leaves nothing behind
  P.kanca.scp = async () => ({ status: 1, stderr: 'No such file' });
  const r = await istek('GET', `/api/sunucu-kapak?yol=${encodeURIComponent('videolar/v8/cikti/v8-kapak.jpg')}&i=1-1`);
  assert.equal(r.kod, 400); assert.match(r.j.hata, /alınamadı/);
  assert.deepStrictEqual(fs.readdirSync(P.KUCUK).filter(x => !/^[0-9a-f]{12}-v[17]-kapak\.jpg$/.test(x)), []);
});

test('every child process the panel starts hides its window (no console pops up over a fullscreen app)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'panel.js'), 'utf8').split('\n');
  const satir = src.filter(l => /\b(spawn|spawnSync|execFileSync|execFile|execSync|exec)\(/.test(l) && !/^\s*\/\//.test(l) && !/\.exec\(/.test(l));
  assert.ok(satir.length >= 8);
  for (const l of satir) assert.match(l, /windowsHide: true/, l.trim().slice(0, 120));
});
