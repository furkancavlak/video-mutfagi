// Series store (kayit/dizi/<kanal>/diziler.json) and the continue/cut decision for story episodes. Pure except yukle/kaydet.
const fs = require('fs'), path = require('path');
const { yazJson, okuJson } = require('../konu/ortak');

const dosya = (kok, kanal) => path.join(kok, 'kayit', 'dizi', kanal, 'diziler.json');
const yukle = (kok, kanal) => okuJson(dosya(kok, kanal), { diziler: [] });
const kaydet = (kok, kanal, veri) => yazJson(dosya(kok, kanal), veri);   // tmp + rename + retry lives in konu/ortak

const bul = (d, n) => (d.bolumler || []).find(b => b.n === n);
const views = b => (b && b.metrik && typeof b.metrik.views === 'number') ? b.metrik.views : null;
const KILIT_SAAT = 6;
const ort = a => a.reduce((s, x) => s + x, 0) / a.length;

function elleKarar(dizi, n, karar, neden) {
  const b = bul(dizi, n);
  if (!b) throw new Error(`bölüm ${n} yok`);
  Object.assign(b, { karar, karar_neden: neden, elle: true });
  return b;
}


// ---- manual decisions (panel). The caller holds kilitAl. A decision must change something and stays overridable only
// until the next episode has been produced.
const sonrakiAcik = b => !b || b.durum === 'metin' || b.durum === 'atlandi' || (b.durum === 'uretimde' && !b.video);
function kararHata(d, n, karar) {
  const b = bul(d, n);
  if (!b) return `bölüm ${n} yok`;
  if (!['yayinda', 'olculdu', 'kontrol_et'].includes(b.durum)) return 'Bu bölüm henüz yayında değil; karar yayından sonra verilir';
  if (d.durum !== 'aktif' && d.durum !== 'kesildi') return 'Bu dizi bitti';
  if (n >= (d.bolumler || []).length) return 'Son bölümden sonra devam edecek bölüm yok';
  if (!sonrakiAcik(bul(d, n + 1))) return 'Sonraki bölüm üretime girdi; karar artık değiştirilemez';
  if (b.durum === 'kontrol_et' && karar !== 'kes') return 'Kontrol bekleyen bölümde yalnız Kes ya da Tekrar dene var';
  if (karar === 'kes' && d.durum === 'kesildi') return 'Bu dizi zaten kesilmiş';
  if (karar === 'devam' && d.durum === 'aktif' && (b.durum === 'olculdu' || (b.elle && b.karar === 'devam'))) return 'Bu hikâye zaten devam edecek';
  return null;
}
function tekrarHata(d, n) {
  const b = bul(d, n);
  if (!b) return `bölüm ${n} yok`;
  if (b.durum !== 'kontrol_et') return 'Yalnız kontrol bekleyen bölüm yeniden denenir';
  if (d.durum !== 'aktif') return 'Dizi kesilmiş: önce devam ettir';
  return null;
}
// applies the decision and its consequence on the series; kontrol_et + kes only cuts the series
function kararUygula(d, n, karar, neden) {
  const e = kararHata(d, n, karar);
  if (e) throw new Error(e);
  const b = bul(d, n);
  if (b.durum !== 'kontrol_et') elleKarar(d, n, karar, neden);
  if (karar === 'kes') { d.durum = 'kesildi'; for (const x of d.bolumler) if (x.n > n && x.durum === 'metin') x.durum = 'atlandi'; }
  else { d.durum = 'aktif'; for (const x of d.bolumler) if (x.n > n && x.durum === 'atlandi') x.durum = 'metin'; }
  return b;
}
// back to yayinda when a post exists (it is measured again), otherwise to metin with the stale video/link dropped
function tekrarDene(d, n) {
  const e = tekrarHata(d, n);
  if (e) throw new Error(e);
  const b = bul(d, n);
  delete b.bekleme; delete b.karar; delete b.elle;
  if (b.media_id) { b.durum = 'yayinda'; delete b.karar_neden; }
  else { b.durum = 'metin'; delete b.video; delete b.link; delete b.paylasildi; delete b.karar_neden; }
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

// ---- per-channel lock (kayit/dizi/<kanal>/.kilit), shared by the scheduler run and the panel's manual decisions; a dead pid or a file older than 6 h is stale
function kilitAl(kok, kanal) {
  const f = path.join(kok, 'kayit', 'dizi', kanal, '.kilit');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fs.openSync(f, 'wx'); fs.writeSync(fd, JSON.stringify({ pid: process.pid, zaman: new Date().toISOString() })); fs.closeSync(fd);
      return { birak: () => { try { if (JSON.parse(fs.readFileSync(f, 'utf8')).pid === process.pid) fs.unlinkSync(f); } catch (e) { } } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let k = null; try { k = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (x) { }
      let yasiyor = !!k && Date.now() - Date.parse(k.zaman) < KILIT_SAAT * 3600e3;
      if (yasiyor) { try { process.kill(k.pid, 0); } catch (x) { yasiyor = x.code === 'EPERM'; } }
      if (yasiyor) return { mesaj: `kilit: başka bir dizi işi sürüyor (pid ${k.pid}, ${k.zaman})` };
      try { fs.unlinkSync(f); } catch (x) { }
    }
  }
  return { mesaj: 'kilit: kilit dosyası alınamadı' };
}

module.exports = { yukle, kaydet, kararVer, elleKarar, kilitAl, kararHata, tekrarHata, kararUygula, tekrarDene };
