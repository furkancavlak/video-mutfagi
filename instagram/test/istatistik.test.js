// Statistics data layer v2 (instagram/istatistik.js): age-based cadence, revival, paged listing, series episodes outside
// the listing, the unsupported-metric cache, observation rows and the readers. Fake Graph API, temp roots, no network.
//   node --test "instagram/test/*.test.js"
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const I = require('../istatistik.js');

const DK = 60e3, SAAT = 3600e3, GUN = 864e5;
const T0 = Date.parse('2026-11-10T12:00:00Z');
const kokler = [];
const kokYap = () => { const k = fs.mkdtempSync(path.join(os.tmpdir(), 'istatistik2-')); kokler.push(k); return k; };
test.after(() => { for (const k of kokler) fs.rmSync(k, { recursive: true, force: true }); });   // only this file's own temp roots
const iso = t => new Date(t).toISOString();
const reel = (id, t) => ({ id, caption: 'Reel ' + id, media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://i/' + id, timestamp: iso(t) });
const D = (kok, h) => path.join(kok, 'kayit', 'istatistik', h);
const satirOku = f => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch (e) { return []; } };
const gozlemSatirlari = (kok, h) => { try { return fs.readdirSync(D(kok, h)).filter(f => f.startsWith('gozlem-')).sort().flatMap(f => satirOku(path.join(D(kok, h), f))); } catch (e) { return []; } };
const kayit = (kok, h) => JSON.parse(fs.readFileSync(path.join(D(kok, h), 'medya.json'), 'utf8'));

// fake paylas.js: listing pages by cursor; insights answered by `deger(id, metric, simdi)` (undefined = metric left out),
// `ret` metrics refused with Graph's code 100, `hata(id)` a non-metric error for that call
function sahteP({ sayfalar = { ilk: { data: [] } }, deger = () => 10, ret = [], hata, meta = {} } = {}) {
  const P = { API_SURUM: 'vTEST', cagri: [], simdi: T0, readAyar: () => ({ token: 'GIZLI' }) };
  P.graph = async (method, p, q) => {
    P.cagri.push({ p, q });
    if (p === '/me') return { followers_count: 50, media_count: 3, username: 'u' };
    if (p === '/me/insights') return { data: [{ name: q.metric, total_value: { value: 5 } }] };
    if (p === '/me/media') return sayfalar[q.after || 'ilk'];
    let m = /^\/([\w.-]+)\/insights$/.exec(p);
    if (m) {
      const ms = q.metric.split(','), h = hata && hata(m[1]);
      if (h) throw new Error(`GET ${p}: ${h}`);
      const r = ms.find(x => ret.includes(x));
      if (r) throw new Error(`GET ${p}: (#100) The Media Insights API does not support the ${r} metric for this media (kod 100)`);
      return { data: ms.map(x => ({ name: x, v: deger(m[1], x, P.simdi) })).filter(x => x.v !== undefined).map(x => ({ name: x.name, values: [{ value: x.v }] })) };
    }
    if (/\/comments$/.test(p)) return { data: [] };
    m = /^\/([\w.-]+)$/.exec(p);
    if (m && meta[m[1]]) return meta[m[1]];
    throw new Error('beklenmeyen ' + p);
  };
  P.kos = (kok, hesap, simdi) => { P.simdi = simdi; return I.anlik({ hesap, kok, P, simdi }); };
  return P;
}
const insightCagri = (P, id) => P.cagri.filter(c => c.p === `/${id}/insights`);

test('cadence: due at 90 % of the interval of each age band; revival keeps an old reel hourly until hizli_bitis', () => {
  const bantlar = [[1 * SAAT, 10 * DK], [24 * SAAT, SAAT], [5 * GUN, 6 * SAAT], [30 * GUN, GUN], [90 * GUN, 7 * GUN]];
  for (const [yas, aralik] of bantlar) {
    assert.strictEqual(I.kadans(yas), aralik);
    const k = { t: iso(T0 - yas) };
    assert.strictEqual(I.zamaniGeldi({ ...k }, T0), true, 'never observed = due');
    assert.strictEqual(I.zamaniGeldi({ ...k, son_gozlem: iso(T0 - 0.89 * aralik) }, T0), false, `age ${yas}: not yet`);
    assert.strictEqual(I.zamaniGeldi({ ...k, son_gozlem: iso(T0 - 0.9 * aralik) }, T0), true, `age ${yas}: due within the tolerance`);
  }
  assert.deepStrictEqual([I.kadans(6 * SAAT - 1), I.kadans(6 * SAAT), I.kadans(72 * SAAT), I.kadans(14 * GUN), I.kadans(60 * GUN)], [10 * DK, SAAT, 6 * SAAT, GUN, 7 * GUN]);
  const eski = { t: iso(T0 - 10 * GUN), son_gozlem: iso(T0 - 61 * DK) };
  assert.strictEqual(I.zamaniGeldi(eski, T0), false);
  assert.strictEqual(I.zamaniGeldi({ ...eski, hizli_bitis: iso(T0 + SAAT) }, T0), true, 'promoted: hourly');
  assert.strictEqual(I.zamaniGeldi({ ...eski, hizli_bitis: iso(T0 - 1) }, T0), false, 'expired promotion: back to 6 h');
  // renewed growth: >= 3 x the views/h before and >= 1 view/h
  assert.strictEqual(I.canlandi([[0, 0], [SAAT, 10], [2 * SAAT, 40]]), true);
  assert.strictEqual(I.canlandi([[0, 0], [SAAT, 10], [2 * SAAT, 39]]), false);
  assert.strictEqual(I.canlandi([[0, 5], [SAAT, 5], [3 * SAAT, 6]]), false, '0.5 view/h is below the floor');
  assert.strictEqual(I.canlandi([[0, 5], [SAAT, 5], [2 * SAAT, 6]]), true, 'from flat to 1 view/h');
  assert.strictEqual(I.canlandi([[SAAT, 10], [2 * SAAT, 40]]), false, 'needs three points');
});

test('anlik: a young reel every 10 min, the account part hourly; an old reel that grows again goes hourly for 48 h, then back', async () => {
  const kok = kokYap(), S = T0, yeniT = S - 2 * SAAT, eskiT = S - 5 * GUN;
  // views of the old reel: 10/h, then 100/h between S+6h and S+13h, then flat
  const eskiV = t => { const h = (t - S) / SAAT; return Math.round(1000 + 10 * Math.min(h, 6) + (h > 6 ? 100 * (Math.min(h, 13) - 6) : 0)); };
  const P = sahteP({ sayfalar: { ilk: { data: [reel('Y', yeniT), reel('E', eskiT)] } }, deger: (id, m, t) => m === 'views' ? (id === 'E' ? eskiV(t) : Math.round((t - yeniT) / DK)) : 1 });
  const me = () => P.cagri.filter(c => c.p === '/me' && /media_count/.test(c.q.fields)).length;   // the account part's /me (the 10-minute follower read asks followers_count only)
  const r0 = await P.kos(kok, 'h', S);
  assert.strictEqual(r0.gozlenen, 2); assert.strictEqual(me(), 1);
  const r1 = await P.kos(kok, 'h', S + 10 * DK);
  assert.deepStrictEqual([r1.atlandi, r1.gozlenen, me()], [true, 1, 1], 'only the young reel; no account call');
  assert.strictEqual(insightCagri(P, 'E').length, 1);
  await P.kos(kok, 'h', S + 6 * SAAT);
  assert.ok(!kayit(kok, 'h').E.hizli_bitis, 'steady growth is no revival');
  await P.kos(kok, 'h', S + 12 * SAAT);
  assert.strictEqual(kayit(kok, 'h').E.hizli_bitis, iso(S + 12 * SAAT + 48 * SAAT), '100/h after 10/h: promoted');
  const n = insightCagri(P, 'E').length;
  await P.kos(kok, 'h', S + 13 * SAAT);
  assert.strictEqual(insightCagri(P, 'E').length, n + 1, 'observed again after one hour');
  await P.kos(kok, 'h', S + 60 * SAAT + DK);
  assert.ok(!('hizli_bitis' in kayit(kok, 'h').E), 'promotion expired and removed');
  assert.strictEqual(insightCagri(P, 'E').length, n + 2);
  await P.kos(kok, 'h', S + 61 * SAAT + DK);
  assert.strictEqual(insightCagri(P, 'E').length, n + 2, 'back to every 6 h');
  // account snapshots: one per account part, in the v2 shape; the hourly line keeps its old shape
  const hs = satirOku(path.join(D(kok, 'h'), 'hesap-2026-11.jsonl'));
  assert.deepStrictEqual(Object.keys(hs[0]).sort(), ['hesap_insight', 'medya_sayisi', 'takipci', 'v', 'zaman']);
  assert.strictEqual(hs.length, satirOku(path.join(D(kok, 'h'), '2026-11.jsonl')).length);
  const eskiSatir = satirOku(path.join(D(kok, 'h'), '2026-11.jsonl'))[0];
  assert.deepStrictEqual([eskiSatir.takipci, eskiSatir.medya.map(m => m.id), eskiSatir.medya[0].views], [50, ['Y', 'E'], 120]);
});

test('listing: pages through paging.next until a page reaches past 60 days, at most 10 pages', async () => {
  const kok = kokYap(), son = cursor => ({ next: 'https://graph.instagram.com/v/me/media?after=' + cursor, cursors: { after: cursor } });
  const sayfalar = {
    ilk: { data: [reel('a', T0 - GUN), reel('b', T0 - 10 * GUN)], paging: son('c2') },
    c2: { data: [reel('c', T0 - 30 * GUN), reel('d', T0 - 61 * GUN)], paging: son('c3') },
    c3: { data: [reel('e', T0 - 90 * GUN)] },
  };
  const P = sahteP({ sayfalar });
  await P.kos(kok, 'h', T0);
  assert.deepStrictEqual(P.cagri.filter(c => c.p === '/me/media').map(c => c.q.after || null), [null, 'c2']);
  assert.deepStrictEqual(Object.keys(kayit(kok, 'h')).sort(), ['a', 'b', 'c', 'd']);
  // the next link alone (no cursors) is enough; an endless recent listing stops at 10 pages
  const P2 = sahteP({ sayfalar: new Proxy({}, { get: (_, k) => ({ data: [reel('x' + String(k).length, T0 - GUN)], paging: { next: 'https://graph.instagram.com/v/me/media?after=' + k + 'z' } }) }) });
  await P2.kos(kokYap(), 'h', T0);
  assert.strictEqual(P2.cagri.filter(c => c.p === '/me/media').length, 10);
});

test('registry: series episodes of this account are observed even when the listing no longer has them', async () => {
  const kok = kokYap(), yaz = (f, j) => { fs.mkdirSync(path.dirname(path.join(kok, f)), { recursive: true }); fs.writeFileSync(path.join(kok, f), JSON.stringify(j)); };
  yaz('kanal/k1/kimlik.json', { hesap: '@Hesap_E' });
  yaz('kayit/dizi/k1/diziler.json', { diziler: [{ id: 'd1', baslik_kisa: 'Dizi', bolumler: [{ n: 1, media_id: 'E1', paylasildi: iso(T0 - 70 * GUN) }, { n: 2, media_id: 'E2' }, { n: 3 }] }] });
  yaz('kanal/k2/kimlik.json', { hesap: 'baska' });
  yaz('kayit/dizi/k2/diziler.json', { diziler: [{ id: 'd2', bolumler: [{ n: 1, media_id: 'X9', paylasildi: iso(T0 - GUN) }] }] });
  const P = sahteP({ sayfalar: { ilk: { data: [reel('L1', T0 - GUN)] } }, meta: { E2: { timestamp: iso(T0 - 3 * GUN), permalink: 'https://i/E2' } } });
  const r = await P.kos(kok, 'hesap_e', T0);
  assert.strictEqual(insightCagri(P, 'E1').length, 1, 'episode outside the listing still read');
  assert.strictEqual(insightCagri(P, 'E2').length, 1, 'posting time fetched once, then read');
  assert.strictEqual(insightCagri(P, 'X9').length, 0, "another account's episode is left alone");
  const R = kayit(kok, 'hesap_e');
  assert.deepStrictEqual([R.E1.dizi, R.E1.bolum, R.E1.t, R.E2.t, R.E2.link], ['d1', 1, iso(T0 - 70 * GUN), iso(T0 - 3 * GUN), 'https://i/E2']);
  assert.deepStrictEqual(r.medya.map(m => m.id), ['L1', 'E1', 'E2'], 'the hourly line carries the episodes too');
  assert.deepStrictEqual(gozlemSatirlari(kok, 'hesap_e').map(x => x.media_id).sort(), ['E1', 'E2', 'L1']);
});

test('unsupported cache: only a Graph "metric" answer (code 100) counts, kept per api|type|metric and asked again after 24 h', async () => {
  const d = m => I.desteksizMi(new Error(m));
  assert.strictEqual(d('GET /1/insights: (#100) metric[9] must be one of the following values: views, reach (kod 100)'), true);
  assert.strictEqual(d('GET /1/insights: (#100) Object with ID 1 does not exist (kod 100)'), false, 'a deleted media is not a metric answer');
  assert.strictEqual(d('GET /1/insights: bağlantı koptu (ETIMEDOUT)'), false);
  assert.strictEqual(d('GET /1/insights: 502'), false, '5xx without a Graph body');
  assert.strictEqual(d('GET /1/insights: An unexpected error has occurred with the metric (kod 2)'), false, 'transient Graph code');
  assert.strictEqual(d('GET /1/insights: Error validating access token (kod 190)'), false);
  const kok = kokYap(), sayfalar = { ilk: { data: [reel('R', T0 - 3 * GUN)] } };   // 6 h cadence
  const P = sahteP({ sayfalar, ret: ['reels_skip_rate'] });
  await P.kos(kok, 'h', T0);
  const ds = JSON.parse(fs.readFileSync(path.join(D(kok, 'h'), 'desteklenmeyen.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(ds), ['vTEST|reel|reels_skip_rate']);
  assert.deepStrictEqual([ds['vTEST|reel|reels_skip_rate'].kod, ds['vTEST|reel|reels_skip_rate'].zaman], [100, iso(T0)]);
  assert.ok(!JSON.stringify(ds).includes('GIZLI'));
  assert.strictEqual(insightCagri(P, 'R').length, 1 + I.METRIKLER.length, 'the combined call, then one by one');
  await P.kos(kok, 'h', T0 + 6 * SAAT);
  const c6 = insightCagri(P, 'R').slice(-1)[0].q.metric;
  assert.ok(!c6.includes('reels_skip_rate') && c6.includes('views'), 'inside 24 h it is not asked');
  assert.strictEqual(gozlemSatirlari(kok, 'h').pop().yok.reels_skip_rate, 'desteklenmiyor');
  const P2 = sahteP({ sayfalar });
  await P2.kos(kok, 'h', T0 + 24 * SAAT);
  assert.ok(insightCagri(P2, 'R')[0].q.metric.includes('reels_skip_rate'), 'after 24 h it is asked again');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(D(kok, 'h'), 'desteklenmeyen.json'), 'utf8')), {}, 'and forgotten once Graph gives it');
  // a network failure is "hata": nothing cached, no one-by-one storm, the reel is tried again within the hour
  const kok2 = kokYap(), P3 = sahteP({ sayfalar, hata: () => 'bağlantı koptu (ECONNRESET)' });
  await P3.kos(kok2, 'h', T0);
  assert.strictEqual(insightCagri(P3, 'R').length, 1);
  const g = gozlemSatirlari(kok2, 'h')[0];
  assert.deepStrictEqual([g.yok.views, g.metrik.views, /bağlantı koptu/.test(g.hata)], ['hata', null, true]);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(D(kok2, 'h'), 'desteklenmeyen.json'), 'utf8')), {});
  assert.ok(!kayit(kok2, 'h').R.son_gozlem);
  await P3.kos(kok2, 'h', T0 + 30 * DK);
  assert.strictEqual(insightCagri(P3, 'R').length, 1, 'a failed read waits');
  await P3.kos(kok2, 'h', T0 + 60 * DK);
  assert.strictEqual(insightCagri(P3, 'R').length, 2);
});

