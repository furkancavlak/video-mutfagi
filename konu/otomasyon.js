// Automation policy (kanal/<kanal>/konu.json → otomasyon) and spend caps.
//   kapali  the scheduler does nothing
//   fikir   collect + score only (no spend beyond the language model)
//   uret    auto-produce ideas above the thresholds, then WAIT for a human before posting
//   tam     auto-produce and queue for posting without a human; needs tam_otomatik: true in the file AND the
//           --tam-otomatik flag on the command line, otherwise it falls back to "uret"
// Budgets: 0 means "no permission to spend" for automation. Manual `uret --onay` is the user's own yes, so only
// caps that are set (> 0) apply there, plus the per-video credit budget in ucretli.json.
const O = require('./ortak');

const SEVIYELER = ['kapali', 'fikir', 'uret', 'tam'];

function politika(ctx, { tamBayrak = false } = {}) {
  const o = ctx.ayar.otomasyon || {};
  const seviye = o.seviye || 'kapali';
  if (!SEVIYELER.includes(seviye)) O.hata(`otomasyon.seviye "${seviye}" geçersiz. Seçenekler: ${SEVIYELER.join(', ')}`);
  const uyarilar = [];
  let etkin = seviye;
  if (seviye === 'tam' && !(o.tam_otomatik === true && tamBayrak)) {
    etkin = 'uret';
    uyarilar.push(`Tam otomatik için iki onay gerekir: konu.json → otomasyon.tam_otomatik: true VE komutta --tam-otomatik. ${o.tam_otomatik === true ? 'Komutta bayrak yok' : 'Dosyada tam_otomatik true değil'}; videolar paylaşım için insan onayı bekleyecek.`);
  }
  if (etkin === 'tam') uyarilar.push('DİKKAT: TAM OTOMATİK. Videolar sen izlemeden paylaşım kuyruğuna onaysız giriyor. Yanlış bilgi, bozuk görüntü ya da hesabın spam sayılması riski sende. Kapatmak için konu.json → otomasyon.seviye: "uret".');
  return { seviye, etkin, uyarilar, onayGerekli: etkin !== 'tam' };
}

function esikler(ctx) {
  const e = (ctx.ayar.otomasyon || {}).esik || {};
  return { puan: e.puan ?? 8, etkilesim_min: e.etkilesim_min ?? 0, kaynak_metrik: e.kaynak_metrik || {} };
}

// "eksi.entry_bugun": 50 → at least one source of the idea is an Ekşi topic with ≥ 50 entries today
function kaynakMetrikTutar(fikir, kosul) {
  const kurallar = Object.entries(kosul || {});
  if (!kurallar.length) return true;
  return kurallar.some(([anahtar, min]) => {
    const [kaynak, metrik] = anahtar.split('.');
    return fikir.kaynaklar.some(k => k.kaynak === kaynak && k.metrikler && +k.metrikler[metrik] >= min);
  });
}

function uygunFikirler(ctx, havuz) {
  const e = esikler(ctx);
  return havuz.fikirler
    .filter(f => ['yeni', 'secildi'].includes(f.durum))
    .filter(f => f.durum === 'secildi' || (f.puan >= e.puan && (f.puan_detay.etkilesim || 0) >= e.etkilesim_min && kaynakMetrikTutar(f, e.kaynak_metrik)))
    .sort((a, b) => (a.durum === 'secildi' ? -1 : 0) - (b.durum === 'secildi' ? -1 : 0) || b.puan - a.puan);
}

function butceDurumu(ctx) {
  const b = (ctx.ayar.otomasyon || {}).butce || {};
  const kr = O.harcamaToplam(ctx, 'kredi'), ka = O.harcamaToplam(ctx, 'karakter'), vi = O.harcamaToplam(ctx, 'video');
  return {
    kredi: { ...kr, gunSinir: b.gunluk_kredi || 0, aySinir: b.aylik_kredi || 0, videoBasi: b.video_basi_kredi || 50 },
    karakter: { ...ka, gunSinir: b.gunluk_karakter || 0, aySinir: b.aylik_karakter || 0 },
    video: { ...vi, gunSinir: (ctx.ayar.otomasyon || {}).gunluk_en_fazla_video ?? 1 },
  };
}

// Can we spend `miktar` of `tur` (kredi | karakter) now? Returns {izin, neden, kalan}
function harcamaIzni(ctx, tur, miktar, { otomatik }) {
  const d = butceDurumu(ctx)[tur], ad = tur === 'kredi' ? 'Higgsfield kredisi' : 'ElevenLabs karakteri';
  if (otomatik && (!d.gunSinir || !d.aySinir)) return { izin: false, neden: `Otomasyonun ${ad} harcama izni yok: konu.json → otomasyon.butce içinde günlük ve aylık sınır 0. Sınır yazılınca harcar.` };
  const kalanGun = d.gunSinir ? d.gunSinir - d.gun : Infinity, kalanAy = d.aySinir ? d.aySinir - d.ay : Infinity;
  if (miktar > kalanGun) return { izin: false, neden: `Günlük ${ad} sınırı aşılıyor: bugün ${d.gun} harcandı, bu adım ${miktar}, sınır ${d.gunSinir}.` };
  if (miktar > kalanAy) return { izin: false, neden: `Aylık ${ad} sınırı aşılıyor: bu ay ${d.ay} harcandı, bu adım ${miktar}, sınır ${d.aySinir}.` };
  return { izin: true, kalan: Math.min(kalanGun, kalanAy) };
}

module.exports = { SEVIYELER, politika, esikler, uygunFikirler, kaynakMetrikTutar, butceDurumu, harcamaIzni };
