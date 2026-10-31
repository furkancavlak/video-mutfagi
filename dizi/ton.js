// Story tone (Furkan 31.10: "kötü olayları da anlatmak lazım... ses tonu kötü hissetmeli, dalga geçmemeli").
// A series carries `ton`: komik | hüzünlü | ürkütücü | ciddi. Anything but komik is told with respect: no playful
// eleven_v3 audio tags, no comic sound, no #komik or 👀 in the caption, calm voice settings, muted scenes.
//   TONLAR, ciddiMi(ton), tonDogru(ton)
//   sakaEtiketleri(metin) -> the playful audio tags in a text ([sarcastic], [laughs], [proudly]...)
//   sakaEtiketleriniSil(metin) -> the text without them (a series written before the tone label)
//   etiketler(ton, konu) -> the caption's hashtags
const TONLAR = ['komik', 'hüzünlü', 'ürkütücü', 'ciddi'];
const tonDogru = t => TONLAR.includes(t);
const ciddiMi = t => tonDogru(t) && t !== 'komik';

const SAKA = /\[[^\]]*\b(sarcastic|sarcastically|mischievous|mischievously|laugh|laughs|laughing|giggle|giggles|giggling|chuckle|chuckles|chuckling|proud|proudly|excited|excitedly|playful|playfully|teasing|teasingly|cheerful|cheerfully|snicker|snickers|smirk|smirks|smug|smugly|amused|joking|jokingly)\b[^\]]*\]/gi;
const sakaEtiketleri = m => String(m || '').match(SAKA) || [];
const sakaEtiketleriniSil = m => String(m || '').replace(SAKA, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,!?…])/g, '$1').replace(/^[ \t]+|[ \t]+$/gm, '');

// a neutral topic tag per theme (konu.json → dizi.kaynak.konular names); unknown themes get none
const KONU_ETIKET = { 'aşk': '#aşk', 'ayrılık': '#ayrılık', 'ihanet': '#ihanet', 'aile': '#aile', 'dedikodu ve komşular': '#komşuluk', 'askerlik': '#askerlik', 'iş hayatı': '#işhayatı', 'okul ve yurt': '#okul', 'utanç ve rezillik': '#anı', 'tesadüf ve ilginç olaylar': '#tesadüf' };
function etiketler(ton, konu) {
  if (!ciddiMi(ton)) return '#hikaye #yaşanmışhikaye #anı #komik';
  const k = KONU_ETIKET[String(konu || '').toLocaleLowerCase('tr')];
  return ['#yaşanmışhikaye', '#hikaye', '#anı', k].filter((x, i, a) => x && a.indexOf(x) === i).join(' ');
}

module.exports = { TONLAR, tonDogru, ciddiMi, sakaEtiketleri, sakaEtiketleriniSil, etiketler, KONU_ETIKET };
