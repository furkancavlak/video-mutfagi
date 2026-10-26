// Polite HTTP for collectors: honest User-Agent, one request at a time per host with a minimum gap,
// timeouts, a single retry on network/5xx errors, robots.txt check for HTML pages, and tiny XML/HTML helpers.
const UA = 'video-mutfagi-konu-radari/0.1 (+https://github.com/furkancavlak/video-mutfagi; acik kaynak konu radari)';

class KaynakHatasi extends Error {
  constructor(kaynak, mesaj, engel = false) { super(mesaj); this.name = 'KaynakHatasi'; this.kaynak = kaynak; this.engel = engel; }
}

const uyu = ms => new Promise(r => setTimeout(r, ms));
const sonIstek = new Map();                     // host -> last request time

// Plain node:https request. Node's built-in fetch() adds browser-style "sec-fetch-*" headers; next to a
// non-browser User-Agent some sites (Ekşi behind Cloudflare) answer that mix with a bot challenge (403),
// while a plain client with the same honest User-Agent is served normally. We never pretend to be a browser.
function istek(url, { yontem, basliklar, govde, zamanAsimiMs }, yonlendirme = 0) {
  return new Promise((coz, reddet) => {
    const u = new URL(url), mod = u.protocol === 'http:' ? require('http') : require('https');
    const req = mod.request(u, { method: yontem, headers: { 'Accept-Encoding': 'gzip, deflate', ...basliklar } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && yonlendirme < 4) {
        res.resume();
        return coz(istek(new URL(res.headers.location, u).toString(), { yontem: res.statusCode === 303 ? 'GET' : yontem, basliklar, govde, zamanAsimiMs }, yonlendirme + 1));
      }
      const zlib = require('zlib'), enc = res.headers['content-encoding'];
      const akis = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : res;
      const parca = [];
      akis.on('data', d => parca.push(d));
      akis.on('end', () => coz({ durum: res.statusCode, metin: Buffer.concat(parca).toString('utf8'), basliklar: res.headers }));
      akis.on('error', reddet);
    });
    req.setTimeout(zamanAsimiMs, () => req.destroy(Object.assign(new Error('zaman aşımı'), { code: 'ETIMEDOUT' })));
    req.on('error', reddet);
    if (govde) req.write(govde);
    req.end();
  });
}

