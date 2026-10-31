// Offline tests for the slot planner (dizi/planla.js): pure, hand-made ratings, local-time slots like dizi.sonrakiSlotSaati.
//   node --test "dizi/test/*.test.js"
const test = require('node:test'), assert = require('node:assert');
const P = require('../planla');

const SAAT = 3600e3;
const yerel = (g, h) => new Date(2026, 10, g, h, 0, 0, 0).getTime();   // 2026-11-<g> <h>:00 local
const SIMDI = yerel(20, 8);
const AYAR = { saatler: ['10:00', '15:00', '20:00'] };
const iso = t => new Date(t).toISOString();
// a series: `yayin` posted episode times, then `kalan` unposted episodes
const dizi = (id, yayin, kalan = 2, ek = {}) => ({ id, durum: 'aktif', metin_onay: 'onaylandi',
  bolumler: [...yayin.map((t, i) => ({ n: i + 1, durum: 'yayinda', paylasildi: iso(t), media_id: `${id}-m${i + 1}` })), ...Array.from({ length: kalan }, (_, i) => ({ n: yayin.length + i + 1, durum: 'metin' }))], ...ek });
const ry = (ds, ek = {}) => ({ zaman: iso(SIMDI), gecici: false, bolumler: {}, canlanan: [], diziler: Object.fromEntries(Object.entries(ds).map(([id, v]) => [id, { mu: 0, sd: 0.2, R: 50, n_bolum: 1, trend: false, ...v }])), ...ek });
const slot = (plan, g, h) => plan.slotlar.find(s => Date.parse(s.saat) === yerel(g, h));

test('slots: the configured hours of the next 48 h', () => {
  const s = P.slotSaatleri(AYAR, SIMDI);
  assert.deepStrictEqual(s, [yerel(20, 10), yerel(20, 15), yerel(20, 20), yerel(21, 10), yerel(21, 15), yerel(21, 20)]);
  const p = P.planla({ diziler: [], reyting: null, ayar: AYAR, simdi: SIMDI });
  assert.strictEqual(p.golge, true); assert.strictEqual(p.slotlar.length, 6);
  assert.ok(p.slotlar.every(x => x.atanan === null && x.neden === 'aday yok'));
});

test('locked: a queued job under 3 h is fixed; a later one is only tentative', () => {
  const d = dizi('a', [yerel(19, 10)], 3);
  d.bolumler[1].video = 'videolar/k-a-b2'; d.bolumler[2].video = 'videolar/k-a-b3';
  const isler = [{ id: 'j2', video: 'videolar/k-a-b2', ne_zaman: iso(yerel(20, 10)) }, { id: 'j3', video: 'videolar/k-a-b3', ne_zaman: iso(yerel(21, 15)) }];
  const p = P.planla({ diziler: [d], reyting: ry({ a: {} }), isler, ayar: AYAR, simdi: SIMDI });
  const s0 = slot(p, 20, 10), s4 = slot(p, 21, 15);
  assert.strictEqual(s0.kilitli, true); assert.deepStrictEqual(s0.atanan, { dizi: 'a', bolum: 2 });
  assert.deepStrictEqual(s4.kuyrukta, { dizi: 'a', bolum: 3, is: 'j3' }); assert.strictEqual(s4.kilitli, false);
  // episode 3 is planned at least 10 h after the locked episode 2, before 30 h
  const e3 = p.slotlar.find(x => x.atanan && x.atanan.bolum === 3);
  assert.ok(Date.parse(e3.saat) - yerel(20, 10) >= 10 * SAAT && Date.parse(e3.saat) - yerel(20, 10) <= 30 * SAAT);
});

test('continuity beats rating: a weak series near its 30 h limit gets the earliest slot; 10 h minimum gap', () => {
  const zayif = dizi('z', [yerel(19, 20)]), guclu = dizi('g', [yerel(20, 7)]);
  const p = P.planla({ diziler: [zayif, guclu], reyting: ry({ z: { mu: -0.3, R: 10 }, g: { mu: 0.5, R: 95 } }), ayar: AYAR, simdi: SIMDI });
  assert.deepStrictEqual(slot(p, 20, 10).atanan, { dizi: 'z', bolum: 2 });
  assert.match(slot(p, 20, 10).neden, /süreklilik/);
  // g posted at 07:00: 10:00 and 15:00 are too close
  for (const s of p.slotlar) if (s.atanan && s.atanan.dizi === 'g') assert.ok(Date.parse(s.saat) - yerel(20, 7) >= 10 * SAAT);
  // no series ever has two episodes closer than 10 h, nor a gap over 30 h inside the horizon
  for (const id of ['z', 'g']) {
    const t = [id === 'z' ? yerel(19, 20) : yerel(20, 7), ...p.slotlar.filter(s => s.atanan && s.atanan.dizi === id).map(s => Date.parse(s.saat))];
    for (let i = 1; i < t.length; i++) { assert.ok(t[i] - t[i - 1] >= 10 * SAAT); assert.ok(t[i] - t[i - 1] <= 30 * SAAT, `${id} gap`); }
  }
});

