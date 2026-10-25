// Ekşi Sözlük: public topic lists (gündem, debe, channel pages such as kanal/bilim). Only topic TITLES and the
// day's entry counts are read, never entry text or author names. robots.txt is checked before each page.
// Ekşi's robots.txt carries "Content-Signal: ai-input=no": unless the channel opts in (llm_e_gonder: true)
// these titles are NOT sent to the language model; they stay in the pool as raw signals for a human to pick.
const { getir, robotsKontrol, icerikSinyali, duzMetin, KaynakHatasi, uyu } = require('./ag');

const KOK = 'https://eksisozluk.com';
const sayfaUrl = s => s === 'gundem' ? `${KOK}/basliklar/gundem` : s === 'debe' ? `${KOK}/debe` : s.startsWith('kanal/') ? `${KOK}/basliklar/${encodeURI(s)}` : null;

// Parses the <ul class="topic-list"> of a list page. Sponsored/ad <li>s have no plain topic link and are skipped.
function listeAyristir(html, sayfa) {
  const i = html.indexOf('class="topic-list');
  if (i < 0) return [];
  const bolum = html.slice(i, html.indexOf('</ul>', i) + 5);
  const out = [];
  for (const m of bolum.matchAll(/<li[^>]*>\s*<a\s+href="(\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const [, href, ic] = m;
    const sayi = (ic.match(/<small>\s*(\d+)\s*<\/small>/) || [])[1];
    const cap = ic.match(/<span class="caption">([\s\S]*?)<\/span>/);
    const baslik = duzMetin(cap ? cap[1] : ic.replace(/<small>[\s\S]*?<\/small>/, ''));
    if (!baslik) continue;
    out.push({ baslik, yol: href.split('?')[0], entry_bugun: sayi ? +sayi : null, sira: out.length + 1, sayfa });
  }
  return out;
}

async function topla(ayar = {}) {
  const sayfalar = ayar.sayfalar || ['gundem', 'debe'];
  const llmIzni = ayar.llm_e_gonder === true;
  const sinyal = await icerikSinyali(KOK + '/', 'eksi').catch(() => ({}));
  const notlar = [];
  if (sinyal['ai-input'] === 'no' && !llmIzni) notlar.push('Ekşi robots.txt "ai-input=no" diyor: başlıklar yapay zekâya gönderilmeyecek, havuzda ham konu olarak duracak (konu.json → eksi.llm_e_gonder).');
  const ogeler = [], gorulen = new Set();
  for (const s of sayfalar) {
    const url = sayfaUrl(s);
    if (!url) { notlar.push(`bilinmeyen Ekşi sayfası: ${s}`); continue; }
    if (!(await robotsKontrol(url, 'eksi'))) { notlar.push(`robots.txt ${s} sayfasına izin vermiyor, atlandı.`); continue; }
    const r = await getir(url, { kaynak: 'eksi', aralikMs: ayar.aralik_ms || 4000 });
    if ([403, 429, 503].includes(r.durum) || /cf-chl|challenge-platform|Just a moment/i.test(r.metin.slice(0, 5000)))
      throw new KaynakHatasi('eksi', `Ekşi Sözlük erişimi engelledi (HTTP ${r.durum}). Bir süre sonra tekrar dene; ısrar etme.`, true);
    if (r.durum !== 200) { notlar.push(`${s}: HTTP ${r.durum}`); continue; }
    const liste = listeAyristir(r.metin, s);
    if (!liste.length) notlar.push(`${s}: sayfada başlık bulunamadı (site yapısı değişmiş olabilir).`);
    for (const x of liste) {
      const url2 = KOK + x.yol;
      if (gorulen.has(url2)) continue; gorulen.add(url2);
      // engagement: today's entry count on log scale (≈1000 entries → 1); debe/channel rank as a weaker fallback
      const etk = x.entry_bugun != null ? Math.min(1, Math.log10(x.entry_bugun + 1) / 3)
        : s === 'debe' ? 0.4 + 0.3 * (1 - x.sira / (liste.length + 1)) : 0.1;   // channel page, quiet today
      ogeler.push({
        kaynak: 'eksi', alt: s, baslik: x.baslik, ozet: '', url: url2, dil: 'tr', zaman: Date.now(), llm_izni: llmIzni,
        metrikler: { sayfa: s, sira: x.sira, ...(x.entry_bugun != null ? { entry_bugun: x.entry_bugun } : {}) }, etkilesim: +etk.toFixed(3),
      });
    }
    await uyu(0);
  }
  return { ogeler, notlar };
}

module.exports = { topla, listeAyristir };
