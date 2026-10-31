// Hourly Instagram snapshots and the İstatistikler aggregation (instagram/istatistik.js). Stubbed Graph API, temp roots.
//   node --test "kuyruk/test/*.test.js"
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const I = require('../../instagram/istatistik.js');

const T0 = Date.parse('2026-11-01T09:00:00Z');
const kokYap = () => fs.mkdtempSync(path.join(os.tmpdir(), 'istatistik-'));
// a fake paylas.js: graph answers by path; `ret` makes a metric unsupported
function sahteP({ hata, ret = [], hesapRet = false } = {}) {
  const P = { cagri: [], readAyar: () => ({ token: 'GIZLI-TOKEN' }) };
  P.graph = async (method, p, q) => {
    P.cagri.push([p, q.metric || q.fields]);
    if (hata) throw new Error(`GET ${p}: ${hata} GIZLI-TOKEN (kod 190)`);
    if (p === '/me') return { followers_count: 1200, media_count: 2, username: 'hesap' };
    if (p === '/me/insights') { if (hesapRet) throw new Error('GET /me/insights: (#10) Application does not have permission (kod 10)'); return { data: [{ name: q.metric, total_value: { value: 77 } }] }; }
    if (p === '/me/media') return { data: [{ id: '1', caption: 'İlk bölüm\nuzun', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://i/1', timestamp: '2026-11-01T07:00:00+0000' }, { id: '2', caption: 'foto', media_type: 'IMAGE', permalink: 'https://i/2', timestamp: '2026-10-20T07:00:00+0000' }] };
    if (/\/insights$/.test(p)) {
      const ms = q.metric.split(',');
      if (ms.some(m => ret.includes(m))) throw new Error(`GET ${p}: (#100) The metric ${ret[0]} is not supported (kod 100)`);
      return { data: ms.map(m => ({ name: m, values: [{ value: m === 'ig_reels_avg_watch_time' ? 21500 : 10 }] })) };
    }
    if (/\/comments$/.test(p)) return { data: [{ text: 'Devamı gelsin!' }, { text: 'harika' }] };
    throw new Error('beklenmeyen ' + p);
  };
  return P;
}

test('anlik: one line with followers, reel metrics, recent comments; an unsupported metric is asked alone and remembered', async () => {
  const kok = kokYap(), P = sahteP({ ret: ['ig_reels_video_view_total_time'] });
  const r = await I.anlik({ hesap: 'hesap_a', kok, P, simdi: T0 });
  assert.deepStrictEqual([r.takipci, r.medya_sayisi, r.medya.length], [1200, 2, 2]);
  const reel = r.medya[0];
  assert.deepStrictEqual([reel.id, reel.tur, reel.baslik, reel.views, reel.ig_reels_avg_watch_time, 'ig_reels_video_view_total_time' in reel], ['1', 'reel', 'İlk bölüm', 10, 21500, false]);
  assert.deepStrictEqual(reel.yorumlar, ['Devamı gelsin!', 'harika']);
  assert.deepStrictEqual([r.medya[1].tur, 'views' in r.medya[1]], ['image', false], 'only reels get insights');
  assert.deepStrictEqual(r.hesap_insight, { reach: 77, profile_views: 77, views: 77, accounts_engaged: 77 });
  const satir = fs.readFileSync(path.join(kok, 'kayit', 'istatistik', 'hesap_a', '2026-11.jsonl'), 'utf8').trim().split('\n');
  assert.strictEqual(satir.length, 1);
  assert.ok(!satir[0].includes('GIZLI'), 'no token in the file');
  // within 55 min: the account part is skipped; only the 2.5 h old reel is due again (10 min cadence)
  const once = P.cagri.length;
  assert.strictEqual((await I.anlik({ hesap: 'hesap_a', kok, P, simdi: T0 + 30 * 60e3 })).atlandi, true);
  assert.deepStrictEqual(P.cagri.slice(once).map(c => c[0]), ['/1/insights']);
  // next hour: the refused metric is no longer asked; one insights call per reel
  const P2 = sahteP({ ret: ['ig_reels_video_view_total_time'] });
  await I.anlik({ hesap: 'hesap_a', kok, P: P2, simdi: T0 + 61 * 60e3 });
  const ins = P2.cagri.filter(c => /^\/1\/insights$/.test(c[0]));
  assert.strictEqual(ins.length, 1); assert.doesNotMatch(ins[0][1], /view_total_time/);
});

test('anlik: an API error writes a hata line without the token and is not retried within the hour; no token = hata', async () => {
  const kok = kokYap();
  const r = await I.anlik({ hesap: 'hesap_b', kok, P: sahteP({ hata: 'Error validating access token' }), simdi: T0 });
  assert.match(r.hata, /Error validating access token \*\*\* \(kod 190\)/);
  const P = sahteP();
  assert.strictEqual((await I.anlik({ hesap: 'hesap_b', kok, P, simdi: T0 + 20 * 60e3 })).atlandi, true);
  assert.strictEqual(P.cagri.length, 0);
  const r2 = await I.anlik({ hesap: 'hesap_c', kok, P: { readAyar: () => null }, simdi: T0 });
  assert.strictEqual(r2.hata, 'kayıtlı token yok');
  // account insights the token may not read: recorded as unavailable, the snapshot still works
  const r3 = await I.anlik({ hesap: 'hesap_d', kok, P: sahteP({ hesapRet: true }), simdi: T0 });
  assert.deepStrictEqual([r3.hesap_insight, r3.hesap_insight_yok, r3.takipci], [null, ['reach', 'profile_views', 'views', 'accounts_engaged'], 1200]);
  await assert.rejects(I.anlik({ hesap: '../x', kok }), /geçersiz/);
});

test('medyaSon: the newest snapshot numbers of a media when younger than 2 h, else null', async () => {
  const kok = kokYap();
  await I.anlik({ hesap: 'h', kok, P: sahteP(), simdi: T0 });
  assert.strictEqual(I.medyaSon(kok, 'h', '1', 2 * 3600e3, T0 + 3600e3).views, 10);
  assert.strictEqual(I.medyaSon(kok, 'h', '1', 2 * 3600e3, T0 + 3 * 3600e3), null);
  assert.strictEqual(I.medyaSon(kok, 'h', '999', 2 * 3600e3, T0 + 3600e3), null);
});

test('ara: views at T interpolated between snapshots, from 0 at posting; null past the last point and across a long gap', () => {
  const y = Date.parse('2026-11-01T10:00:00Z'), p = [[y + 2 * 3600e3, 200], [y + 26 * 3600e3, 1400]];
  assert.strictEqual(I.ara(p, y + 3600e3, y, 3600e3), 100, 'hourly source: 2 h after posting is inside 3 x 1 h + the listing hour');
  assert.strictEqual(I.ara(p, y + 24 * 3600e3, y, 3600e3), null, 'a 24 h hole at 2 h of age says nothing');
  assert.strictEqual(I.ara(p, y + 26 * 3600e3, y), 1400, 'on a point');
  assert.strictEqual(I.ara(p, y + 48 * 3600e3, y), null);
});

// a few synthetic snapshots: two reels of one series, followers growing
function yazAnliklar(kok, hesap) {
  const f = path.join(kok, 'kayit', 'istatistik', hesap); fs.mkdirSync(f, { recursive: true });
  const y1 = Date.parse('2026-10-28T09:00:00Z'), y2 = Date.parse('2026-10-30T14:00:00Z'), satir = [];
  for (let h = 0; h <= 96; h++) {   // hourly, like the real lines (ara leaves longer gaps empty)
    const t = y1 + h * 3600e3, m = [{ id: '11', t: new Date(y1).toISOString(), baslik: 'Ep 1', link: 'L1', tur: 'reel', views: 100 * h, reach: 80 * h, likes: h, comments: 1, saved: 1, shares: 0, ig_reels_avg_watch_time: 30000 }];
    if (t >= y2) m.push({ id: '12', t: new Date(y2).toISOString(), baslik: 'Ep 2', link: 'L2', tur: 'reel', views: 50 * (t - y2) / 3600e3, reach: 40, likes: 2, comments: 0, saved: 0, shares: 1, ig_reels_avg_watch_time: 20000 });
    satir.push(JSON.stringify({ zaman: new Date(t).toISOString(), hesap, takipci: 1000 + h, medya: m }));
  }
  satir.push(JSON.stringify({ zaman: new Date(y1 + 97 * 3600e3).toISOString(), hesap, hata: 'Error validating access token' }));
  fs.writeFileSync(path.join(f, '2026-10.jsonl'), satir.join('\n') + '\n');
  return { y1, y2 };
}

test('ozet: KPIs, daily series, per-video curve and 1/24/48 h, series drop, theme/tone/slot averages, last error', () => {
  const kok = kokYap(), { y1, y2 } = yazAnliklar(kok, 'h');
  const simdi = y1 + 97.5 * 3600e3;
  const ek = {
    isler: [{ media_id: '11', video: 'videolar/k-d-b1', ne_zaman: '2026-10-28T09:00:00Z' }, { media_id: '12', video: 'videolar/k-d-b2', paylasildi: new Date(y2).toISOString() }],
    diziler: [{ id: 'd', baslik_kisa: 'Dizi', konu: 'aşk', ton: 'hüzünlü', durum: 'aktif', bolumler: [{ n: 1, media_id: '11', durum: 'olculdu', karar: 'devam' }, { n: 2, media_id: '12', durum: 'yayinda' }, { n: 3, durum: 'metin' }] }],
    sure: { 'videolar/k-d-b1': 60 },
  };
  const o = I.ozet({ kok, hesap: 'h', gun: 7, simdi, ek });
  assert.deepStrictEqual([o.gun, o.takipci, o.son_hata.hata], [7, 1096, 'Error validating access token']);
  assert.strictEqual(o.kpi.donem.views, 9600 + 50 * (y1 + 96 * 3600e3 - y2) / 3600e3);
  assert.strictEqual(o.kpi.donem.takipci_kazanilan, 96);
  assert.strictEqual(o.kpi.donem.video_sayisi, 2);
  assert.strictEqual(o.kpi.donem.ort_izleme_sn, 25);
  assert.strictEqual(o.gunluk.length, 7);
  assert.strictEqual(o.gunluk.reduce((a, g) => a + g.views, 0), o.kpi.donem.views);
  const v1 = o.videolar.find(v => v.id === '11');
  assert.deepStrictEqual([v1.dizi, v1.konu, v1.ton, v1.sure_sn, v1.izlenme_orani, v1.slot], [{ id: 'd', baslik: 'Dizi', n: 1, toplam: 3 }, 'aşk', 'hüzünlü', 60, 0.5, '12:00']);
  assert.deepStrictEqual([v1.v1s, v1.v24s, v1.v48s], [100, 2400, 4800]);
  assert.ok(v1.egri.length >= 10 && v1.egri[0][1] === 0);
  assert.deepStrictEqual(o.diziler[0].bolumler.map(b => [b.n, b.views, b.dusus]), [[1, 9600, null], [2, 2150, -0.776], [3, null, null]]);
  assert.strictEqual(o.diziler[0].karar, 'devam');
  assert.deepStrictEqual(o.tonlar.map(t => t.ad), ['hüzünlü']); assert.deepStrictEqual(o.konular[0], { ad: 'aşk', video: 2, ort: Math.round((9600 + 2150) / 2) });
  assert.deepStrictEqual(o.slotlar.map(s => s.ad), ['12:00', '17:00']);
  assert.ok(I.ozet({ kok, hesap: 'h', gun: 5, simdi, ek }).gun === 5, 'custom day count kept');
  assert.ok(I.ozet({ kok, hesap: 'h', gun: 0, simdi, ek }).gun === 28, 'out of range -> 28');
  assert.deepStrictEqual(I.ozet({ kok, hesap: 'yok', gun: 7, simdi }).videolar, []);
});

test('series measurement: a fresh snapshot answers (numbers and "devam" comments) without asking Instagram', async () => {
  const { sonucAlYap } = require('../../dizi/calistir');
  const P = { sonuc: async () => { throw new Error('Instagram must not be asked'); }, readAyar: () => ({ token: 't' }), graph: async () => { throw new Error('no'); } };
  const Ist = { medyaSon: () => ({ views: 900, reach: 700, likes: 5, yorumlar: ['devamı gelsin', 'güzel', 'Devam!'] }) };
  const r = await sonucAlYap(P, Ist, '/tmp')('m1', 'h', ['devam']);
  assert.deepStrictEqual([r.metrik.views, r.metrik.reach, r.yorum_devam, r.kaynak], [900, 700, 2, 'anlik']);
  // no snapshot: the live call as before
  const P2 = { sonuc: async () => ({ views: 5 }), readAyar: () => null };
  assert.strictEqual((await sonucAlYap(P2, { medyaSon: () => null })('m1', 'h', [])).metrik.views, 5);
});