test('the old permanent cache (an array) is dropped: everything is asked again', async () => {
  const kok = kokYap(); fs.mkdirSync(D(kok, 'h'), { recursive: true });
  fs.writeFileSync(path.join(D(kok, 'h'), 'desteklenmeyen.json'), JSON.stringify(['views', 'hesap:reach']));
  const P = sahteP({ sayfalar: { ilk: { data: [reel('R', T0 - GUN)] } } });
  const r = await P.kos(kok, 'h', T0);
  assert.ok(insightCagri(P, 'R')[0].q.metric.split(',').includes('views'));
  assert.strictEqual(r.hesap_insight.reach, 5);
});

test('observation row: v2 shape, 0 stays 0, a missing metric is null with its reason in yok', async () => {
  const kok = kokYap(), yayin = T0 - 30 * DK;
  const P = sahteP({ sayfalar: { ilk: { data: [reel('R', yayin)] } }, ret: ['reels_skip_rate'], deger: (id, m) => ({ views: 0, reach: 3, likes: undefined, comments: null })[m] ?? (m === 'likes' || m === 'comments' ? undefined : 7) });
  await P.kos(kok, 'h', T0);
  const [g] = gozlemSatirlari(kok, 'h');
  assert.deepStrictEqual([g.v, g.zaman, g.media_id, g.yayin, g.yas_s, g.api, 'hata' in g], [2, iso(T0), 'R', iso(yayin), 1800, 'vTEST', false]);
  assert.deepStrictEqual(Object.keys(g.metrik).sort(), [...I.METRIKLER].sort(), 'every metric has a slot');
  assert.deepStrictEqual([g.metrik.views, g.metrik.reach, g.metrik.likes, g.metrik.reels_skip_rate], [0, 3, null, null]);
  assert.deepStrictEqual(g.yok, { likes: 'bos', comments: 'bos', reels_skip_rate: 'desteklenmiyor' });
  // readers: gozlemler by media and by days; medyaSon answers from the row, the series measurement copies the new fields
  assert.strictEqual(I.gozlemler('h', { kok, simdi: T0, mediaId: 'R' }).length, 1);
  assert.strictEqual(I.gozlemler('h', { kok, simdi: T0 + 3 * GUN, gun: 1 }).length, 0);
  const an = I.medyaSon(kok, 'h', 'R', 2 * SAAT, T0 + SAAT);
  assert.deepStrictEqual([an.zaman, an.views, 'likes' in an], [iso(T0), 0, false]);
  const { sonucAlYap } = require('../../dizi/calistir');
  const st = await sonucAlYap({}, { medyaSon: () => ({ zaman: iso(T0), views: 4, reels_skip_rate: 31, ig_reels_avg_watch_time: 5100 }) })('R', 'h', []);
  assert.deepStrictEqual([st.metrik.reels_skip_rate, st.metrik.ig_reels_avg_watch_time, 'ig_reels_video_view_total_time' in st.metrik, st.metrik_zaman], [31, 5100, false, iso(T0)]);
});

