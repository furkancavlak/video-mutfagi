// Splits a found story into 3 faithful episodes (model) and checks nothing was invented (second model call).
const fs = require('fs'), path = require('path');
const LLM = require('../konu/llm');

const MIN_KAYNAK = 420, MIN_BOLUM = 140, MAX_BOLUM = 190;
const BURAK = { ses: 'l5wXOpZHEQpKhuIrBiCN', ad: 'Burak' };

const say = m => String(m || '').replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length;

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

const bicimDogru = o => o && Array.isArray(o.bolumler) && o.bolumler.length === 3 &&
  o.bolumler.every(b => b && typeof b.metin === 'string' && say(b.metin) >= MIN_BOLUM && say(b.metin) <= MAX_BOLUM);

async function bol(ctx, hikaye, { calistir } = {}) {
  const kelime = say(hikaye.metin);
  if (kelime < MIN_KAYNAK) return { ok: false, neden: 'kisa', ayrinti: `${kelime} kelime (en az ${MIN_KAYNAK})` };
  const llm = ctx.ayar && ctx.ayar.llm;
  const ortak = { ayar: llm, model: llm && llm.model_metin, efor: llm && llm.efor_metin, json: true, calistir };
  const ornek = ornekOku(ctx);
  const bolun = not => LLM.sor(LLM.istem('hikaye-bol', { dil: hikaye.dil || 'tr', baslik: hikaye.baslik || '', metin: hikaye.metin, ornek, not }), { ...ortak, is: 'hikaye-bol' });
  const denetle = o => LLM.sor(LLM.istem('hikaye-sadakat', { kaynak: hikaye.metin, bolumler: o.bolumler.map((b, i) => `Bölüm ${i + 1}:\n${b.metin}`).join('\n\n') }), { ...ortak, is: 'hikaye-sadakat' });

  let cikti = await bolun('');
  if (!bicimDogru(cikti)) return { ok: false, neden: 'bicim', ayrinti: cikti && Array.isArray(cikti.bolumler) ? cikti.bolumler.map(b => say(b && b.metin)) : 'bolumler yok' };
  let s = await denetle(cikti);
  if (!s.gecti) {
    const liste = Array.isArray(s.eklenenler) ? s.eklenenler : [];
    cikti = await bolun('## Önceki denemenin düzeltilecek hataları\n\nBir önceki bölümlemede kaynakta olmayan şunlar vardı; bunları çıkar, yalnız kaynakta yazanı anlat:\n' + liste.map(x => '- ' + x).join('\n'));
    if (!bicimDogru(cikti)) return { ok: false, neden: 'bicim', ayrinti: cikti && Array.isArray(cikti.bolumler) ? cikti.bolumler.map(b => say(b && b.metin)) : 'bolumler yok' };
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

module.exports = { bol, sesSec };
