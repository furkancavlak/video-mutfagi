// A series' cover identity: the colour every episode cover is painted in and the hook-style cover title. Both are
// chosen once, at the series' first produced episode, and kept (the owner may edit the title later in the panel).
// The look itself lives in the channel kit (kimlik.json → marka.kapak, kapak.js); uretim/kapak.js renders it.
//   renkSec(dizi, diziler, renkler) -> '#RRGGBB' | null    palette entry farthest (Lab ΔE) from the last 20 series' colours,
//                                                         among the entries tagged with the series' tone; ties by a seeded die
//   baslikTemiz(s) -> upper-case Turkish title, single spaces     baslikDogru(s, dizi) -> '' | the reason it is not usable
//   baslikSec(secenekler, dizi) -> the shortest usable option | null
//   yedekBaslik(dizi) -> a cleaned short title from baslik_kisa (last resort)
//   hazirla(ctx, dizi, diziler, { calistir, sor }) -> { renk, baslik } | null   fills dizi.renk / dizi.kapak_baslik in place
const LLM = require('../konu/llm');

const SON_DIZI = 20, EN_UZUN = 28, KELIME_MIN = 2, KELIME_MAX = 5;

// ---- colour
const hex = s => { const m = /^#?([0-9a-f]{6})$/i.exec(String(s || '').trim()); return m ? '#' + m[1].toUpperCase() : null; };
function lab(h) {
  const n = parseInt(hex(h).slice(1), 16), lin = c => (c /= 255) <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(lin);
  const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  const x = f((r * .4124 + g * .3576 + b * .1805) / .95047), y = f(r * .2126 + g * .7152 + b * .0722), z = f((r * .0193 + g * .1192 + b * .9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
// FNV-1a over the series id: the same series always breaks a tie the same way
const tohum = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
// palette entries: '#hex' or { renk, ad?, tonlar?: [...] }
const girdi = e => typeof e === 'string' ? { renk: hex(e), tonlar: [] } : { ...e, renk: hex(e && e.renk), tonlar: Array.isArray(e && e.tonlar) ? e.tonlar : [] };

function renkSec(dizi, diziler = [], renkler = []) {
  const P = (renkler || []).map(girdi).filter(e => e.renk);
  if (!P.length) return null;
  const uyan = P.filter(e => e.tonlar.includes(dizi.ton || 'komik'));
  const aday = uyan.length ? uyan : P;
  const son = (diziler || []).filter(d => d && d.id !== dizi.id && hex(d.renk))
    .sort((a, b) => (Date.parse(b.olusturma || '') || 0) - (Date.parse(a.olusturma || '') || 0)).slice(0, SON_DIZI).map(d => hex(d.renk));
  const puan = e => son.length ? Math.min(...son.map(r => deltaE(e.renk, r))) : Infinity;
  const p = aday.map(e => ({ e, p: puan(e) })), en = Math.max(...p.map(x => x.p));
  const esit = p.filter(x => x.p === Infinity ? en === Infinity : en - x.p < .5).map(x => x.e);
  return esit[tohum(dizi.id) % esit.length].renk;
}

// ---- title
const baslikTemiz = s => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/["“”«»*_#]/g, '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr').replace(/[.…!]+$/, '');
const kelimeler = s => baslikTemiz(s).split(' ').filter(Boolean);
const sade = s => baslikTemiz(s).replace(/[^A-ZÇĞİÖŞÜÂÎÛ0-9 ]/g, '').replace(/\s+/g, ' ').trim();

function baslikDogru(s, dizi = {}) {
  const b = baslikTemiz(s), k = kelimeler(b);
  if (!b) return 'boş';
  if (b.length > EN_UZUN) return `${b.length} karakter (en fazla ${EN_UZUN})`;
  if (k.length < KELIME_MIN || k.length > KELIME_MAX) return `${k.length} kelime (${KELIME_MIN}-${KELIME_MAX} olmalı)`;
  // a plain topic name ("3-J VELİ GRUBU", the series' theme) is no hook
  const konu = [dizi.konu, dizi.baslik_kisa].map(sade).filter(Boolean);
  if (konu.includes(sade(b))) return 'dizinin konusu, kanca değil';
  const konuK = new Set(konu.flatMap(x => x.split(' ')));
  if (konuK.size && sade(b).split(' ').every(w => konuK.has(w))) return 'yalnız konunun kelimeleri, kanca değil';
  return '';
}

function baslikSec(secenekler, dizi = {}) {
  const ok = (Array.isArray(secenekler) ? secenekler : []).map(baslikTemiz).filter(b => !baslikDogru(b, dizi));
  if (!ok.length) return null;
  return ok.reduce((a, b) => b.length < a.length ? b : a);
}

// last resort: baslik_kisa (or the source title) upper-cased, cut at a word boundary to 28 characters and 5 words
function yedekBaslik(dizi = {}) {
  const k = kelimeler(String(dizi.baslik_kisa || dizi.baslik || '').replace(/[()[\]{}"“”]/g, ' '));
  const out = [];
  for (const w of k) { if (out.length >= KELIME_MAX || [...out, w].join(' ').length > EN_UZUN) break; out.push(w); }
  return out.join(' ') || (k[0] || '').slice(0, EN_UZUN) || null;
}

async function baslikIste(ctx, dizi, { calistir, sor = LLM.sor } = {}) {
  const llm = (ctx.ayar && ctx.ayar.llm) || {};
  const metin = (dizi.bolumler || []).map(b => String(b.metin || '').replace(/\[[^\]]*\]\s*/g, '')).join('\n\n');
  const r = await sor(LLM.istem('kapak-baslik', { baslik: dizi.baslik_kisa || dizi.baslik || '', konu: dizi.konu || '', ton: dizi.ton || 'komik', metin }),
    { ayar: llm, model: llm.model_metin, efor: 'low', json: true, calistir, is: 'kapak-baslik' });
  return r && Array.isArray(r.kapak_basliklari) ? r.kapak_basliklari : [];
}

// Never throws: a cover is never a reason to stop an episode. The colour needs the kit's palette; the title is asked for
// once (series split before this feature, or whose split gave no usable option), else the cleaned short title.
// The colour is chosen only when the kit has a palette; nothing is written for a channel without marka.kapak.
async function hazirla(ctx, dizi, diziler = [], { calistir, sor, yaz = () => { } } = {}) {
  const kapak = ((((ctx || {}).kimlik || {}).marka) || {}).kapak;
  if (!kapak) return null;
  try {
    if (!hex(dizi.renk)) { const r = renkSec(dizi, diziler, kapak.renkler); if (r) dizi.renk = r; }
    // a title already there (the split's pick, or the owner's edit in the panel) is kept as it is
    if (!baslikTemiz(dizi.kapak_baslik)) {
      let b = null;
      try { b = baslikSec(await baslikIste(ctx, dizi, { calistir, sor }), dizi); }
      catch (e) { yaz(`${dizi.id}: kapak başlığı istenemedi (${e.message}); kısa başlık kullanılıyor`); }
      dizi.kapak_baslik = b || yedekBaslik(dizi);
    } else dizi.kapak_baslik = baslikTemiz(dizi.kapak_baslik);
  } catch (e) { yaz(`${dizi.id}: kapak kimliği hazırlanamadı: ${e.message}`); }
  return hex(dizi.renk) && dizi.kapak_baslik ? { renk: hex(dizi.renk), baslik: dizi.kapak_baslik } : null;
}

module.exports = { renkSec, deltaE, baslikTemiz, baslikDogru, baslikSec, yedekBaslik, baslikIste, hazirla, EN_UZUN };
