// Panel: planned (not yet produced) episodes for the calendar, from the series' hour and the measurement rule.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-planli-'));
process.argv.push('--kok', KOK);
const P = require('../panel.js');
const D = require('../../dizi/dizi.js');
test.after(() => fs.rmSync(KOK, { recursive: true, force: true }));   // only this test's own temp root
const yardimci = typeof D.hedefSlot === 'function' && typeof D.olcumZamani === 'function';

const AYAR = { olcum_once_saat: 3, bolum_arasi_saat: 12, saatler: ['10:00', '15:00', '20:00'] };
const yerel = (g, s, d = 0) => new Date(2026, 10, g, s, d).toISOString();          // local time, 1-based day of November
const dizi = (bolumler, ek = {}) => ({ id: 'd1', baslik: 'Uzun baslik', baslik_kisa: 'Kisa', durum: 'aktif', metin_onay: 'onaylandi', saat: '10:00', ton: 'hüzünlü', konu: 'aile', bolumler, ...ek });
const SIMDI = new Date(2026, 10, 1, 12, 0).getTime();

test('a posted previous episode: the next one is planned at the series hour, its decision 3 h before', { skip: !yardimci && 'dizi.js helpers not present' }, () => {
  const L = P.planliBolumler([dizi([{ n: 1, durum: 'yayinda', paylasildi: yerel(1, 10, 5), video: 'videolar/v1' }, { n: 2, durum: 'metin' }, { n: 3, durum: 'metin' }])], AYAR, [], SIMDI);
  assert.strictEqual(L.length, 1);
  assert.deepStrictEqual({ ...L[0] }, { planli: true, dizi_id: 'd1', baslik: 'Kisa', n: 2, toplam: 3, ton: 'hüzünlü', konu: 'aile', slot: yerel(2, 10), karar: yerel(2, 7) });
});

test('a previous episode still waiting: the next one goes to the next series hour after its slot, no decision yet', { skip: !yardimci && 'dizi.js helpers not present' }, () => {
  const bek = [{ id: 'j1', video: 'videolar/v1', ne_zaman: yerel(2, 10), onay_gerekli: true }];
  const L = P.planliBolumler([dizi([{ n: 1, durum: 'onay-bekliyor', video: 'videolar/v1' }, { n: 2, durum: 'metin' }])], AYAR, bek, SIMDI);
  assert.strictEqual(L.length, 1); assert.strictEqual(L[0].n, 2); assert.strictEqual(L[0].slot, yerel(3, 10)); assert.strictEqual(L[0].karar, null);
});

test('an episode that already has a video or a queue job is never planned again', { skip: !yardimci && 'dizi.js helpers not present' }, () => {
  const bek = [{ id: 'j2', video: 'videolar/v2', ne_zaman: yerel(2, 10) }];
  assert.deepStrictEqual(P.planliBolumler([dizi([{ n: 1, durum: 'yayinda', paylasildi: yerel(1, 10), video: 'videolar/v1' }, { n: 2, durum: 'sirada', video: 'videolar/v2' }])], AYAR, bek, SIMDI), []);
  // in production now (uretimde with its folder): not planned either
  assert.deepStrictEqual(P.planliBolumler([dizi([{ n: 1, durum: 'yayinda', paylasildi: yerel(1, 10), video: 'videolar/v1' }, { n: 2, durum: 'uretimde', video: 'videolar/v2' }])], AYAR, [], SIMDI), []);
});

test('finished, cut or text-waiting series, and a first episode with nothing before it, get no planned item', { skip: !yardimci && 'dizi.js helpers not present' }, () => {
  const b = [{ n: 1, durum: 'yayinda', paylasildi: yerel(1, 10), video: 'videolar/v1' }, { n: 2, durum: 'metin' }];
  assert.deepStrictEqual(P.planliBolumler([dizi(b, { durum: 'bitti' })], AYAR, [], SIMDI), []);
  assert.deepStrictEqual(P.planliBolumler([dizi([b[0], { n: 2, durum: 'atlandi' }], { durum: 'kesildi' })], AYAR, [], SIMDI), []);
  assert.deepStrictEqual(P.planliBolumler([dizi(b, { metin_onay: 'bekliyor' })], AYAR, [], SIMDI), []);
  assert.deepStrictEqual(P.planliBolumler([dizi([{ n: 1, durum: 'metin' }, { n: 2, durum: 'metin' }])], AYAR, [], SIMDI), []);
});
