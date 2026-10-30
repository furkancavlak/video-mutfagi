// Story themes, theme rotation and the weekly story pool (stub fetch and stub model, temp roots, no network).
//   node --test "dizi/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const tema = require('../tema');
const H = require('../havuz');
const { yeniDiziYap, siraliAdaylar } = require('../calistir');
const { kaydet, yukle } = require('../dizi');
const O = require('../../konu/ortak');

const SIMDI = new Date('2026-11-02T09:00:00Z');   // Monday 12:00 Istanbul
const kelimeler = n => Array.from({ length: n }, (_, i) => 'k' + i).join(' ');
const KONULAR = [{ ad: 'aşk', basliklar: ['/ask--1'] }, { ad: 'iş', basliklar: ['/is--2', '/is-2--3'] }, { ad: 'okul', basliklar: ['/okul--4'] }];
const ctx = (havuz = {}) => ({ kanal: 'k', kimlik: {}, ayar: { dizi: { kaynak: { konular: KONULAR, aralik_ms: 0 }, havuz: { hedef: 6, sayfa: 2, ...havuz } }, llm: {} } });
const kokYap = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dizi-havuz-'));
// a topic best-of page with entries [{id, fav, n (words), tarih}]
const sayfa = (baslik, es) => `<h1 id="title" data-title="${baslik}" data-id="9"></h1><ul>${es.map(e => `<li data-id="${e.id}" data-author="a" data-favorite-count="${e.fav}"><div class="content">${kelimeler(e.n)}</div><footer><a class="entry-date permalink" href="/entry/${e.id}">${e.tarih || '01.01.2016 10:00'}</a></footer></li>`).join('')}</ul>`;

test('tema.konular: only well-formed themes; temaSirasi: least recently used first, never one used today', () => {
  assert.deepStrictEqual(tema.konular({ ayar: { dizi: { kaynak: { konular: [{ ad: ' aşk ', basliklar: ['/a--1'] }, { ad: '', basliklar: [] }, { basliklar: ['/x'] }, 'x'] } } } }), [{ ad: 'aşk', basliklar: ['/a--1'] }]);
  assert.deepStrictEqual(tema.konular({ ayar: {} }), []);
  const d = (konu, t) => ({ id: konu + t, konu, olusturma: t });
  // okul used two days ago, aşk last week, iş never: iş, aşk, okul
  assert.deepStrictEqual(tema.temaSirasi(KONULAR, [d('okul', '2026-10-31T10:00:00Z'), d('aşk', '2026-10-26T10:00:00Z'), d('aşk', '2026-10-20T10:00:00Z')], SIMDI), ['iş', 'aşk', 'okul']);
  // aşk used this morning (Istanbul day) is out for the rest of the day; a series without konu counts for nothing
  assert.deepStrictEqual(tema.temaSirasi(KONULAR, [d('aşk', '2026-11-02T06:00:00Z'), { id: 'x', olusturma: '2026-11-02T07:00:00Z' }], SIMDI), ['iş', 'okul']);
  // 23:30 Istanbul on Sunday is "yesterday" for Monday
  assert.deepStrictEqual(tema.temaSirasi(KONULAR, [d('aşk', '2026-11-01T20:30:00Z')], SIMDI)[2], 'aşk');
  assert.strictEqual(tema.enIyiUrl('/is--2', 2), 'https://eksisozluk.com/is--2?a=nice&p=2');
});

test('siraliAdaylar: allowed themes in rotation order, favourites inside, untagged after', () => {
  const a = [{ id: 'a1', konu: 'aşk', puan: 10 }, { id: 'i1', konu: 'iş', puan: 5 }, { id: 'i2', konu: 'iş', puan: 50 }, { id: 'o1', konu: 'okul', puan: 99 }, { id: 'd', tur: 'eksi', puan: 1 }];
  assert.deepStrictEqual(siraliAdaylar(a, ['iş', 'aşk']).map(x => x.id), ['i2', 'i1', 'a1', 'd']);
});

function sahteGetir(sayfalar) {
  const f = async url => { f.urls.push(url); const s = sayfalar[url]; if (s instanceof Error) throw s; return s || sayfa('boş', []); };
  f.urls = [];
  return f;
}

