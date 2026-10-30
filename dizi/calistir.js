// Hourly series scheduler run: sync posted episodes from the queue, measure, decide continue/cut, fill the day, ask for due episodes.
//   node dizi/calistir.js <kanal> [--kuru]      (--kuru = plan only: no writes, no production, no network)
const fs = require('fs'), path = require('path');
const { yukle, kaydet, kararVer, kilitAl, metinOnay, metinOnayGoc } = require('./dizi');
const ortak = require('../konu/ortak');

// MAX_BEKLEYEN_METIN: new series waiting for Furkan's text approval do not count as active, but no more than this many
// are opened while waiting (the queue must not flood)
const MAX_AKTIF = 3, ESKALASYON_SAAT = 72, MAX_BEKLEYEN_METIN = 2;
const bul = (d, n) => (d.bolumler || []).find(b => b.n === n);
const saatFark = (simdi, t) => (new Date(simdi).getTime() - new Date(t).getTime()) / 3600e3;
const gunIst = t => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date(t));   // YYYY-MM-DD
const hesapAd = h => String(h || '').trim().replace(/^@/, '').trim().toLowerCase() || 'oxygbio';   // same rule as the panel's hesapTemiz

// ---- queue files
function kuyrukOku(kok) {
  const out = { bekleyen: [], paylasilan: [], hatali: [], iptal: [] };
  for (const k of Object.keys(out)) {
    const d = path.join(kok, 'kuyruk', k);
    let ad = []; try { ad = fs.readdirSync(d).filter(f => f.endsWith('.json')); } catch (e) { }
    for (const f of ad) { try { out[k].push({ id: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(d, f), 'utf8').replace(/^﻿/, '')) }); } catch (e) { } }
  }
  return out;
}

