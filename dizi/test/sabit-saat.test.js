// Offline tests for hand-set times: dizi.saat, a pinned episode (bolum.sabit_zaman) in dizi.js, uret-bolum.js and the planner.
//   node --test "dizi/test/*.test.js"
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const D = require('../dizi'), P = require('../planla');
const { uretBolum, doluSaatler } = require('../uret-bolum');

const SAAT = 3600e3, iso = t => new Date(t).toISOString();
const yerel = (g, h, m = 0) => new Date(2026, 10, g, h, m, 0, 0).getTime();   // 2026-11-<g> <h>:<m> local
const SIMDI = yerel(20, 8);
const AYAR = { olcum_once_saat: 3, bolum_arasi_saat: 20, saatler: ['10:00', '15:00', '20:00'] };
const dizi = (ek = {}, b2 = {}) => ({ id: 'a', kanal: 'k', baslik: 'Uzun', baslik_kisa: 'Kisa', durum: 'aktif', metin_onay: 'onaylandi', anlatici: { ses: 'S', ad: 'B' },
  bolumler: [{ n: 1, durum: 'yayinda', paylasildi: iso(yerel(19, 10, 5)), metin: 'Bir. Iki.' }, { n: 2, durum: 'metin', metin: 'Önceki bölümde bir şey oldu.\n\nSonra iki.', ...b2 }, { n: 3, durum: 'metin', metin: 'x' }], ...ek });

test('saatUygula: HH:MM sets, null clears, anything else or an inactive series is refused', () => {
  const d = dizi();
  D.saatUygula(d, '19:30'); assert.strictEqual(d.saat, '19:30');
  D.saatUygula(d, null); assert.ok(!('saat' in d));
  for (const k of ['7:30', '24:00', '19:60', '', 'abc', 1930, '19:30:00']) assert.throws(() => D.saatUygula(d, k), /Saat SS:DD/, String(k));
  assert.throws(() => D.saatUygula(dizi({ durum: 'kesildi' }), '10:00'), /etkin/);
  assert.throws(() => D.saatUygula(dizi({ durum: 'bitti' }), null), /etkin/);
});

test('the series hour moves the next slot and the measurement time (diziSaati)', () => {
  const d = dizi({ saat: '20:00' }), once = d.bolumler[0];
  assert.strictEqual(D.hedefSlot(once, AYAR, d), yerel(20, 20));
  assert.strictEqual(D.olcumZamani(once, AYAR, d), yerel(20, 17));
  D.saatUygula(d, '15:00');
  assert.strictEqual(D.hedefSlot(once, AYAR, d), yerel(20, 15)); assert.strictEqual(D.olcumZamani(once, AYAR, d), yerel(20, 12));
  D.saatUygula(d, null);   // automatic again: the configured hours
  assert.strictEqual(D.hedefSlot(once, AYAR, d), yerel(20, 10));
});

test('bolumZamanUygula: future ISO only, null clears, posted or closed episodes refused', () => {
  const d = dizi(), t = iso(SIMDI + 5 * SAAT);
  const b = D.bolumZamanUygula(d, 2, t, SIMDI); assert.strictEqual(b.sabit_zaman, t);
  assert.strictEqual(D.sabitZaman(b), SIMDI + 5 * SAAT);
  D.bolumZamanUygula(d, 2, null, SIMDI); assert.ok(!('sabit_zaman' in d.bolumler[1]));
  assert.throws(() => D.bolumZamanUygula(d, 2, iso(SIMDI - 60e3), SIMDI), /geçmiş/);
  assert.throws(() => D.bolumZamanUygula(d, 2, iso(SIMDI), SIMDI), /geçmiş/);
  assert.throws(() => D.bolumZamanUygula(d, 2, 'yarın', SIMDI), /anlaşılmadı/);
  assert.throws(() => D.bolumZamanUygula(d, 9, t, SIMDI), /yok/);
  assert.throws(() => D.bolumZamanUygula(d, 1, t, SIMDI), /sabitlenemez/);                    // posted
  for (const durum of ['olculdu', 'atlandi', 'kontrol_et']) assert.throws(() => D.bolumZamanUygula(dizi({}, { durum }), 2, t, SIMDI), /sabitlenemez/);
  for (const durum of ['metin', 'uretimde', 'onay-bekliyor', 'sirada']) assert.doesNotThrow(() => D.bolumZamanUygula(dizi({}, { durum }), 2, t, SIMDI));
  assert.throws(() => D.bolumZamanUygula(dizi({ durum: 'kesildi' }), 2, t, SIMDI), /etkin/);
  assert.ok(!d.bolumler[1].sabit_zaman, 'refusals leave the episode untouched');
});

