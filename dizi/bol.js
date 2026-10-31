// Splits a found story into 2-5 faithful episodes (model) and checks nothing was invented (second model call).
// The story's own turns set the cuts and the episode count; length is guidance (~1 min), never a rejection. Rejected:
// a source too short to split at all (kisa), no story at all (hikaye_degil, own first call), a broken shape after one retry (bicim),
// invention after one retry (sadakat), a non-komik story that still reads mocking or identifying after one retry
// (hassasiyet). The split labels the tone (dizi/ton.js): komik | hüzünlü | ürkütücü | ciddi.
const fs = require('fs'), path = require('path');
const LLM = require('../konu/llm');
const { cumleler } = require('./uret-bolum');
const TON = require('./ton');
const KAPAK = require('./kapak');

const MIN_KAYNAK = 250, MIN_SAYI = 2, MAX_SAYI = 5;
const OZET_KELIME = 25, OZET_CUMLE = 2;              // hard limit for the recap; the prompt asks for 1 sentence, 15 words
const BOLUM_KELIME = 140;                            // ~1 minute of narration: only used to suggest an episode count
const BURAK = { ses: 'l5wXOpZHEQpKhuIrBiCN', ad: 'Burak' };
// episode 1 must open on the story's situation (Furkan 31.10, the 3-J lesson): an eventless intro sends the split back
const OLAYSIZ = /(hikâyem|hikayem|anım|anim) var|anlatacağım|anlatacagim|nereden başla|nereden basla|yıllar önceydi|yillar onceydi|tahmin edemezsiniz|hayatımın (hatası|en)/;

