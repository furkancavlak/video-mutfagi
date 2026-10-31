#!/usr/bin/env node
// Instagram statistics snapshots. The server runs `anlik` every 10 minutes per account; the panel, the İstatistikler page
// and the series measurement read the files below, never Instagram.
//   node instagram/istatistik.js anlik [--hesap x]     (cron: */10 * * * *, dizi/zamanlayici.js)
// Account part, at most once in 55 min: /me, /me/insights and the /me/media listing (paged back to 60 days, at most 10
// pages). Media part, every run: each media is observed when due by its age (KADANS: 10 min under 6 h ... 7 days past
// 60 days); an old reel that grows again is observed hourly for 48 h (hizli_bitis). Files in kayit/istatistik/<hesap>/:
//   medya.json            registry {<media_id>: {t, link, baslik, tur, son_gozlem, hizli_bitis?, dizi?, bolum?}}: every
//                         listed media plus every series episode of this account (kayit/dizi/<kanal>/diziler.json whose
//                         kanal/<kanal>/kimlik.json hesap is this account), so an episode that left the listing is still read
//   gozlem-<YYYY-MM>.jsonl one line per media per observation:
//     {v: 2, zaman, media_id, yayin, yas_s, api, metrik: {name: number|null}, yok: {name: desteklenmiyor|hata|bos}, hata?}
//   hesap-<YYYY-MM>.jsonl  one line per account part: {v: 2, zaman, takipci, medya_sayisi, hesap_insight}
//   <YYYY-MM>.jsonl        the hourly line in its old shape (ozet fallback, the panel's posts and followers), written
//                          with the account part from the newest observation of each media:
//     {zaman, hesap, takipci, medya_sayisi, hesap_insight: {...} | null, hesap_insight_yok?,
//      medya: [{id, t, baslik, link, tur, olcum?, views, reach, ..., ig_reels_avg_watch_time (ms), yorumlar?: [text]}]}
//     an account API error writes {zaman, hesap, hata} and the account part waits for the next hour.
//   desteklenmeyen.json    {"<api>|<media type>|<metric>": {kod, mesaj, zaman}}: metrics Graph refused, asked again after 24 h
// The token is never printed or stored here.
const fs = require('fs'), path = require('path'), os = require('os');
const ortak = require('../konu/ortak');   // yazJson (tmp + rename), kilitAl

const KOK0 = path.join(__dirname, '..');
const DK = 60e3, SAAT = 3600e3, GUN = 864e5;
const ARALIK = 55 * DK;   // account part and the hourly line
// observation cadence by age [age below, every]; a run is due at TOLERANS of the interval (cron jitter)
const KADANS = [[6 * SAAT, 10 * DK], [72 * SAAT, SAAT], [14 * GUN, 6 * SAAT], [60 * GUN, GUN], [Infinity, 7 * GUN]];
const TOLERANS = 0.9;
// revival: a reel older than 72 h whose views/h since the last observation is CANLANMA_KAT x the one before (and at least
// CANLANMA_EN_AZ views/h) is observed hourly for HIZLI_SURE
const CANLANMA_KAT = 3, CANLANMA_EN_AZ = 1;
const HIZLI_YAS = 72 * SAAT, HIZLI_SURE = 48 * SAAT;
const LISTE_GUN = 60, LISTE_SAYFA = 10, LISTE_LIMIT = 50;
const DESTEKSIZ_SURE = 24 * SAAT;
const METRIKLER = ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'reels_skip_rate', 'crossposted_views', 'facebook_views'];
const HESAP_METRIK = ['reach', 'profile_views', 'views', 'accounts_engaged'];
const YORUM_SAAT = 72, YORUM_EN_FAZLA = 50;
const ID = /^[\w.-]+$/;

const dizin = (kok, hesap) => path.join(kok, 'kayit', 'istatistik', hesap);
const ayAd = t => new Date(t).toISOString().slice(0, 7);
const ayDosyasi = (kok, hesap, t, onek = '') => path.join(dizin(kok, hesap), onek + ayAd(t) + '.jsonl');
const satirlar = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } };
const okuJ = (f, v) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return v; } };
const ekle = (f, j) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, JSON.stringify(j) + '\n'); return j; };
const hesapAd = h => String(h || '').trim().replace(/^@/, '').trim().toLowerCase() || 'oxygbio';   // same rule as dizi/calistir.js

