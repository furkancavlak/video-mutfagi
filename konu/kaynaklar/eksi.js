// Ekşi Sözlük: public topic lists (gündem, debe, channel pages such as kanal/bilim). The radar reads only topic TITLES and the
// day's entry counts; entry text is fetched one by one only for the story sources (entryGetir). robots.txt is checked before each page.
// Titles go to the language model like every other source; a channel can opt out with llm_e_gonder: false.
const { getir, robotsKontrol, icerikSinyali, duzMetin, varlikCoz, KaynakHatasi, uyu } = require('./ag');

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

// ---- single entries (story sources, dizi/kaynak.js). Entry text is read only for explicitly chosen entries.
// Plain clients get 403 from Ekşi's Cloudflare; a browser User-Agent gets 200 (decided by the channel owner).
const TARAYICI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const entryUrl = id => `${KOK}/entry/${id}`;

// Entry <li data-id=...> blocks of an entry or topic page -> [{id, baslik, metin, fav, yazar}]
function entryleriAyristir(html) {
  const bs = html.match(/<h1 id="title"[^>]*data-title="([^"]*)"/);
  const baslik = bs ? varlikCoz(bs[1]).trim() : '';
  const out = [];
  for (const m of html.matchAll(/<li\b([^>]*\bdata-id="(\d+)"[^>]*)>([\s\S]*?)<\/li>/g)) {
    const [, oz, id, ic] = m;
    const c = ic.match(/<div class="content">([\s\S]*?)<\/div>/);
    if (!c) continue;
    const metin = varlikCoz(c[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
      .split('\n').map(s => s.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const fav = +(oz.match(/data-favorite-count="(\d+)"/) || [])[1] || 0;
    const yazar = varlikCoz((oz.match(/data-author="([^"]*)"/) || [])[1] || '');
    out.push({ id, baslik, metin, fav, yazar });
  }
  return out;
}
const entryAyristir = html => entryleriAyristir(html)[0] || null;

// Entry ids linked from the debe page (/entry/<id>?debe=true), in page order
const debeEntryIdleri = html => [...new Set([...html.matchAll(/href="\/entry\/(\d+)/g)].map(m => m[1]))];


// default fetcher: robots.txt respected, throws "HTTP <n>" on non-200. Cloudflare answers a Chrome User-Agent sent over
// Node's TLS with a 403 challenge (fingerprint mismatch) but serves the radar's honest one, so that goes first and the
// browser UA only after a 403. istemci/robots are injectable for tests.
async function tarayiciGetir(url, { headers = {}, aralikMs = 4000, istemci = getir, robots = robotsKontrol } = {}) {
  if (!(await robots(url, 'eksi'))) throw new Error('robots.txt izin vermiyor');
  const { 'User-Agent': _ua, ...kalan } = headers;
  let r = await istemci(url, { kaynak: 'eksi', aralikMs, basliklar: kalan });
  if (r.durum === 403) r = await istemci(url, { kaynak: 'eksi', aralikMs, basliklar: { ...kalan, 'User-Agent': TARAYICI_UA } });
  if (r.durum !== 200) throw new Error(`HTTP ${r.durum}`);
  return r.metin;
}

async function entryGetir(id, { getir: g = tarayiciGetir } = {}) {
  const e = entryAyristir(await g(entryUrl(id), { headers: { 'User-Agent': TARAYICI_UA } }));
  if (!e) throw new Error(`entry ${id} sayfada bulunamadı (site yapısı değişmiş olabilir)`);
  return e;
}

async function topla(ayar = {}) {
  const sayfalar = ayar.sayfalar || ['gundem', 'debe'];
  const llmIzni = ayar.llm_e_gonder !== false;
  const sinyal = await icerikSinyali(KOK + '/', 'eksi').catch(() => ({}));
  const notlar = [];
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

module.exports = { topla, listeAyristir, entryAyristir, entryleriAyristir, entryGetir, debeEntryIdleri, entryUrl, tarayiciGetir, TARAYICI_UA };
