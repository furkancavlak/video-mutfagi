// Panel: Diziler page API (list, manual decision, continuation settings) against an in-process server on a temp root.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-dizi-'));
const yaz = (rel, j) => { const f = path.join(KOK, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof j === 'string' ? j : JSON.stringify(j, null, 2)); };
const oku = rel => JSON.parse(fs.readFileSync(path.join(KOK, rel), 'utf8'));
const KONU = { _aciklama: 'keep me', kaynaklar: { x: { aktif: false } }, dizi: { gunluk_hedef: 3, onay_donemi: true, onay_gunluk: 2, saatler: ['12:00', '17:00'], bekle_saat: 20, esik_oran: 0.6, ilk_dizi_sayisi: 6, yorum_min: 3, yorum_kelimeleri: ['devam'], kaynak: { eksi_min_fav: 300 }, _not: 'note' }, llm: { yol: 'claude-cli' } };
yaz('kanal/kanal_a/konu.json', KONU); yaz('kanal/kanal_a/kimlik.json', { hesap: 'ornek' });
const DIZI = { id: 'd1', kanal: 'kanal_a', baslik: 'Ornek hikaye', baslik_kisa: 'Ornek', kaynak: { tur: 'reddit', url: 'https://example.com/x' }, durum: 'aktif', anlatici: { ses: 'v', ad: 'Burak' },
  bolumler: [{ n: 1, metin: 'bir iki uc', durum: 'yayinda', video: 'videolar/v1', paylasildi: '2026-10-30T10:00:00Z', link: 'https://example.com/r' }, { n: 2, metin: 'x', durum: 'onay-bekliyor', video: 'videolar/v2', bekleme: 'butce' }, { n: 3, metin: 'x', durum: 'metin' }] };
yaz('kayit/dizi/kanal_a/diziler.json', { diziler: [DIZI] });
yaz('kuyruk/bekleyen/job-2.json', { video: 'videolar/v2', mp4: 'videolar/v2/cikti/a.mp4', onay_gerekli: true, ne_zaman: '2026-11-01T10:00:00Z' });
yaz('videolar/v1/cikti/a.mp4', 'x');

process.argv.push('--kok', KOK);
const P = require('../panel.js');
const srv = P.sunucuYap();
let port;
test.before(() => new Promise(ok => srv.listen(0, '127.0.0.1', () => { port = srv.address().port; ok(); })));
test.after(() => new Promise(ok => srv.close(ok)));

const istek = (method, yol, govde, anahtar = P.ANAHTAR) => new Promise((ok, red) => {
  const r = http.request({ host: '127.0.0.1', port, path: yol, method, headers: { Host: `127.0.0.1:${port}`, 'X-Panel': anahtar, 'Content-Type': 'application/json' } }, res => {
    let b = ''; res.on('data', c => b += c); res.on('end', () => ok({ kod: res.statusCode, j: b ? JSON.parse(b) : null }));
  });
  r.on('error', red); if (govde) r.write(JSON.stringify(govde)); r.end();
});
const ayarGonder = ayar => istek('POST', '/api/dizi/ayar', { kanal: 'kanal_a', ayar });

test('the API refuses a wrong key', async () => {
  assert.equal((await istek('GET', '/api/diziler?kanal=kanal_a', null, 'yanlis')).kod, 401);
});

test('GET /api/diziler: settings, series with queue id, mp4 and no script text', async () => {
  const { kod, j } = await istek('GET', '/api/diziler?kanal=kanal_a');
  assert.equal(kod, 200);
  assert.equal(j.ayar.esik_oran, 0.6); assert.equal(j.son_kosu, null);
  const d = j.diziler[0], [b1, b2] = d.bolumler;
  assert.equal(d.id, 'd1'); assert.ok(!('metin' in b1));
  assert.equal(b1.mp4, 'videolar/v1/cikti/a.mp4');
  assert.equal(b2.kuyruk_id, 'job-2'); assert.equal(b2.kuyruk_onay_gerekli, true); assert.equal(b2.bekleme, 'butce');
});

test('GET /api/diziler returns son-kosu.json when present; unknown or hostile channel is refused', async () => {
  yaz('kayit/dizi/kanal_a/son-kosu.json', { zaman: '2026-10-30T12:00:00Z', notlar: ['n1'], kararlar: [], uretilecek: [] });
  assert.deepEqual((await istek('GET', '/api/diziler?kanal=kanal_a')).j.son_kosu.notlar, ['n1']);
  for (const k of ['yok_kanal', '../kacak', '']) { const r = await istek('GET', '/api/diziler?kanal=' + encodeURIComponent(k)); assert.equal(r.kod, 400, k); assert.match(r.j.hata, /kanal/); }
});

