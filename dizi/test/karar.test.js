// Offline tests for the series store and the continue/cut decision (pure, no network).
//   node --test "dizi/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { kararVer, elleKarar, yukle, kaydet } = require('../dizi');

const AYAR = { bekle_saat: 20, esik_oran: 0.6, ilk_dizi_sayisi: 6, yorum_min: 3 };
const T0 = Date.parse('2026-10-30T10:00:00Z');
const saatSonra = h => new Date(T0 + h * 3600e3);
const bolum = (n, views, ekstra = {}) => ({ n, metin: 'x', durum: 'olculdu', paylasildi: new Date(T0).toISOString(), metrik: { views, reach: null, likes: null, comments: null, shares: null, saved: null }, ...ekstra });
const dizi = (id, durum, views) => ({ id, kanal: 'k', baslik: id, durum, bolumler: views.map((v, i) => bolum(i + 1, v)) });
// six finished stories; ep1 = 2000, ep2 = 1100 (retention 0.55), ep3 = 600
const gecmis = () => Array.from({ length: 6 }, (_, i) => dizi('g' + i, i % 2 ? 'bitti' : 'kesildi', [2000, 1100, 600]));

test('posted 10 h ago waits for the 20 h mark', () => {
  const d = dizi('a', 'aktif', [1000]);
  const r = kararVer(d, 1, gecmis(), AYAR, saatSonra(10));
  assert.strictEqual(r.karar, 'bekle');
  assert.match(r.neden, /20 saat/);
});

test('missing views at 25 h waits, never cuts', () => {
  const d = dizi('a', 'aktif', [null]);
  assert.strictEqual(kararVer(d, 1, gecmis(), AYAR, saatSonra(25)).karar, 'bekle');
});

test('fewer than 6 finished stories never cuts', () => {
  const d = dizi('a', 'aktif', [200]);
  const r = kararVer(d, 1, gecmis().slice(0, 5), AYAR, saatSonra(25));
  assert.strictEqual(r.karar, 'devam');
});

test('episode 1 below 0.6 x past ep-1 average is cut', () => {
  const d = dizi('a', 'aktif', [1000]);
  assert.strictEqual(kararVer(d, 1, gecmis(), AYAR, saatSonra(25)).karar, 'kes');
});

test('episode 2 retention 0.30 vs past 0.55 is cut', () => {
  const d = dizi('a', 'aktif', [1000, 300]);
  assert.strictEqual(kararVer(d, 2, gecmis(), AYAR, saatSonra(25)).karar, 'kes');
});

test('comment override keeps the story going', () => {
  const d = dizi('a', 'aktif', [1000, 300]);
  d.bolumler[1].yorum_devam = 3;
  const r = kararVer(d, 2, gecmis(), AYAR, saatSonra(25));
  assert.strictEqual(r.karar, 'devam');
  assert.match(r.neden, /yorum/);
});

test('manual decision is returned unchanged and elleKarar sets it', () => {
  const d = dizi('a', 'aktif', [1000, 300]);
  elleKarar(d, 2, 'devam', 'Furkan istedi');
  assert.strictEqual(d.bolumler[1].elle, true);
  const r = kararVer(d, 2, gecmis(), AYAR, saatSonra(25));
  assert.deepStrictEqual(r, { karar: 'devam', neden: 'Furkan istedi' });
});

test('yukle/kaydet round-trip, empty store when missing', () => {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'dizi-'));
  assert.deepStrictEqual(yukle(kok, 'k'), { diziler: [] });
  kaydet(kok, 'k', { diziler: [dizi('a', 'aktif', [1])] });
  assert.strictEqual(yukle(kok, 'k').diziler[0].id, 'a');
  assert.ok(fs.existsSync(path.join(kok, 'kayit', 'dizi', 'k', 'diziler.json')));
});

// ---- manual decisions with their consequence (panel)
const { kararHata, kararUygula, tekrarHata, tekrarDene, kilitAl } = require('../dizi');
const seri = (durumlar, ekstra = {}) => ({ id: 's', durum: 'aktif', bolumler: durumlar.map((d, i) => ({ n: i + 1, metin: 'x', durum: d, ...(ekstra[i + 1] || {}) })) });

