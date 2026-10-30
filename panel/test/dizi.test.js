// Panel: Diziler page API (list, manual decision, continuation settings) against an in-process server on a temp root.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-dizi-'));
const yaz = (rel, j) => { const f = path.join(KOK, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof j === 'string' ? j : JSON.stringify(j, null, 2)); };
const oku = rel => JSON.parse(fs.readFileSync(path.join(KOK, rel), 'utf8'));
const DZ = 'kayit/dizi/kanal_a/diziler.json', diziOku = id => oku(DZ).diziler.find(d => d.id === id);
const KONU = { _aciklama: 'keep me', kaynaklar: { x: { aktif: false } }, dizi: { gunluk_hedef: 3, onay_donemi: true, onay_gunluk: 2, saatler: ['12:00', '17:00'], bekle_saat: 20, esik_oran: 0.6, ilk_dizi_sayisi: 6, yorum_min: 3, yorum_kelimeleri: ['devam'], kaynak: { eksi_min_fav: 300 }, _not: 'note' }, llm: { yol: 'claude-cli' } };
yaz('kanal/kanal_a/konu.json', KONU); yaz('kanal/kanal_a/kimlik.json', { hesap: 'ornek' });
yaz('kanal/kanal_b/konu.json', { llm: {} });                    // a channel without a dizi block
const b = (n, durum, ekstra = {}) => ({ n, metin: 'bir iki uc', durum, ...ekstra });
const taban = () => ({ diziler: [
  { id: 'd1', kanal: 'kanal_a', baslik: 'Ornek hikaye', baslik_kisa: 'Ornek', kaynak: { tur: 'reddit', url: 'https://example.com/x' }, durum: 'aktif', anlatici: { ses: 'v', ad: 'Burak' },
    bolumler: [b(1, 'yayinda', { video: 'videolar/v1', paylasildi: '2026-10-30T10:00:00Z', link: 'https://example.com/r' }), b(2, 'metin'), b(3, 'metin')] },
  { id: 'd2', kanal: 'kanal_a', baslik: 'Ikinci', baslik_kisa: 'Ikinci', durum: 'aktif',
    bolumler: [b(1, 'olculdu', { karar: 'devam' }), b(2, 'onay-bekliyor', { video: 'videolar/v2', bekleme: 'butce' }), b(3, 'metin')] },
  { id: 'd3', kanal: 'kanal_a', baslik: 'Ucuncu', baslik_kisa: 'Ucuncu', durum: 'aktif',
    bolumler: [b(1, 'kontrol_et', { video: 'videolar/v9', link: 'L', media_id: 'M9' }), b(2, 'metin'), b(3, 'metin')] },
  { id: 'd4', kanal: 'kanal_a', baslik: 'Dorduncu', baslik_kisa: 'Dorduncu', durum: 'aktif',
    bolumler: [b(1, 'kontrol_et', { video: 'videolar/v8', link: 'L' }), b(2, 'metin'), b(3, 'metin')] } ] });
const sifirla = () => yaz(DZ, taban());
sifirla();
yaz('kuyruk/bekleyen/job-2.json', { video: 'videolar/v2', mp4: 'videolar/v2/cikti/a.mp4', onay_gerekli: true, ne_zaman: '2026-11-01T10:00:00Z' });
yaz('videolar/v1/cikti/a.mp4', 'x');

process.argv.push('--kok', KOK);
const P = require('../panel.js');
const srv = P.sunucuYap();
let port;
test.before(() => new Promise(ok => srv.listen(0, '127.0.0.1', () => { port = srv.address().port; ok(); })));
test.after(() => new Promise(ok => srv.close(() => { fs.rmSync(KOK, { recursive: true, force: true }); ok(); })));   // only this test's own temp root

const istek = (method, yol, govde, anahtar = P.ANAHTAR) => new Promise((ok, red) => {
  const r = http.request({ host: '127.0.0.1', port, path: yol, method, headers: { Host: `127.0.0.1:${port}`, 'X-Panel': anahtar, 'Content-Type': 'application/json' } }, res => {
    let t = ''; res.on('data', c => t += c); res.on('end', () => ok({ kod: res.statusCode, j: t ? JSON.parse(t) : null }));
  });
  r.on('error', red); if (govde) r.write(JSON.stringify(govde)); r.end();
});
const ayarGonder = ayar => istek('POST', '/api/dizi/ayar', { kanal: 'kanal_a', ayar });
const karar = (id, n, k, neden) => istek('POST', '/api/dizi/karar', { kanal: 'kanal_a', id, n, karar: k, neden });
const durumlar = id => [diziOku(id).durum, ...diziOku(id).bolumler.map(x => x.durum)];

