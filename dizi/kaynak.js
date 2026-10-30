// Story candidates with full text: Ekşi entries (debe page + configured topics/ids) and Reddit self posts.
// adaylar(ctx, {simdi, getir, kok}) -> {ogeler: Hikaye[], notlar}. Never throws on a source failure: it adds a note and goes on.
//   Hikaye = {id:'eksi-<entry>'|'reddit-<post>', tur, url, baslik, metin, puan, dil}
// Config (ctx.ayar.dizi.kaynak): subredditler, eksi_basliklar (entry ids/paths or topic paths), eksi_min_fav, min_kelime, aralik_ms.
const eksi = require('../konu/kaynaklar/eksi'), reddit = require('../konu/kaynaklar/reddit');
const { rssAyristir } = reddit;
const { uyu } = require('../konu/kaynaklar/ag');
const { KOK } = require('../konu/ortak');
const { yukle } = require('./dizi');

const VARSAYILAN = { subredditler: ['tifu', 'AmItheAsshole', 'relationship_advice', 'confession', 'pettyrevenge'], eksi_basliklar: [], eksi_min_fav: 300, min_kelime: 420, aralik_ms: 2000, reddit_adet: 5, eksi_adet: 10 };
const kelimeSay = s => (String(s).match(/\S+/g) || []).length;
const engelMi = e => /HTTP (403|429|503)/.test(String(e && e.message));

// default fetcher: Ekşi via browser-UA helper, everything else via the polite shared client
const varsayilanGetir = (url, o) => /eksisozluk\.com/.test(url) ? eksi.tarayiciGetir(url, o) : reddit.varsayilanGetir(url, o);

async function adaylar(ctx, { simdi, getir = varsayilanGetir, kok } = {}) {
  const a = { ...VARSAYILAN, ...(((ctx && ctx.ayar && ctx.ayar.dizi) || {}).kaynak || {}) };
  const notlar = [], ogeler = [], gorulen = new Set();
  let kullanilan = new Set();
  try {
    for (const d of (yukle(kok || ctx.kok || KOK, ctx.kanal).diziler || [])) { kullanilan.add(d.id); if (d.kaynak && d.kaynak.id) kullanilan.add(d.kaynak.id); }
  } catch (e) { notlar.push(`dizi deposu okunamadı: ${e.message}`); }
  const uygun = (metin, fav, tur) => kelimeSay(metin) >= a.min_kelime || (tur === 'eksi' && fav >= a.eksi_min_fav);
  const bekle = () => uyu(a.aralik_ms);
  const al = async (url, basliklar) => { const m = await getir(url, { headers: basliklar || {}, aralikMs: a.aralik_ms }); await bekle(); return m; };

  // ---- Ekşi
  try {
    const idler = [], konular = [];
    try { idler.push(...eksi.debeEntryIdleri(await al('https://eksisozluk.com/debe')).slice(0, a.eksi_adet)); }
    catch (e) { notlar.push(`ekşi debe: ${e.message}`); if (engelMi(e)) throw e; }
    for (const b of a.eksi_basliklar) {
      const s = String(b).trim();
      const m = s.match(/^(?:\/entry\/|https?:\/\/eksisozluk\.com\/entry\/)?(\d+)\/?$/);
      if (m) idler.push(m[1]); else if (s) konular.push(s);
    }
    const ekle = e => {
      const id = 'eksi-' + e.id;
      if (gorulen.has(id) || kullanilan.has(id) || !uygun(e.metin, e.fav, 'eksi')) return;
      gorulen.add(id);
      ogeler.push({ id, tur: 'eksi', url: eksi.entryUrl(e.id), baslik: e.baslik, metin: e.metin, puan: e.fav, dil: 'tr' });
    };
    for (const id of [...new Set(idler)]) {
      if (gorulen.has('eksi-' + id) || kullanilan.has('eksi-' + id)) continue;
      try { ekle(await eksi.entryGetir(id, { getir: (u, o) => al(u, o.headers) })); }
      catch (e) { notlar.push(`ekşi entry ${id}: ${e.message}`); if (engelMi(e)) throw e; }
    }
    for (const k of konular) {
      const url = /^https?:/.test(k) ? k : 'https://eksisozluk.com' + (k.startsWith('/') ? '' : '/') + k;
      try { for (const e of eksi.entryleriAyristir(await al(url + (url.includes('?') ? '&' : '?') + 'a=nice')).slice(0, a.eksi_adet)) ekle(e); }
      catch (e) { notlar.push(`ekşi başlık ${k}: ${e.message}`); if (engelMi(e)) throw e; }
    }
  } catch (e) { notlar.push(`ekşi: ${e.message} (kaynak atlandı)`); }

  // ---- Reddit: top of the week per subreddit via RSS (links only), then the full post via <url>.json
  for (const sub of a.subredditler) {
    try {
      if (!/^\w+$/.test(sub)) throw new Error('geçersiz subreddit adı');
      const linkler = rssAyristir(await al(`https://www.reddit.com/r/${sub}/top/.rss?t=week&limit=${a.reddit_adet * 2}`, { Accept: 'application/atom+xml' }), a.reddit_adet * 2)
        .map(o => o.url).filter(u => /\/comments\/\w+/.test(u)).slice(0, a.reddit_adet);
      for (const url of linkler) {
        const rid = 'reddit-' + url.match(/\/comments\/(\w+)/)[1];
        if (gorulen.has(rid) || kullanilan.has(rid)) continue;
        try {
          const p = await reddit.postGetir(url, { getir: (u, o) => al(u, o.headers) });
          const id = 'reddit-' + p.id;
          if (gorulen.has(id) || kullanilan.has(id) || !uygun(p.metin, 0, 'reddit')) continue;
          gorulen.add(id);
          ogeler.push({ id, tur: 'reddit', url: url.split(/[?#]/)[0], baslik: p.baslik, metin: p.metin, puan: p.skor, dil: 'en' });
        } catch (e) { notlar.push(`reddit gönderi ${rid}: ${e.message}`); if (engelMi(e)) throw e; }
      }
    } catch (e) { notlar.push(`reddit r/${sub}: ${e.message}`); }
  }
  return { ogeler, notlar };
}

module.exports = { adaylar, kelimeSay };