// accounts with a token file: instagram.json = oxygbio, instagram-<ad>.json = <ad>
function hesaplar(dir = path.join(os.homedir(), '.video-mutfagi')) {
  try { return fs.readdirSync(dir).map(f => (f.match(/^instagram(?:-([\w.-]+))?\.json$/) || [])).filter(m => m[0]).map(m => m[1] || 'oxygbio'); } catch (e) { return []; }
}

// lines of one kind of month file (onek '' = the hourly lines, 'gozlem-', 'hesap-') between two times, oldest first
const EN_SON = 8.64e15;   // the latest time a Date can hold
function ayliklar(kok, hesap, onek, bas = 0, son = Date.now()) {
  if (!ID.test(hesap || '')) return [];
  const re = new RegExp(`^${onek}\\d{4}-\\d{2}\\.jsonl$`);
  let ay = []; try { ay = fs.readdirSync(dizin(kok, hesap)).filter(f => re.test(f)).sort(); } catch (e) { return []; }
  const b = ayAd(Math.max(0, bas)), s = son >= EN_SON ? '9999-12' : ayAd(son), ayi = f => f.slice(onek.length, onek.length + 7);
  return ay.filter(f => ayi(f) >= b && ayi(f) <= s).flatMap(f => satirlar(path.join(dizin(kok, hesap), f)))
    .filter(x => { const t = Date.parse(x.zaman); return t >= bas && t <= son; }).sort((x, y) => Date.parse(x.zaman) - Date.parse(y.zaman));
}
// hourly lines of an account between two times
const anliklar = (kok, hesap, bas = 0, son = Date.now()) => ayliklar(kok, hesap, '', bas, son);
const sonAnlik = (kok, hesap, { hatasiz = false } = {}) => { const l = anliklar(kok, hesap, 0, EN_SON).filter(x => !hatasiz || !x.hata); return l[l.length - 1] || null; };
const veriVar = r => Object.values(r.metrik || {}).some(v => v != null);
// observation rows of an account (gun: only the last gun days), optionally of one media, oldest first
function gozlemler(hesap, { mediaId, gun, kok = KOK0, simdi = Date.now() } = {}) {
  const l = ayliklar(kok, hesap, 'gozlem-', gun ? simdi - gun * GUN : 0, simdi);
  return mediaId == null ? l : l.filter(r => r.media_id === String(mediaId));
}

// the newest numbers of one media, if observed within enGenc ms (the series measurement): the observation rows first,
// then the hourly line (whose entries carry their observation time in `olcum`); comments come from the hourly line
function medyaSon(kok, hesap, mediaId, enGenc = 2 * SAAT, simdi = Date.now()) {
  const id = String(mediaId), l = anliklar(kok, hesap, simdi - enGenc, simdi).filter(x => !x.hata);
  let satir = null; for (let i = l.length - 1; i >= 0 && !satir; i--) { const m = (l[i].medya || []).find(x => x.id === id); if (m) satir = { zaman: l[i].zaman, m }; }
  const g = ayliklar(kok, hesap, 'gozlem-', simdi - enGenc, simdi).filter(r => r.media_id === id && veriVar(r)).pop();
  if (g) {
    const metrik = {}; for (const [k, v] of Object.entries(g.metrik)) if (v != null) metrik[k] = v;
    return { zaman: g.zaman, id, ...metrik, ...(satir && Array.isArray(satir.m.yorumlar) ? { yorumlar: satir.m.yorumlar } : {}) };
  }
  if (!satir) return null;
  const zaman = satir.m.olcum || satir.zaman;
  return Date.parse(zaman) >= simdi - enGenc ? { ...satir.m, zaman } : null;
}

