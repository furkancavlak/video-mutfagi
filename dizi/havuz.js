#!/usr/bin/env node
// Weekly story pool (Furkan 31.10): once a week the themes' Ekşi topics are searched until the stock covers about a
// month of new series; the hourly run (calistir.js) then takes the next story from here instead of searching live.
//   node dizi/havuz.js doldur <kanal>        fill kayit/dizi/<kanal>/havuz.json (weekly: dizi/zamanlayici.js)
//   node dizi/havuz.js durum <kanal>         stock per theme
// Item: {id, konu, baslik, link, fav, tarih, kelime, ozet, tahmini_bolum, durum: havuzda|kullanildi|elendi, neden?, eklendi}
// Every item passed the story check (bol.js hikayeMi); one that failed is kept as elendi so it is never fetched again.
// Used, rejected (reddedilen.json) and already pooled ids are never added. Ekşi load stays polite: konu.json →
// dizi.kaynak.aralik_ms between requests, the honest User-Agent first (tarayiciGetir), and a 403/429 stops the fill.
// Settings (konu.json → dizi.havuz): hedef (60: ~30 days at 1-3 new series a day), min_fav (50), sayfa (3 best-of pages
// per topic), azaldi (10: below this the hourly run notes "havuz azaldı").
const fs = require('fs'), path = require('path');
const O = require('../konu/ortak');
const D = require('./dizi');
const tema = require('./tema');

const VARSAYILAN = { hedef: 60, min_fav: 50, sayfa: 3, azaldi: 10 };
const ID = /^eksi-\d{1,12}$/;
const dosya = (kok, kanal) => path.join(kok, 'kayit', 'dizi', kanal, 'havuz.json');
const yukle = (kok, kanal) => { const h = O.okuJson(dosya(kok, kanal), { hikayeler: [] }); if (!Array.isArray(h.hikayeler)) h.hikayeler = []; return h; };
const kaydet = (kok, kanal, h) => O.yazJson(dosya(kok, kanal), h);
const ayar = ctx => ({ ...VARSAYILAN, ...((((ctx || {}).ayar || {}).dizi || {}).havuz || {}) });
const kelimeSay = s => (String(s).match(/\S+/g) || []).length;
const engelMi = e => /HTTP (403|429|503)/.test(String(e && e.message));

// ids that may never come back: pooled (any state), used by a series, rejected by the splitter
function bilinenler(kok, kanal, H) {
  const s = new Set(H.hikayeler.map(x => x.id));
  for (const d of D.yukle(kok, kanal).diziler || []) { s.add(d.id); if (d.kaynak && d.kaynak.id) s.add(d.kaynak.id); }
  const red = O.okuJson(path.join(kok, 'kayit', 'dizi', kanal, 'reddedilen.json'), { reddedilen: [] });
  for (const x of red.reddedilen || []) s.add(x.id);
  return s;
}

// stories ready to use, in the order the rotation takes them: allowed themes least recently used first, then favourites
function sirala(H, sira) {
  const i = new Map(sira.map((k, n) => [k, n]));
  return H.hikayeler.filter(x => x.durum === 'havuzda' && i.has(x.konu)).sort((a, b) => i.get(a.konu) - i.get(b.konu) || (b.fav || 0) - (a.fav || 0));
}
const stok = H => { const s = {}; for (const x of H.hikayeler) if (x.durum === 'havuzda') s[x.konu] = (s[x.konu] || 0) + 1; return s; };

