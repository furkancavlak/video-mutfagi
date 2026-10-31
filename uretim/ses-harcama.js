// What a voice step really cost on ElevenLabs. The script length over-counts (eleven_v3 charged ~0.4x of it on
// 30.10.2026), so ses.js records the real charge in ses/harcama.json and uret.js logs that to the budget ledger.
//   basliktanKarakter(headers)            -> characters charged for one request (response header), or null
//   hesapla({ basliklar, once, sonra, tahmin }) -> { karakter, kaynak: 'baslik'|'abonelik'|'tahmin', tahmini? }
//     basliklar  per-request header counts (null where missing); used when every request had one
//     once/sonra subscription character_count before and after the step
//   oku(dir, tahmin) -> the same shape from ses/harcama.json; the estimate (tahmini: true) when it is missing or broken
const fs = require('fs'), path = require('path');

function basliktanKarakter(h) {
  const al = k => (h && typeof h.get === 'function' ? h.get(k) : h && h[k]);
  for (const k of ['character-cost', 'x-character-count']) {
    const v = al(k);
    if (v != null && v !== '' && Number.isFinite(+v) && +v >= 0) return Math.round(+v);
  }
  return null;
}

function hesapla({ basliklar = [], once, sonra, tahmin = 0 } = {}) {
  if (basliklar.length && basliklar.every(x => Number.isFinite(x))) return { karakter: basliklar.reduce((a, x) => a + x, 0), kaynak: 'baslik' };
  if (Number.isFinite(once) && Number.isFinite(sonra) && sonra >= once && sonra - once <= Math.max(tahmin * 3, 100)) return { karakter: sonra - once, kaynak: 'abonelik' };
  return { karakter: tahmin, kaynak: 'tahmin', tahmini: true };
}

const dosya = dir => path.join(dir, 'ses', 'harcama.json');
function oku(dir, tahmin) {
  try {
    const j = JSON.parse(fs.readFileSync(dosya(dir), 'utf8'));
    if (Number.isFinite(j.karakter) && j.karakter >= 0 && ['baslik', 'abonelik', 'tahmin'].includes(j.kaynak)) return { karakter: j.karakter, kaynak: j.kaynak, ...(j.kaynak === 'tahmin' ? { tahmini: true } : {}) };
  } catch (e) { }
  return { karakter: tahmin, kaynak: 'tahmin', tahmini: true };
}

module.exports = { basliktanKarakter, hesapla, oku, dosya };