// ---- default collaborators (all injectable)
// factory so tests can pass a fake paylas module: returns {metrik, yorum_devam, not?}; yorum_devam = comments containing a keyword (tr-lowercase).
// A failed comments fetch never blocks the measurement: yorum_devam is 0 and `not` says why.
const sonucAlYap = P => async (mediaId, hesap, kelimeler) => {
  const metrik = await P.sonuc(mediaId, hesap);
  let yorum_devam = 0, not;
  const a = P.readAyar(hesap);
  if (a && kelimeler && kelimeler.length) {
    try {
      const j = await P.graph('GET', `/${mediaId}/comments`, { fields: 'text', access_token: a.token });
      const kl = kelimeler.map(k => String(k).toLocaleLowerCase('tr'));
      yorum_devam = (j.data || []).filter(c => { const t = String(c.text || '').toLocaleLowerCase('tr'); return kl.some(k => t.includes(k)); }).length;
    } catch (e) { not = `yorumlar okunamadı, devam yorumu 0 sayıldı: ${e.message}`; }
  }
  return { metrik, yorum_devam, ...(not ? { not } : {}) };
};
const varsayilanSonucAl = (...a) => sonucAlYap(require('../instagram/paylas'))(...a);
// Ekşi favourites and Reddit scores are not one scale: rank inside each source, then take them in turns (Ekşi first).
function sirayaKoy(ogeler) {
  const gruplar = {};
  for (const h of ogeler) (gruplar[h.tur || 'diger'] = gruplar[h.tur || 'diger'] || []).push(h);
  const turler = Object.keys(gruplar).sort((a, b) => (a === 'eksi' ? -1 : b === 'eksi' ? 1 : a.localeCompare(b)));
  for (const t of turler) gruplar[t].sort((a, b) => (b.puan || 0) - (a.puan || 0));
  const out = [];
  for (let i = 0; turler.some(t => i < gruplar[t].length); i++) for (const t of turler) if (i < gruplar[t].length) out.push(gruplar[t][i]);
  return out;
}
// candidates are fetched once per run (the source's notes go to the run notes); a story whose split fails (too short,
// not faithful, no story) is recorded in kayit/dizi/<kanal>/reddedilen.json and never split again. sonuc: the run's
// result (notlar, reddedilen count), optional.
// With themes (konu.json → dizi.kaynak.konular) the next story comes from the weekly pool (dizi/havuz.js) by theme
// rotation (least recently used theme, never one already used today) and favourites; a dry pool falls back to the live
// search with a "havuz azaldı" note. The new series carries its theme in `konu`.
const redDosya = (kok, kanal) => path.join(kok, 'kayit', 'dizi', kanal, 'reddedilen.json');
// live candidates: themed ones of the allowed themes in rotation order (favourites inside a theme), then the rest
function siraliAdaylar(aday, sira) {
  const i = new Map(sira.map((k, n) => [k, n]));
  const temali = aday.filter(h => h.konu && i.has(h.konu)).sort((a, b) => i.get(a.konu) - i.get(b.konu) || (b.puan || 0) - (a.puan || 0));
  return [...temali, ...sirayaKoy(aday.filter(h => !h.konu))];
}
function yeniDiziYap({ kaynak, bol, havuz, entryGetir } = {}) {
  kaynak = kaynak || require('./kaynak'); bol = bol || require('./bol'); havuz = havuz || require('./havuz');
  entryGetir = entryGetir || (no => require('../konu/kaynaklar/eksi').entryGetir(no));
  const tema = require('./tema');
  let aday = null;
  return async (ctx, { simdi, diziler, kok, sonuc }) => {
    kok = kok || ctx.kok || ortak.KOK;
    const not = m => { if (sonuc) sonuc.notlar.push(m); };
    const f = redDosya(kok, ctx.kanal);
    let red; try { red = ortak.okuJson(f, { reddedilen: [] }); } catch (e) { red = { reddedilen: [] }; not(`reddedilen.json okunamadı, baştan yazılacak: ${e.message}`); }
    if (!Array.isArray(red.reddedilen)) red.reddedilen = [];
    const kullanilan = new Set([...(diziler || []).flatMap(d => [d.id, d.kaynak && d.kaynak.id]).filter(Boolean), ...red.reddedilen.map(x => x.id)]);
    const reddet = (h, r) => {
      const ayrinti = r && r.ayrinti != null ? String(typeof r.ayrinti === 'string' ? r.ayrinti : JSON.stringify(r.ayrinti)).slice(0, 300) : undefined;
      red.reddedilen.push({ kaynak: h.tur || null, id: h.id, neden: (r && r.neden) || 'bölünemedi', ...(ayrinti ? { ayrinti } : {}), zaman: new Date(simdi).toISOString() });
      kullanilan.add(h.id);
      ortak.yazJson(f, red);
      if (sonuc) sonuc.reddedilen = (sonuc.reddedilen || 0) + 1;
    };
    // with text approval on (konu.json → dizi.metin_onayi, default true) the new series waits for Furkan before any voice
    const metinOnayi = (((ctx.ayar || {}).dizi || {}).metin_onayi) !== false;
    const yeni = (h, r, konu) => ({ id: h.id, kanal: ctx.kanal, kaynak: { tur: h.tur, url: h.url, puan: h.puan }, ...r.dizi, ...(konu ? { konu } : {}), ...(metinOnayi ? { metin_onay: 'bekliyor' } : {}), olusturma: new Date(simdi).toISOString() });
    const temalar = tema.konular(ctx), sira = tema.temaSirasi(temalar, diziler, simdi);

    // 1. the weekly pool
    if (temalar.length) {
      const H = havuz.yukle(kok, ctx.kanal), esik = havuz.ayar(ctx).azaldi;
      const kaydetH = () => havuz.kaydet(kok, ctx.kanal, H);
      for (const x of havuz.sirala(H, sira)) {
        if (kullanilan.has(x.id)) { Object.assign(x, { durum: 'kullanildi' }); kaydetH(); continue; }
        let h;
        // the pool may carry the entry text (filled on a machine Ekşi does not block): no fetch needed
        if (x.metin) h = { id: x.id, tur: 'eksi', url: x.link, baslik: x.baslik, metin: x.metin, puan: x.fav, dil: 'tr' };
        else try {
          const e = await entryGetir(x.id.replace(/^eksi-/, ''));
          h = { id: x.id, tur: 'eksi', url: x.link, baslik: e.baslik || x.baslik, metin: e.metin, puan: e.fav ?? x.fav, dil: 'tr' };
        } catch (e) {
          not(`havuz ${x.id}: entry alınamadı: ${e.message}`);
          // Ekşi is blocking us: stop for this run instead of trying the whole pool
          if (/HTTP (403|429|503)/.test(e.message)) break;
          // only a real 404 drops the story; a changed or challenge page must not empty the pool
          if (/HTTP 404/.test(e.message)) { Object.assign(x, { durum: 'elendi', neden: 'entry artık yok' }); kaydetH(); }
          continue;
        }
        const r = await bol.bol(ctx, h, {});
        if (r && r.ok) { Object.assign(x, { durum: 'kullanildi', kullanildi: new Date(simdi).toISOString() }); kaydetH(); return yeni(h, r, x.konu); }
        Object.assign(x, { durum: 'elendi', neden: (r && r.neden) || 'bölünemedi' }); kaydetH();
        reddet(h, r);
      }
      const kalan = H.hikayeler.filter(x => x.durum === 'havuzda').length;
      not(`havuz azaldı: ${kalan} hikâye kaldı${sira.length ? ', bugün kullanılabilecek temada hikâye yok: canlı aramaya geçildi' : ''} (node dizi/havuz.js doldur ${ctx.kanal})`);
    }

    // 2. live search
    if (!aday) {
      const k = (await kaynak.adaylar(ctx, { simdi, kok })) || {};
      for (const n of k.notlar || []) not('kaynak: ' + n);
      aday = k.ogeler || [];
    }
    for (const h of siraliAdaylar(aday, sira)) {
      aday = aday.filter(x => x !== h);
      if (kullanilan.has(h.id)) continue;
      const r = await bol.bol(ctx, h, {});
      if (r && r.ok) return yeni(h, r, h.konu);
      reddet(h, r);
    }
    return null;
  };
}
const eksikModul = e => { if (e && e.code === 'MODULE_NOT_FOUND') { const m = String(e.message).match(/dizi\/[\w-]+/); return `${m ? m[0] : 'modül'} henüz yok`; } throw e; };

