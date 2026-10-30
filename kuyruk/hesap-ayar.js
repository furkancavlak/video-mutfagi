// Posting hours and daily limit of one Instagram account, in this order:
//   1. ayarlar/kuyruk.json → hesaplar.<hesap>
//   2. the series channel whose kimlik.hesap is this account: konu.json → dizi.saatler, and dizi.onay_gunluk while
//      the approval period is on (a missing onay_donemi counts as on), dizi.gunluk_hedef after it
//   3. the global paylasim_saatleri / gunluk_en_fazla
// A channel without a dizi block (oxygbio) never changes anything. Shared by kuyruk/kuyruk.js and the panel.
const fs = require('fs'), path = require('path');

const HESAP0 = 'oxygbio';
const hesapAd = h => String(h || '').trim().replace(/^@/, '').trim().toLowerCase() || HESAP0;
const okuJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };

// the dizi block of the channel that posts as `hesap` (normalised), or null
function kanalDizi(kok, hesap) {
  let ad = []; try { ad = fs.readdirSync(path.join(kok, 'kanal')).sort(); } catch (e) { return null; }
  for (const k of ad) {
    const kim = okuJ(path.join(kok, 'kanal', k, 'kimlik.json'));
    if (!kim || !String(kim.hesap || '').trim() || hesapAd(kim.hesap) !== hesap) continue;
    const dz = (okuJ(path.join(kok, 'kanal', k, 'konu.json')) || {}).dizi;
    if (dz && typeof dz === 'object' && !Array.isArray(dz)) return dz;
  }
  return null;
}

function hesapAyar(a, hesap, kok) {
  const h = hesapAd(hesap), o = (a.hesaplar || {})[h];
  if (o) return { paylasim_saatleri: o.paylasim_saatleri || a.paylasim_saatleri, gunluk_en_fazla: o.gunluk_en_fazla ?? a.gunluk_en_fazla };
  const dz = kok ? kanalDizi(kok, h) : null;
  if (dz) {
    const sinir = dz.onay_donemi !== false ? dz.onay_gunluk : dz.gunluk_hedef;
    return { paylasim_saatleri: Array.isArray(dz.saatler) && dz.saatler.length ? dz.saatler : a.paylasim_saatleri, gunluk_en_fazla: Number.isInteger(sinir) && sinir > 0 ? sinir : a.gunluk_en_fazla };
  }
  return { paylasim_saatleri: a.paylasim_saatleri, gunluk_en_fazla: a.gunluk_en_fazla };
}

module.exports = { hesapAyar, hesapAd, HESAP0 };
