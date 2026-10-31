// Story pool "Öne al": a story marked next for its theme comes first inside its theme (temp roots, no network).
//   node --test "dizi/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const H = require('../havuz');

const KONULAR = [{ ad: 'aşk', basliklar: ['/ask--1'] }, { ad: 'iş', basliklar: ['/is--2'] }];
const ctx = { kanal: 'k', kimlik: {}, ayar: { dizi: { kaynak: { konular: KONULAR }, havuz: { hedef: 6 } }, llm: {} } };
const kokYap = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dizi-oncelik-'));

test('sirala: inside a theme the marked story comes first (the latest mark first), then favourites; theme order kept', () => {
  const Hv = { hikayeler: [
    { id: 'eksi-1', konu: 'aşk', fav: 900, durum: 'havuzda' }, { id: 'eksi-2', konu: 'aşk', fav: 10, durum: 'havuzda', oncelik: '2026-10-31T10:00:00Z' },
    { id: 'eksi-3', konu: 'aşk', fav: 5, durum: 'havuzda', oncelik: '2026-10-31T11:00:00Z' }, { id: 'eksi-4', konu: 'iş', fav: 1, durum: 'havuzda', oncelik: '2026-10-31T12:00:00Z' },
    { id: 'eksi-5', konu: 'iş', fav: 50, durum: 'havuzda' }] };
  assert.deepStrictEqual(H.sirala(Hv, ['aşk', 'iş']).map(x => x.id), ['eksi-3', 'eksi-2', 'eksi-1', 'eksi-4', 'eksi-5']);
  assert.deepStrictEqual(H.sirala(Hv, ['iş', 'aşk']).map(x => x.id).slice(0, 2), ['eksi-4', 'eksi-5'], 'a mark never jumps over the theme rotation');
});

test('oneAl: validates, takes the lock, only a pooled story; ozet shows the mark and the new order', () => {
  const kok = kokYap();
  try {
    H.kaydet(kok, 'k', { hikayeler: [{ id: 'eksi-1', konu: 'aşk', fav: 900, durum: 'havuzda' }, { id: 'eksi-2', konu: 'aşk', fav: 3, durum: 'havuzda' }, { id: 'eksi-3', konu: 'aşk', durum: 'elendi' }] });
    assert.throws(() => H.oneAl(kok, 'k', '../x'), /id geçersiz/);
    assert.throws(() => H.oneAl(kok, 'k', 'eksi-99'), /böyle bir hikâye yok/);
    assert.throws(() => H.oneAl(kok, 'k', 'eksi-3'), /zaten elendi/);
    const kilit = path.join(kok, 'kayit', 'dizi', 'k', '.kilit');
    fs.writeFileSync(kilit, JSON.stringify({ pid: process.pid, zaman: new Date().toISOString() }));
    assert.throws(() => H.oneAl(kok, 'k', 'eksi-2'), e => e.kod === 409);
    fs.unlinkSync(kilit);
    assert.deepStrictEqual(H.oneAl(kok, 'k', 'eksi-2'), { ok: true });
    assert.ok(H.yukle(kok, 'k').hikayeler.find(x => x.id === 'eksi-2').oncelik, 'the mark is saved');
    const oz = H.ozet(ctx, kok);
    assert.deepStrictEqual(oz.siradaki.filter(x => x.konu === 'aşk').map(x => x.id), ['eksi-2', 'eksi-1']);
    assert.ok(oz.siradaki.find(x => x.id === 'eksi-2').oncelik);
    assert.strictEqual(oz.siradaki.find(x => x.id === 'eksi-1').oncelik, undefined);
  } finally { fs.rmSync(kok, { recursive: true, force: true }); }   // only this test's own temp root
});
