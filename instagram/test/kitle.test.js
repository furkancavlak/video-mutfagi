// Audience data and follows (instagram/istatistik.js): the breakdown parser, the per-reel follow estimate, the daily
// demographics throttle, the 10-minute follower read, real follows typed in the panel and how ozet merges them.
// Fake Graph API, temp roots, no network.
//   node --test "instagram/test/*.test.js"
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const I = require('../istatistik.js');

const DK = 60e3, SAAT = 3600e3, GUN = 864e5;
const T0 = Date.parse('2026-11-10T12:00:00Z');
const kokler = [];
const kokYap = () => { const k = fs.mkdtempSync(path.join(os.tmpdir(), 'istatistik-kitle-')); kokler.push(k); return k; };
test.after(() => { for (const k of kokler) fs.rmSync(k, { recursive: true, force: true }); });   // only this file's own temp roots
const iso = t => new Date(t).toISOString();
const D = (kok, h) => path.join(kok, 'kayit', 'istatistik', h);
const satirOku = f => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch (e) { return []; } };
const yaz = (f, l) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, l.map(x => JSON.stringify(x)).join('\n') + '\n'); };
// Graph's breakdown shape
const bd = (name, rows) => ({ name, total_value: { breakdowns: [{ dimension_keys: ['k'], results: rows.map(([k, v]) => ({ dimension_values: [k], value: v })) }] } });