// ---------------------------------------------------------------- cadence
const kadans = yas => KADANS.find(([s]) => yas < s)[1];
const yasi = (k, simdi) => { const t = Date.parse(k && k.t); return Number.isFinite(t) ? Math.max(0, simdi - t) : null; };
// is a registry entry due at simdi? (hizli_bitis in the future = at most hourly; a fully failed read waits min(cadence, 1 h))
function zamaniGeldi(k, simdi) {
  let a = kadans(yasi(k, simdi) ?? 0);
  if (k.hizli_bitis && Date.parse(k.hizli_bitis) > simdi) a = Math.min(a, SAAT);
  if (k.son_hata && simdi - Date.parse(k.son_hata) < TOLERANS * Math.min(a, SAAT)) return false;
  return !k.son_gozlem || simdi - Date.parse(k.son_gozlem) >= TOLERANS * a;
}
// renewed growth from the last three [t, views] points, oldest first
const hiz = (a, b) => (b[1] - a[1]) / ((b[0] - a[0]) / SAAT);
function canlandi(noktalar) {
  const p = noktalar.filter(x => x[1] != null).slice(-3);
  if (p.length < 3 || !(p[1][0] > p[0][0] && p[2][0] > p[1][0])) return false;
  const yeni = hiz(p[1], p[2]);
  return yeni >= CANLANMA_EN_AZ && yeni >= CANLANMA_KAT * Math.max(0, hiz(p[0], p[1]));
}

// ---------------------------------------------------------------- Graph errors
const insightDeger = m => { const v = (m.values && m.values[0] ? m.values[0].value : m.total_value && m.total_value.value) ?? null; return v != null && Number.isFinite(+v) ? +v : null; };
const hataKodu = e => { const m = /\(kod (\d+)\)\s*$/.exec(String((e && e.message) || e)); return m ? +m[1] : null; };
const GECICI_KOD = new Set([1, 2, 4, 17, 32, 341, 613]);   // Graph's own "try again later" codes
// only a Graph answer about the metric itself (code 100 that names a metric, e.g. "metric[3] must be one of" or "does not
// support the reels_skip_rate metric") means unsupported. Network drops, 5xx, rate limits, token errors and code 100 for
// other reasons (a deleted media) are "hata" and are asked again on the next due run.
function desteksizMi(e) {
  const s = String((e && e.message) || e), kod = hataKodu(e);
  if (kod == null || GECICI_KOD.has(kod) || /bağlantı koptu/.test(s)) return false;
  return kod === 100 && /metric/i.test(s.replace(/^\w+ \/\S*: /, ''));
}