// ---- state helpers
// a series whose text is not approved yet is never produced
const bekleyenUretim = d => d.durum === 'aktif' && metinOnay(d) === 'onaylandi' && !(d.bolumler || []).some(b => b.durum === 'kontrol_et');
// episode n is due when it is still text (or production stalled before a video existed) and its predecessor was measured as devam
function uretilecekler(diziler) {
  const out = [];
  for (const d of diziler) {
    if (!bekleyenUretim(d)) continue;
    for (const b of d.bolumler || []) {
      const hazir = b.durum === 'metin' || (b.durum === 'uretimde' && !b.video);
      if (!hazir) continue;
      const onceki = bul(d, b.n - 1);
      if (b.n === 1 || (onceki && onceki.durum === 'olculdu' && onceki.karar === 'devam')) out.push({ id: d.id, n: b.n, _t: onceki && onceki.paylasildi ? Date.parse(onceki.paylasildi) : Infinity });
      break;   // only the first unfinished episode of a series can be due
    }
  }
  return out.sort((a, b) => a._t - b._t).map(({ id, n }) => ({ id, n }));
}

// a waiting or posted job for this video (posted wins); failed/cancelled ones are never adopted
const isBul = (kuyruk, video) => kuyruk.paylasilan.find(j => j.video === video) || kuyruk.bekleyen.find(j => j.video === video) || null;
function benimse(b, j) {
  Object.assign(b, { video: j.video, kuyruk_id: j.id });
  delete b.bekleme;
  if (j.paylasildi) { Object.assign(b, { durum: 'yayinda', paylasildi: j.paylasildi }); if (j.media_id) b.media_id = j.media_id; if (j.link) b.link = j.link; }
  else b.durum = j.onay_gerekli ? 'onay-bekliyor' : 'sirada';
}

