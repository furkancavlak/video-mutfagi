#!/usr/bin/env node
// Instagram statistics snapshots (Furkan 31.10: at most ONE Instagram read per hour). The server takes one snapshot an hour
// per account; the panel, the İstatistikler page and the series measurement read the snapshots, never Instagram.
//   node instagram/istatistik.js anlik [--hesap x]     one snapshot per account (cron: 5 * * * *, dizi/zamanlayici.js)
// One line per run in kayit/istatistik/<hesap>/<YYYY-MM>.jsonl:
//   {zaman, hesap, takipci, medya_sayisi, hesap_insight: {reach, profile_views, ...} | null, hesap_insight_yok?,
//    medya: [{id, t, baslik, link, tur, views, reach, likes, comments, saved, shares, total_interactions,
//             ig_reels_avg_watch_time (ms), ig_reels_video_view_total_time (ms), yorumlar?: [text]}]}
//   an API error writes {zaman, hesap, hata} and nothing is retried before the next hour. Snapshots younger than 55 min
//   are never repeated. Unsupported media metrics are remembered per account (desteklenmeyen.json) so the next hour asks
//   only for what the API gives. The token is never printed or stored here.
const fs = require('fs'), path = require('path'), os = require('os');

const KOK0 = path.join(__dirname, '..');
const ARALIK = 55 * 60e3;
const METRIKLER = ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'];
const HESAP_METRIK = ['reach', 'profile_views', 'views', 'accounts_engaged'];
const YORUM_SAAT = 72, YORUM_EN_FAZLA = 50;
const ID = /^[\w.-]+$/;

const dizin = (kok, hesap) => path.join(kok, 'kayit', 'istatistik', hesap);
const ayDosyasi = (kok, hesap, t) => path.join(dizin(kok, hesap), new Date(t).toISOString().slice(0, 7) + '.jsonl');
const satirlar = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } };
const okuJ = (f, v) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return v; } };

// accounts with a token file: instagram.json = oxygbio, instagram-<ad>.json = <ad>
function hesaplar(dir = path.join(os.homedir(), '.video-mutfagi')) {
  try { return fs.readdirSync(dir).map(f => (f.match(/^instagram(?:-([\w.-]+))?\.json$/) || [])).filter(m => m[0]).map(m => m[1] || 'oxygbio'); } catch (e) { return []; }
}

