// Series store (kayit/dizi/<kanal>/diziler.json) and the continue/cut decision for story episodes. Pure except yukle/kaydet.
const fs = require('fs'), path = require('path');
const { yazJson, okuJson } = require('../konu/ortak');

const dosya = (kok, kanal) => path.join(kok, 'kayit', 'dizi', kanal, 'diziler.json');
const yukle = (kok, kanal) => okuJson(dosya(kok, kanal), { diziler: [] });
const kaydet = (kok, kanal, veri) => yazJson(dosya(kok, kanal), veri);   // tmp + rename + retry lives in konu/ortak

const bul = (d, n) => (d.bolumler || []).find(b => b.n === n);
const views = b => (b && b.metrik && typeof b.metrik.views === 'number') ? b.metrik.views : null;
const ort = a => a.reduce((s, x) => s + x, 0) / a.length;

function elleKarar(dizi, n, karar, neden) {
  const b = bul(dizi, n);
  if (!b) throw new Error(`bölüm ${n} yok`);
  Object.assign(b, { karar, karar_neden: neden, elle: true });
  return b;
}

function kararVer(dizi, n, tumDiziler, ayar, simdi) {
  const b = bul(dizi, n);
  if (!b) throw new Error(`bölüm ${n} yok`);
  if (b.elle) return { karar: b.karar, neden: b.karar_neden };
  const gecen = (new Date(simdi).getTime() - new Date(b.paylasildi).getTime()) / 3600e3;
  if (!(gecen >= ayar.bekle_saat)) return { karar: 'bekle', neden: `${ayar.bekle_saat} saat dolmadı (${Math.max(0, Math.floor(gecen))} saat geçti)` };
  const v = views(b);
  if (v === null) return { karar: 'bekle', neden: 'izlenme sayısı henüz yok' };
  let onceki = null;
  if (n > 1) {
    onceki = views(bul(dizi, n - 1));
    if (onceki === null || onceki === 0) return { karar: 'bekle', neden: 'önceki bölümün izlenmesi yok' };
  }
  const digerleri = (tumDiziler || []).filter(x => x.id !== dizi.id);
  const biten = digerleri.filter(x => x.durum === 'bitti' || x.durum === 'kesildi').length;
  if (biten < ayar.ilk_dizi_sayisi) return { karar: 'devam', neden: `ilk dizilerde kesilmez (${biten}/${ayar.ilk_dizi_sayisi} bitti)` };
  if ((b.yorum_devam || 0) >= ayar.yorum_min) return { karar: 'devam', neden: `yorum: ${b.yorum_devam} kişi devam istedi` };
  // past data: ep1 views, or views(n)/views(n-1) of the same episode pair
  const gecmis = [];
  for (const x of digerleri) {
    const a = views(bul(x, n));
    if (a === null) continue;
    if (n === 1) gecmis.push(a);
    else { const p = views(bul(x, n - 1)); if (p) gecmis.push(a / p); }
  }
  if (!gecmis.length) return { karar: 'devam', neden: 'karşılaştıracak geçmiş veri yok' };
  const ortalama = ort(gecmis), deger = n === 1 ? v : v / onceki, esik = ayar.esik_oran * ortalama;
  const f = x => n === 1 ? Math.round(x) : x.toFixed(2);
  const ne = n === 1 ? 'izlenme' : 'tutma oranı';
  if (deger < esik) return { karar: 'kes', neden: `${ne} ${f(deger)} < eşik ${f(esik)} (ortalama ${f(ortalama)})` };
  return { karar: 'devam', neden: `${ne} ${f(deger)} >= eşik ${f(esik)} (ortalama ${f(ortalama)})` };
}

module.exports = { yukle, kaydet, kararVer, elleKarar };
