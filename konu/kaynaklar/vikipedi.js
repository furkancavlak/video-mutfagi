// Wikipedia "most read" articles (Wikimedia feed API, free and stable; content is CC BY-SA).
// Each article comes with its daily views and the last five days, so we can tell a rising topic from a steady one.
const { getir, KaynakHatasi } = require('./ag');

// pages that are always on top and never a video topic
const ATLA = /^(Anasayfa|Ana Sayfa|Main Page|Özel:|Special:|Vikipedi:|Wikipedia:|Dosya:|File:|Kategori:|Portal:|Yardım:|Help:)/i;

function ayristir(json, dil, tarihMs) {
  const out = [];
  const arts = (json.mostread && json.mostread.articles) || [];
  for (const a of arts) {
    const baslik = (a.titles && a.titles.normalized) || a.normalizedtitle || a.title;
    if (!baslik || ATLA.test(baslik) || (a.type && a.type !== 'standard')) continue;
    const h = (a.view_history || []).map(v => v.views);
    const once = h.slice(0, -1), ort = once.length ? once.reduce((x, y) => x + y, 0) / once.length : a.views;
    const yukselis = ort ? +(a.views / ort).toFixed(2) : 1;
    // engagement: views on log scale (≈100k/day → 1), up for a topic that is rising, down for evergreen pages
    // ("Bilim", "Türkiye") that are read every day and say nothing about today
    const etk = Math.min(1, Math.log10(a.views + 1) / 5 * (yukselis >= 2 ? 1.15 : yukselis < 1.3 ? 0.6 : 1));
    out.push({
      kaynak: 'vikipedi', alt: dil + '.wikipedia', baslik, ozet: (a.description ? a.description + '. ' : '') + (a.extract || ''),
      url: (a.content_urls && a.content_urls.desktop && a.content_urls.desktop.page) || `https://${dil}.wikipedia.org/wiki/${encodeURIComponent(baslik)}`,
      dil, zaman: tarihMs, llm_izni: true, metrikler: { goruntulenme: a.views, sira: a.rank, yukselis }, etkilesim: +etk.toFixed(3),
    });
  }
  // today's featured article: a hand-picked, well-sourced topic
  if (json.tfa && json.tfa.titles) out.push({
    kaynak: 'vikipedi', alt: dil + '.wikipedia seçkin', baslik: json.tfa.titles.normalized, ozet: json.tfa.extract || '',
    url: json.tfa.content_urls && json.tfa.content_urls.desktop.page, dil, zaman: tarihMs, llm_izni: true, metrikler: { seckin: true }, etkilesim: 0.5,
  });
  return out;
}

async function topla(ayar = {}) {
  const diller = ayar.diller || ['tr'];
  const d = new Date();
  const yol = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
  const ogeler = [], notlar = [];
  for (const dil of diller) {
    if (!/^[a-z-]{2,12}$/.test(dil)) { notlar.push(`geçersiz dil kodu: ${dil}`); continue; }
    const r = await getir(`https://api.wikimedia.org/feed/v1/wikipedia/${dil}/featured/${yol}`, { kaynak: 'vikipedi', aralikMs: 1000, basliklar: { Accept: 'application/json' } });
    if (r.durum !== 200) { notlar.push(`${dil}: HTTP ${r.durum}`); continue; }
    let j; try { j = JSON.parse(r.metin); } catch (e) { throw new KaynakHatasi('vikipedi', 'yanıt okunamadı'); }
    ogeler.push(...ayristir(j, dil, Date.now()).slice(0, ayar.adet || 40));
  }
  return { ogeler, notlar };
}

module.exports = { topla, ayristir };