// ---------------------------------------------------------------- one run for one account
// deps: P = instagram/paylas.js (graph, readAyar, API_SURUM), simdi
async function anlik({ hesap = 'oxygbio', kok = KOK0, P, simdi = Date.now() } = {}) {
  if (!ID.test(hesap)) throw new Error('hesap adı geçersiz');
  const D = dizin(kok, hesap);
  let birak; try { birak = ortak.kilitAl({ kayit: D }, 'istatistik'); } catch (e) { return { atlandi: true, kilit: true }; }
  try { return await anlikIc({ hesap, kok, P, simdi, D }); } finally { birak(); }
}
async function anlikIc({ hesap, kok, P, simdi, D }) {
  const son = sonAnlik(kok, hesap), hesapSirasi = !son || simdi - Date.parse(son.zaman) >= ARALIK;
  P = P || require('./paylas');
  const zaman = new Date(simdi).toISOString(), api = P.API_SURUM || process.env.IG_API_VERSION || 'v23.0';
  const yazSatir = j => ekle(ayDosyasi(kok, hesap, simdi), j);
  const a = P.readAyar(hesap === 'oxygbio' ? undefined : hesap);
  if (!a || !a.token) return hesapSirasi ? yazSatir({ zaman, hesap, hata: 'kayıtlı token yok' }) : { atlandi: true, son: son.zaman, gozlenen: 0 };
  const tok = a.token, gizle = s => String(s).split(tok).join('***').slice(0, 300);
  const kayitF = path.join(D, 'medya.json'), dsF = path.join(D, 'desteklenmeyen.json');
  const R = okuJ(kayitF, {}), ds0 = okuJ(dsF, {});
  const ds = ds0 && typeof ds0 === 'object' && !Array.isArray(ds0) ? ds0 : {};   // the old permanent list (an array) is dropped
  const desteksiz = (tur, m) => { const e = ds[`${api}|${tur}|${m}`]; return !!(e && simdi - Date.parse(e.zaman) < DESTEKSIZ_SURE); };
  const reddet = (tur, m, e) => { ds[`${api}|${tur}|${m}`] = { kod: hataKodu(e), mesaj: gizle(e.message || e).slice(0, 200), zaman }; };
  const kaydet = () => { ortak.yazJson(kayitF, R); ortak.yazJson(dsF, ds); };

  // ---- account part (hourly)
  let hesapSatiri = null, liste = [];
  if (hesapSirasi) {
    try {
      const me = await P.graph('GET', '/me', { fields: 'followers_count,media_count,username', access_token: tok });
      // account insights only when the token's scopes allow them; each metric on its own, a refused one is noted
      const hi = {}, yok = [];
      for (const m of HESAP_METRIK) {
        if (desteksiz('hesap', m)) { yok.push(m); continue; }
        try { const j = await P.graph('GET', '/me/insights', { metric: m, period: 'day', metric_type: 'total_value', access_token: tok }); const d = (j.data || [])[0]; if (d) hi[m] = insightDeger(d); delete ds[`${api}|hesap|${m}`]; }
        catch (e) { yok.push(m); if (desteksizMi(e)) reddet('hesap', m, e); }
      }
      // the listing, newest first, page by page until a page reaches past 60 days
      const sinir = simdi - LISTE_GUN * GUN;
      let sonra = null;
      for (let s = 0; s < LISTE_SAYFA; s++) {
        const j = await P.graph('GET', '/me/media', { fields: 'id,caption,media_type,media_product_type,permalink,timestamp', limit: LISTE_LIMIT, ...(sonra ? { after: sonra } : {}), access_token: tok });
        const d = j.data || []; liste.push(...d);
        const next = j.paging && j.paging.next;
        if (!d.length || !next || d.some(g => Date.parse(g.timestamp) < sinir)) break;
        sonra = (j.paging.cursors && j.paging.cursors.after) || (() => { try { return new URL(next).searchParams.get('after'); } catch (e) { return null; } })();
        if (!sonra) break;
      }
      const takipci = Number.isFinite(Number(me.followers_count)) ? Number(me.followers_count) : null;
      hesapSatiri = { kullanici: me.username || null, takipci, medya_sayisi: me.media_count ?? null, hesap_insight: Object.keys(hi).length ? hi : null, ...(yok.length ? { hesap_insight_yok: yok } : {}) };
    } catch (e) {
      kaydet();
      return yazSatir({ zaman, hesap, hata: gizle(e.message || e) });
    }
  }

  // ---- registry: the listing, then the series episodes of this account
  const tur = g => (g.media_type === 'VIDEO' || g.media_product_type === 'REELS' ? 'reel' : String(g.media_type || '').toLowerCase());
  const baslikOf = g => String(g.caption || '').split('\n')[0].slice(0, 90);
  for (const g of liste) {
    const id = String(g.id); if (!ID.test(id)) continue;
    const k = R[id] = R[id] || {};
    Object.assign(k, { t: g.timestamp || k.t || null, link: g.permalink || k.link || null, baslik: baslikOf(g), tur: tur(g) });
  }
  for (const { d, b } of diziBolumleri(kok, hesap)) {
    const id = String(b.media_id), k = R[id] = R[id] || {};
    Object.assign(k, { t: k.t || b.paylasildi || null, link: k.link || b.link || null, baslik: k.baslik || d.baslik_kisa || d.baslik || '', tur: k.tur || 'reel', dizi: d.id, bolum: b.n });
  }

  // ---- media part: every reel that is due
  const gecmis = new Map();   // media id -> the newest observation rows of the last 40 days, oldest first
  for (const r of ayliklar(kok, hesap, 'gozlem-', simdi - 40 * GUN, simdi)) { if (!gecmis.has(r.media_id)) gecmis.set(r.media_id, []); gecmis.get(r.media_id).push(r); }
  let gozlenen = 0;
  for (const [id, k] of Object.entries(R)) {
    if (k.hizli_bitis && Date.parse(k.hizli_bitis) <= simdi) delete k.hizli_bitis;
    if (k.tur !== 'reel' || !zamaniGeldi(k, simdi)) continue;
    if (!k.t) {   // an episode without a posting time: read it once
      try { const g = await P.graph('GET', `/${id}`, { fields: 'timestamp,permalink,caption,media_type,media_product_type', access_token: tok }); k.t = g.timestamp || null; k.link = k.link || g.permalink || null; }
      catch (e) { k.son_hata = zaman; continue; }
      if (!k.t) continue;
    }
    const r = await gozle(id, k);
    gozlenen++;
    ekle(ayDosyasi(kok, hesap, simdi, 'gozlem-'), r);
    if (!veriVar(r) && r.hata) { k.son_hata = zaman; continue; }
    delete k.son_hata; k.son_gozlem = zaman;
    const l = gecmis.get(id) || []; l.push(r); gecmis.set(id, l);
    if (yasi(k, simdi) > HIZLI_YAS && canlandi(l.map(x => [Date.parse(x.zaman), x.metrik.views]))) k.hizli_bitis = new Date(simdi + HIZLI_SURE).toISOString();
  }
  async function gozle(id, k) {
    const metrik = {}, yok = {}, sor = [];
    let hata;
    for (const m of METRIKLER) { metrik[m] = null; if (desteksiz(k.tur, m)) yok[m] = 'desteklenmiyor'; else sor.push(m); }
    const al = (j, ist) => { for (const x of j.data || []) if (ist.includes(x.name)) metrik[x.name] = insightDeger(x); for (const m of ist) { if (metrik[m] == null) yok[m] = 'bos'; else delete ds[`${api}|${k.tur}|${m}`]; } };
    if (sor.length) {
      try { al(await P.graph('GET', `/${id}/insights`, { metric: sor.join(','), access_token: tok }), sor); }
      catch (e) {
        if (desteksizMi(e)) {
          // one unsupported metric fails the whole call: ask one by one and remember what Graph refuses
          for (const m of sor) {
            try { al(await P.graph('GET', `/${id}/insights`, { metric: m, access_token: tok }), [m]); }
            catch (e2) { if (desteksizMi(e2)) { reddet(k.tur, m, e2); yok[m] = 'desteklenmiyor'; } else { yok[m] = 'hata'; hata = gizle(e2.message || e2); } }
          }
        } else { for (const m of sor) yok[m] = 'hata'; hata = gizle(e.message || e); }
      }
    }
    const t = Date.parse(k.t);
    return { v: 2, zaman, media_id: id, yayin: Number.isFinite(t) ? new Date(t).toISOString() : null, yas_s: Number.isFinite(t) ? Math.round((simdi - t) / 1000) : null, api, metrik, yok, ...(hata ? { hata } : {}) };
  }

  if (!hesapSatiri) { kaydet(); return { atlandi: true, son: son && son.zaman, gozlenen }; }

  // ---- the hourly lines: account snapshot + the old-shape line from the newest observation of each media
  const medya = [], listede = new Set(liste.map(g => String(g.id)));
  const ids = [...listede, ...Object.keys(R).filter(id => !listede.has(id) && R[id].dizi != null)];
  for (const id of ids) {
    const k = R[id]; if (!k) continue;
    const o = { id, t: k.t, baslik: k.baslik || '', link: k.link || null, tur: k.tur };
    if (k.tur === 'reel') {
      const r = (gecmis.get(id) || []).filter(veriVar).pop();
      if (r) { o.olcum = r.zaman; for (const m of METRIKLER) if (r.metrik[m] != null) o[m] = r.metrik[m]; }
      // comments of recent reels: the series measurement counts "devam" requests from these, without its own read
      if (Date.parse(k.t) > simdi - YORUM_SAAT * SAAT) {
        try { const c = await P.graph('GET', `/${id}/comments`, { fields: 'text', limit: YORUM_EN_FAZLA, access_token: tok }); o.yorumlar = (c.data || []).map(x => String(x.text || '').slice(0, 200)); } catch (e) { }
      }
    }
    medya.push(o);
  }
  kaydet();
  ekle(ayDosyasi(kok, hesap, simdi, 'hesap-'), { v: 2, zaman, takipci: hesapSatiri.takipci, medya_sayisi: hesapSatiri.medya_sayisi, hesap_insight: hesapSatiri.hesap_insight });
  return { ...yazSatir({ zaman, hesap, ...hesapSatiri, medya }), gozlenen };
}

