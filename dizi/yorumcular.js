// Commenters of a series' posted episodes, for the thanks outro of its last episode. Read through Apify's Instagram
// comment scraper (it reads the public reels without any Instagram login), because the Graph API returns no other
// users' comments to an app in development mode. Token: ~/.video-mutfagi/apify.txt (never printed).
// Used right before a series' last episode is produced: the usernames join dizi.tesekkur (names added in the panel
// stay first), the channel's own account and duplicates left out. A failure never stops the episode.
//   cek(linkler, { token, getir }) -> [username] in comment order (replies included)
//   topla(ctx, dizi, { token, getir, yaz }) -> dizi.tesekkur (filled in place) | null when nothing could be read
const fs = require('fs'), path = require('path'), os = require('os');

const AKTOR = 'apify~instagram-comment-scraper';
const ADRES = `https://api.apify.com/v2/acts/${AKTOR}/run-sync-get-dataset-items?timeout=240`;
const temizAd = x => String(x || '').trim().replace(/^@+/, '');
const gecerli = x => /^[\w.]{1,30}$/.test(x);

function tokenOku() {
  try { const t = fs.readFileSync(path.join(os.homedir(), '.video-mutfagi', 'apify.txt'), 'utf8').trim(); return t || null; } catch (e) { return null; }
}

async function cek(linkler, { token, getir = fetch } = {}) {
  if (!token || !linkler.length) return [];
  const r = await getir(ADRES, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ directUrls: linkler, resultsLimit: 500, includeNestedComments: true }) });
  if (!r.ok) throw new Error(`Apify HTTP ${r.status}`);
  const liste = await r.json();
  if (!Array.isArray(liste)) throw new Error('Apify: beklenmeyen cevap');
  const adlar = [];
  const ekle = c => { if (!c) return; adlar.push(temizAd(c.ownerUsername || (c.owner && c.owner.username))); for (const y of c.replies || []) ekle(y); };
  for (const c of liste.slice().sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')))) ekle(c);
  return adlar.filter(gecerli);
}

async function topla(ctx, dizi, { token = tokenOku(), getir, yaz = () => { } } = {}) {
  const linkler = (dizi.bolumler || []).map(b => b.link).filter(l => /^https:\/\/www\.instagram\.com\//.test(String(l || '')));
  if (!token || !linkler.length) return null;
  const m = ((ctx || {}).kimlik || {}).marka || {};
  const biz = new Set([m.hesap, (ctx.kimlik || {}).hesap, ctx.kanal].map(temizAd).filter(Boolean).map(x => x.toLowerCase()));
  try {
    const yeni = await cek(linkler, { token, getir });
    const once = (Array.isArray(dizi.tesekkur) ? dizi.tesekkur : []).map(temizAd).filter(gecerli);
    const gor = new Set(), hepsi = [];
    for (const a of [...once, ...yeni]) { const k = a.toLowerCase(); if (biz.has(k) || gor.has(k)) continue; gor.add(k); hepsi.push(a); }
    dizi.tesekkur = hepsi;
    dizi.tesekkur_cekildi = new Date().toISOString();
    yaz(`${dizi.id}: ${linkler.length} bölümden ${hepsi.length} yorumcu teşekkür listesinde`);
    return hepsi;
  } catch (e) {
    yaz(`${dizi.id}: yorumcular okunamadı (${e.message}); panelde eklenen liste kullanılacak`);
    return null;
  }
}

module.exports = { cek, topla, tokenOku };