// a fake paylas.js for the account part: /me/insights answered per metric[:breakdown] by `kitle`, a function key -> data
// object (or throws); one young or old reel in the listing
function sahteP({ reelT = T0 - 2 * SAAT, kitle = {} } = {}) {
  const P = { API_SURUM: 'vT', cagri: [], readAyar: () => ({ token: 'GIZLI' }) };
  P.graph = async (method, p, q) => {
    P.cagri.push({ p, q });
    if (p === '/me') return { followers_count: 500, media_count: 1, username: 'u' };
    if (p === '/me/insights') {
      const k = q.metric + (q.breakdown ? ':' + q.breakdown : ''), f = kitle[k];
      if (typeof f === 'function') return { data: [f(q)] };
      if (f) return { data: [f] };
      return { data: [{ name: q.metric, total_value: { value: 3 } }] };
    }
    if (p === '/me/media') return { data: [{ id: 'R', caption: 'r', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://i/R', timestamp: iso(reelT) }] };
    if (/\/insights$/.test(p)) return { data: [{ name: 'views', values: [{ value: 5 }] }] };
    if (/\/comments$/.test(p)) return { data: [] };
    throw new Error('beklenmeyen ' + p);
  };
  P.kos = (kok, simdi) => I.anlik({ hesap: 'h', kok, P, simdi });
  return P;
}
const demoCagri = P => P.cagri.filter(c => c.p === '/me/insights' && /demographics|online_followers/.test(c.q.metric));

test('kirilim: breakdown results, a {key: n} value, several dimensions, junk rows; takipTuru and cevrimiciOku', () => {
  assert.deepStrictEqual(I.kirilim(bd('follower_demographics', [['Istanbul, Istanbul Province', 40], ['Ankara, Ankara Province', 12]])), { 'Istanbul, Istanbul Province': 40, 'Ankara, Ankara Province': 12 });
  assert.deepStrictEqual(I.kirilim({ total_value: { breakdowns: [{ results: [{ dimension_values: ['F', '18-24'], value: 3 }, { dimension_values: ['F', '18-24'], value: '2' }, { value: 9 }, null, { dimension_values: ['M'], value: 'x' }] }] } }), { 'F|18-24': 5 });
  assert.deepStrictEqual(I.kirilim({ total_value: { breakdowns: [{ results: [] }] } }), {}, 'an empty breakdown is a real nothing');
  assert.deepStrictEqual(I.kirilim({ values: [{ value: { FOLLOWER: 4, NON_FOLLOWER: 1 } }] }), { FOLLOWER: 4, NON_FOLLOWER: 1 });
  assert.strictEqual(I.kirilim({ total_value: { value: 7 } }), null, 'a plain total cannot be split');
  assert.strictEqual(I.kirilim(null), null);
  assert.deepStrictEqual(I.takipTuru({ FOLLOWER: 6, NON_FOLLOWER: 2, UNKNOWN: 9 }), [6, 2]);
  assert.deepStrictEqual(I.takipTuru({ FOLLOWS: 1 }), [1, null]);
  assert.deepStrictEqual(I.takipTuru(null), [null, null]);
  assert.strictEqual(I.cevrimiciOku({ values: [{ value: {} }] }), null, 'Graph sends {} for small accounts');
  assert.deepStrictEqual(I.cevrimiciOku({ values: [{ value: { 0: 3, 23: 9, 24: 1, x: 2 } }, { value: {} }] }), { 0: 3, 23: 9 });
});

test('takipTahmini: gain up to the next post, capped at 24 h, null across a gap > 3 h, negatives kept', () => {
  const y = T0, s = [];
  for (let t = y - SAAT; t <= y + 30 * SAAT; t += SAAT) s.push([t, 1000 + Math.round((t - y) / SAAT) * 10]);   // +10 per hour
  assert.strictEqual(I.takipTahmini(s, [y], y), 240, 'no next post: 24 h window');
  assert.strictEqual(I.takipTahmini(s, [y, y + 5 * SAAT], y), 50, 'cut at the next post');
  assert.strictEqual(I.takipTahmini(s, [y, y + 30 * 60e3 + 5 * SAAT], y + 30 * 60e3), 50, 'interpolated between hourly points');
  assert.strictEqual(I.takipTahmini(s, [y], y + 10 * SAAT), null, 'window not over yet (past the last point)');
  const bosluk = s.filter(([t]) => t < y + 4 * SAAT || t > y + 8 * SAAT);   // a 5 h hole
  assert.strictEqual(I.takipTahmini(bosluk, [y, y + 6 * SAAT], y), null, 'the end falls in a gap');
  assert.strictEqual(I.takipTahmini(bosluk, [y, y + 3 * SAAT], y), 30, 'a window before the gap still counts');
  const dusen = [[y, 1000], [y + 2 * SAAT, 990], [y + 24 * SAAT, 985]];
  assert.strictEqual(I.takipTahmini(dusen, [y, y + 2 * SAAT], y), -10, 'unfollows stay negative');
  assert.strictEqual(I.takipAra(dusen, y + 13 * SAAT), null, '22 h between points is a gap');
});

test('anlik: follows/reach by follow_type in the account snapshot; demographics once a day, each fetch on its own', async () => {
  const kok = kokYap();
  const kitle = {
    'follows_and_unfollows:follow_type': bd('follows_and_unfollows', [['FOLLOWER', 7], ['NON_FOLLOWER', 2]]),
    'reach:follow_type': bd('reach', [['FOLLOWER', 40], ['NON_FOLLOWER', 160]]),
    'follower_demographics:city': bd('follower_demographics', [['Istanbul, Istanbul Province', 50]]),
    'follower_demographics:age': () => { throw new Error('GET /me/insights: (#100) Invalid metric breakdown for this metric (kod 100)'); },
    'follower_demographics:gender': bd('follower_demographics', [['F', 30], ['M', 20]]),
    'engaged_audience_demographics:city': () => { throw new Error('GET /me/insights: bağlantı koptu'); },
    'engaged_audience_demographics:age': bd('e', [['18-24', 5]]),
    'engaged_audience_demographics:gender': bd('e', [['M', 5]]),
    online_followers: { name: 'online_followers', values: [{ value: { 20: 33, 21: 40 } }] },
  };
  const P = sahteP({ kitle });
  const r = await P.kos(kok, T0);
  assert.deepStrictEqual([r.hesap_insight.takip_gelen, r.hesap_insight.takip_giden, r.hesap_insight.erisim_takipci, r.hesap_insight.erisim_takipci_degil], [7, 2, 40, 160]);
  const hs = satirOku(path.join(D(kok, 'h'), 'hesap-2026-11.jsonl'));
  assert.strictEqual(hs[0].hesap_insight.takip_gelen, 7, 'stored in the account snapshot');
  const K = JSON.parse(fs.readFileSync(path.join(D(kok, 'h'), 'kitle.json'), 'utf8'));
  assert.deepStrictEqual(K, { zaman: iso(T0), takipci: { city: { 'Istanbul, Istanbul Province': 50 }, gender: { F: 30, M: 20 } }, etkilesim: { age: { '18-24': 5 }, gender: { M: 5 } }, cevrimici: { 20: 33, 21: 40 } }, 'a failed fetch does not block the others');
  const ds = JSON.parse(fs.readFileSync(path.join(D(kok, 'h'), 'desteklenmeyen.json'), 'utf8'));
  assert.ok(ds['vT|hesap|follower_demographics:age'], 'the refused breakdown is cached under the hesap type');
  assert.ok(!ds['vT|hesap|engaged_audience_demographics:city'], 'a dropped connection is not a verdict');
  assert.strictEqual(demoCagri(P).length, 7);
  // the next hours: the account part runs, the demographics wait for 20 h
  await P.kos(kok, T0 + SAAT); await P.kos(kok, T0 + 19 * SAAT);
  assert.strictEqual(demoCagri(P).length, 7, 'no demographics within 20 h');
  await P.kos(kok, T0 + 20 * SAAT);
  const yeni = demoCagri(P).slice(7).map(c => c.q.metric + ':' + (c.q.breakdown || ''));
  assert.strictEqual(yeni.length, 6, 'the cached refusal is not asked again');
  assert.ok(!yeni.includes('follower_demographics:age'));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(D(kok, 'h'), 'kitle.json'), 'utf8')).zaman, iso(T0 + 20 * SAAT));
  assert.strictEqual(I.kitleZamani({ zaman: iso(T0) }, T0 + 20 * SAAT - 1), false);
  assert.strictEqual(I.kitleZamani(null, T0), true);
  // nothing came back at all (every fetch failed): no file, asked again at the next account part. An empty answer such as
  // online_followers {} is a real answer and counts.
  const koptu = () => { throw new Error('GET /me/insights: bağlantı koptu'); }, hepsi = {};
  for (const m of ['follower_demographics', 'engaged_audience_demographics']) for (const b of ['city', 'age', 'gender']) hepsi[m + ':' + b] = koptu;
  const kok2 = kokYap(), P2 = sahteP({ kitle: { ...hepsi, online_followers: koptu } });
  await P2.kos(kok2, T0);
  assert.ok(!fs.existsSync(path.join(D(kok2, 'h'), 'kitle.json')));
  assert.strictEqual(satirOku(path.join(D(kok2, 'h'), 'hesap-2026-11.jsonl'))[0].hesap_insight.takip_gelen, null, 'unavailable = null');
  await P2.kos(kok2, T0 + SAAT);
  assert.strictEqual(demoCagri(P2).length, 14);
});