test('trend: the trending series takes tomorrow\'s first slot', () => {
  const ds = [dizi('t', [yerel(20, 7)], 3), dizi('b', [yerel(19, 15)], 3), dizi('c', [yerel(19, 20)], 3)];
  const r = ry({ t: { mu: 0.2, R: 80, trend: true }, b: { mu: 0.4, R: 90 }, c: { mu: 0.1 } });
  const p = P.planla({ diziler: ds, reyting: r, ayar: AYAR, simdi: SIMDI });
  assert.strictEqual(slot(p, 21, 10).atanan.dizi, 't');
  assert.match(slot(p, 21, 10).neden, /trend/);
  assert.ok(p.kararlar.some(k => k.tur === 'trend-one-al' && k.dizi === 't'));
  // without the trend flag the 10:00 slot goes by rating / continuity, not to t
  const p2 = P.planla({ diziler: ds, reyting: ry({ t: { mu: 0.2 }, b: { mu: 0.4 }, c: { mu: 0.1 } }), ayar: AYAR, simdi: SIMDI });
  assert.ok(!p2.kararlar.some(k => k.tur === 'trend-one-al'));
});

test('remaining slots go by mu; a benched series only when canlanan or nobody else', () => {
  const a = dizi('a', [yerel(19, 10)], 4), kes = dizi('k', [yerel(18, 10)], 2, { durum: 'kesildi' });
  // a alone (needs >= 10 h gaps): the benched one fills a slot a cannot take
  const p = P.planla({ diziler: [a, kes], reyting: ry({ a: { mu: 0.1 }, k: { mu: -0.5 } }), ayar: AYAR, simdi: SIMDI });
  const kSlot = p.slotlar.filter(s => s.atanan && s.atanan.dizi === 'k');
  assert.ok(kSlot.length >= 1 && /başka aday yok/.test(kSlot[0].neden));
  assert.ok(p.kararlar.some(k => k.tur === 'geri-cagir' && k.dizi === 'k'));
  // canlanan: it competes by mu with the running ones for the slots continuity leaves free
  const b = dizi('b', [yerel(19, 15)], 4);
  const r2 = ry({ a: { mu: -0.2 }, b: { mu: -0.1 }, k: { mu: 0.3 } }, { canlanan: [{ media_id: 'k-m1', dizi: 'k', Zvel: 3 }] });
  const p2 = P.planla({ diziler: [a, b, kes], reyting: r2, ayar: AYAR, simdi: SIMDI });
  assert.ok(slot(p2, 20, 20).atanan.dizi === 'k' && /canlandı/.test(slot(p2, 20, 20).neden));
  // not canlanan and others available: it stays out of that slot
  const p3 = P.planla({ diziler: [a, b, kes], reyting: ry({ a: { mu: -0.2 }, b: { mu: -0.1 }, k: { mu: 0.3 } }), ayar: AYAR, simdi: SIMDI });
  assert.strictEqual(slot(p3, 20, 20).atanan.dizi, 'a');
});