test('POST /api/dizi/karar sets elle:true in diziler.json', async () => {
  const r = await istek('POST', '/api/dizi/karar', { kanal: 'kanal_a', id: 'd1', n: 1, karar: 'kes', neden: 'sıkıcı' });
  assert.equal(r.kod, 200); assert.deepEqual(r.j, { ok: true });
  const b = oku('kayit/dizi/kanal_a/diziler.json').diziler[0].bolumler[0];
  assert.deepEqual([b.elle, b.karar, b.karar_neden], [true, 'kes', 'sıkıcı']);
  assert.equal(b.metin, 'bir iki uc', 'other fields stay');
});

test('POST /api/dizi/karar validates channel, series, n and decision', async () => {
  const g = o => istek('POST', '/api/dizi/karar', { kanal: 'kanal_a', id: 'd1', n: 1, karar: 'devam', ...o });
  for (const o of [{ kanal: '../x' }, { kanal: 'yok' }, { id: 'nope' }, { n: 0 }, { n: 4 }, { n: 1.5 }, { n: '1' }, { karar: 'bekle' }, { karar: undefined }]) {
    const r = await g(o); assert.equal(r.kod, 400, JSON.stringify(o)); assert.ok(r.j.hata);
  }
  assert.equal((await g({ karar: 'devam' })).kod, 200);
});

test('POST /api/dizi/ayar: out-of-range values are 400 with a Turkish message and write nothing', async () => {
  const once = fs.readFileSync(path.join(KOK, 'kanal/kanal_a/konu.json'), 'utf8');
  const kotu = [{ esik_oran: 2 }, { esik_oran: 0.05 }, { esik_oran: '0.5' }, { bekle_saat: 5 }, { bekle_saat: 73 }, { gunluk_hedef: 0 }, { gunluk_hedef: 6 }, { gunluk_hedef: 2.5 },
    { onay_gunluk: 0 }, { onay_gunluk: 6 }, { onay_donemi: 'evet' }, { saatler: ['25:00'] }, { saatler: ['9:00'] }, { saatler: [] }, { saatler: '12:00' }, { saatler: ['12:60'] },
    { ilk_dizi_sayisi: -1 }, { yorum_kelimeleri: 'devam' }, { yorum_kelimeleri: [1] }, { bilinmeyen: 1 }];
  for (const a of kotu) { const r = await ayarGonder(a); assert.equal(r.kod, 400, JSON.stringify(a)); assert.match(r.j.hata, /\S/); }
  assert.equal((await ayarGonder(2)).kod, 400);
  assert.equal((await istek('POST', '/api/dizi/ayar', { kanal: '../x', ayar: { esik_oran: 0.5 } })).kod, 400);
  assert.equal(fs.readFileSync(path.join(KOK, 'kanal/kanal_a/konu.json'), 'utf8'), once);
  assert.match((await ayarGonder({ esik_oran: 2 })).j.hata, /eşik/i);
});

test('POST /api/dizi/ayar: a valid body is written and every other key is kept', async () => {
  const r = await ayarGonder({ esik_oran: 0.5, bekle_saat: 24, gunluk_hedef: 2, onay_gunluk: 1, onay_donemi: false, saatler: ['09:30', '21:00'], ilk_dizi_sayisi: 4, yorum_min: 2, yorum_kelimeleri: ['devam', 'sonra'] });
  assert.equal(r.kod, 200); assert.equal(r.j.ok, true);
  const k = oku('kanal/kanal_a/konu.json');
  assert.deepEqual([k.dizi.esik_oran, k.dizi.bekle_saat, k.dizi.gunluk_hedef, k.dizi.onay_gunluk, k.dizi.onay_donemi], [0.5, 24, 2, 1, false]);
  assert.deepEqual(k.dizi.saatler, ['09:30', '21:00']); assert.deepEqual(k.dizi.yorum_kelimeleri, ['devam', 'sonra']);
  assert.deepEqual(k.dizi.kaynak, { eksi_min_fav: 300 }); assert.equal(k.dizi._not, 'note');
  assert.equal(k._aciklama, 'keep me'); assert.deepEqual(k.kaynaklar, KONU.kaynaklar); assert.deepEqual(k.llm, KONU.llm);
  assert.deepEqual(fs.readdirSync(path.join(KOK, 'kanal/kanal_a')).sort(), ['kimlik.json', 'konu.json'], 'no temp file left behind');
  assert.equal((await istek('GET', '/api/diziler?kanal=kanal_a')).j.ayar.esik_oran, 0.5);
});

test('POST /api/dizi/ayar: a partial body changes only the given keys', async () => {
  assert.equal((await ayarGonder({ bekle_saat: 30 })).kod, 200);
  const k = oku('kanal/kanal_a/konu.json');
  assert.equal(k.dizi.bekle_saat, 30); assert.equal(k.dizi.esik_oran, 0.5); assert.equal(k.dizi.gunluk_hedef, 2);
});