test('follows_and_unfollows: a refused breakdown is asked once more without it; a {key: n} value still splits', async () => {
  const kok = kokYap();
  const P = sahteP({ kitle: {
    'follows_and_unfollows:follow_type': () => { throw new Error('GET /me/insights: (#100) breakdown follow_type is not supported for metric follows_and_unfollows (kod 100)'); },
    follows_and_unfollows: { name: 'follows_and_unfollows', values: [{ value: { FOLLOWS: 4, UNFOLLOWS: 1 } }] },
  } });
  const r = await P.kos(kok, T0);
  assert.deepStrictEqual([r.hesap_insight.takip_gelen, r.hesap_insight.takip_giden], [4, 1]);
});

test('anlik: the follower count every 10 min only while a reel is younger than 6 h; the hourly count joins the series', async () => {
  const kok = kokYap(), P = sahteP({ reelT: T0 - 5 * SAAT }), f = path.join(D(kok, 'h'), 'takipci-2026-11.jsonl');
  const okuma = () => P.cagri.filter(c => c.p === '/me' && c.q.fields === 'followers_count').length;
  await P.kos(kok, T0);
  assert.deepStrictEqual(satirOku(f), [{ v: 2, zaman: iso(T0), takipci: 500 }], 'the account part writes its count');
  assert.strictEqual(okuma(), 0, 'the account part already read it');
  await P.kos(kok, T0 + 10 * DK); await P.kos(kok, T0 + 20 * DK);
  assert.strictEqual(okuma(), 2);
  assert.deepStrictEqual(satirOku(f).map(x => x.zaman), [iso(T0), iso(T0 + 10 * DK), iso(T0 + 20 * DK)]);
  await P.kos(kok, T0 + 61 * DK + 10 * DK);   // the reel is now past 6 h
  const n = okuma();
  await P.kos(kok, T0 + 61 * DK + 20 * DK);
  assert.strictEqual(okuma(), n, 'no young reel: no extra read');
  // an old reel only: never between the account parts
  const kok2 = kokYap(), P2 = sahteP({ reelT: T0 - 3 * GUN });
  await P2.kos(kok2, T0); await P2.kos(kok2, T0 + 10 * DK);
  assert.strictEqual(P2.cagri.filter(c => c.p === '/me' && c.q.fields === 'followers_count').length, 0);
});