test('doldur: per-theme target, best favourites first, story check, short/low-fav/known ids skipped, never re-added', async () => {
  const kok = kokYap(), c = ctx();
  kaydet(kok, 'k', { diziler: [{ id: 'eksi-12', kaynak: { id: 'eksi-12' }, bolumler: [] }] });
  O.yazJson(path.join(kok, 'kayit', 'dizi', 'k', 'reddedilen.json'), { reddedilen: [{ id: 'eksi-13' }] });
  const U = 'https://eksisozluk.com';
  const getir = sahteGetir({
    [U + '/ask--1?a=nice']: sayfa('ilk aşk', [{ id: 11, fav: 500, n: 400, tarih: '13.11.2014 22:53' }, { id: 12, fav: 900, n: 400 }, { id: 13, fav: 800, n: 400 }, { id: 14, fav: 300, n: 100 }, { id: 15, fav: 20, n: 400 }, { id: 16, fav: 200, n: 300 }]),
    [U + '/ask--1?a=nice&p=2']: sayfa('ilk aşk', [{ id: 17, fav: 150, n: 600 }, { id: 18, fav: 120, n: 300 }]),
    [U + '/is--2?a=nice']: sayfa('iş', [{ id: 21, fav: 100, n: 300 }]),
    [U + '/is-2--3?a=nice']: sayfa('iş 2', [{ id: 21, fav: 100, n: 300 }, { id: 22, fav: 90, n: 300 }]),
    [U + '/okul--4?a=nice']: sayfa('okul', []),
  });
  const kontrol = async (cx, h) => (h.id === 'eksi-16' ? { hikaye: false, neden: 'inceleme' } : { hikaye: true, ozet: 'özet ' + h.id });
  const r = await H.doldur(c, { kok, simdi: SIMDI, getir, hikayeMi: kontrol, uyu: async () => { } });
  const h = H.yukle(kok, 'k').hikayeler;
  // target 6 over 3 themes = 2 each: aşk gets 11 (500) and 17 (150); 16 failed the check and is kept as elendi.
  // okul has nothing, so the pool is short: the top-up pass lets aşk carry 18 too (up to twice its share)
  assert.deepStrictEqual(h.filter(x => x.konu === 'aşk' && x.durum === 'havuzda').map(x => x.id), ['eksi-11', 'eksi-17', 'eksi-18']);
  assert.deepStrictEqual(h.filter(x => x.durum === 'elendi').map(x => [x.id, x.neden]), [['eksi-16', 'hikaye_degil: inceleme']]);
  assert.ok(!h.some(x => ['eksi-12', 'eksi-13', 'eksi-14', 'eksi-15'].includes(x.id)), 'used, rejected, short and low-fav ids skipped');
  assert.deepStrictEqual(h.filter(x => x.konu === 'iş').map(x => x.id), ['eksi-21', 'eksi-22'], 'an id on two topics is added once');
  const x = h.find(y => y.id === 'eksi-11');
  assert.deepStrictEqual([x.baslik, x.link, x.fav, x.tarih, x.kelime, x.ozet, x.tahmini_bolum, x.durum], ['ilk aşk', 'https://eksisozluk.com/entry/11', 500, '13.11.2014 22:53', 400, 'özet eksi-11', 2, 'havuzda']);
  assert.deepStrictEqual(r.stok, { 'aşk': 3, 'iş': 2 });
  assert.ok(r.notlar.some(n => /okul: 2 hikâye eksik/.test(n)));
  assert.ok(r.notlar.some(n => /havuz hedefin altında: 5\/6/.test(n)));
  // a second fill finds nothing new
  const r2 = await H.doldur(c, { kok, simdi: SIMDI, getir, hikayeMi: kontrol, uyu: async () => { } });
  assert.deepStrictEqual(r2.eklenen, {});
  assert.strictEqual(H.yukle(kok, 'k').hikayeler.length, h.length);
});

test('doldur: a pool already at the target asks no page at all', async () => {
  const kok = kokYap(), c = ctx();
  H.kaydet(kok, 'k', { hikayeler: Array.from({ length: 6 }, (_, i) => ({ id: 'eksi-' + (900 + i), konu: KONULAR[i % 3].ad, durum: 'havuzda' })) });
  const getir = sahteGetir({});
  const r = await H.doldur(c, { kok, simdi: SIMDI, getir, hikayeMi: async () => ({ hikaye: true }), uyu: async () => { } });
  assert.deepStrictEqual([getir.urls.length, r.eklenen], [0, {}]);
});

test('doldur: a 403 stops the whole fill with a note; polite wait between requests; no themes is an error', async () => {
  const kok = kokYap(), bekle = [];
  const getir = sahteGetir({ 'https://eksisozluk.com/ask--1?a=nice': new Error('HTTP 403') });
  const r = await H.doldur(ctx(), { kok, simdi: SIMDI, getir, hikayeMi: async () => ({ hikaye: true }), uyu: async ms => bekle.push(ms) });
  assert.strictEqual(getir.urls.length, 1);
  assert.ok(r.notlar.some(n => /engelledi/.test(n)));
  const c = ctx(); c.ayar.dizi.kaynak.aralik_ms = 2500;
  await H.doldur(c, { kok: kokYap(), simdi: SIMDI, getir: sahteGetir({}), hikayeMi: async () => ({ hikaye: true }), uyu: async ms => bekle.push(ms) });
  assert.ok(bekle.length && bekle.every(ms => ms === 2500));
  await assert.rejects(H.doldur({ kanal: 'k', ayar: { dizi: {} } }, { kok }), /konular boş/);
});