// deps injectable: getir (url -> html), hikayeMi (ctx, h -> {hikaye, neden, ozet}), uyu (ms)
async function doldur(ctx, { kok = O.KOK, simdi = new Date(), getir, hikayeMi, uyu, yaz = () => { } } = {}) {
  const a = ayar(ctx), temalar = tema.konular(ctx), aralik = +((((ctx.ayar || {}).dizi || {}).kaynak || {}).aralik_ms ?? 2000);
  const minKelime = +((((ctx.ayar || {}).dizi || {}).kaynak || {}).min_kelime ?? 250);
  if (!temalar.length) throw new Error('konu.json → dizi.kaynak.konular boş: havuz hangi başlıklardan doldurulacağını bilmiyor');
  getir = getir || ((u, o) => require('../konu/kaynaklar/eksi').tarayiciGetir(u, o));
  hikayeMi = hikayeMi || ((c, h) => require('./bol').hikayeMi(c, h));
  uyu = uyu || require('../konu/kaynaklar/ag').uyu;
  const { oneri } = require('./bol');
  const H = yukle(kok, ctx.kanal), bilinen = bilinenler(kok, ctx.kanal, H), notlar = [], eklenen = {}, temaHedef = Math.ceil(a.hedef / temalar.length);
  const al = async u => { const m = await getir(u, { aralikMs: aralik }); await uyu(aralik); return m; };
  let durdu = false;
  for (const t of temalar) {
    if (durdu) break;
    let eksik = temaHedef - (stok(H)[t.ad] || 0);
    if (eksik <= 0) continue;
    // candidates of this theme: every topic, best-of pages 1..sayfa
    const adaylar = [];
    for (const b of t.basliklar) {
      for (let p = 1; p <= a.sayfa && !durdu; p++) {
        let es;
        try { es = await tema.basliktanAl(b, { getir: al, sayfa: p }); }
        catch (e) { notlar.push(`${t.ad} ${b} sayfa ${p}: ${e.message}`); if (engelMi(e)) { durdu = true; notlar.push('Ekşi engelledi: doldurma durdu, sonraki hafta yeniden denenecek'); } break; }
        if (!es.length) break;
        for (const h of es) if (!bilinen.has(h.id) && (h.puan || 0) >= a.min_fav && kelimeSay(h.metin) >= minKelime) { bilinen.add(h.id); adaylar.push(h); }
      }
      if (durdu) break;
    }
    adaylar.sort((x, y) => (y.puan || 0) - (x.puan || 0));
    for (const h of adaylar) {
      if (eksik <= 0) break;
      let k;
      try { k = await hikayeMi(ctx, h); } catch (e) { notlar.push(`${h.id}: hikâye kontrolü yapılamadı: ${e.message}`); continue; }   // not recorded: tried again next week
      const kelime = kelimeSay(h.metin);
      const oge = { id: h.id, konu: t.ad, baslik: h.baslik, link: h.url, fav: h.puan || 0, tarih: h.tarih || null, kelime, ozet: k.ozet || '', tahmini_bolum: oneri(kelime), durum: k.hikaye ? 'havuzda' : 'elendi', eklendi: new Date(simdi).toISOString() };
      if (!k.hikaye) oge.neden = 'hikaye_degil: ' + (k.neden || '');
      H.hikayeler.push(oge);
      H.guncelleme = new Date(simdi).toISOString();
      kaydet(kok, ctx.kanal, H);   // after every story: a crash keeps what was found
      if (k.hikaye) { eksik--; eklenen[t.ad] = (eklenen[t.ad] || 0) + 1; yaz(`+ ${t.ad}: ${h.baslik} (${oge.fav} fav, ${kelime} kelime)`); }
    }
    if (eksik > 0 && !durdu) notlar.push(`${t.ad}: ${eksik} hikâye eksik kaldı (başlıklarda yeterli uygun entry yok)`);
  }
  H.guncelleme = new Date(simdi).toISOString(); H.son_doldurma = { zaman: H.guncelleme, eklenen, notlar };
  kaydet(kok, ctx.kanal, H);
  return { eklenen, stok: stok(H), notlar };
}

// strike a story before it is used (panel "Ele"); the caller validates, this takes the channel lock
function ele(kok, kanal, id, neden = 'elle elendi') {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error('hikâye id geçersiz');
  const k = D.kilitAl(kok, kanal);
  if (k.mesaj) throw Object.assign(new Error('Zamanlayıcı şu an çalışıyor, birkaç dakika sonra tekrar dene'), { kod: 409 });
  try {
    const H = yukle(kok, kanal), x = H.hikayeler.find(h => h.id === id);
    if (!x) throw new Error('havuzda böyle bir hikâye yok');
    if (x.durum !== 'havuzda') throw new Error(`bu hikâye zaten ${x.durum}`);
    Object.assign(x, { durum: 'elendi', neden: String(neden).replace(/\s+/g, ' ').trim().slice(0, 200) || 'elle elendi', elendi: new Date().toISOString() });
    kaydet(kok, kanal, H);
    return { ok: true };
  } finally { k.birak(); }
}

// panel view: stock per theme (every theme listed) and the next stories in rotation order
function ozet(ctx, kok = O.KOK, adet = 15) {
  const H = yukle(kok, ctx.kanal), s = stok(H), temalar = tema.konular(ctx);
  const sira = tema.temaSirasi(temalar, D.yukle(kok, ctx.kanal).diziler || [], new Date());
  const tumu = [...sira, ...temalar.map(t => t.ad).filter(k => !sira.includes(k))];
  return {
    stok: temalar.map(t => ({ konu: t.ad, adet: s[t.ad] || 0 })), toplam: Object.values(s).reduce((x, y) => x + y, 0),
    hedef: ayar(ctx).hedef, son_doldurma: H.son_doldurma || null,
    siradaki: sirala(H, tumu).slice(0, adet).map(({ id, konu, baslik, link, fav, tarih, kelime, ozet: oz, tahmini_bolum }) => ({ id, konu, baslik, link, fav, tarih, kelime, ozet: oz, tahmini_bolum })),
  };
}

module.exports = { yukle, kaydet, sirala, stok, doldur, ele, ozet, ayar, dosya };

if (require.main === module) {
  const [alt, kanal] = process.argv.slice(2);
  (async () => {
    const ctx = O.kanalYukle(kanal);
    if (alt === 'doldur') {
      const t0 = Date.now(), r = await doldur(ctx, { yaz: m => console.log(m) });
      console.log(`Havuz dolduruldu (${Math.round((Date.now() - t0) / 1000)} sn). Eklenen: ${JSON.stringify(r.eklenen)}. Stok: ${JSON.stringify(r.stok)}`);
      for (const n of r.notlar) console.log('  not: ' + n);
    } else if (alt === 'durum') console.log(JSON.stringify(ozet(ctx), null, 1));
    else console.log('Kullanım: node dizi/havuz.js doldur <kanal> | durum <kanal>');
  })().catch(e => { console.error('HATA: ' + e.message); process.exit(1); });
}
