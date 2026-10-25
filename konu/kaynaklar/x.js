// X (Twitter): OPTIONAL, off by default. Uses ONLY the official X API v2 "recent search" with the user's own
// bearer token, stored in ~/.video-mutfagi/x.json as {"bearer_token": "..."} (never in the repo, never printed).
// Recent search needs a paid API plan on X; without one the API answers 401/403/429.
const fs = require('fs'), path = require('path');
const { getir, KaynakHatasi } = require('./ag');
const { AYAR_DIR } = require('../ortak');

function ayristir(json, sorgu) {
  return (json.data || []).map(t => {
    const m = t.public_metrics || {};
    const puan = (m.like_count || 0) + 2 * (m.retweet_count || 0) + (m.reply_count || 0) + (m.quote_count || 0);
    return {
      kaynak: 'x', alt: 'X: ' + sorgu, baslik: t.text.replace(/\s+/g, ' ').slice(0, 160), ozet: t.text, url: `https://x.com/i/web/status/${t.id}`,
      dil: t.lang || 'tr', zaman: Date.parse(t.created_at) || null, llm_izni: true,
      metrikler: { begeni: m.like_count || 0, repost: m.retweet_count || 0, yanit: m.reply_count || 0, ...(m.impression_count != null ? { gosterim: m.impression_count } : {}) },
      etkilesim: +Math.min(1, Math.log10(puan + 1) / 4).toFixed(3),
    };
  });
}

async function topla(ayar = {}) {
  const f = path.join(AYAR_DIR, 'x.json');
  if (!fs.existsSync(f)) throw new KaynakHatasi('x', `X açık ama anahtar yok. Kendi X API anahtarını ${f} dosyasına {"bearer_token": "..."} olarak kaydet (konu/BENIOKU.md → X). Anahtarı sohbete yapıştırma.`);
  let token; try { token = JSON.parse(fs.readFileSync(f, 'utf8')).bearer_token; } catch (e) { }
  if (!token) throw new KaynakHatasi('x', 'x.json içinde bearer_token yok.');
  const ogeler = [], notlar = [];
  for (const sorgu of ayar.sorgular || []) {
    const q = new URLSearchParams({ query: sorgu, max_results: String(Math.min(100, Math.max(10, ayar.adet || 50))), 'tweet.fields': 'public_metrics,created_at,lang' });
    const r = await getir('https://api.x.com/2/tweets/search/recent?' + q, { kaynak: 'x', aralikMs: 3000, basliklar: { Authorization: 'Bearer ' + token } });
    if (r.durum === 401) throw new KaynakHatasi('x', 'X anahtarı geçersiz (401).');
    if (r.durum === 403) throw new KaynakHatasi('x', 'X API bu anahtara arama izni vermiyor (403). Arama ücretli API planı ister.', true);
    if (r.durum === 429) { notlar.push('X kota sınırı (429): kalan sorgular atlandı.'); break; }
    if (r.durum !== 200) { notlar.push(`X "${sorgu}": HTTP ${r.durum}`); continue; }
    ogeler.push(...ayristir(JSON.parse(r.metin), sorgu));
  }
  return { ogeler, notlar };
}

module.exports = { topla, ayristir };