test('ele: validates, takes the lock, only a pooled story; ozet lists stock per theme and the next stories', () => {
  const kok = kokYap(), c = ctx();
  H.kaydet(kok, 'k', { hikayeler: [{ id: 'eksi-1', konu: 'aşk', fav: 9, durum: 'havuzda', ozet: 'ö1' }, { id: 'eksi-2', konu: 'iş', fav: 5, durum: 'havuzda' }, { id: 'eksi-3', konu: 'iş', fav: 50, durum: 'havuzda' }, { id: 'eksi-4', konu: 'aşk', durum: 'kullanildi' }] });
  assert.throws(() => H.ele(kok, 'k', '../x'), /id geçersiz/);
  assert.throws(() => H.ele(kok, 'k', 'eksi-99'), /böyle bir hikâye yok/);
  assert.throws(() => H.ele(kok, 'k', 'eksi-4'), /zaten kullanildi/);
  fs.writeFileSync(path.join(kok, 'kayit', 'dizi', 'k', '.kilit'), JSON.stringify({ pid: process.pid, zaman: new Date().toISOString() }));
  assert.throws(() => H.ele(kok, 'k', 'eksi-1'), e => e.kod === 409);
  fs.unlinkSync(path.join(kok, 'kayit', 'dizi', 'k', '.kilit'));
  assert.deepStrictEqual(H.ele(kok, 'k', 'eksi-1', '  sevmedim '), { ok: true });
  const x = H.yukle(kok, 'k').hikayeler[0];
  assert.deepStrictEqual([x.durum, x.neden], ['elendi', 'sevmedim']);
  const oz = H.ozet(c, kok);
  assert.deepStrictEqual(oz.stok, [{ konu: 'aşk', adet: 0 }, { konu: 'iş', adet: 2 }, { konu: 'okul', adet: 0 }]);
  assert.strictEqual(oz.toplam, 2); assert.strictEqual(oz.hedef, 6);
  assert.deepStrictEqual(oz.siradaki.map(s => s.id), ['eksi-3', 'eksi-2']);
});

// calistir's new-series path: pool first (rotation + favourites), live search when it runs dry
function bolSahte(red = []) {
  const f = { cagri: [], bol: async (cx, h) => { f.cagri.push(h.id); return red.includes(h.id) ? { ok: false, neden: 'hikaye_degil', ayrinti: 'deneme' } : { ok: true, dizi: { id: h.id, kanal: 'k', durum: 'aktif', bolumler: [{ n: 1, metin: 'x', durum: 'metin' }, { n: 2, metin: 'y', durum: 'metin' }] } }; } };
  return f;
}
const entrySahte = async no => ({ baslik: 'b' + no, metin: kelimeler(300), fav: 7 });

