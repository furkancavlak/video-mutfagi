// Splits a found story into 2-5 faithful episodes (model) and checks nothing was invented (second model call).
// The story's own turns set the cuts and the episode count; length is guidance (~1 min), never a rejection. Rejected:
// a source too short to split at all (kisa), a broken shape after one retry (bicim), invention after one retry (sadakat).
const fs = require('fs'), path = require('path');
const LLM = require('../konu/llm');
const { cumleler } = require('./uret-bolum');

const MIN_KAYNAK = 250, MIN_SAYI = 2, MAX_SAYI = 5;
const OZET_KELIME = 25, OZET_CUMLE = 2;              // hard limit for the recap; the prompt asks for 1 sentence, 15 words
const BOLUM_KELIME = 140;                            // ~1 minute of narration: only used to suggest an episode count
const BURAK = { ses: 'l5wXOpZHEQpKhuIrBiCN', ad: 'Burak' };

const temiz = m => String(m || '').replace(/\[[^\]]*\]/g, ' ').replace(/[ \t]+/g, ' ').trim();
const say = m => temiz(m).split(/\s+/).filter(Boolean).length;
// the recap is the first paragraph of episodes 2+
const paragraflar = m => String(m || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
const oneri = kelime => Math.max(MIN_SAYI, Math.min(MAX_SAYI, Math.round(kelime * .75 / BOLUM_KELIME)));

function sesSec(anlatici, roster) {
  const a = anlatici || {};
  const r = (roster || []).find(x => x.cinsiyet && x.yas && x.cinsiyet === a.cinsiyet && x.yas === a.yas);
  return r ? { ses: r.elevenlabs_voice, ad: r.ad } : { ...BURAK };
}

function ornekOku(ctx) {
  try {
    if (ctx.kimlik && ctx.kimlik.ornek_bolum) {
      const f = path.join(ctx.dir || '', ctx.kimlik.ornek_bolum);
      if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
    }
  } catch (e) { }
  return '(örnek yok: kurallara uy)';
}

// shape problems in Turkish (they go back to the model on the retry), [] when the split is usable
function bicimHatalari(o) {
  if (!o || !Array.isArray(o.bolumler)) return ['bolumler listesi yok'];
  const B = o.bolumler, h = [];
  if (B.length < MIN_SAYI || B.length > MAX_SAYI) h.push(`${B.length} bölüm var; ${MIN_SAYI}-${MAX_SAYI} bölüm olmalı`);
  B.forEach((b, i) => {
    const n = i + 1, m = b && typeof b.metin === 'string' ? b.metin.trim() : '';
    if (!m) { h.push(`Bölüm ${n} boş`); return; }
    const acilis = /^önceki bölüm/.test(temiz(m).toLocaleLowerCase('tr'));
    if (n === 1) { if (acilis) h.push('Bölüm 1 "Önceki bölümde…" ile açılmaz'); return; }
    if (!acilis) { h.push(`Bölüm ${n} "Önceki bölümde…" cümlesiyle açılmıyor`); return; }
    const p = paragraflar(m);
    if (p.length < 2) { h.push(`Bölüm ${n}: "Önceki bölümde…" özeti ayrı bir paragraf değil (özetten sonra boş satır bırak)`); return; }
    const c = cumleler(temiz(p[0])).length, k = say(p[0]);
    if (c > OZET_CUMLE || k > OZET_KELIME) h.push(`Bölüm ${n}: özet ${c} cümle, ${k} kelime; tek cümle ve en fazla 15 kelime olmalı`);
  });
  return h;
}

async function bol(ctx, hikaye, { calistir } = {}) {
  const kelime = say(hikaye.metin);
  if (kelime < MIN_KAYNAK) return { ok: false, neden: 'kisa', ayrinti: `${kelime} kelime (bölünmek için en az ${MIN_KAYNAK})` };
  const llm = ctx.ayar && ctx.ayar.llm;
  const ortak = { ayar: llm, model: llm && llm.model_metin, efor: llm && llm.efor_metin, json: true, calistir };
  const ornek = ornekOku(ctx);
  const bolun = not => LLM.sor(LLM.istem('hikaye-bol', { dil: hikaye.dil || 'tr', baslik: hikaye.baslik || '', metin: hikaye.metin, kelime: String(kelime), oneri: String(oneri(kelime)), ornek, not }), { ...ortak, is: 'hikaye-bol' });
  const denetle = o => LLM.sor(LLM.istem('hikaye-sadakat', { kaynak: hikaye.metin, bolumler: o.bolumler.map((b, i) => `Bölüm ${i + 1}:\n${b.metin}`).join('\n\n') }), { ...ortak, is: 'hikaye-sadakat' });
  const bicimNotu = h => '## Önceki denemenin biçim hataları (düzelt)\n\n' + h.map(x => '- ' + x).join('\n');
  const red = (cikti, h) => ({ ok: false, neden: 'bicim', ayrinti: { hatalar: h, kelimeler: cikti && Array.isArray(cikti.bolumler) ? cikti.bolumler.map(b => say(b && b.metin)) : [] } });
  // one split, retried once with its own shape problems
  const bolVeDuzelt = async not => {
    let c = await bolun(not), h = bicimHatalari(c);
    if (h.length) { c = await bolun([not, bicimNotu(h)].filter(Boolean).join('\n\n')); h = bicimHatalari(c); }
    return { c, h };
  };

  let { c: cikti, h } = await bolVeDuzelt('');
  if (h.length) return red(cikti, h);
  let s = await denetle(cikti);
  if (!s.gecti) {
    const liste = Array.isArray(s.eklenenler) ? s.eklenenler : [];
    ({ c: cikti, h } = await bolVeDuzelt('## Önceki denemenin düzeltilecek hataları\n\nBir önceki bölümlemede kaynakta olmayan şunlar vardı; bunları çıkar, yalnız kaynakta yazanı anlat:\n' + liste.map(x => '- ' + x).join('\n')));
    if (h.length) return red(cikti, h);
    s = await denetle(cikti);
    if (!s.gecti) return { ok: false, neden: 'sadakat', ayrinti: Array.isArray(s.eklenenler) ? s.eklenenler : [] };
  }
  const dizi = {
    id: hikaye.id, kanal: ctx.kanal, baslik: hikaye.baslik, baslik_kisa: cikti.baslik_kisa,
    kaynak: { tur: hikaye.tur, url: hikaye.url, puan: hikaye.puan, id: hikaye.id },
    durum: 'aktif', olusturma: new Date().toISOString(),
    anlatici: sesSec(cikti.anlatici, ctx.kimlik && ctx.kimlik.anlaticilar),
    degisen_isimler: cikti.degisen_isimler || {},
    bolumler: cikti.bolumler.map((b, i) => ({ n: i + 1, metin: b.metin.trim(), durum: 'metin' })),
  };
  return { ok: true, dizi };
}

module.exports = { bol, sesSec, bicimHatalari, MIN_KAYNAK, MAX_SAYI };
