// Google Trends daily searches (public RSS, per country). Each term comes with an approximate search volume
// and a few related news headlines that tell the language model what the search is about.
const { getir, akisOgeleri, etiket, duzMetin, KaynakHatasi } = require('./ag');

// "2K+" -> 2000, "200+" -> 200, "1M+" -> 1e6
function trafik(s) {
  const m = /^(\d+(?:\.\d+)?)([KMB])?$/i.exec(String(s || '').replace(/[,+\s]/g, ''));
  return m ? Math.round(+m[1] * ({ K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1)) : null;
}

function ayristir(xml, ulke) {
  return akisOgeleri(xml).map(o => {
    const haberler = [...o.blok.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)].map(m => ({
      baslik: duzMetin(etiket(m[1], 'ht:news_item_title')), url: duzMetin(etiket(m[1], 'ht:news_item_url')), kaynak: duzMetin(etiket(m[1], 'ht:news_item_source')),
    }));
    const arama = trafik(duzMetin(etiket(o.blok, 'ht:approx_traffic')));
    return {
      kaynak: 'gtrends', alt: 'Google ' + ulke, baslik: o.baslik, ozet: haberler.map(h => h.baslik).filter(Boolean).join(' | '),
      url: (haberler[0] && haberler[0].url) || `https://trends.google.com/trends/explore?${new URLSearchParams({ q: o.baslik, geo: ulke, date: 'now 1-d' })}`,
      dil: ulke === 'TR' ? 'tr' : 'en', zaman: o.zaman, llm_izni: true,
      metrikler: { arama }, etkilesim: +Math.min(1, Math.log10((arama || 100) + 1) / 6).toFixed(3),
    };
  }).filter(x => x.baslik);
}

async function topla(ayar = {}) {
  const ulke = (ayar.ulke || 'TR').toUpperCase();
  if (!/^[A-Z]{2}$/.test(ulke)) throw new KaynakHatasi('gtrends', 'ülke kodu iki harf olmalı (TR, US…).');
  const r = await getir(`https://trends.google.com/trending/rss?geo=${ulke}`, { kaynak: 'gtrends', aralikMs: 2000 });
  if (r.durum !== 200) throw new KaynakHatasi('gtrends', `Google Trends HTTP ${r.durum}`, r.durum === 429);
  return { ogeler: ayristir(r.metin, ulke), notlar: [] };
}

module.exports = { topla, ayristir, trafik };