// snapshots of an account between two times (month files in between), oldest first
function anliklar(kok, hesap, bas = 0, son = Date.now()) {
  if (!ID.test(hesap || '')) return [];
  let ay = []; try { ay = fs.readdirSync(dizin(kok, hesap)).filter(f => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort(); } catch (e) { return []; }
  const b = new Date(bas).toISOString().slice(0, 7), s = son >= 8.64e15 ? '9999-12' : new Date(son).toISOString().slice(0, 7);
  return ay.filter(f => f.slice(0, 7) >= b && f.slice(0, 7) <= s).flatMap(f => satirlar(path.join(dizin(kok, hesap), f)))
    .filter(x => { const t = Date.parse(x.zaman); return t >= bas && t <= son; }).sort((x, y) => Date.parse(x.zaman) - Date.parse(y.zaman));
}
const EN_SON = 8.64e15;   // the latest time a Date can hold
const sonAnlik = (kok, hesap, { hatasiz = false } = {}) => { const l = anliklar(kok, hesap, 0, EN_SON).filter(x => !hatasiz || !x.hata); return l[l.length - 1] || null; };

// the newest snapshot numbers of one media id, if that snapshot is younger than enGenc ms (the series measurement)
function medyaSon(kok, hesap, mediaId, enGenc = 2 * 3600e3, simdi = Date.now()) {
  const l = anliklar(kok, hesap, simdi - enGenc, simdi).filter(x => !x.hata);
  for (let i = l.length - 1; i >= 0; i--) { const m = (l[i].medya || []).find(x => x.id === String(mediaId)); if (m) return { zaman: l[i].zaman, ...m }; }
  return null;
}

const insightDeger = m => (m.values && m.values[0] ? m.values[0].value : m.total_value && m.total_value.value) ?? null;
const desteksizMi = e => /metric|not supported|does not support|invalid|unsupported/i.test(String(e && e.message));

// one snapshot of one account. deps: P = instagram/paylas.js (graph, readAyar), simdi
async function anlik({ hesap = 'oxygbio', kok = KOK0, P, simdi = Date.now() } = {}) {
  if (!ID.test(hesap)) throw new Error('hesap adı geçersiz');
  const son = sonAnlik(kok, hesap);
  if (son && simdi - Date.parse(son.zaman) < ARALIK) return { atlandi: true, son: son.zaman };
  P = P || require('./paylas');
  const zaman = new Date(simdi).toISOString(), f = ayDosyasi(kok, hesap, simdi);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const yaz = j => { fs.appendFileSync(f, JSON.stringify(j) + '\n'); return j; };
  const a = P.readAyar(hesap === 'oxygbio' ? undefined : hesap);
  if (!a || !a.token) return yaz({ zaman, hesap, hata: 'kayıtlı token yok' });
  const tok = a.token, gizle = s => String(s).split(tok).join('***').slice(0, 300);
  const dsF = path.join(dizin(kok, hesap), 'desteklenmeyen.json'), ds = new Set(okuJ(dsF, []));
  try {
    const me = await P.graph('GET', '/me', { fields: 'followers_count,media_count,username', access_token: tok });
    // account insights only when the token's scopes allow them; each metric on its own, a refused one is noted
    const hi = {}, yok = [];
    for (const m of HESAP_METRIK) {
      if (ds.has('hesap:' + m)) { yok.push(m); continue; }
      try { const j = await P.graph('GET', '/me/insights', { metric: m, period: 'day', metric_type: 'total_value', access_token: tok }); const d = (j.data || [])[0]; if (d) hi[m] = insightDeger(d); }
      catch (e) { yok.push(m); if (desteksizMi(e)) ds.add('hesap:' + m); }
    }
    const liste = await P.graph('GET', '/me/media', { fields: 'id,caption,media_type,media_product_type,permalink,timestamp', limit: 30, access_token: tok });
    const medya = [];
    for (const g of liste.data || []) {
      const reel = g.media_type === 'VIDEO' || g.media_product_type === 'REELS';
      const o = { id: String(g.id), t: g.timestamp, baslik: String(g.caption || '').split('\n')[0].slice(0, 90), link: g.permalink, tur: reel ? 'reel' : String(g.media_type || '').toLowerCase() };
      if (reel) {
        const ist = METRIKLER.filter(m => !ds.has(m));
        try {
          const j = await P.graph('GET', `/${g.id}/insights`, { metric: ist.join(','), access_token: tok });
          for (const m of j.data || []) o[m.name] = insightDeger(m);
        } catch (e) {
          // one unsupported metric fails the whole call: ask one by one and remember what the API refuses
          for (const m of ist) {
            try { const j = await P.graph('GET', `/${g.id}/insights`, { metric: m, access_token: tok }); for (const x of j.data || []) o[x.name] = insightDeger(x); }
            catch (e2) { if (desteksizMi(e2)) ds.add(m); }
          }
        }
        // comments of recent reels: the series measurement counts "devam" requests from these, without its own read
        if (Date.parse(g.timestamp) > simdi - YORUM_SAAT * 3600e3) {
          try { const c = await P.graph('GET', `/${g.id}/comments`, { fields: 'text', limit: YORUM_EN_FAZLA, access_token: tok }); o.yorumlar = (c.data || []).map(x => String(x.text || '').slice(0, 200)); } catch (e) { }
        }
      }
      medya.push(o);
    }
    fs.writeFileSync(dsF, JSON.stringify([...ds]));
    const takipci = Number.isFinite(Number(me.followers_count)) ? Number(me.followers_count) : null;
    return yaz({ zaman, hesap, kullanici: me.username || null, takipci, medya_sayisi: me.media_count ?? null, hesap_insight: Object.keys(hi).length ? hi : null, ...(yok.length ? { hesap_insight_yok: yok } : {}), medya });
  } catch (e) {
    return yaz({ zaman, hesap, hata: gizle(e.message || e) });
  }
}

// ---------------------------------------------------------------- aggregation for the İstatistikler page
const GUN = 864e5;
const gunIst = t => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date(t));
const saatIst = t => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const sayi = v => (Number.isFinite(+v) && v !== null && v !== '' ? +v : null);
// views of a media at time T from its snapshot points [[t, views]] (posting time counts as 0); null past the last point
function ara(noktalar, T, yayin) {
  const p = [...(Number.isFinite(yayin) ? [[yayin, 0]] : []), ...noktalar].filter(x => x[1] != null).sort((a, b) => a[0] - b[0]);
  if (!p.length || T > p[p.length - 1][0] || T < p[0][0]) return null;
  for (let i = 1; i < p.length; i++) if (T <= p[i][0]) { const [t0, v0] = p[i - 1], [t1, v1] = p[i]; return Math.round(t1 === t0 ? v1 : v0 + (v1 - v0) * (T - t0) / (t1 - t0)); }
  return p[0][1];
}
const seyrelt = (l, n = 100) => l.length <= n ? l : Array.from({ length: n }, (_, i) => l[Math.round(i * (l.length - 1) / (n - 1))]);
const oran = (a, b) => (a == null || !b ? null : +(a / b).toFixed(4));