test('real follows: validation, persistence, clearing', () => {
  const kok = kokYap();
  for (const bad of [{ media_id: '../x', takip: 1 }, { media_id: 'a b', takip: 1 }, { media_id: 'R', takip: -1 }, { media_id: 'R', takip: 1.5 }, { media_id: 'R', takip: 1e7 + 1 }, { media_id: 'R', takip: '5' }, { media_id: 5, takip: 5 }])
    assert.throws(() => I.takipElleYaz({ kok, hesap: 'h', ...bad }), /geçersiz|tam sayı/, JSON.stringify(bad));
  assert.throws(() => I.takipElleYaz({ kok, hesap: '../h', media_id: 'R', takip: 1 }), /hesap/);
  const r = I.takipElleYaz({ kok, hesap: 'h', media_id: 'R.1_x-2', takip: 0, simdi: T0 });
  assert.deepStrictEqual(r, { ok: true, media_id: 'R.1_x-2', takip: 0, zaman: iso(T0) });
  I.takipElleYaz({ kok, hesap: 'h', media_id: 'S', takip: 1e7, simdi: T0 });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(D(kok, 'h'), 'takip-elle.json'), 'utf8')), { 'R.1_x-2': { takip: 0, zaman: iso(T0) }, S: { takip: 1e7, zaman: iso(T0) } });
  I.takipElleYaz({ kok, hesap: 'h', media_id: 'S', takip: null });
  assert.deepStrictEqual(Object.keys(I.takipElleOku(kok, 'h')), ['R.1_x-2']);
});

