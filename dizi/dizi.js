// Series store (kayit/dizi/<kanal>/diziler.json) and the continue/cut decision for story episodes. Pure except yukle/kaydet.
const fs = require('fs'), path = require('path'), os = require('os');
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
// The last episode takes Kes (the series is then bitti); Devam only to reactivate a cut series. A kontrol_et episode
// takes Kes or Tekrar dene; on a cut series it also takes Devam, which only reactivates it so Tekrar dene works again.
const sonBolum = (d, n) => n >= (d.bolumler || []).length;
function kararHata(d, n, karar) {
  const b = bul(d, n);
  if (!b) return `bölüm ${n} yok`;
  if (!['yayinda', 'olculdu', 'kontrol_et'].includes(b.durum)) return 'Bu bölüm henüz yayında değil; karar yayından sonra verilir';
  if (d.durum !== 'aktif' && d.durum !== 'kesildi') return 'Bu dizi bitti';
  if (b.durum === 'kontrol_et' && karar === 'devam') return d.durum === 'kesildi' ? null : 'Kontrol bekleyen bölümde yalnız Kes ya da Tekrar dene var';
  if (karar === 'kes' && d.durum === 'kesildi') return 'Bu dizi zaten kesilmiş';
  // devam on a cut series' last episode only reactivates it (it is measured, then bitti)
  if (sonBolum(d, n)) return karar === 'kes' || d.durum === 'kesildi' ? null : 'Son bölümden sonra devam edecek bölüm yok';
  if (!sonrakiAcik(bul(d, n + 1))) return 'Sonraki bölüm üretime girdi; karar artık değiştirilemez';
  if (karar === 'devam' && d.durum === 'aktif' && (b.durum === 'olculdu' || (b.elle && b.karar === 'devam'))) return 'Bu hikâye zaten devam edecek';
  return null;
}
function tekrarHata(d, n) {
  const b = bul(d, n);
  if (!b) return `bölüm ${n} yok`;
  if (b.durum !== 'kontrol_et') return 'Yalnız kontrol bekleyen bölüm yeniden denenir';
  if (d.durum === 'kesildi') return 'Dizi kesilmiş: önce devam ettir';
  if (d.durum !== 'aktif') return 'Bu dizi bitti';
  return null;
}
// applies the decision and its consequence on the series; on a kontrol_et episode no decision is stored (kes cuts or,
// on the last episode, finishes the series; devam reactivates it)
function kararUygula(d, n, karar, neden) {
  const e = kararHata(d, n, karar);
  if (e) throw new Error(e);
  const b = bul(d, n);
  if (b.durum !== 'kontrol_et') elleKarar(d, n, karar, neden);
  if (karar === 'kes' && sonBolum(d, n)) d.durum = 'bitti';
  else if (karar === 'kes') { d.durum = 'kesildi'; for (const x of d.bolumler) if (x.n > n && x.durum === 'metin') x.durum = 'atlandi'; }
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

// ---- story-level text approval (Furkan 31.10): a new series waits with metin_onay 'bekliyor' until its episode texts are
// approved; nothing of it is voiced before. A series from before this feature (no field) counts as approved.
const metinOnay = d => (d && d.metin_onay) || 'onaylandi';
// the recap rule a human edit is checked against: episode 2+ opens with one "Önceki bölümde…" sentence of at most 15 words
function ozetHatasi(metin, n) {
  const m = String(metin || '').trim();
  if (!m) return `Bölüm ${n} boş`;
  if (m.length > 4000) return `Bölüm ${n} çok uzun`;
  if (n === 1) return null;
  const temiz = s => s.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const ilk = temiz(m.split(/\n\s*\n/)[0]);
  if (!/^önceki bölüm/.test(ilk.toLocaleLowerCase('tr'))) return `Bölüm ${n} "Önceki bölümde…" cümlesiyle açılmalı`;
  if (!/\n\s*\n/.test(m)) return `Bölüm ${n}: özetten sonra boş satır bırak`;
  const { cumleler } = require('./uret-bolum');
  const c = cumleler(ilk).length, k = ilk.split(/\s+/).filter(Boolean).length;
  return c > 1 || k > 15 ? `Bölüm ${n}: özet tek cümle ve en fazla 15 kelime olmalı (${c} cümle, ${k} kelime)` : null;
}
// karar 'onayla' (optionally with edited texts {n: text}) or 'reddet'; the caller holds the lock and records a rejection
function metinKarar(d, karar, metinler, simdi = new Date()) {
  if (!['onayla', 'reddet'].includes(karar)) throw new Error('karar onayla ya da reddet olmalı');
  if (metinOnay(d) !== 'bekliyor') throw new Error('Bu hikâyenin metni onay beklemiyor');
  const zaman = new Date(simdi).toISOString();
  if (karar === 'reddet') {
    Object.assign(d, { metin_onay: 'reddedildi', metin_onay_zaman: zaman, durum: 'kesildi', karar_neden: 'metin reddedildi' });
    for (const b of d.bolumler || []) if (b.durum === 'metin') b.durum = 'atlandi';
    return d;
  }
  const yeni = {};
  if (metinler != null) {
    if (typeof metinler !== 'object' || Array.isArray(metinler)) throw new Error('metinler {bölüm: metin} olmalı');
    for (const [k, v] of Object.entries(metinler)) {
      const n = Number(k), b = bul(d, n);
      if (!Number.isInteger(n) || !b) throw new Error(`bölüm ${k} yok`);
      if (typeof v !== 'string') throw new Error(`bölüm ${n} metni yazı olmalı`);
      const e = ozetHatasi(v, n);
      if (e) throw new Error(e);
      yeni[n] = v.replace(/\r\n/g, '\n').trim();
    }
  }
  for (const [n, v] of Object.entries(yeni)) { const b = bul(d, +n); if (b.metin !== v) { b.metin = v; b.elle_duzeltildi = true; } }
  Object.assign(d, { metin_onay: 'onaylandi', metin_onay_zaman: zaman });
  return d;
}
// migration: series created before the feature get an explicit 'onaylandi' (returns how many were set)
function metinOnayGoc(veri) {
  let n = 0;
  for (const d of (veri && veri.diziler) || []) if (d && !d.metin_onay) { d.metin_onay = 'onaylandi'; n++; }
  return n;
}

// migration: a series from before the tone label gets one: the kit's own assignment (konu.json → dizi.ton_atamalari
// {id: ton}) or komik. Returns how many were set.
function tonGoc(veri, atamalar = {}) {
  const { tonDogru } = require('./ton');
  let n = 0;
  for (const d of (veri && veri.diziler) || []) if (d && !tonDogru(d.ton)) { d.ton = tonDogru((atamalar || {})[d.id]) ? atamalar[d.id] : 'komik'; n++; }
  return n;
}

// When an episode is measured (Furkan 31.10: "10'da yayınlanacaksa 2-3 saat önce baksın"): olcum_once_saat hours before
// the next episode's slot, the slot being the first configured hour (dizi.saatler, local time) at least bolum_arasi_saat
// (20) after this episode was posted. A channel without olcum_once_saat keeps the old rule: paylasildi + bekle_saat.
//   olcumZamani(b, ayar) -> ms      olcumGecen(b, ayar, simdi) -> hours since the measurement became due (< 0: not yet)
function sonrakiSlotSaati(t0, saatler) {
  const ss = (saatler || []).map(s => String(s).split(':').map(Number)).filter(([h, m]) => h >= 0 && h < 24 && m >= 0 && m < 60).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!ss.length) return t0;
  const g = new Date(t0);
  for (let gun = 0; gun < 4; gun++) for (const [h, m] of ss) {
    const c = new Date(g.getFullYear(), g.getMonth(), g.getDate() + gun, h, m, 0, 0).getTime();
    if (c >= t0) return c;
  }
  return t0;
}
// A series keeps its own hour (Furkan 31.10: "ilk seferinde kaçta başladıysa o saatte devam etsin"): dizi.saat, set when
// its first episode is produced (a configured hour no other active series holds); its next episode goes out at that hour.
const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;
const diziSaati = dz => (dz && SAAT.test(String(dz.saat || ''))) ? [dz.saat] : null;
// the next episode's slot after episode b: the series' own hour (or the configured hours) at least bolum_arasi_saat later
const hedefSlot = (b, ayar = {}, dz = null) => sonrakiSlotSaati(new Date(b.paylasildi).getTime() + (ayar.bolum_arasi_saat ?? 20) * 3600e3, diziSaati(dz) || ayar.saatler);
function olcumZamani(b, ayar = {}, dz = null) {
  const p = new Date(b.paylasildi).getTime();
  if (!(ayar.olcum_once_saat > 0)) return p + (ayar.bekle_saat || 0) * 3600e3;
  return Math.max(p + 6 * 3600e3, hedefSlot(b, ayar, dz) - ayar.olcum_once_saat * 3600e3);   // never on fewer than 6 hours of data
}
const olcumGecen = (b, ayar, simdi, dz = null) => (new Date(simdi).getTime() - olcumZamani(b, ayar, dz)) / 3600e3;
// an hour for a new series: the first configured one no other active series holds, else the least used
function bosSaat(diziler, ayar = {}, haric = null) {
  const ss = (ayar.saatler || []).filter(s => SAAT.test(s));
  if (!ss.length) return null;
  const say = s => (diziler || []).filter(x => x && x !== haric && x.durum === 'aktif' && x.saat === s).length;
  return ss.slice().sort((a, b) => say(a) - say(b) || ss.indexOf(a) - ss.indexOf(b))[0];
}