test('the API refuses a wrong key', async () => {
  assert.equal((await istek('GET', '/api/diziler?kanal=kanal_a', null, 'yanlis')).kod, 401);
});

test('GET /api/diziler: settings, series with queue id, mp4, permissions and no script text', async () => {
  const { kod, j } = await istek('GET', '/api/diziler?kanal=kanal_a');
  assert.equal(kod, 200);
  assert.equal(j.ayar.esik_oran, 0.6); assert.equal(j.ayar_var, true); assert.equal(j.son_kosu, null);
  const [d1, d2, d3, d4] = j.diziler, b1 = d1.bolumler[0], b2 = d2.bolumler[1];
  assert.equal(d1.id, 'd1'); assert.ok(!('metin' in b1));
  assert.equal(b1.mp4, 'videolar/v1/cikti/a.mp4');
  assert.equal(b2.kuyruk_id, 'job-2'); assert.equal(b2.kuyruk_onay_gerekli, true); assert.equal(b2.bekleme, 'butce');
  assert.deepEqual(b1.izin, { devam: true, kes: true, tekrar: false });
  assert.deepEqual(d1.bolumler[1].izin, { devam: false, kes: false, tekrar: false });
  assert.deepEqual(d2.bolumler[0].izin, { devam: false, kes: false, tekrar: false });     // next episode already produced
  assert.deepEqual(d3.bolumler[0].izin, { devam: false, kes: true, tekrar: true });
  assert.equal((await istek('GET', '/api/diziler?kanal=kanal_b')).j.ayar_var, false);
});

test('GET /api/diziler returns son-kosu.json when present; unknown or hostile channel is refused', async () => {
  yaz('kayit/dizi/kanal_a/son-kosu.json', { zaman: '2026-10-30T12:00:00Z', notlar: ['n1'], kararlar: [], uretilecek: [] });
  assert.deepEqual((await istek('GET', '/api/diziler?kanal=kanal_a')).j.son_kosu.notlar, ['n1']);
  assert.equal((await istek('GET', '/api/diziler?kanal=kanal_a')).j.reddedilen_toplam, 0);
  yaz('kayit/dizi/kanal_a/reddedilen.json', { reddedilen: [{ kaynak: 'eksi', id: 'eksi-1', neden: 'kisa', zaman: 'z' }, { kaynak: 'reddit', id: 'reddit-2', neden: 'sadakat', zaman: 'z' }] });
  assert.equal((await istek('GET', '/api/diziler?kanal=kanal_a')).j.reddedilen_toplam, 2);
  for (const k of ['yok_kanal', '../kacak', '']) { const r = await istek('GET', '/api/diziler?kanal=' + encodeURIComponent(k)); assert.equal(r.kod, 400, k); assert.match(r.j.hata, /kanal/); }
});

test('kes: elle:true, the series is cut and later text episodes are skipped at once', async () => {
  const r = await karar('d1', 1, 'kes', 'sıkıcı');
  assert.equal(r.kod, 200); assert.deepEqual(r.j, { ok: true });
  const d = diziOku('d1'), e = d.bolumler[0];
  assert.deepEqual([e.elle, e.karar, e.karar_neden], [true, 'kes', 'sıkıcı']);
  assert.equal(e.metin, 'bir iki uc', 'other fields stay');
  assert.deepEqual(durumlar('d1'), ['kesildi', 'yayinda', 'atlandi', 'atlandi']);
  assert.equal((await karar('d1', 1, 'kes')).kod, 400, 'a second kes does nothing, so it is refused');
});

test('devam on the cut series reactivates it and puts the skipped episodes back to metin', async () => {
  assert.equal((await karar('d1', 1, 'devam', 'yine de')).kod, 200);
  assert.deepEqual(durumlar('d1'), ['aktif', 'yayinda', 'metin', 'metin']);
  assert.deepEqual([diziOku('d1').bolumler[0].karar, diziOku('d1').bolumler[0].elle], ['devam', true]);
  const r = await karar('d1', 1, 'devam'); assert.equal(r.kod, 400); assert.match(r.j.hata, /zaten devam/);
});