function senkronla(diziler, kuyruk, notlar) {
  const idx = {};
  for (const k of ['iptal', 'hatali', 'bekleyen', 'paylasilan']) for (const j of kuyruk[k]) if (j.video) idx[j.video] = { k, j };   // later wins: paylasilan > hatali
  for (const d of diziler) for (const b of d.bolumler || []) {
    if (!b.video || !idx[b.video]) continue;
    const { k, j } = idx[b.video];
    if (k === 'paylasilan' && j.paylasildi) {
      Object.assign(b, { paylasildi: j.paylasildi, media_id: j.media_id ?? b.media_id, link: j.link ?? b.link });
      if (['metin', 'uretimde', 'onay-bekliyor', 'sirada', 'kontrol_et'].includes(b.durum) && b.durum !== 'kontrol_et') b.durum = 'yayinda';
    } else if (k === 'hatali' && b.durum !== 'kontrol_et') {
      b.durum = 'kontrol_et'; b.karar_neden = `kuyrukta hatalı iş${j.kontrol_et ? ' (yayın belirsiz, hesaba bak)' : ''}: ${j.son_hata || j.id}`;
      notlar.push(`${d.id} bölüm ${b.n}: kontrol_et (${j.id})`);
    } else if (k === 'iptal' && b.durum !== 'kontrol_et') {
      b.durum = 'kontrol_et'; b.karar_neden = `kuyruk işi iptal edildi: ${j.id}`;
      notlar.push(`${d.id} bölüm ${b.n}: kuyruk işi iptal, kontrol_et`);
    }
  }
}