test('yeniDizi from the pool: rotation + favourites, konu on the series, used/rejected marked, no theme twice a day', async () => {
  const kok = kokYap(), c = ctx();
  kaydet(kok, 'k', { diziler: [{ id: 'eski', konu: 'aşk', olusturma: '2026-10-30T10:00:00Z', bolumler: [] }] });
  H.kaydet(kok, 'k', { hikayeler: [
    { id: 'eksi-1', konu: 'aşk', fav: 900, link: 'https://eksisozluk.com/entry/1', durum: 'havuzda' },
    { id: 'eksi-2', konu: 'iş', fav: 10, link: 'https://eksisozluk.com/entry/2', durum: 'havuzda' },
    { id: 'eksi-3', konu: 'iş', fav: 300, link: 'https://eksisozluk.com/entry/3', durum: 'havuzda' },
    { id: 'eksi-4', konu: 'okul', fav: 50, link: 'https://eksisozluk.com/entry/4', durum: 'havuzda' },
  ] });
  const bol = bolSahte(['eksi-3']), kaynak = { adaylar: async () => { throw new Error('live search must not run'); } };
  const yd = yeniDiziYap({ kaynak, bol, entryGetir: entrySahte }), sonuc = { notlar: [], reddedilen: 0 };
  const diziler = yukle(kok, 'k').diziler;
  // iş and okul never used, aşk used before: iş first; its best (eksi-3) fails the split, then eksi-2
  const d1 = await yd(c, { simdi: SIMDI, diziler, kok, sonuc });
  assert.deepStrictEqual([d1.id, d1.konu, d1.kaynak.url], ['eksi-2', 'iş', 'https://eksisozluk.com/entry/2']);
  assert.deepStrictEqual(bol.cagri, ['eksi-3', 'eksi-2']);
  diziler.push(d1);
  // same day: iş is out; okul (never used) before aşk
  const d2 = await yd(c, { simdi: SIMDI, diziler, kok, sonuc });
  assert.deepStrictEqual([d2.id, d2.konu], ['eksi-4', 'okul']);
  diziler.push(d2);
  const d3 = await yd(c, { simdi: SIMDI, diziler, kok, sonuc });
  assert.deepStrictEqual([d3.id, d3.konu], ['eksi-1', 'aşk']);
  const h = Object.fromEntries(H.yukle(kok, 'k').hikayeler.map(x => [x.id, x.durum]));
  assert.deepStrictEqual(h, { 'eksi-1': 'kullanildi', 'eksi-2': 'kullanildi', 'eksi-3': 'elendi', 'eksi-4': 'kullanildi' });
  const red = O.okuJson(path.join(kok, 'kayit', 'dizi', 'k', 'reddedilen.json'));
  assert.deepStrictEqual(red.reddedilen.map(x => [x.id, x.neden]), [['eksi-3', 'hikaye_degil']]);
  assert.strictEqual(sonuc.reddedilen, 1);
});

test('yeniDizi: a dry pool notes "havuz azaldı" and falls back to the live search (themed, rotated)', async () => {
  const kok = kokYap(), c = ctx();
  kaydet(kok, 'k', { diziler: [] });
  H.kaydet(kok, 'k', { hikayeler: [{ id: 'eksi-1', konu: 'aşk', fav: 9, durum: 'elendi' }] });
  const kaynak = { adaylar: async () => ({ ogeler: [{ id: 'eksi-50', tur: 'eksi', konu: 'okul', puan: 5, metin: 'x' }, { id: 'eksi-51', tur: 'eksi', konu: 'iş', puan: 1, metin: 'x' }], notlar: [] }) };
  const sonuc = { notlar: [], reddedilen: 0 };
  const d = await yeniDiziYap({ kaynak, bol: bolSahte(), entryGetir: entrySahte })(c, { simdi: SIMDI, diziler: [], kok, sonuc });
  assert.deepStrictEqual([d.id, d.konu], ['eksi-51', 'iş'], 'config order breaks the tie between never-used themes');
  assert.ok(sonuc.notlar.some(n => /^havuz azaldı: 0 hikâye kaldı/.test(n)));
});

test('yeniDizi without themes keeps the old live path (no pool, no konu)', async () => {
  const kok = kokYap();
  kaydet(kok, 'k', { diziler: [] });
  const kaynak = { adaylar: async () => ({ ogeler: [{ id: 'reddit-1', tur: 'reddit', puan: 5 }, { id: 'eksi-9', tur: 'eksi', puan: 1 }], notlar: [] }) };
  const d = await yeniDiziYap({ kaynak, bol: bolSahte(), entryGetir: entrySahte })({ kanal: 'k', ayar: { dizi: {} } }, { simdi: SIMDI, diziler: [], kok, sonuc: { notlar: [] } });
  assert.strictEqual(d.id, 'eksi-9'); assert.ok(!('konu' in d));
  assert.ok(!fs.existsSync(H.dosya(kok, 'k')));
});

test('birlestir: the server copy wins for known stories, the filled copy only adds new ones', () => {
  const sunucu = { guncelleme: 'eski', hikayeler: [{ id: 'eksi-1', durum: 'kullanildi' }, { id: 'eksi-2', durum: 'elendi', neden: 'elle elendi' }] };
  const yerel = { guncelleme: 'yeni', son_doldurma: { zaman: 'z' }, hikayeler: [{ id: 'eksi-1', durum: 'havuzda' }, { id: 'eksi-2', durum: 'havuzda' }, { id: 'eksi-3', durum: 'havuzda' }] };
  const b = H.birlestir(sunucu, yerel);
  assert.deepStrictEqual(b.hikayeler.map(x => [x.id, x.durum]), [['eksi-1', 'kullanildi'], ['eksi-2', 'elendi'], ['eksi-3', 'havuzda']]);
  assert.deepStrictEqual([b.guncelleme, b.son_doldurma], ['yeni', { zaman: 'z' }]);
  assert.deepStrictEqual(H.birlestir(null, yerel).hikayeler.length, 3, 'no server copy: the filled one as is');
});