function kararVer(dizi, n, tumDiziler, ayar, simdi) {
  const b = bul(dizi, n);
  if (!b) throw new Error(`bölüm ${n} yok`);
  if (b.elle) return { karar: b.karar, neden: b.karar_neden };
  const kalan = -olcumGecen(b, ayar, simdi, dizi);
  if (kalan > 0) return { karar: 'bekle', neden: `ölçüm zamanı gelmedi (${Math.ceil(kalan)} saat var)` };
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

// ---- per-channel lock (kayit/dizi/<kanal>/.kilit), shared by the scheduler run and the panel's manual decisions.
// A live pid on this host always holds it, however long the run takes. Stale: a dead pid on this host, or a lock from
// another host (or without a pid) older than 6 h. A file still being written (unreadable) is held for a minute.
const pidCanli = pid => { try { process.kill(pid, 0); return true; } catch (x) { return x.code === 'EPERM'; } };
function kilitTutuluyor(k, mtime) {
  if (!k) return Date.now() - mtime < 60e3;
  const t = Date.parse(k.zaman), yas = Date.now() - (isNaN(t) ? mtime : t), buMakine = !k.host || k.host === os.hostname();
  if (Number.isInteger(k.pid) && k.pid > 0 && buMakine) return pidCanli(k.pid);
  return yas < KILIT_SAAT * 3600e3;
}
function kilitAl(kok, kanal) {
  const f = path.join(kok, 'kayit', 'dizi', kanal, '.kilit');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fs.openSync(f, 'wx'); fs.writeSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), zaman: new Date().toISOString() })); fs.closeSync(fd);
      return { birak: () => { try { if (JSON.parse(fs.readFileSync(f, 'utf8')).pid === process.pid) fs.unlinkSync(f); } catch (e) { } } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let k = null, mtime = 0;
      try { mtime = fs.statSync(f).mtimeMs; k = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (x) { }
      if (kilitTutuluyor(k, mtime)) return { mesaj: k ? `kilit: başka bir dizi işi sürüyor (pid ${k.pid}${k.host ? ' @' + k.host : ''}, ${k.zaman})` : 'kilit: başka bir dizi işi kilidi yazıyor' };
      try { fs.unlinkSync(f); } catch (x) { }
    }
  }
  return { mesaj: 'kilit: kilit dosyası alınamadı' };
}

module.exports = { olcumZamani, olcumGecen, sonrakiSlotSaati, hedefSlot, bosSaat, yukle, kaydet, kararVer, elleKarar, kilitAl, kararHata, tekrarHata, kararUygula, tekrarDene, metinOnay, metinKarar, metinOnayGoc, ozetHatasi, tonGoc };
