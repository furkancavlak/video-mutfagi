// Every story gets its own cast: the people of the story (narrator first) are read from the text by a model call, and the
// channel's figure file invents a look for each (karakter.stil: job -> clothing, age -> hair and glasses, the rest from a
// seeded die), as unlike the recent stories' people as it can, never repeating a clothing colour inside the story.
// Chosen once per series and kept for every episode: dizi.kisiler = [{ kim, ad, rol, cinsiyet, yas, meslek, basortusu,
// ipucu, gorunum }]. The narrator's gender and age come from the voice roster (kimlik.anlaticilar), not from the model.
//   ata(ctx, dizi, diziler, { calistir, sor, stil }) -> dizi.kisiler (filled in place; [] when the channel has no stil)
//   anlatici(dizi) -> the narrator's look | null      haritasi(dizi) -> { kim: look } for everyone but the narrator
//   istemMetni(dizi) -> the scene writer's lines about the cast
const fs = require('fs'), path = require('path');
const LLM = require('../konu/llm');

const SON_DIZI = 20;                // looks of the last 20 stories' people are avoided
const MESLEK = ['ogrenci', 'ofis', 'memur', 'doktor', 'hemsire', 'asker', 'polis', 'ogretmen', 'esnaf', 'isci', 'emekli', 'ev', 'sporcu', 'sanatci', 'diger'];
const YAS = ['genc', 'orta', 'yasli'];

function anlaticiKim(dizi, kimlik) {
  const ses = ((dizi || {}).anlatici || {}).ses;
  return ((kimlik || {}).anlaticilar || []).find(r => ses && r.elevenlabs_voice === ses) || {};
}

// the channel's figure file (kimlik.json → gorsel_dil.karakter.dosya), sandboxed; its stil() invents looks
function kanalStili(ctx) {
  const gd = ((ctx || {}).kimlik || {}).gorsel_dil || {}, kf = path.join((ctx || {}).dir || '', (gd.karakter || {}).dosya || 'karakter.js');
  if (!ctx || !ctx.dir || !fs.existsSync(kf)) return null;
  const K = require('../uretim/cekirdek').guvenliYukle(kf)({});
  return K && typeof K.stil === 'function' ? K.stil : null;
}

// the model's list, cleaned: known fields only, narrator first with the voice's gender and age, unique kim, at most 6
function temizle(liste, an) {
  const out = [], gor = new Set();
  for (const k of Array.isArray(liste) ? liste : []) {
    const kim = String((k && k.kim) || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
    if (!kim || gor.has(kim)) continue;
    gor.add(kim);
    out.push({ kim, ad: String(k.ad || kim).slice(0, 40), rol: String(k.rol || '').slice(0, 80),
      cinsiyet: k.cinsiyet === 'kadin' ? 'kadin' : 'erkek', yas: YAS.includes(k.yas) ? k.yas : 'genc',
      meslek: MESLEK.includes(k.meslek) ? k.meslek : 'diger', basortusu: k.basortusu === true, ipucu: String(k.ipucu || '').slice(0, 120) });
  }
  let a = out.find(k => k.kim === 'anlatici');
  if (!a) { a = { kim: 'anlatici', ad: 'anlatıcı', rol: 'hikâyeyi anlatan', cinsiyet: 'erkek', yas: 'genc', meslek: 'diger', basortusu: false, ipucu: '' }; }
  if (an.cinsiyet) a.cinsiyet = an.cinsiyet;
  if (YAS.includes(an.yas)) a.yas = an.yas;
  if (a.cinsiyet !== 'kadin') a.basortusu = false;
  return [a, ...out.filter(k => k !== a)].slice(0, 6);
}

async function kisileriCikar(ctx, dizi, { calistir, sor = LLM.sor } = {}) {
  const an = anlaticiKim(dizi, ctx.kimlik), llm = ctx.ayar && ctx.ayar.llm;
  const metin = (dizi.bolumler || []).map(b => String(b.metin || '').replace(/\[[^\]]*\]\s*/g, '')).join('\n\n');
  try {
    const r = await sor(LLM.istem('hikaye-kisiler', { baslik: dizi.baslik || '', metin, anlatici_cinsiyet: an.cinsiyet === 'kadin' ? 'kadın' : 'erkek' }),
      { ayar: llm, model: llm && llm.model_metin, efor: 'low', json: true, calistir, is: 'hikaye-kisiler' });
    return temizle(r && r.kisiler, an);
  } catch (e) {
    return temizle([], an);       // no cast list is no reason to stop an episode: the narrator alone still gets a look
  }
}

async function ata(ctx, dizi, diziler = [], { calistir, sor, stil } = {}) {
  stil = stil || kanalStili(ctx);
  if (!stil) return dizi.kisiler || [];
  if (!Array.isArray(dizi.kisiler) || !dizi.kisiler.length) dizi.kisiler = await kisileriCikar(ctx, dizi, { calistir, sor });
  if (dizi.kisiler.every(k => k.gorunum)) return dizi.kisiler;
  const kacin = (diziler || []).filter(d => d && d.id !== dizi.id && Array.isArray(d.kisiler))
    .sort((a, b) => (Date.parse(b.olusturma || '') || 0) - (Date.parse(a.olusturma || '') || 0)).slice(0, SON_DIZI)
    .flatMap(d => d.kisiler.map(k => k.gorunum).filter(Boolean));
  for (const k of dizi.kisiler) {
    if (k.gorunum) continue;
    const ayni = dizi.kisiler.map(x => x.gorunum).filter(Boolean);
    k.gorunum = stil(k, `${dizi.id}|${k.kim}`, kacin, ayni);
  }
  return dizi.kisiler;
}

const anlatici = dizi => ((dizi.kisiler || []).find(k => k.kim === 'anlatici') || {}).gorunum || null;
const haritasi = dizi => Object.fromEntries((dizi.kisiler || []).filter(k => k.kim !== 'anlatici' && k.gorunum).map(k => [k.kim, k.gorunum]));

function istemMetni(kisiler) {
  if (!Array.isArray(kisiler) || !kisiler.length) return '';
  return 'Bu hikâyenin kişileri (görünümleri sabit; kıyafet/saç/ten seçeneği verme, yalnız ifade, poz ve kim):\n' + kisiler.map(k => k.kim === 'anlatici'
    ? `- anlatıcı: ${(k.gorunum || {}).tanim || ''} -> karakter.adam({ ... }) (kim vermeden)`
    : `- ${k.ad}${k.rol ? ` (${k.rol})` : ''}: ${(k.gorunum || {}).tanim || ''} -> karakter.adam({ kim: '${k.kim}', ... })`).join('\n')
    + '\nListede olmayan bir yetişkin gerekirse ona da kendi adıyla kim ver (ör. kim: \'garson\', cinsiyet, yas); kendi görünümünü alır. Çocuklar karakter.cocuk ile çizilir. Karakter kütüphanesinde (aşağıda) aynı kişi varsa onu kütüphaneden kullan, burada üretileni değil.';
}

module.exports = { ata, anlatici, haritasi, istemMetni, temizle, kisileriCikar, kanalStili };
