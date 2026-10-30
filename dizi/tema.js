// Story themes (Furkan 30.10): a channel lists fixed themes with their Ekşi topics in konu.json → dizi.kaynak.konular
// [{ad, basliklar: ['/slug--id', ...]}]. Each new series comes from the least recently used theme, never from a theme
// already used today (Istanbul day); inside a theme stories rank by favourites only (no recency filter).
//   konular(ctx) -> [{ad, basliklar}]
//   temaSirasi(konular, diziler, simdi) -> ['aşk', ...]   themes allowed now, least recently used first
//   basliktanAl(baslik, {getir, sayfa}) -> [{id, tur, url, baslik, metin, puan, tarih, dil}]   one topic's best-of page
const eksi = require('../konu/kaynaklar/eksi');

const gunIst = t => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date(t));   // YYYY-MM-DD

function konular(ctx) {
  const k = ((((ctx || {}).ayar || {}).dizi || {}).kaynak || {}).konular;
  return Array.isArray(k) ? k.filter(x => x && typeof x.ad === 'string' && x.ad.trim() && Array.isArray(x.basliklar)).map(x => ({ ad: x.ad.trim(), basliklar: x.basliklar.map(String).filter(Boolean) })) : [];
}

// series carry their theme in `konu`; the last use of a theme is its newest series' olusturma
function temaSirasi(liste, diziler, simdi) {
  const bugun = gunIst(simdi), son = {};
  for (const d of diziler || []) {
    if (!d || !d.konu) continue;
    const t = Date.parse(d.olusturma) || 0;
    if (!(d.konu in son) || t > son[d.konu]) son[d.konu] = t;
  }
  return liste.map((k, i) => ({ ad: k.ad, i, t: son[k.ad] ?? -Infinity }))
    .filter(x => x.t === -Infinity || gunIst(x.t) !== bugun)
    .sort((a, b) => a.t - b.t || a.i - b.i).map(x => x.ad);
}

// a topic path ("/slug--123") or a full Ekşi topic url -> its best-of page url (?a=nice works without login), page n
function enIyiUrl(baslik, sayfa = 1) {
  const u = /^https?:/.test(baslik) ? baslik.split('?')[0] : 'https://eksisozluk.com' + (baslik.startsWith('/') ? '' : '/') + baslik.split('?')[0];
  return `${u}?a=nice${sayfa > 1 ? '&p=' + sayfa : ''}`;
}
async function basliktanAl(baslik, { getir, sayfa = 1 } = {}) {
  const es = eksi.entryleriAyristir(await getir(enIyiUrl(baslik, sayfa)));
  return es.map(e => ({ id: 'eksi-' + e.id, tur: 'eksi', url: eksi.entryUrl(e.id), baslik: e.baslik, metin: e.metin, puan: e.fav, tarih: e.tarih || null, dil: 'tr' }));
}

module.exports = { konular, temaSirasi, basliktanAl, enIyiUrl, gunIst };