test('kes on a yayinda episode cuts the series and skips later text episodes', () => {
  const s = seri(['yayinda', 'metin', 'metin']);
  kararUygula(s, 1, 'kes', 'neden');
  assert.deepStrictEqual([s.durum, ...s.bolumler.map(b => b.durum)], ['kesildi', 'yayinda', 'atlandi', 'atlandi']);
  assert.deepStrictEqual([s.bolumler[0].elle, s.bolumler[0].karar], [true, 'kes']);
});

test('devam on a cut series reactivates it and restores the skipped episodes', () => {
  const s = seri(['olculdu', 'atlandi', 'atlandi']); s.durum = 'kesildi'; s.bolumler[0].karar = 'kes';
  kararUygula(s, 1, 'devam', 'x');
  assert.deepStrictEqual([s.durum, ...s.bolumler.map(b => b.durum)], ['aktif', 'olculdu', 'metin', 'metin']);
  assert.strictEqual(s.bolumler[0].karar, 'devam');
});

test('yayinda + devam on an active series is stored once, a repeat is refused', () => {
  const s = seri(['yayinda', 'metin', 'metin']);
  kararUygula(s, 1, 'devam', 'x');
  assert.match(kararHata(s, 1, 'devam'), /zaten devam/);
});

test('the next episode may be metin, atlandi or uretimde without a video; anything further is refused', () => {
  assert.strictEqual(kararHata(seri(['yayinda', 'uretimde', 'metin']), 1, 'kes'), null);
  assert.match(kararHata(seri(['yayinda', 'uretimde', 'metin'], { 2: { video: 'v' } }), 1, 'kes'), /üretime girdi/);
  for (const d of ['sirada', 'onay-bekliyor', 'yayinda', 'olculdu', 'kontrol_et']) assert.match(kararHata(seri(['yayinda', d, 'metin']), 1, 'kes'), /üretime girdi/, d);
});

test('refusals: episode not published, atlandi, the last episode, a finished series, a repeated kes', () => {
  assert.match(kararHata(seri(['metin', 'metin', 'metin']), 1, 'kes'), /yayında değil/);
  const k = seri(['olculdu', 'atlandi', 'atlandi']); k.durum = 'kesildi';
  assert.match(kararHata(k, 2, 'kes'), /yayında değil/);
  assert.match(kararHata(k, 1, 'kes'), /zaten kesilmiş/);
  assert.match(kararHata(seri(['olculdu', 'olculdu', 'yayinda']), 3, 'devam'), /Son bölüm/);
  const b = seri(['olculdu', 'olculdu', 'olculdu']); b.durum = 'bitti';
  assert.match(kararHata(b, 1, 'devam'), /bitti/);
  assert.match(kararHata(seri(['olculdu', 'metin', 'metin']), 1, 'devam'), /zaten devam/);
  assert.throws(() => kararUygula(seri(['metin', 'metin', 'metin']), 1, 'kes', 'x'), /yayında değil/);
  assert.match(kararHata(seri(['yayinda']), 9, 'kes'), /yok/);
});

test('kontrol_et: Kes cuts the series without storing a decision; devam is refused', () => {
  const s = seri(['kontrol_et', 'metin', 'metin']);
  assert.match(kararHata(s, 1, 'devam'), /yalnız Kes/);
  kararUygula(s, 1, 'kes', 'x');
  assert.deepStrictEqual([s.durum, ...s.bolumler.map(b => b.durum)], ['kesildi', 'kontrol_et', 'atlandi', 'atlandi']);
  assert.ok(!s.bolumler[0].elle);
});

