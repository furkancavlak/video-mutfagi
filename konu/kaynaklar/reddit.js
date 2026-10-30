// Reddit: top posts of the configured subreddits.
//   yontem "api": official Data API with the user's own app (client credentials in ~/.video-mutfagi/reddit.json).
//                 Gives real score and comment counts. The compliant path; recommended.
//   yontem "rss": the public Atom feed (one request for all subreddits combined). Logged-out .json returns 403
//                 since 2026, and Reddit's robots.txt disallows automated access, so RSS is a feed-reader fallback:
//                 keep it to a few requests a day. No score in the feed, the rank stands in for engagement.
const fs = require('fs'), path = require('path');
const { getir, akisOgeleri, duzMetin, varlikCoz, KaynakHatasi } = require('./ag');
const { AYAR_DIR } = require('../ortak');

function rssAyristir(xml, adet) {
  return akisOgeleri(xml).map((o, i) => {
    const html = varlikCoz(o.icerik);
    // self posts carry their text in <div class="md">; link posts point at an outside source ("[link]")
    const md = (html.match(/<div class="md">([\s\S]*?)<\/div>/) || [])[1];
    const dis = (html.match(/<a href="([^"]+)">\[link\]<\/a>/) || [])[1];
    return {
      kaynak: 'reddit', alt: 'r/' + o.kategori, baslik: o.baslik.replace(/^TIL\b[:,]?\s*/i, 'TIL: '), ozet: md ? duzMetin(md).slice(0, 600) : '',
      url: o.link, dis_kaynak: dis && !/reddit\.com|redd\.it/.test(dis) ? dis : null, dil: 'en', zaman: o.zaman, llm_izni: true,
      metrikler: { subreddit: o.kategori, sira: i + 1 }, etkilesim: +Math.max(0.1, 1 - i / adet).toFixed(3),
    };
  });
}

// Full post via <post-url>.json (listing shape [{data:{children:[{data:post}]}}, comments]).
async function varsayilanGetir(url, { headers = {} } = {}) {
  const r = await getir(url, { kaynak: 'reddit', aralikMs: 2000, basliklar: headers });
  if (r.durum !== 200) throw new Error(`HTTP ${r.durum}`);
  return r.metin;
}
function postAyristir(json) {
  const d = (((JSON.parse(json) || [])[0] || {}).data || {}).children;
  const p = d && d[0] && d[0].data;
  if (!p || !p.id) throw new Error('reddit yanıtında gönderi yok');
  return { id: p.id, baslik: p.title || '', metin: p.selftext || '', skor: p.score || 0, yorum: p.num_comments || 0, subreddit: p.subreddit || '' };
}
async function postGetir(url, { getir: g = varsayilanGetir } = {}) {
  const temiz = String(url).split(/[?#]/)[0].replace(/\/+$/, '');
  return postAyristir(await g(temiz + '.json?raw_json=1', { headers: { Accept: 'application/json' } }));
}

async function apiTopla(ayar, subs) {
  const f = path.join(AYAR_DIR, 'reddit.json');
  if (!fs.existsSync(f)) throw new KaynakHatasi('reddit', `Reddit API seçili ama ${f} yok. konu/BENIOKU.md → "Reddit API" adımlarını izle ya da yontem: "rss" kullan.`);
  const { client_id, client_secret } = JSON.parse(fs.readFileSync(f, 'utf8'));
  const tok = await getir('https://www.reddit.com/api/v1/access_token', {
    kaynak: 'reddit', yontem: 'POST', govde: 'grant_type=client_credentials', aralikMs: 1000,
    basliklar: { Authorization: 'Basic ' + Buffer.from(`${client_id}:${client_secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (tok.durum !== 200) throw new KaynakHatasi('reddit', `Reddit API girişi başarısız (HTTP ${tok.durum}). reddit.json'daki uygulama bilgilerini kontrol et.`);
  const token = JSON.parse(tok.metin).access_token;
  const r = await getir(`https://oauth.reddit.com/r/${subs.join('+')}/top?t=${ayar.zaman || 'day'}&limit=${ayar.adet || 50}&raw_json=1`, { kaynak: 'reddit', basliklar: { Authorization: 'Bearer ' + token }, aralikMs: 1000 });
  if (r.durum !== 200) throw new KaynakHatasi('reddit', `Reddit API HTTP ${r.durum}`, r.durum === 403 || r.durum === 429);
  return JSON.parse(r.metin).data.children.map(({ data: d }) => ({
    kaynak: 'reddit', alt: 'r/' + d.subreddit, baslik: d.title, ozet: (d.selftext || '').slice(0, 600), url: 'https://www.reddit.com' + d.permalink,
    dis_kaynak: d.is_self ? null : d.url, dil: 'en', zaman: d.created_utc * 1000, llm_izni: true,
    metrikler: { subreddit: d.subreddit, skor: d.score, yorum: d.num_comments }, etkilesim: +Math.min(1, Math.log10(d.score + 2 * d.num_comments + 1) / 5).toFixed(3),
  }));
}

async function topla(ayar = {}) {
  const subs = ayar.subredditler || ['todayilearned', 'askscience'];
  if (!subs.every(s => /^\w+$/.test(s))) throw new KaynakHatasi('reddit', 'subreddit adlarında yalnız harf, rakam ve _ olabilir.');
  if ((ayar.yontem || 'rss') === 'api') return { ogeler: await apiTopla(ayar, subs), notlar: [] };
  const adet = ayar.adet || 50;
  const r = await getir(`https://www.reddit.com/r/${subs.join('+')}/top/.rss?t=${ayar.zaman || 'day'}&limit=${adet}`, { kaynak: 'reddit', aralikMs: 65000, basliklar: { Accept: 'application/atom+xml' } });
  if (r.durum === 429 || r.durum === 403) throw new KaynakHatasi('reddit', `Reddit isteği reddetti (HTTP ${r.durum}). Saatte birden sık çalıştırma ya da resmi API'yi kullan (yontem: "api").`, true);
  if (r.durum !== 200) throw new KaynakHatasi('reddit', `Reddit HTTP ${r.durum}`);
  return { ogeler: rssAyristir(r.metin, adet), notlar: [] };
}

module.exports = { topla, rssAyristir, postAyristir, postGetir, varsayilanGetir };