async function getir(url, { aralikMs = 2000, zamanAsimiMs = 20000, basliklar = {}, yontem = 'GET', govde, kaynak = 'ag' } = {}) {
  const host = new URL(url).host;
  const bekle = (sonIstek.get(host) || 0) + aralikMs - Date.now();
  if (bekle > 0) await uyu(bekle);
  for (let deneme = 0; ; deneme++) {
    sonIstek.set(host, Date.now());
    let r;
    try {
      r = await istek(url, { yontem, govde, zamanAsimiMs, basliklar: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.6', ...basliklar } });
    } catch (e) {
      if (deneme < 1) { await uyu(3000); continue; }
      throw new KaynakHatasi(kaynak, `bağlantı kurulamadı (${e.code || e.message})`);
    }
    if (r.durum >= 500 && deneme < 1) { await uyu(3000); continue; }
    return r;
  }
}

// ---- robots.txt (only the groups for "*" and our own token; longest matching rule wins, Allow wins ties)
const robotsOnbellek = new Map();
function robotsAyristir(txt) {
  const gruplar = []; let g = null, ajanSonrasi = false;
  for (const ham of txt.split(/\r?\n/)) {
    const satir = ham.replace(/#.*/, '').trim(); if (!satir) continue;
    const i = satir.indexOf(':'); if (i < 0) continue;
    const k = satir.slice(0, i).trim().toLowerCase(), v = satir.slice(i + 1).trim();
    if (k === 'user-agent') { if (!g || !ajanSonrasi) { g = { ajanlar: [], kurallar: [] }; gruplar.push(g); } g.ajanlar.push(v.toLowerCase()); ajanSonrasi = true; }
    else if (g && (k === 'allow' || k === 'disallow')) { g.kurallar.push({ izin: k === 'allow', yol: v }); ajanSonrasi = false; }
    else ajanSonrasi = false;
  }
  return gruplar;
}
function robotsIzinli(txt, yol, ajan = 'video-mutfagi') {
  const gruplar = robotsAyristir(txt);
  const bizim = gruplar.filter(g => g.ajanlar.some(a => a !== '*' && ajan.includes(a)));
  const kurallar = (bizim.length ? bizim : gruplar.filter(g => g.ajanlar.includes('*'))).flatMap(g => g.kurallar);
  let en = null;
  for (const k of kurallar) {
    if (k.yol === '') { if (!k.izin) continue; }
    const re = new RegExp('^' + k.yol.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (!re.test(yol)) continue;
    if (!en || k.yol.length > en.yol.length || (k.yol.length === en.yol.length && k.izin)) en = k;
  }
  return !en || en.izin;
}
async function robotsKontrol(url, kaynak) {
  const u = new URL(url);
  if (!robotsOnbellek.has(u.host)) {
    const r = await getir(`${u.protocol}//${u.host}/robots.txt`, { kaynak, aralikMs: 1000 }).catch(() => null);
    robotsOnbellek.set(u.host, r && r.durum === 200 ? r.metin : '');
  }
  return robotsIzinli(robotsOnbellek.get(u.host), u.pathname + u.search);
}
// Cloudflare-style content signals ("ai-input=no") declared in robots.txt; returned so callers can respect them.
async function icerikSinyali(url, kaynak) {
  await robotsKontrol(url, kaynak);
  const txt = robotsOnbellek.get(new URL(url).host) || '';
  const m = txt.match(/content-signal:\s*([^\n]+)/i);
  const o = {}; if (m) for (const p of m[1].split(',')) { const [k, v] = p.split('=').map(s => s.trim().toLowerCase()); if (k) o[k] = v; }
  return o;
}

// ---- text helpers
const VARLIK = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
const varlikCoz = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (t, v) => {
  if (v[0] === '#') { const k = v[1] === 'x' || v[1] === 'X' ? parseInt(v.slice(2), 16) : parseInt(v.slice(1), 10); return k > 0 && k < 0x110000 ? String.fromCodePoint(k) : t; }
  return VARLIK[v.toLowerCase()] ?? t;
});
const etiketSil = s => String(s).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
// HTML → plain text; feeds often double-escape, so decode, strip, decode again.
const duzMetin = s => varlikCoz(etiketSil(varlikCoz(etiketSil(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))))).replace(/\s+/g, ' ').trim();

// Minimal RSS/Atom reader: enough for Reddit, Google Trends and similar feeds (no dependency).
function etiket(blok, ad) {
  const m = blok.match(new RegExp(`<${ad}(\\s[^>]*)?>([\\s\\S]*?)<\\/${ad}>`, 'i'));
  return m ? m[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') : '';
}
function oznitelik(blok, ad, oz) {
  const m = blok.match(new RegExp(`<${ad}\\s[^>]*?${oz}="([^"]*)"`, 'i'));
  return m ? varlikCoz(m[1]) : '';
}
function akisOgeleri(xml) {
  const bloklar = [...xml.matchAll(/<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map(m => m[2]);
  return bloklar.map(b => ({
    blok: b,
    baslik: duzMetin(etiket(b, 'title')),
    link: oznitelik(b, 'link', 'href') || varlikCoz(etiket(b, 'link').trim()),
    icerik: etiket(b, 'content') || etiket(b, 'description') || etiket(b, 'summary'),
    zaman: Date.parse(etiket(b, 'published') || etiket(b, 'pubDate') || etiket(b, 'updated')) || null,
    kategori: oznitelik(b, 'category', 'term'),
  }));
}

module.exports = { UA, KaynakHatasi, getir, uyu, robotsIzinli, robotsKontrol, icerikSinyali, varlikCoz, duzMetin, etiket, akisOgeleri };