// series episodes with a media_id of the channels whose kanal/<kanal>/kimlik.json names this account (no hesap = oxygbio)
function diziBolumleri(kok, hesap) {
  const out = []; let ad = [];
  try { ad = fs.readdirSync(path.join(kok, 'kayit', 'dizi')).filter(k => ID.test(k)); } catch (e) { return out; }
  for (const k of ad) {
    if (hesapAd((okuJ(path.join(kok, 'kanal', k, 'kimlik.json'), {}) || {}).hesap) !== hesap) continue;
    const v = okuJ(path.join(kok, 'kayit', 'dizi', k, 'diziler.json'), null);
    for (const d of (v && v.diziler) || []) for (const b of d.bolumler || []) if (b.media_id && ID.test(String(b.media_id))) out.push({ d, b });
  }
  return out;
}

// ---------------------------------------------------------------- aggregation for the İstatistikler page
const gunIst = t => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date(t));
const saatIst = t => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const sayi = v => (Number.isFinite(+v) && v !== null && v !== '' ? +v : null);
// views of a media at time T from its points [[t, views]] (posting time counts as 0); null past the last point and inside
// a gap longer than 3 x the cadence expected at that age (enAz: the source's own interval, 1 h for the hourly lines). The
// gap after posting also allows the hourly listing that finds a new post.
function ara(noktalar, T, yayin, enAz = 0) {
  const p = [...(Number.isFinite(yayin) ? [[yayin, 0]] : []), ...noktalar].filter(x => x[1] != null).sort((a, b) => a[0] - b[0]);
  if (!p.length || T > p[p.length - 1][0] || T < p[0][0]) return null;
  for (let i = 1; i < p.length; i++) if (T <= p[i][0]) {
    const [t0, v0] = p[i - 1], [t1, v1] = p[i];
    if (T === t0) return Math.round(v0);
    if (T === t1) return Math.round(v1);
    const izin = 3 * Math.max(kadans(Number.isFinite(yayin) ? t0 - yayin : Infinity), enAz) + (i === 1 && t0 === yayin ? SAAT : 0);
    if (t1 - t0 > izin) return null;
    return Math.round(v0 + (v1 - v0) * (T - t0) / (t1 - t0));
  }
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
  const gz = ayliklar(kok, hesap, 'gozlem-', onceBas - 2 * GUN, simdi), hs = ayliklar(kok, hesap, 'hesap-', onceBas - 2 * GUN, simdi);
  const R = ID.test(hesap || '') ? okuJ(path.join(dizin(kok, hesap), 'medya.json'), {}) || {} : {};
  const son = iyi[iyi.length - 1] || null, sonHata = hepsi.length && hepsi[hepsi.length - 1].hata ? hepsi[hepsi.length - 1] : null;
  // per media: its points over time and newest numbers
  const M = new Map();
  for (const s of iyi) for (const m of s.medya || []) {
    const t = Date.parse(s.zaman), x = M.get(m.id) || { id: m.id, yayin: Date.parse(m.t), noktalar: [], son: null, sonT: 0, enAz: SAAT };
    x.noktalar.push([t, sayi(m.views)]); if (t >= x.sonT) { x.son = m; x.sonT = t; }
    M.set(m.id, x);
  }
  // observation rows replace the hourly points from their first row on (the hourly line only repeats them); the hourly
  // points before it stay (history from before the observations)
  const G = new Map(); for (const r of gz) { if (!G.has(r.media_id)) G.set(r.media_id, []); G.get(r.media_id).push(r); }
  for (const [id, l] of G) {
    const k = R[id] || {}, ilk = Date.parse(l[0].zaman), sonR = l.filter(veriVar).pop();
    const x = M.get(id) || { id, yayin: Date.parse(k.t || l[0].yayin), noktalar: [], son: null, sonT: 0 };
    const eski = x.noktalar.filter(p => p[0] < ilk);
    x.enAz = eski.length ? SAAT : 0;
    x.noktalar = [...eski, ...l.map(r => [Date.parse(r.zaman), sayi(r.metrik && r.metrik.views)])];
    if (sonR) {
      const meta = x.son ? { id, t: x.son.t, baslik: x.son.baslik, link: x.son.link, tur: x.son.tur } : { id, t: k.t || sonR.yayin, baslik: k.baslik || '', link: k.link || null, tur: k.tur || 'reel' };
      x.son = { ...meta, ...sonR.metrik }; x.sonT = Math.max(x.sonT, Date.parse(sonR.zaman));
    }
    if (x.son) M.set(id, x);
  }
  // views of every media at time T (the newest point not after T; media dropped from the list keep their last value)
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
      v1s: ara(x.noktalar, x.yayin + SAAT, x.yayin, x.enAz), v24s: ara(x.noktalar, x.yayin + 24 * SAAT, x.yayin, x.enAz), v48s: ara(x.noktalar, x.yayin + 48 * SAAT, x.yayin, x.enAz),
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
  // the newest data of any kind: an hourly line, an account snapshot or an observation that brought a number
  const sonVeri = Math.max(-Infinity, ...[son, hs[hs.length - 1], gz.filter(veriVar).pop()].filter(Boolean).map(x => Date.parse(x.zaman)));
  return {
    hesap, gun, zaman: new Date(simdi).toISOString(), son_anlik: son ? son.zaman : null, son_veri: Number.isFinite(sonVeri) ? new Date(sonVeri).toISOString() : null, son_hata: sonHata ? { zaman: sonHata.zaman, hata: sonHata.hata } : null,
    takipci: son ? son.takipci : null, hesap_insight: son ? son.hesap_insight || null : null, hesap_insight_yok: son ? son.hesap_insight_yok || [] : [],
    kpi: { donem: kpi(bas, simdi), onceki: kpi(onceBas, bas) },
    gunluk,
    videolar: videolar.filter(v => donemde(v) || (v.egri.length && Date.parse(v.egri[v.egri.length - 1][0]) >= bas)),
    diziler,
    konular: grupla(v => v.konu, v => v.son.views), tonlar: grupla(v => v.ton, v => v.son.views),
    slotlar: grupla(v => v.slot, v => v.v24s).sort((a, b) => a.ad.localeCompare(b.ad)),
  };
}

module.exports = { anlik, anliklar, sonAnlik, medyaSon, gozlemler, ozet, hesaplar, ara, kadans, zamaniGeldi, canlandi, desteksizMi, METRIKLER, ARALIK, KADANS, TOLERANS, CANLANMA_KAT, CANLANMA_EN_AZ };

if (require.main === module) {
  const argv = process.argv.slice(2), i = argv.indexOf('--hesap'), tek = i >= 0 ? argv[i + 1] : null;
  (async () => {
    if (argv[0] !== 'anlik') { console.log('Kullanım: node instagram/istatistik.js anlik [--hesap ad]'); return; }
    for (const h of tek ? [tek] : hesaplar()) {
      const r = await anlik({ hesap: h }).catch(e => ({ hata: e.message }));
      // a run that only observed media logs only when it read something (every 10 minutes would flood the log)
      if (r.atlandi && !r.gozlenen) continue;
      console.log(`${new Date().toISOString()} ${h}: ${r.atlandi ? `${r.gozlenen} medya gözlendi` : r.hata ? 'HATA ' + r.hata : `takipçi ${r.takipci}, ${(r.medya || []).length} medya, ${r.gozlenen} gözlem`}`);
    }
  })();
}