test('refusals are 400 with a Turkish message and change nothing', async () => {
  sifirla();
  const once = fs.readFileSync(path.join(KOK, DZ), 'utf8');
  const g = (o) => istek('POST', '/api/dizi/karar', { kanal: 'kanal_a', id: 'd1', n: 1, karar: 'devam', ...o });
  for (const [o, re] of [[{ kanal: '../x' }, /kanal/], [{ kanal: 'yok' }, /kanal/], [{ id: 'nope' }, /dizi yok/], [{ n: 0 }, /bölüm numarası/], [{ n: 4 }, /bölüm numarası/], [{ n: 1.5 }, /bölüm numarası/], [{ n: '1' }, /bölüm numarası/], [{ karar: 'bekle' }, /devam ya da kes/], [{ karar: undefined }, /devam ya da kes/],
    [{ id: 'd1', n: 2, karar: 'kes' }, /yayında değil/], [{ id: 'd2', n: 1, karar: 'kes' }, /üretime girdi/], [{ id: 'd2', n: 1, karar: 'devam' }, /üretime girdi/], [{ id: 'd1', n: 3, karar: 'kes' }, /yayında değil/], [{ id: 'd3', n: 1, karar: 'devam' }, /yalnız Kes/]]) {
    const r = await g(o); assert.equal(r.kod, 400, JSON.stringify(o)); assert.match(r.j.hata, re, JSON.stringify(o));
  }
  assert.equal(fs.readFileSync(path.join(KOK, DZ), 'utf8'), once);
});

test('kontrol_et: Kes cuts the series; Tekrar dene returns to yayinda with a media_id, to metin without one', async () => {
  sifirla();
  assert.equal((await karar('d3', 1, 'kes')).kod, 200);
  assert.deepEqual(durumlar('d3'), ['kesildi', 'kontrol_et', 'atlandi', 'atlandi']);
  assert.ok(!diziOku('d3').bolumler[0].elle);
  sifirla();
  const t = (id, n = 1) => istek('POST', '/api/dizi/tekrar', { kanal: 'kanal_a', id, n });
  assert.equal((await t('d3')).kod, 200);
  const e3 = diziOku('d3').bolumler[0]; assert.deepEqual([e3.durum, e3.video, e3.media_id], ['yayinda', 'videolar/v9', 'M9']);
  assert.equal((await t('d4')).kod, 200);
  const e4 = diziOku('d4').bolumler[0]; assert.deepEqual([e4.durum, 'video' in e4, 'link' in e4], ['metin', false, false]);
  const r = await t('d1'); assert.equal(r.kod, 400); assert.match(r.j.hata, /kontrol bekleyen/);
  assert.equal((await istek('POST', '/api/dizi/tekrar', { kanal: '../x', id: 'd3', n: 1 })).kod, 400);
});

test('a running scheduler holds the lock: 409, nothing is written', async () => {
  sifirla();
  const kilit = path.join(KOK, 'kayit', 'dizi', 'kanal_a', '.kilit'), once = fs.readFileSync(path.join(KOK, DZ), 'utf8');
  fs.writeFileSync(kilit, JSON.stringify({ pid: process.pid, zaman: new Date().toISOString() }));
  try {
    const r = await karar('d1', 1, 'kes');
    assert.equal(r.kod, 409); assert.equal(r.j.hata, 'Zamanlayıcı şu an çalışıyor, birkaç dakika sonra tekrar dene');
    assert.equal((await istek('POST', '/api/dizi/tekrar', { kanal: 'kanal_a', id: 'd3', n: 1 })).kod, 409);
    assert.equal(fs.readFileSync(path.join(KOK, DZ), 'utf8'), once);
    assert.equal((await ayarGonder({ bekle_saat: 21 })).kod, 200, 'settings do not need the lock');
  } finally { fs.unlinkSync(kilit); }
  assert.equal((await karar('d1', 1, 'kes')).kod, 200);
  assert.ok(!fs.existsSync(kilit), 'the panel releases its own lock');
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

test('hesapTemiz trims before and after the @: " @Foo " becomes foo', () => {
  yaz('kanal/kanal_h/konu.json', {}); yaz('kanal/kanal_h/kimlik.json', { hesap: ' @Foo ' });
  assert.equal(P.ekleHesap({ kanal: 'kanal_h' }), 'foo');
});