test('a pinned episode is the target slot exactly; the previous one is measured olcum_once_saat before it; the gap rule is overridden', () => {
  const pin = yerel(20, 12, 20);   // 2 h after the previous post: well under bolum_arasi_saat, not on a configured hour
  const d = dizi({}, { sabit_zaman: iso(pin) }), once = d.bolumler[0];
  assert.strictEqual(D.hedefSlot(once, AYAR, d), pin);
  assert.strictEqual(D.olcumZamani(once, AYAR, d), Math.max(Date.parse(once.paylasildi) + 6 * SAAT, pin - 3 * SAAT));
  const uzak = dizi({}, { sabit_zaman: iso(yerel(23, 21, 40)) });
  assert.strictEqual(D.olcumZamani(uzak.bolumler[0], AYAR, uzak), yerel(23, 18, 40));
  assert.strictEqual(D.olcumGecen(uzak.bolumler[0], AYAR, yerel(23, 18, 40), uzak), 0);
  // a pin on an episode that is already posted is ignored
  const e3 = dizi(); e3.bolumler[1] = { ...e3.bolumler[1], durum: 'yayinda', paylasildi: iso(yerel(20, 10)), sabit_zaman: iso(yerel(25, 9)) };
  assert.strictEqual(D.hedefSlot(e3.bolumler[0], AYAR, e3), D.hedefSlot(e3.bolumler[0], AYAR, { ...e3, bolumler: [e3.bolumler[0]] }));
});

