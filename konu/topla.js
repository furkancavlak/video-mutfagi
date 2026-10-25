// Runs every enabled collector for a channel and stores one raw snapshot:
// kayit/konu/<kanal>/ham/<YYYYMMDD-HHMM>.json  [{id, kaynak, baslik, ozet, url, metrikler, etkilesim, zaman, dil, llm_izni}]
// A failing or blocking source never stops the others; it is reported in Turkish and skipped.
const fs = require('fs'), path = require('path');
const O = require('./ortak');

const KAYNAKLAR = {
  eksi: () => require('./kaynaklar/eksi'),
  reddit: () => require('./kaynaklar/reddit'),
  vikipedi: () => require('./kaynaklar/vikipedi'),
  gtrends: () => require('./kaynaklar/gtrends'),
  x: () => require('./kaynaklar/x'),
};
const AD = { eksi: 'Ekşi Sözlük', reddit: 'Reddit', vikipedi: 'Vikipedi', gtrends: 'Google Trends', x: 'X' };

async function topla(ctx, { yaz = console.log } = {}) {
  const ayar = ctx.ayar.kaynaklar || {};
  const hepsi = [], rapor = [];
  for (const [ad, yukle] of Object.entries(KAYNAKLAR)) {
    const a = ayar[ad];
    if (!a || !a.aktif) { rapor.push({ kaynak: ad, durum: 'kapalı' }); continue; }
    const t0 = Date.now();
    try {
      const { ogeler, notlar } = await yukle().topla(a);
      for (const o of ogeler) o.id = `${ad}:${O.kisaHash(o.url || o.baslik)}`;
      hepsi.push(...ogeler);
      rapor.push({ kaynak: ad, durum: 'tamam', adet: ogeler.length, sure: Date.now() - t0, notlar });
      yaz(`  ✓ ${AD[ad].padEnd(14)} ${String(ogeler.length).padStart(3)} konu  (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);
      for (const n of notlar) yaz(`      not: ${n}`);
    } catch (e) {
      rapor.push({ kaynak: ad, durum: e.engel ? 'engellendi' : 'hata', mesaj: e.message });
      yaz(`  ✗ ${AD[ad].padEnd(14)} ${e.message}`);
    }
  }
  // same link from two pages (e.g. Ekşi gündem + kanal/bilim): keep the first
  const tekil = [...new Map(hepsi.map(o => [o.id, o])).values()];
  const f = path.join(ctx.kayit, 'ham', O.damga() + '.json');
  O.yazJson(f, { zaman: O.simdi().toISOString(), rapor, ogeler: tekil });
  return { dosya: f, ogeler: tekil, rapor };
}

// Raw items of the last `saat` hours, newest snapshot first, de-duplicated by id.
function sonHamlar(ctx, saat = 48) {
  const dir = path.join(ctx.kayit, 'ham');
  if (!fs.existsSync(dir)) return [];
  const sinir = Date.now() - saat * 3600e3, m = new Map();
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse()) {
    if (fs.statSync(path.join(dir, f)).mtimeMs < sinir) continue;
    for (const o of O.okuJson(path.join(dir, f)).ogeler) if (!m.has(o.id)) m.set(o.id, o);
  }
  return [...m.values()];
}

module.exports = { topla, sonHamlar, KAYNAKLAR, AD };