test('ara: no interpolation across a gap longer than 3 x the cadence of that age', () => {
  const y = T0, p = [];
  for (let t = 10 * DK; t <= 2 * SAAT; t += 10 * DK) p.push([y + t, t / DK]);   // every 10 min: views = minutes
  p.push([y + 5 * SAAT, 300]);                                                    // then a 3 h hole at 2 h of age
  assert.strictEqual(I.ara(p, y + 5 * DK, y), 5);
  assert.strictEqual(I.ara(p, y + 95 * DK, y), 95);
  assert.strictEqual(I.ara(p, y + 3 * SAAT, y), null, 'inside the hole');
  assert.strictEqual(I.ara(p, y + 5 * SAAT, y), 300, 'on the point after it');
  assert.strictEqual(I.ara([[y + 10 * SAAT, 100], [y + 11 * SAAT, 200]], y + 10.5 * SAAT, y), 150, 'hourly at 10 h of age is its cadence');
  assert.strictEqual(I.ara([[y + 3 * SAAT, 100], [y + 4 * SAAT, 200]], y + 3.5 * SAAT, y), null, 'but at 3 h of age 1 h is a hole');
  assert.strictEqual(I.ara([[y + 50 * DK, 50]], y + 30 * DK, y), 30, 'the first find of a new post may take the listing hour');
});