async function calistir(ctx, { simdi = new Date(), sonucAl, uretBolum, yeniDizi, kuru = false, kok } = {}) {
  kok = kok || ctx.kok || ortak.KOK;
  const sonuc = { olculen: 0, kararlar: [], uretilecek: [], yeniler: 0, reddedilen: 0, notlar: [] };
  const notlar = sonuc.notlar, ayar = (ctx.ayar && ctx.ayar.dizi) || {}, hesap = (ctx.kimlik && ctx.kimlik.hesap) || null;
  const kilit = kuru ? { birak() { } } : kilitAl(kok, ctx.kanal);
  // last run for the panel; written on every non-dry exit, also when the run throws or the lock refused it
  const sonKosu = () => { if (kuru) return; try { ortak.yazJson(path.join(kok, 'kayit', 'dizi', ctx.kanal, 'son-kosu.json'), { zaman: new Date(simdi).toISOString(), notlar: sonuc.notlar, kararlar: sonuc.kararlar, uretilecek: sonuc.uretilecek, reddedilen: sonuc.reddedilen }); } catch (e) { } };
  if (kilit.mesaj) { notlar.push(kilit.mesaj); sonKosu(); return sonuc; }
  try {
    let veri = yukle(kok, ctx.kanal);
    if (kuru) veri = JSON.parse(JSON.stringify(veri));
    const diziler = veri.diziler, kuyruk = kuyrukOku(kok);
    const kaydetSon = () => { if (!kuru) kaydet(kok, ctx.kanal, veri); };

    // 0. series from before the text approval feature count as approved (written explicitly once)
    const goc = metinOnayGoc(veri);
    if (goc) notlar.push(`${goc} eski dizi metin onaylı sayıldı (metin_onay: onaylandi)`);

    // 1. sync; a series whose last episode is already measured (older data) is finished
    senkronla(diziler, kuyruk, notlar);
    for (const d of diziler) {
      const b = d.bolumler || [], son = b[b.length - 1];
      if (d.durum !== 'bitti' && son && son.durum === 'olculdu') { d.durum = 'bitti'; notlar.push(`${d.id}: son bölüm ölçülmüş, dizi bitti olarak işaretlendi`); }
    }
    kaydetSon();

    // 2. measure + decide
    sonucAl = sonucAl || varsayilanSonucAl;
    for (const d of diziler) {
      if (d.durum !== 'aktif') continue;
      if ((d.bolumler || []).some(b => b.durum === 'kontrol_et')) { notlar.push(`${d.id}: kontrol_et var, dizi atlandı`); continue; }
      for (const b of (d.bolumler || []).slice().sort((x, y) => x.n - y.n)) {
        if (b.durum !== 'yayinda' || !b.paylasildi) continue;
        const gecen = saatFark(simdi, b.paylasildi);
        if (!(gecen >= ayar.bekle_saat)) continue;
        // `elle` only overrides the decision (kararVer), never the measurement: the next episode needs this one's views
        if (kuru) { notlar.push(`ölçülecek: ${d.id} bölüm ${b.n}`); sonuc.olculen++; continue; }
        // a measurement that keeps failing would leave the episode yayinda forever: past the wait + 72 h a human looks at it
        const olcemedi = neden => {
          if (gecen > ayar.bekle_saat + ESKALASYON_SAAT) { b.durum = 'kontrol_et'; b.karar_neden = `${ESKALASYON_SAAT} saatten uzun süredir ölçülemiyor: ${neden}`; notlar.push(`${d.id} bölüm ${b.n}: ölçülemiyor, kontrol_et (${neden})`); }
          else notlar.push(`${d.id} bölüm ${b.n}: ${neden}`);
        };
        if (!b.media_id) { olcemedi('media_id yok, ölçülemedi'); continue; }
        try {
          const r = (await sonucAl(b.media_id, hesap, ayar.yorum_kelimeleri || [])) || {};
          b.metrik = r.metrik || r; b.yorum_devam = r.yorum_devam ?? 0; sonuc.olculen++;
          if (r.not) notlar.push(`${d.id} bölüm ${b.n}: ${r.not}`);
        } catch (e) { olcemedi(`ölçüm hatası: ${e.message}`); continue; }
        const k = kararVer(d, b.n, diziler, ayar, simdi), son = b.n >= d.bolumler.length;
        b.karar = k.karar; b.karar_neden = k.neden;
        if (k.karar === 'bekle') {
          const asildi = gecen > ayar.bekle_saat + ESKALASYON_SAAT;
          // nothing waits on the last episode's decision: past the limit it is closed as measured, never kontrol_et
          if (asildi && son) { b.durum = 'olculdu'; d.durum = 'bitti'; b.karar_neden = `son bölüm, karar verilemeden kapandı: ${k.neden}`; notlar.push(`${d.id}: son bölüm ölçüldü (${k.neden}), dizi bitti`); continue; }
          if (asildi) { b.durum = 'kontrol_et'; b.karar_neden = `${ESKALASYON_SAAT} saatten uzun süredir bekliyor: ${k.neden}`; notlar.push(`${d.id} bölüm ${b.n}: bekleme sınırı aşıldı, kontrol_et`); }
          continue;
        }
        b.durum = 'olculdu';
        sonuc.kararlar.push({ id: d.id, n: b.n, karar: k.karar });
        // the measured last episode ends the series whatever the decision
        if (son) d.durum = 'bitti';
        else if (k.karar === 'kes') {
          d.durum = 'kesildi';
          for (const x of d.bolumler) if (x.n > b.n && !['yayinda', 'olculdu'].includes(x.durum)) x.durum = 'atlandi';
        }
      }
    }
    kaydetSon();

    // 3. fill the day
    const bugun = gunIst(simdi);
    const due = uretilecekler(diziler);
    // count by episode state (produced but waiting for a slot/approval still fills today) plus unlinked queue jobs dated today
    const sayilan = new Set(due.map(u => `${u.id}:${u.n}`)), videolar = new Set();
    for (const d of diziler) for (const b of d.bolumler || []) {
      if (b.video) videolar.add(b.video);
      if (['sirada', 'onay-bekliyor', 'uretimde'].includes(b.durum) || (['yayinda', 'olculdu'].includes(b.durum) && b.paylasildi && gunIst(b.paylasildi) === bugun)) sayilan.add(`${d.id}:${b.n}`);
    }
    for (const j of [...kuyruk.bekleyen, ...kuyruk.paylasilan]) {
      const t = j.paylasildi || j.ne_zaman;
      if (!t || isNaN(new Date(t)) || hesapAd(j.hesap) !== hesapAd(hesap) || (j.video && videolar.has(j.video))) continue;
      if (gunIst(t) === bugun) sayilan.add('job:' + j.id);
    }
    const onayDonemi = ayar.onay_donemi !== false;   // a missing onay_donemi means approval is on
    const hedef = onayDonemi ? ayar.onay_gunluk : ayar.gunluk_hedef;
    const metinBekliyor = d => d.durum === 'aktif' && metinOnay(d) === 'bekliyor';
    let sayi = sayilan.size, aktif = diziler.filter(d => d.durum === 'aktif' && !metinBekliyor(d)).length, bekleyenMetin = diziler.filter(metinBekliyor).length;
    const metinYeri = () => ayar.metin_onayi === false || bekleyenMetin < MAX_BEKLEYEN_METIN;
    const eksik = metinYeri() ? Math.max(0, Math.min((hedef || 0) - sayi, MAX_AKTIF - aktif)) : 0;
    if (!metinYeri() && (hedef || 0) > sayi) notlar.push(`${bekleyenMetin} hikâye metin onayı bekliyor: yeni hikâye açılmadı`);
    if (kuru) { sonuc.yeniler = eksik; if (eksik) notlar.push(`yeni dizi planlanan: ${eksik}`); }
    else if (eksik) {
      try { yeniDizi = yeniDizi || yeniDiziYap(); }
      catch (e) { notlar.push(eksikModul(e)); yeniDizi = null; }
      while (yeniDizi && sayi < (hedef || 0) && aktif < MAX_AKTIF && metinYeri()) {
        let d;
        try { d = await yeniDizi(ctx, { simdi, diziler, kok, sonuc }); } catch (e) { notlar.push(`yeni dizi hatası: ${e.message}`); break; }
        if (!d) { notlar.push('yeni dizi için uygun hikâye bulunamadı'); break; }
        if (d.id && !diziler.some(x => x.id === d.id)) diziler.push(d);
        // a series waiting for its text approval fills no slot today; at most MAX_BEKLEYEN_METIN of them wait at once
        if (metinOnay(d) === 'bekliyor') { bekleyenMetin++; notlar.push(`${d.id}: metin onayı bekliyor`); }
        else { sayi++; aktif++; }
        sonuc.yeniler++;
        kaydetSon();
      }
    }

    // 4. produce
    const liste = uretilecekler(diziler);
    sonuc.uretilecek = liste;
    if (kuru) { for (const u of liste) notlar.push(`üretilecek: ${u.id} bölüm ${u.n}`); return sonuc; }
    if (liste.length && !uretBolum) {
      try { uretBolum = require('./uret-bolum').uretBolum; } catch (e) { notlar.push(eksikModul(e)); }
    }
    if (uretBolum) for (const u of liste) {
      const d = diziler.find(x => x.id === u.id), b = bul(d, u.n);
      // the episode's video folder already has a waiting or posted job (e.g. a run died after queueing): adopt it
      const j = isBul(kuyrukOku(kok), `videolar/${ctx.kanal}-${d.id}-b${u.n}`);
      if (j) { benimse(b, j); notlar.push(`${u.id} bölüm ${u.n}: kuyrukta işi var (${j.id}), yeniden üretilmedi`); kaydetSon(); continue; }
      try {
        const r = await uretBolum(ctx, d, u.n, { onayGerekli: onayDonemi, kok });
        // uretBolum contract: returns {durum, dir?, mp4?}; the state is written whatever the episode's current one
        if (r && r.durum) b.durum = r.durum === 'butce-bekliyor' ? 'uretimde' : r.durum;
        // the panel shows this chip; it clears as soon as production gets past the budget gate
        if (r && r.durum === 'butce-bekliyor') b.bekleme = 'butce'; else delete b.bekleme;
        // a budget stop keeps the episode due (uretimde without a video), so it is resumed next run
        if (r && r.durum !== 'butce-bekliyor' && (r.dir || r.mp4) && !b.video) b.video = r.dir || r.mp4;
        if (r && r.durum === 'butce-bekliyor') notlar.push(`${u.id} bölüm ${u.n}: bütçe bekliyor${r.neden ? ': ' + r.neden : ''}`);
      } catch (e) { notlar.push(`${u.id} bölüm ${u.n}: üretim hatası: ${e.message}`); }
      kaydetSon();
    }
    return sonuc;
  } catch (e) { notlar.push(`çalışma hatası: ${e.message}`); throw e; }
  finally { kilit.birak(); sonKosu(); }
}

module.exports = { calistir, sonucAlYap, uretilecekler, senkronla, yeniDiziYap, sirayaKoy, siraliAdaylar };

if (require.main === module) {
  const kanal = process.argv[2], kuru = process.argv.includes('--kuru');
  (async () => {
    const ctx = ortak.kanalYukle(kanal);
    const r = await calistir(ctx, { kuru });
    console.log(`${kuru ? '[KURU] ' : ''}ölçülen: ${r.olculen}, yeni dizi: ${r.yeniler}`);
    for (const k of r.kararlar) console.log(`  karar: ${k.id} bölüm ${k.n} -> ${k.karar}`);
    for (const u of r.uretilecek) console.log(`  üretim: ${u.id} bölüm ${u.n}`);
    for (const n of r.notlar) console.log('  not: ' + n);
  })().catch(e => { console.error('HATA: ' + e.message); process.exit(1); });
}
