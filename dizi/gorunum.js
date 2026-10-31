// Each story's narrator gets a look of its own (clothes, hair, skin, colours) so two stories never share a figure.
// Catalogue: kit kimlik.json → gorsel_dil.karakter.gorunumler: [{ id, cinsiyet?, yas?, tanim?, ...drawing options }].
// The narrator's gender and age come from the voice roster (kimlik.anlaticilar, matched by the series' voice id); among
// the looks that fit, the one used longest ago by another series wins (never used = first), ties in catalogue order.
//   sec(dizi, diziler, kimlik) -> look id | null      bul(kimlik, id) -> look object | null
//   ata(dizi, diziler, kimlik) -> the series' look id, assigned once and kept for every episode
const katalog = kimlik => ((((kimlik || {}).gorsel_dil || {}).karakter || {}).gorunumler || []).filter(g => g && g.id);

function anlaticiKim(dizi, kimlik) {
  const ses = ((dizi || {}).anlatici || {}).ses;
  return ((kimlik || {}).anlaticilar || []).find(r => ses && r.elevenlabs_voice === ses) || {};
}

function sec(dizi, diziler, kimlik) {
  const G = katalog(kimlik);
  if (!G.length) return null;
  const { cinsiyet, yas } = anlaticiKim(dizi, kimlik);
  let aday = G.filter(g => !cinsiyet || !g.cinsiyet || g.cinsiyet === cinsiyet);
  if (!aday.length) aday = G;
  const yasUyan = aday.filter(g => !yas || !g.yas || g.yas === yas);
  if (yasUyan.length) aday = yasUyan;
  const son = {};
  for (const d of diziler || []) {
    if (!d || d === dizi || d.id === (dizi || {}).id || !d.gorunum) continue;
    const t = Date.parse(d.olusturma || '') || 0;
    son[d.gorunum] = Math.max(son[d.gorunum] ?? -1, t);
  }
  let en = aday[0];
  for (const g of aday) if ((son[g.id] ?? -Infinity) < (son[en.id] ?? -Infinity)) en = g;
  return en.id;
}

const bul = (kimlik, id) => katalog(kimlik).find(g => g.id === id) || null;

function ata(dizi, diziler, kimlik) {
  if (dizi.gorunum && bul(kimlik, dizi.gorunum)) return dizi.gorunum;
  const id = sec(dizi, diziler, kimlik);
  if (id) dizi.gorunum = id;
  return id;
}

module.exports = { sec, bul, ata, katalog };
