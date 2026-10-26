#!/usr/bin/env node
// One production run started from the panel, with an approval that covers only the paid step whose price the
// user has just seen, and only up to that price. Everything else is `node konu/radar.js uret`: the run continues
// where it stopped and halts again at the next paid step (its price lands in uretim.json → bekleyen).
//
//   node panel/uret-adim.js <kanal> <fikir-id> [--ses <karakter> | --kredi <gorsel|klip> <kredi>] [--kok <repo>]
//
// Without --ses/--kredi nothing is spent (same as `radar.js uret` without --onay).
const path = require('path');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const KOK = arg('--kok') ? path.resolve(arg('--kok')) : path.join(__dirname, '..');
const O = require(path.join(KOK, 'konu', 'ortak.js'));
const [kanal, fikirId] = process.argv.slice(2);

(async () => {
  const onay = {};
  if (arg('--ses') !== null) onay.ses = +arg('--ses');
  if (arg('--kredi') !== null) { const i = process.argv.indexOf('--kredi'); onay[process.argv[i + 1]] = +process.argv[i + 2]; }
  for (const [adim, n] of Object.entries(onay)) if (!['ses', 'gorsel', 'klip'].includes(adim) || !Number.isFinite(n) || n < 0) O.hata('onay anlaşılmadı: ' + adim);
  if (!/^f-[\w-]+$/.test(fikirId || '')) O.hata('fikir kimliğini ver.');
  const ctx = O.kanalYukle(kanal);
  const birak = O.kilitAl(ctx, 'uret ' + fikirId);
  try { await require(path.join(KOK, 'konu', 'uret.js')).uret(ctx, fikirId, { onay, otomatik: false, onayGerekli: true, yaz: (...a) => console.log(...a) }); } finally { birak(); }
})().catch(e => { console.error('HATA: ' + e.message); process.exit(1); });
