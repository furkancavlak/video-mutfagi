// One due episode of a series -> a finished, queued video through konu/uret.js (ready-script path, `hazir`).
//   uretBolum(ctx, dizi, n, { onayGerekli, calistir, kok, uret, yaz }) -> {durum, dir, mp4?, neden?}
// durum is the episode's new state: onay-bekliyor | sirada | butce-bekliyor | kontrol_et (calistir.js writes it back;
// butce-bekliyor becomes uretimde there). The episode object is updated in place: durum, video (= the queue job's
// `video`, so calistir.js can match the two), karar_neden on a human stop. A budget stop leaves video unset so the
// episode stays due and the next run resumes the same folder.
const path = require('path');
const O = require('../konu/ortak');

const ETIKETLER = '#hikaye #yaşanmışhikaye #anı #komik';
const temiz = s => String(s || '').replace(/\[[^\]]*\]\s*/g, '').replace(/\s+/g, ' ').trim();   // eleven_v3 audio tags out
// sentences end at a single "." or at "!"/"?"; an ellipsis ("Bir sabah... tanımadığım") is a pause, not an end
function cumleler(s) {
  s = String(s); const out = [], re = /(?:(?<![.…])\.(?![.…])|[!?]+)["'”’)]*(?=\s|$)/g;
  let son = 0, m;
  while ((m = re.exec(s))) { out.push(s.slice(son, m.index + m[0].length).trim()); son = m.index + m[0].length; }
  if (s.slice(son).trim()) out.push(s.slice(son).trim());
  return out.length ? out : [s];
}

// 2-4 narration lines at paragraph breaks: one paragraph splits at the sentence nearest its middle, more than four
// merge the shortest neighbouring pair until four are left. Text and order are kept.
function satirlaraBol(metin) {
  let p = String(metin).split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  if (p.length < 2) p = String(metin).split(/\n/).map(x => x.trim()).filter(Boolean);
  if (p.length === 1) {
    const c = cumleler(p[0]).map(x => x.trim()).filter(Boolean);
    if (c.length > 1) {
      const yarim = p[0].length / 2;
      let en = 1, fark = Infinity, top = 0;
      for (let i = 1; i < c.length; i++) { top += c[i - 1].length + 1; if (Math.abs(top - yarim) < fark) { fark = Math.abs(top - yarim); en = i; } }
      p = [c.slice(0, en).join(' '), c.slice(en).join(' ')];
    }
  }
  while (p.length > 4) {
    let i0 = 0;
    for (let i = 1; i < p.length - 1; i++) if (p[i].length + p[i + 1].length < p[i0].length + p[i0 + 1].length) i0 = i;
    p.splice(i0, 2, p[i0] + ' ' + p[i0 + 1]);
  }
  return p;
}

// a series has its own episode count (2-5): only its last episode says Final
function aciklamaYaz(metin, n, toplam = 3) {
  const ilk = temiz(cumleler(temiz(metin))[0]);
  return `${ilk} 👀\nBölüm ${n} · ${n < toplam ? 'Devamı yarın.' : 'Final.'}\n${ETIKETLER}`;
}

function hazirYap(dizi, n) {
  const b = (dizi.bolumler || []).find(x => x.n === n);
  if (!b) throw new Error(`bölüm ${n} yok`);
  return {
    ad: `${dizi.id}-b${n}`, baslik: `${dizi.baslik_kisa || dizi.baslik} · Bölüm ${n}`,
    satirlar: satirlaraBol(b.metin).map(metin => ({ rol: 'anlatici', metin })),
    anlaticilar: { anlatici: dizi.anlatici.ses },
    video_ek: { bolum: n, toplam_bolum: dizi.bolumler.length, etiket: `${String(dizi.baslik_kisa || dizi.baslik).toLocaleUpperCase('tr')} · BÖLÜM ${n}` },
    aciklama_instagram: aciklamaYaz(b.metin, n, dizi.bolumler.length),
  };
}

// the queue job's `video` (uret.js writes it relative to kok)
const videoAdi = (kok, dir) => path.isAbsolute(dir) ? path.relative(kok, dir).split(path.sep).join('/') : String(dir).split(path.sep).join('/');

async function uretBolum(ctx, dizi, n, { onayGerekli = true, calistir, kok = O.KOK, uret, yaz = console.log } = {}) {
  uret = uret || require('../konu/uret').uret;
  const b = (dizi.bolumler || []).find(x => x.n === n);
  if (!b) throw new Error(`bölüm ${n} yok`);
  const hazir = hazirYap(dizi, n);      // before any state change: a bad episode leaves it as it was
  b.durum = 'uretimde';
  // the scheduler is automation: spending follows konu.json → otomasyon.butce, never an interactive gate
  const r = await uret(ctx, null, { hazir, onay: true, otomatik: true, onayGerekli, calistir, kok, yaz });
  const durum = { uretildi: onayGerekli ? 'onay-bekliyor' : 'sirada', 'onay-bekliyor': 'onay-bekliyor', 'butce-bekliyor': 'butce-bekliyor', 'insan-bekliyor': 'kontrol_et' }[r.durum] || 'kontrol_et';
  if (durum === 'butce-bekliyor') {
    b.durum = 'uretimde';
    // no DeskFlow helper exists in konu/: the wait is reported in the run notes (calistir.js) and the log
    yaz(`${dizi.id} bölüm ${n}: bütçe bekliyor: ${r.neden || ''}`);
    return { durum, dir: r.dir, neden: r.neden };
  }
  b.durum = durum;
  if (r.dir) b.video = videoAdi(kok, r.dir);
  if (durum === 'kontrol_et') b.karar_neden = `üretim durdu: ${r.neden || r.durum}`;
  return { durum, dir: r.dir, ...(r.mp4 ? { mp4: r.mp4 } : {}), ...(r.neden ? { neden: r.neden } : {}) };
}

module.exports = { uretBolum, satirlaraBol, aciklamaYaz, hazirYap, cumleler };