test('tekrarDene: with a media_id back to yayinda (video kept), without one back to metin (video/link dropped)', () => {
  const a = seri(['kontrol_et', 'metin', 'metin'], { 1: { media_id: 'M', video: 'v', link: 'L', karar_neden: 'hata', bekleme: 'butce' } });
  tekrarDene(a, 1);
  assert.deepStrictEqual([a.bolumler[0].durum, a.bolumler[0].video, a.bolumler[0].media_id, a.bolumler[0].karar_neden, a.bolumler[0].bekleme], ['yayinda', 'v', 'M', undefined, undefined]);
  const b = seri(['kontrol_et', 'metin', 'metin'], { 1: { video: 'v', link: 'L', karar_neden: 'hata' } });
  tekrarDene(b, 1);
  assert.deepStrictEqual([b.bolumler[0].durum, 'video' in b.bolumler[0], 'link' in b.bolumler[0]], ['metin', false, false]);
  assert.match(tekrarHata(seri(['yayinda', 'metin', 'metin']), 1), /kontrol bekleyen/);
  const c = seri(['kontrol_et', 'metin', 'metin']); c.durum = 'kesildi';
  assert.match(tekrarHata(c, 1), /kesilmiş/);
});

test('kilitAl is shared: a second holder gets a message, release frees it', () => {
  const k = fs.mkdtempSync(path.join(os.tmpdir(), 'dizi-kilit-'));
  const a = kilitAl(k, 'k'); assert.ok(a.birak);
  assert.match(kilitAl(k, 'k').mesaj, /kilit/);
  a.birak(); assert.ok(kilitAl(k, 'k').birak);
});

test('kilitAl: a live pid on this host holds the lock however old; a dead pid or an old foreign-host lock is taken', () => {
  const k = fs.mkdtempSync(path.join(os.tmpdir(), 'dizi-kilit2-')), f = path.join(k, 'kayit', 'dizi', 'k', '.kilit');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const eski = new Date(Date.now() - 10 * 3600e3).toISOString(), yeni = new Date().toISOString();
  const yaz = o => fs.writeFileSync(f, JSON.stringify(o));
  yaz({ pid: process.pid, host: os.hostname(), zaman: eski });
  assert.match(kilitAl(k, 'k').mesaj, /kilit/, 'live old lock stays held');
  yaz({ pid: process.pid, zaman: eski });
  assert.match(kilitAl(k, 'k').mesaj, /kilit/, 'a lock without host counts as this host');
  const olu = require('child_process').spawnSync(process.execPath, ['-e', '']).pid;
  yaz({ pid: olu, host: os.hostname(), zaman: yeni });
  const a = kilitAl(k, 'k'); assert.ok(a.birak, 'dead-pid lock is taken');
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepStrictEqual([j.pid, j.host], [process.pid, os.hostname()], 'the hostname is recorded');
  a.birak();
  yaz({ pid: olu, host: 'baska-makine', zaman: yeni });
  assert.match(kilitAl(k, 'k').mesaj, /kilit/, 'a fresh lock from another host is held');
  yaz({ pid: olu, host: 'baska-makine', zaman: eski });
  const b = kilitAl(k, 'k'); assert.ok(b.birak, 'an old lock from another host is stale'); b.birak();
});

// ---- end of a series: no dead ends
test('Kes on the last episode finishes the series (bitti), yayinda or kontrol_et', () => {
  const a = seri(['olculdu', 'olculdu', 'yayinda']);
  assert.strictEqual(kararHata(a, 3, 'kes'), null);
  kararUygula(a, 3, 'kes', 'yeter');
  assert.deepStrictEqual([a.durum, a.bolumler[2].karar, a.bolumler[2].elle], ['bitti', 'kes', true]);
  const b = seri(['olculdu', 'olculdu', 'kontrol_et'], { 3: { media_id: 'M3' } });
  assert.strictEqual(kararHata(b, 3, 'kes'), null); assert.strictEqual(tekrarHata(b, 3), null);
  kararUygula(b, 3, 'kes', 'x');
  assert.strictEqual(b.durum, 'bitti'); assert.ok(!b.bolumler[2].elle);
  assert.match(tekrarHata(b, 3), /bitti/);
});