// ---- uret-bolum.js: the queue job's time
const tmp = ad => fs.mkdtempSync(path.join(os.tmpdir(), ad));
const ctx = () => ({ kanal: 'k', kimlik: { hesap: 'hesap1' }, ayar: { dizi: AYAR } });
const isYaz = (kok, ad, j) => { const f = path.join(kok, 'kuyruk', 'bekleyen', ad + '.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ hesap: 'hesap1', ...j })); };
async function uretNe(kok, d, n, diziler = [d]) {
  let ne = 'yok';
  const uret = async (cx, id, o) => { ne = o.neZaman; return { durum: 'uretildi', dir: path.join(kok, 'videolar', 'k-' + o.hazir.ad) }; };
  await uretBolum(ctx(), d, n, { kok, uret, yaz: () => { }, yorumcular: null, diziler, calistir: async () => ({}) });
  return ne;
}
test('uretBolum: the queue job gets ne_zaman = sabit_zaman exactly (no slot move, no gap rule)', async () => {
  const pin = Date.now() + 2 * SAAT + 17 * 60e3;   // not a slot hour, well under the usual gap
  const kok = tmp('sabit-ub-'); isYaz(kok, 'j1', { ne_zaman: iso(pin), video: 'videolar/k-baska-b1' });   // another job holds that very time
  const d = dizi({ saat: '10:00' }, { sabit_zaman: iso(pin) });
  d.bolumler[0].paylasildi = iso(Date.now() - 3 * SAAT);
  assert.strictEqual(await uretNe(kok, d, 2), iso(pin));
});

test('uretBolum: an unpinned episode moves around another series pinned (not yet produced) episode; the pinned one stays', async () => {
  const kok = tmp('sabit-ub2-'), once = iso(Date.now() - 3 * SAAT);
  const a = dizi({ saat: '10:00' }); a.bolumler[0].paylasildi = once;
  const hedef = D.hedefSlot(a.bolumler[0], AYAR, a);   // where a's episode 2 would go without clashes
  const b = dizi({ id: 'b' }, { sabit_zaman: iso(hedef) }); b.bolumler[0].paylasildi = once;
  const ne = await uretNe(kok, a, 2, [a, b]);
  assert.notStrictEqual(ne, iso(hedef)); assert.ok(Date.parse(ne) > hedef);
  assert.strictEqual(doluSaatler(kok, 'hesap1', a, [a, b], 2).includes(hedef), true);
  assert.strictEqual(doluSaatler(kok, 'hesap1', b, [a, b], 2).includes(hedef), false, 'an episode never clashes with its own pin');
  // the pinned one itself stays put, whatever the queue holds
  isYaz(kok, 'j9', { ne_zaman: iso(hedef), video: 'videolar/k-x-b1' });
  assert.strictEqual(await uretNe(kok, b, 2, [a, b]), iso(hedef));
});

// ---- planner
const dz = (id, yayin, ek = {}) => ({ id, durum: 'aktif', metin_onay: 'onaylandi', bolumler: [...yayin.map((t, i) => ({ n: i + 1, durum: 'yayinda', paylasildi: iso(t) })), { n: yayin.length + 1, durum: 'metin', ...ek }, { n: yayin.length + 2, durum: 'metin' }] });
const slot = (plan, t) => plan.slotlar.find(s => Date.parse(s.saat) === t);
test('planner: a pinned episode is a kilitli slot at exactly its time, on and off the grid, and no one else takes it', () => {
  const a = dz('a', [yerel(19, 10)], { sabit_zaman: iso(yerel(21, 15)) }), z = dz('z', [yerel(19, 12)]);
  const p = P.planla({ diziler: [a, z], reyting: null, ayar: AYAR, simdi: SIMDI });
  const s = slot(p, yerel(21, 15));
  assert.strictEqual(s.kilitli, true); assert.deepStrictEqual(s.atanan, { dizi: 'a', bolum: 2 }); assert.match(s.neden, /sabit/);
  assert.strictEqual(p.slotlar.filter(x => x.atanan && x.atanan.dizi === 'a' && x.atanan.bolum === 2).length, 1);
  // off the slot grid: its own locked slot
  const b = dz('b', [yerel(19, 10)], { sabit_zaman: iso(yerel(20, 12, 20)) });
  const q = P.planla({ diziler: [b], reyting: null, ayar: AYAR, simdi: SIMDI }), o = slot(q, yerel(20, 12, 20));
  assert.ok(o && o.kilitli && o.atanan.dizi === 'b' && o.atanan.bolum === 2);
  // a past pin: nothing locked
  const c = dz('c', [yerel(19, 10)], { sabit_zaman: iso(SIMDI - SAAT) });
  assert.ok(P.planla({ diziler: [c], reyting: null, ayar: AYAR, simdi: SIMDI }).slotlar.every(x => !x.kilitli));
});

test('planner: a pin under the 10 h minimum gap plus a queued job for the pinned episode keep one locked slot', () => {
  const a = dz('a', [yerel(20, 6)], { sabit_zaman: iso(yerel(20, 10)), video: 'videolar/k-a-b2' });   // 4 h after the previous
  const isler = [{ id: 'j2', video: 'videolar/k-a-b2', ne_zaman: iso(yerel(20, 10)) }];
  const p = P.planla({ diziler: [a], reyting: null, isler, ayar: AYAR, simdi: SIMDI }), s = slot(p, yerel(20, 10));
  assert.ok(s.kilitli && s.atanan.dizi === 'a' && s.atanan.bolum === 2);
  assert.strictEqual(p.slotlar.filter(x => x.atanan && x.atanan.dizi === 'a' && x.atanan.bolum === 2).length, 1);
  assert.strictEqual(s.kuyrukta.is, 'j2');
});