// ek: { isler: queue jobs (paylasilan, with media_id/video/ne_zaman/paylasildi), diziler: series stores of this account,
//       sure: video folder -> seconds }
function ozet({ kok = KOK0, hesap, gun = 28, simdi = Date.now(), ek = {} } = {}) {
  gun = [7, 28, 90].includes(+gun) ? +gun : 28;
  const bas = simdi - gun * GUN, onceBas = simdi - 2 * gun * GUN;
  const hepsi = anliklar(kok, hesap, onceBas - 2 * GUN, simdi), iyi = hepsi.filter(x => !x.hata);
  const son = iyi[iyi.length - 1] || null, sonHata = hepsi.length && hepsi[hepsi.length - 1].hata ? hepsi[hepsi.length - 1] : null;
  // per media: its points over time and newest numbers
  const M = new Map();
  for (const s of iyi) for (const m of s.medya || []) {
    const t = Date.parse(s.zaman), x = M.get(m.id) || { id: m.id, yayin: Date.parse(m.t), noktalar: [], son: null, sonT: 0 };
    x.noktalar.push([t, sayi(m.views)]); if (t >= x.sonT) { x.son = m; x.sonT = t; }
    M.set(m.id, x);
  }
  // views of every media at time T (the newest snapshot not after T; media dropped from the list keep their last value)
  const toplamAn = T => { let v = 0; for (const x of M.values()) { let s = null; for (const [t, w] of x.noktalar) if (t <= T && w != null) s = w; if (s != null) v += s; } return v; };
  const takipciAn = T => { let v = null; for (const s of iyi) if (Date.parse(s.zaman) <= T && s.takipci != null) v = s.takipci; return v; };
  const isler = (ek.isler || []).filter(j => j && j.media_id);
  const isBul = id => isler.find(j => String(j.media_id) === String(id)) || null;
  const bolumBul = id => { for (const d of ek.diziler || []) for (const b of d.bolumler || []) if (b.media_id && String(b.media_id) === String(id)) return { d, b }; return null; };
  const videolar = [...M.values()].filter(x => x.son && x.son.tur === 'reel').map(x => {
    const j = isBul(x.id), e = bolumBul(x.id), s = x.son, sure = j && ek.sure ? sayi(ek.sure[j.video]) : null;
    const izl = sayi(s.ig_reels_avg_watch_time);
    return {
      id: x.id, baslik: s.baslik || '', link: s.link || null, yayin: Number.isFinite(x.yayin) ? new Date(x.yayin).toISOString() : null,
      sure_sn: sure, son: { views: sayi(s.views), reach: sayi(s.reach), likes: sayi(s.likes), comments: sayi(s.comments), saved: sayi(s.saved), shares: sayi(s.shares), total_interactions: sayi(s.total_interactions), ort_izleme_sn: izl == null ? null : +(izl / 1000).toFixed(2), toplam_izleme_sn: sayi(s.ig_reels_video_view_total_time) == null ? null : Math.round(s.ig_reels_video_view_total_time / 1000) },
      izlenme_orani: izl != null && sure ? +((izl / 1000) / sure).toFixed(3) : null,
      egri: seyrelt(x.noktalar.filter(p => p[1] != null)).map(([t, v]) => [new Date(t).toISOString(), v]),
      v1s: ara(x.noktalar, x.yayin + 3600e3, x.yayin), v24s: ara(x.noktalar, x.yayin + 24 * 3600e3, x.yayin), v48s: ara(x.noktalar, x.yayin + 48 * 3600e3, x.yayin),
      dizi: e ? { id: e.d.id, baslik: e.d.baslik_kisa || e.d.baslik || e.d.id, n: e.b.n, toplam: (e.d.bolumler || []).length } : null,
      konu: e ? e.d.konu || null : null, ton: e ? e.d.ton || 'komik' : null,
      slot: j && (j.ne_zaman || j.paylasildi) ? `${String(saatIst(j.ne_zaman || j.paylasildi)).padStart(2, '0')}:00` : Number.isFinite(x.yayin) ? `${String(saatIst(x.yayin)).padStart(2, '0')}:00` : null,
      video: j ? j.video || null : null,
    };
  }).sort((a, b) => Date.parse(b.yayin || 0) - Date.parse(a.yayin || 0));
  // KPIs of a period [b, s)
  const kpi = (b, s) => {
    const icinde = videolar.filter(v => v.yayin && Date.parse(v.yayin) >= b && Date.parse(v.yayin) < s);
    const topla = k => icinde.reduce((a, v) => a + (v.son[k] || 0), 0);
    const izl = icinde.map(v => v.son.ort_izleme_sn).filter(x => x != null);
    const reachDelta = (() => { let v = 0; for (const x of M.values()) { const r = T => { let o = null; for (const s2 of iyi) { if (Date.parse(s2.zaman) > T) break; const m = (s2.medya || []).find(y => y.id === x.id); if (m && m.reach != null) o = +m.reach; } return o; }; const a = r(b), z = r(s); if (z != null) v += z - (a || 0); } return v; })();
    // followers at the start of the period, or the first count inside it when the snapshots begin later
    const ilkIcinde = (iyi.find(x => Date.parse(x.zaman) >= b && Date.parse(x.zaman) < s && x.takipci != null) || {}).takipci ?? null;
    const tB = takipciAn(b) ?? ilkIcinde, tS = takipciAn(s), views = toplamAn(s) - toplamAn(b), et = topla('likes') + topla('comments') + topla('saved') + topla('shares'), tv = topla('views');
    return { views, reach: reachDelta, takipci_kazanilan: tB != null && tS != null ? tS - tB : null, ort_izleme_sn: izl.length ? +(izl.reduce((a, x) => a + x, 0) / izl.length).toFixed(2) : null, etkilesim_orani: oran(et, tv), video_sayisi: icinde.length };
  };
  const gunluk = [];
  for (let i = gun - 1; i >= 0; i--) {
    const T = simdi - i * GUN, g = gunIst(T), gBas = Date.parse(g + 'T00:00:00+03:00'), gSon = gBas + GUN;
    gunluk.push({ gun: g, views: Math.max(0, toplamAn(Math.min(gSon, simdi)) - toplamAn(gBas)), takipci: takipciAn(Math.min(gSon, simdi)) });
  }
  // per series: episodes in order with their views and the drop from the previous episode
  const diziler = (ek.diziler || []).map(d => {
    const bl = (d.bolumler || []).map(b => { const v = b.media_id ? videolar.find(x => x.id === String(b.media_id)) : null; const vs = v ? v.son.views : (b.metrik && sayi(b.metrik.views)); return { n: b.n, media_id: b.media_id || null, views: vs ?? null, durum: b.durum, karar: b.karar || null }; });
    bl.forEach((b, i) => { const o = bl[i - 1]; b.dusus = i && o && o.views && b.views != null ? +((b.views - o.views) / o.views).toFixed(3) : null; });
    return { id: d.id, baslik: d.baslik_kisa || d.baslik || d.id, konu: d.konu || null, ton: d.ton || 'komik', durum: d.durum, bolumler: bl, karar: d.durum === 'kesildi' ? 'kes' : d.durum === 'bitti' ? 'bitti' : (bl.filter(b => b.karar).pop() || {}).karar || null };
  }).filter(d => d.bolumler.some(b => b.views != null));
  const grupla = (anahtar, deger) => { const g = {}; for (const v of videolar) { const k = anahtar(v), d = deger(v); if (k == null || d == null) continue; (g[k] = g[k] || []).push(d); } return Object.entries(g).map(([k, l]) => ({ ad: k, video: l.length, ort: Math.round(l.reduce((a, x) => a + x, 0) / l.length) })).sort((a, b) => b.ort - a.ort); };
  const donemde = v => v.yayin && Date.parse(v.yayin) >= bas;
  return {
    hesap, gun, zaman: new Date(simdi).toISOString(), son_anlik: son ? son.zaman : null, son_hata: sonHata ? { zaman: sonHata.zaman, hata: sonHata.hata } : null,
    takipci: son ? son.takipci : null, hesap_insight: son ? son.hesap_insight || null : null, hesap_insight_yok: son ? son.hesap_insight_yok || [] : [],
    kpi: { donem: kpi(bas, simdi), onceki: kpi(onceBas, bas) },
    gunluk,
    videolar: videolar.filter(v => donemde(v) || (v.egri.length && Date.parse(v.egri[v.egri.length - 1][0]) >= bas)),
    diziler,
    konular: grupla(v => v.konu, v => v.son.views), tonlar: grupla(v => v.ton, v => v.son.views),
    slotlar: grupla(v => v.slot, v => v.v24s).sort((a, b) => a.ad.localeCompare(b.ad)),
  };
}

module.exports = { anlik, anliklar, sonAnlik, medyaSon, ozet, hesaplar, ara, METRIKLER, ARALIK };

if (require.main === module) {
  const argv = process.argv.slice(2), i = argv.indexOf('--hesap'), tek = i >= 0 ? argv[i + 1] : null;
  (async () => {
    if (argv[0] !== 'anlik') { console.log('Kullanım: node instagram/istatistik.js anlik [--hesap ad]'); return; }
    for (const h of tek ? [tek] : hesaplar()) {
      const r = await anlik({ hesap: h }).catch(e => ({ hata: e.message }));
      console.log(`${new Date().toISOString()} ${h}: ${r.atlandi ? 'atlandı (son anlık ' + r.son + ')' : r.hata ? 'HATA ' + r.hata : `takipçi ${r.takipci}, ${(r.medya || []).length} medya`}`);
    }
  })();
}