test('capacity: a stock story starts only while running < slots; at most one a day while gecici', () => {
  const stok = (id, g) => ({ ...dizi(id, [], 3), stok: true, olusturma: iso(yerel(g, 1)) });
  const run = [dizi('a', [yerel(19, 10)]), dizi('b', [yerel(19, 15)]), dizi('c', [yerel(19, 20)])];
  const dolu = P.planla({ diziler: [...run, stok('s1', 10)], reyting: ry({ a: {}, b: {}, c: {} }), ayar: AYAR, simdi: SIMDI });
  assert.ok(!dolu.kararlar.some(k => k.tur === 'yeni-baslat'));
  const iki = P.planla({ diziler: [run[0], stok('s1', 10), stok('s2', 11)], reyting: ry({ a: {} }), ayar: AYAR, simdi: SIMDI });
  assert.deepStrictEqual(iki.kararlar.filter(k => k.tur === 'yeni-baslat').map(k => k.dizi), ['s1', 's2']);   // oldest first
  const gec = P.planla({ diziler: [run[0], stok('s1', 10), stok('s2', 11)], reyting: ry({ a: {} }, { gecici: true }), ayar: AYAR, simdi: SIMDI });
  const yeni = gec.slotlar.filter(s => s.atanan && /yeni hikâye/.test(s.neden || ''));
  const gunler = yeni.map(s => new Date(s.saat).getDate());
  assert.strictEqual(new Set(gunler).size, gunler.length);           // never two new trials on one day
});

test('bench: two plan runs >= 6 h apart with new data; provisional only flags', () => {
  const d = dizi('w', [yerel(19, 10)], 3);
  const zayif = (yas, ek = {}) => ry({ w: { mu: -0.5, sd: 0.2, R: 1 } }, { bolumler: { 'w-m1': { dizi: 'w', yas_h: yas } }, ...ek });
  const r1 = P.planYap({ diziler: [d], reyting: zayif(22), ayar: AYAR, simdi: SIMDI });
  assert.ok(!r1.plan.kararlar.some(k => k.tur === 'yedege-al'));
  assert.ok(r1.gecmis.diziler.w.zayif);
  // 3 h later: too soon
  const r2 = P.planYap({ diziler: [d], reyting: zayif(25), ayar: AYAR, simdi: SIMDI + 3 * SAAT, gecmis: r1.gecmis });
  assert.ok(!r2.plan.kararlar.some(k => k.tur === 'yedege-al'));
  // 7 h later but no new observation: not fresh
  const r3 = P.planYap({ diziler: [d], reyting: zayif(22), ayar: AYAR, simdi: SIMDI + 7 * SAAT, gecmis: r1.gecmis });
  assert.ok(!r3.plan.kararlar.some(k => k.tur === 'yedege-al'));
  // 7 h later with new data: benched, and the series holds no slot
  const r4 = P.planYap({ diziler: [d], reyting: zayif(29), ayar: AYAR, simdi: SIMDI + 7 * SAAT, gecmis: r1.gecmis });
  assert.ok(r4.plan.kararlar.some(k => k.tur === 'yedege-al' && k.dizi === 'w'));
  assert.ok(r4.gecmis.diziler.w.yedek);
  // provisional: the same evidence only flags
  const r5 = P.planYap({ diziler: [d], reyting: zayif(29, { gecici: true }), ayar: AYAR, simdi: SIMDI + 7 * SAAT, gecmis: r1.gecmis });
  assert.ok(!r5.plan.kararlar.some(k => k.tur === 'yedege-al'));
  assert.ok(r5.plan.kararlar.some(k => k.tur === 'isaret' && k.dizi === 'w'));
  assert.ok(!r5.gecmis.diziler.w.yedek);
  // a good run in between resets the streak
  const iyi = P.planYap({ diziler: [d], reyting: ry({ w: { mu: 0.1 } }, { bolumler: { 'w-m1': { dizi: 'w', yas_h: 25 } } }), ayar: AYAR, simdi: SIMDI + 3 * SAAT, gecmis: r1.gecmis });
  assert.ok(!iyi.gecmis.diziler.w.zayif);
});

test('a finished series leaves the planner; unapproved or stock-only text never runs', () => {
  const bitti = dizi('f', [yerel(19, 10), yerel(20, 6)], 0);
  const bekl = { ...dizi('m', [], 3), metin_onay: 'bekliyor', stok: true };
  const p = P.planla({ diziler: [bitti, bekl], reyting: ry({ f: { mu: 1 } }), ayar: AYAR, simdi: SIMDI });
  assert.ok(p.slotlar.every(s => s.atanan === null));
});

test('isBolum: a job maps to its series episode by the video folder', () => {
  assert.deepStrictEqual(P.isBolum({ video: 'videolar/kanal-abc-b2' }, [{ id: 'abc', bolumler: [] }]), { dizi: 'abc', bolum: 2 });
  assert.strictEqual(P.isBolum({ video: 'videolar/baska' }, [{ id: 'abc', bolumler: [] }]), null);
});