test('a series cut while an episode was kontrol_et comes back: Devam reactivates it, then Tekrar dene works', () => {
  for (const n of [1, 3]) {
    const durumlar = n === 1 ? ['kontrol_et', 'metin', 'metin'] : ['olculdu', 'olculdu', 'kontrol_et'];
    const s = seri(durumlar, { [n]: { media_id: 'M' } });
    if (n === 1) kararUygula(s, 1, 'kes', 'x'); else s.durum = 'kesildi';
    assert.strictEqual(s.durum, 'kesildi');
    assert.match(tekrarHata(s, n), /kesilmiş/);
    assert.strictEqual(kararHata(s, n, 'devam'), null, 'devam is offered on the cut series, ep ' + n);
    kararUygula(s, n, 'devam', 'geri');
    assert.strictEqual(s.durum, 'aktif'); assert.ok(!s.bolumler[n - 1].elle, 'no decision stored on a kontrol_et episode');
    if (n === 1) assert.deepStrictEqual(s.bolumler.map(b => b.durum), ['kontrol_et', 'metin', 'metin']);
    tekrarDene(s, n);
    assert.strictEqual(s.bolumler[n - 1].durum, 'yayinda');
  }
  assert.match(kararHata(seri(['kontrol_et', 'metin', 'metin']), 1, 'devam'), /yalnız Kes/, 'an active series still gets Kes / Tekrar dene only');
});

test('izin flags: a non-finished series that waits for a human always has a button', () => {
  const D = ['yayinda', 'olculdu', 'kontrol_et'], SONRA = ['metin', 'atlandi', 'uretimde', 'onay-bekliyor', 'sirada', 'kontrol_et'];
  const seriler = [];
  for (let k = 1; k <= 3; k++) for (const son of D) for (const media of [true, false]) for (const durum of ['aktif', 'kesildi']) {
    const bas = [...Array(k - 1).fill('olculdu'), son];
    const kuyruklar = k === 3 ? [[]] : SONRA.map(x => [x, ...Array(2 - k).fill(x === 'atlandi' ? 'atlandi' : 'metin')]);
    for (const geri of kuyruklar) seriler.push({ s: { ...seri([...bas, ...geri], { [k]: media ? { media_id: 'M' } : {} }), durum }, k });
  }
  // the scheduler moves these on by itself
  const otomatik = (s, k) => {
    const b = s.bolumler;
    if (s.durum !== 'aktif') return false;
    if (b.some(x => ['uretimde', 'onay-bekliyor', 'sirada'].includes(x.durum))) return true;
    return b[k - 1].durum === 'olculdu' && b[k] && b[k].durum === 'metin';
  };
  let bakilan = 0;
  for (const { s, k } of seriler) {
    if (s.bolumler[s.bolumler.length - 1].durum === 'olculdu') continue;     // finished: the scheduler marks it bitti
    if (otomatik(s, k)) continue;
    // unreachable: a series is only cut while its next episode is still text
    if (s.durum === 'kesildi' && s.bolumler.some(x => ['uretimde', 'onay-bekliyor', 'sirada'].includes(x.durum))) continue;
    bakilan++;
    const var_ = s.bolumler.some(b => !kararHata(s, b.n, 'devam') || !kararHata(s, b.n, 'kes') || !tekrarHata(s, b.n));
    assert.ok(var_, JSON.stringify([s.durum, ...s.bolumler.map(b => b.durum + (b.media_id ? '+m' : ''))]));
  }
  assert.ok(bakilan > 20, String(bakilan));
});

test('a 5-episode series: Kes on ep 3 skips 4-5, Kes on ep 5 finishes, Devam past the last is refused', () => {
  const s = () => ({ id: 's5', kanal: 'k', durum: 'aktif', bolumler: [1, 2, 3, 4, 5].map(n => ({ n, metin: 'x', durum: n <= 3 ? 'yayinda' : 'metin' })) });
  let d = s(); kararUygula(d, 3, 'kes', 'neden');
  assert.deepStrictEqual([d.durum, ...d.bolumler.map(b => b.durum)], ['kesildi', 'yayinda', 'yayinda', 'yayinda', 'atlandi', 'atlandi']);
  d = s(); d.bolumler[3].durum = 'yayinda';
  assert.strictEqual(kararHata(d, 4, 'devam'), null, 'ep 4 of 5 is not the last');
  d.bolumler[4].durum = 'yayinda';
  assert.match(kararHata(d, 5, 'devam'), /Son bölüm/);
  kararUygula(d, 5, 'kes', 'son'); assert.strictEqual(d.durum, 'bitti');
  assert.match(kararHata(s(), 6, 'kes'), /bölüm 6 yok/);
});