test('ozet: takip / takip_elle / takip_tahmini per reel, takip_eksik, kitle, daily follows and reach, identity card', () => {
  const kok = kokYap(), d = D(kok, 'h'), simdi = T0;
  const yA = simdi - 10 * GUN, yB = yA + 6 * SAAT, yC = simdi - 2 * GUN;   // A and B old, C young
  const gz = [];
  for (const [id, y] of [['A', yA], ['B', yB], ['C', yC]]) for (let h = 1; h <= 30; h++) gz.push({ v: 2, zaman: iso(y + h * SAAT), media_id: id, yayin: iso(y), yas_s: h * 3600, api: 'v', metrik: { views: 10 * h }, yok: {} });
  gz.sort((a, b) => Date.parse(a.zaman) - Date.parse(b.zaman));
  yaz(path.join(d, 'gozlem-2026-10.jsonl'), gz.filter(x => x.zaman < '2026-11'));
  yaz(path.join(d, 'gozlem-2026-11.jsonl'), gz.filter(x => x.zaman >= '2026-11'));
  fs.writeFileSync(path.join(d, 'medya.json'), JSON.stringify({ A: { t: iso(yA), tur: 'reel', baslik: 'A' }, B: { t: iso(yB), tur: 'reel', baslik: 'B' }, C: { t: iso(yC), tur: 'reel', baslik: 'C' } }));
  // followers: +2 per hour from A's posting on, hourly, through the end
  const tk = []; for (let t = yA - SAAT; t <= simdi; t += SAAT) tk.push({ v: 2, zaman: iso(t), takipci: 100 + 2 * Math.max(0, Math.round((t - yA) / SAAT)) });
  yaz(path.join(d, 'takipci-2026-10.jsonl'), tk.filter(x => x.zaman < '2026-11')); yaz(path.join(d, 'takipci-2026-11.jsonl'), tk.filter(x => x.zaman >= '2026-11'));
  // two account snapshots on the same (Istanbul) day yesterday: the later one carries the day's value
  const dun = Date.parse('2026-11-09T10:00:00Z');
  yaz(path.join(d, 'hesap-2026-11.jsonl'), [
    { v: 2, zaman: iso(dun), takipci: null, hesap_insight: { takip_gelen: 1, takip_giden: 0, erisim_takipci: 5, erisim_takipci_degil: null } },
    { v: 2, zaman: iso(dun + 5 * SAAT), takipci: null, hesap_insight: { takip_gelen: 6, takip_giden: 2, erisim_takipci: 30, erisim_takipci_degil: 90 } }]);
  fs.writeFileSync(path.join(d, 'kitle.json'), JSON.stringify({ zaman: iso(simdi - SAAT), takipci: { city: { X: 1 } }, etkilesim: {}, cevrimici: null }));
  I.takipElleYaz({ kok, hesap: 'h', media_id: 'B', takip: 9, simdi });
  const ek = {
    isler: [{ media_id: 'C', video: 'videolar/c' }],
    diziler: [{ id: 'dz', baslik: 'Dizi', anlatici: { ses: 'VOICE1' }, kapak_baslik: 'KAPAK', bolumler: [{ n: 1, media_id: 'A', metin: '[sighs] Bir sabah... kapıyı açtım. Sonra her şey değişti!' }, { n: 2, media_id: 'B', metin: 'x'.repeat(200) }] }],
    kimlik: { 'videolar/c': { metin: 'Tek video. İkinci cümle.', ses: 'VOICE2', bolum: null, toplam_bolum: null } },
  };
  const o = I.ozet({ kok, hesap: 'h', gun: 7, simdi, ek }), o14 = I.ozet({ kok, hesap: 'h', gun: 14, simdi, ek });
  const v = id => o14.videolar.find(x => x.id === id);
  assert.deepStrictEqual([v('A').takip_tahmini, v('A').takip, v('A').takip_elle], [12, null, false], 'A: cut at B, 6 h x 2');
  assert.deepStrictEqual([v('B').takip_tahmini, v('B').takip, v('B').takip_elle], [48, 9, true], 'B: 24 h x 2, the real number beside it');
  assert.strictEqual(v('C').takip_tahmini, 48);
  assert.strictEqual(o.takip_eksik, 1, 'only A: older than 7 days, nothing typed');
  assert.strictEqual(o14.takip_eksik, 1);
  assert.deepStrictEqual(o.videolar.map(x => x.id).sort(), ['A', 'C'], 'with 7 days A is sent although it is older (it waits for a number), B is not');
  assert.deepStrictEqual(o.kitle.takipci, { city: { X: 1 } });
  const g = o.gunluk.find(x => x.gun === '2026-11-09');
  assert.deepStrictEqual([g.takip_gelen, g.takip_giden, g.erisim_takipci, g.erisim_takipci_degil], [6, 2, 30, 90]);
  assert.ok(!('takip_gelen' in o.gunluk.find(x => x.gun === '2026-11-08')), 'unknown days carry no follow fields');
  assert.deepStrictEqual([v('A').acilis, v('A').bolum, v('A').toplam_bolum, v('A').ses, v('A').kapak_baslik], ['Bir sabah... kapıyı açtım.', 1, 2, 'VOICE1', 'KAPAK']);
  assert.strictEqual(v('B').acilis.length, 120);
  assert.deepStrictEqual([v('C').acilis, v('C').ses, v('C').bolum, v('C').kapak_baslik], ['Tek video.', 'VOICE2', null, null], 'from the video folder');
  assert.strictEqual(I.ozet({ kok, hesap: 'yok', gun: 7, simdi }).kitle, null);
});