test('ozet: curve from observation rows, hourly points before them kept, son_veri = newest data of any kind', () => {
  const kok = kokYap(), d = D(kok, 'h'), yayin = T0 - 10 * SAAT; fs.mkdirSync(d, { recursive: true });
  // one hourly line before the observations began, then observation rows every hour
  fs.writeFileSync(path.join(d, '2026-11.jsonl'), JSON.stringify({ zaman: iso(yayin + SAAT), hesap: 'h', takipci: 10, medya: [{ id: 'R', t: iso(yayin), baslik: 'Reel', link: 'L', tur: 'reel', views: 60 }] }) + '\n');
  const gz = [];
  for (let h = 2; h <= 9; h++) gz.push({ v: 2, zaman: iso(yayin + h * SAAT), media_id: 'R', yayin: iso(yayin), yas_s: h * 3600, api: 'v', metrik: { views: 60 * h, ig_reels_avg_watch_time: 4000 }, yok: {} });
  gz.push({ v: 2, zaman: iso(yayin + 9.5 * SAAT), media_id: 'R', yayin: iso(yayin), yas_s: 0, api: 'v', metrik: { views: null }, yok: { views: 'hata' }, hata: 'x' });
  fs.writeFileSync(path.join(d, 'gozlem-2026-11.jsonl'), gz.map(x => JSON.stringify(x)).join('\n') + '\n');
  fs.writeFileSync(path.join(d, 'hesap-2026-11.jsonl'), JSON.stringify({ v: 2, zaman: iso(yayin + 8 * SAAT), takipci: 11, medya_sayisi: 1, hesap_insight: null }) + '\n');
  const o = I.ozet({ kok, hesap: 'h', gun: 7, simdi: T0 });
  const v = o.videolar.find(x => x.id === 'R');
  assert.deepStrictEqual(v.egri.map(x => x[1]), [60, 120, 180, 240, 300, 360, 420, 480, 540]);
  assert.deepStrictEqual([v.son.views, v.son.ort_izleme_sn, v.baslik, v.v1s], [540, 4, 'Reel', 60]);
  assert.strictEqual(o.son_veri, iso(yayin + 9 * SAAT), 'the failed row brought no number');
  assert.strictEqual(o.son_anlik, iso(yayin + SAAT));
  assert.strictEqual(I.ozet({ kok, hesap: 'bos', gun: 7, simdi: T0 }).son_veri, null);
});