const temiz = m => String(m || '').replace(/\[[^\]]*\]/g, ' ').replace(/[ \t]+/g, ' ').trim();
const say = m => temiz(m).split(/\s+/).filter(Boolean).length;
// the recap is the first paragraph of episodes 2+
const paragraflar = m => String(m || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
const oneri = kelime => Math.max(MIN_SAYI, Math.min(MAX_SAYI, Math.round(kelime * .75 / BOLUM_KELIME)));

// narrator by gender and age; among those, one whose kit entry lists this tone (roster `ton: [...]`) comes first
function sesSec(anlatici, roster, ton) {
  const a = anlatici || {};
  const uyan = (roster || []).filter(x => x.cinsiyet && x.yas && x.cinsiyet === a.cinsiyet && x.yas === a.yas);
  const r = (ton && uyan.find(x => Array.isArray(x.ton) && x.ton.includes(ton))) || uyan.find(x => !Array.isArray(x.ton) || !ton || x.ton.includes(ton)) || uyan[0];
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
  const B = o.bolumler, h = [], ton = o.ton && o.ton.deger;
  if (!TON.tonDogru(ton)) h.push(`ton.deger ${JSON.stringify(ton || null)}: komik, hüzünlü, ürkütücü ya da ciddi olmalı`);
  // a sad, eerie or serious story never gets a playful audio tag
  if (TON.ciddiMi(ton)) B.forEach((b, i) => { const e = TON.sakaEtiketleri(b && b.metin); if (e.length) h.push(`Bölüm ${i + 1}: ${ton} bir hikâyede şakacı ses etiketi olmaz: ${[...new Set(e)].join(' ')}`); });
  if (B.length < MIN_SAYI || B.length > MAX_SAYI) h.push(`${B.length} bölüm var; ${MIN_SAYI}-${MAX_SAYI} bölüm olmalı`);
  B.forEach((b, i) => {
    const n = i + 1, m = b && typeof b.metin === 'string' ? b.metin.trim() : '';
    if (!m) { h.push(`Bölüm ${n} boş`); return; }
    const acilis = /^önceki bölüm/.test(temiz(m).toLocaleLowerCase('tr'));
    if (n === 1) {
      if (acilis) h.push('Bölüm 1 "Önceki bölümde…" ile açılmaz');
      else if (OLAYSIZ.test(temiz(cumleler(temiz(m))[0]).toLocaleLowerCase('tr'))) h.push('Bölüm 1 olaysız bir girişle açılıyor; ilk cümle kim + başına gelen durum olmalı (açılış formülü)');
      return;
    }
    if (!acilis) { h.push(`Bölüm ${n} "Önceki bölümde…" cümlesiyle açılmıyor`); return; }
    const p = paragraflar(m);
    if (p.length < 2) { h.push(`Bölüm ${n}: "Önceki bölümde…" özeti ayrı bir paragraf değil (özetten sonra boş satır bırak)`); return; }
    const c = cumleler(temiz(p[0])).length, k = say(p[0]);
    if (c > OZET_CUMLE || k > OZET_KELIME) h.push(`Bölüm ${n}: özet ${c} cümle, ${k} kelime; tek cümle ve en fazla 15 kelime olmalı`);
  });
  return h;
}

// is it a real-life anecdote with events, a turn and an outcome? -> {hikaye, neden, ozet}. Also used by the story pool.
async function hikayeMi(ctx, hikaye, { calistir } = {}) {
  const llm = ctx.ayar && ctx.ayar.llm;
  const r = await LLM.sor(LLM.istem('hikaye-mi', { baslik: hikaye.baslik || '', metin: hikaye.metin }), { ayar: llm, model: llm && llm.model_metin, efor: 'low', json: true, calistir, is: 'hikaye-mi' });
  return { hikaye: !!(r && r.hikaye === true), neden: String((r && r.neden) || '').slice(0, 200), ozet: String((r && r.ozet) || '').trim().slice(0, 600) };
}

async function bol(ctx, hikaye, { calistir } = {}) {
  const kelime = say(hikaye.metin);
  if (kelime < MIN_KAYNAK) return { ok: false, neden: 'kisa', ayrinti: `${kelime} kelime (bölünmek için en az ${MIN_KAYNAK})` };
  const llm = ctx.ayar && ctx.ayar.llm;
  const ortak = { ayar: llm, model: llm && llm.model_metin, efor: llm && llm.efor_metin, json: true, calistir };
  const ornek = ornekOku(ctx);
  const bolun = not => LLM.sor(LLM.istem('hikaye-bol', { dil: hikaye.dil || 'tr', baslik: hikaye.baslik || '', metin: hikaye.metin, kelime: String(kelime), oneri: String(oneri(kelime)), ornek, not }), { ...ortak, is: 'hikaye-bol' });
  // the sensitivity check of a non-komik story: mocking wording, victim-blaming, gratuitous detail, identifying details
  const hassas = o => LLM.sor(LLM.istem('hikaye-hassasiyet', { ton: o.ton.deger, kaynak: hikaye.metin, bolumler: o.bolumler.map((b, i) => `Bölüm ${i + 1}:\n${b.metin}`).join('\n\n'), isimler: JSON.stringify(o.degisen_isimler || {}) }), { ...ortak, is: 'hikaye-hassasiyet' });
  const denetle = o => LLM.sor(LLM.istem('hikaye-sadakat', { kaynak: hikaye.metin, bolumler: o.bolumler.map((b, i) => `Bölüm ${i + 1}:\n${b.metin}`).join('\n\n') }), { ...ortak, is: 'hikaye-sadakat' });
  const bicimNotu = h => '## Önceki denemenin biçim hataları (düzelt)\n\n' + h.map(x => '- ' + x).join('\n');
  const red = (cikti, h) => ({ ok: false, neden: 'bicim', ayrinti: { hatalar: h, kelimeler: cikti && Array.isArray(cikti.bolumler) ? cikti.bolumler.map(b => say(b && b.metin)) : [] } });
  // a split with shape problems is asked for once more, with them listed
  const duzelt = async (not, c) => {
    let h = bicimHatalari(c);
    if (h.length) { c = await bolun([not, bicimNotu(h)].filter(Boolean).join('\n\n')); h = bicimHatalari(c); }
    return { c, h };
  };

  // an essay, review or opinion piece is no story (debe 30.10: a Tolkien essay): decided before any split
  const k = await hikayeMi(ctx, hikaye, { calistir });
  if (!k.hikaye) return { ok: false, neden: 'hikaye_degil', ayrinti: k.neden };
  let cikti = await bolun(''), h;
  ({ c: cikti, h } = await duzelt('', cikti));
  if (h.length) return red(cikti, h);
  let s = await denetle(cikti);
  if (!s.gecti) {
    const liste = Array.isArray(s.eklenenler) ? s.eklenenler : [];
    const not = '## Önceki denemenin düzeltilecek hataları\n\nBir önceki bölümlemede kaynakta olmayan şunlar vardı; bunları çıkar, yalnız kaynakta yazanı anlat:\n' + liste.map(x => '- ' + x).join('\n');
    ({ c: cikti, h } = await duzelt(not, await bolun(not)));
    if (h.length) return red(cikti, h);
    s = await denetle(cikti);
    if (!s.gecti) return { ok: false, neden: 'sadakat', ayrinti: Array.isArray(s.eklenenler) ? s.eklenenler : [] };
  }
  // a flagged non-komik story is rewritten once (and checked for fidelity again); a second flag stops for Furkan
  if (TON.ciddiMi(cikti.ton.deger)) {
    let hs = await hassas(cikti);
    if (!hs.gecti) {
      const sorunlar = Array.isArray(hs.sorunlar) ? hs.sorunlar : [];
      const not = `## Önceki denemenin hassasiyet sorunları (bu bir ${cikti.ton.deger} hikâye: saygıyla anlat)\n\n` + sorunlar.map(x => '- ' + x).join('\n') + '\n\nKaynakta olmayan hiçbir şey ekleme; isimleri değiştir, kişiyi ya da kurumu tanıtacak ayrıntıyı çıkar.';
      ({ c: cikti, h } = await duzelt(not, await bolun(not)));
      if (h.length) return red(cikti, h);
      s = await denetle(cikti);
      if (!s.gecti) return { ok: false, neden: 'sadakat', ayrinti: Array.isArray(s.eklenenler) ? s.eklenenler : [] };
      if (TON.ciddiMi(cikti.ton.deger)) {
        hs = await hassas(cikti);
        if (!hs.gecti) return { ok: false, neden: 'hassasiyet', ayrinti: Array.isArray(hs.sorunlar) ? hs.sorunlar : [] };
      }
    }
  }
  const ton = cikti.ton.deger;
  // the cover's hook title: the shortest usable one of the model's 3 options; none usable -> asked again at the first
  // produced episode (dizi/kapak.js hazirla). Never a reason to reject the split.
  const kapakBaslik = KAPAK.baslikSec(cikti.kapak_basliklari, { baslik_kisa: cikti.baslik_kisa, konu: hikaye.konu });
  const dizi = {
    id: hikaye.id, kanal: ctx.kanal, baslik: hikaye.baslik, baslik_kisa: cikti.baslik_kisa,
    ...(kapakBaslik ? { kapak_baslik: kapakBaslik } : {}),
    kaynak: { tur: hikaye.tur, url: hikaye.url, puan: hikaye.puan, id: hikaye.id },
    durum: 'aktif', olusturma: new Date().toISOString(),
    ton, ton_neden: String(cikti.ton.neden || '').slice(0, 300),
    ...(TON.ciddiMi(ton) ? { hassasiyet_notu: String(cikti.hassasiyet || '').slice(0, 600) } : {}),
    anlatici: sesSec(cikti.anlatici, ctx.kimlik && ctx.kimlik.anlaticilar, ton),
    degisen_isimler: cikti.degisen_isimler || {},
    bolumler: cikti.bolumler.map((b, i) => ({ n: i + 1, metin: b.metin.trim(), durum: 'metin' })),
  };
  return { ok: true, dizi };
}

module.exports = { bol, hikayeMi, oneri, sesSec, bicimHatalari, MIN_KAYNAK, MAX_SAYI };
