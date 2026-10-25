// Scoring in two stages so the language model only sees a short list:
//   1. on_eleme (free, deterministic): drop blocked words, score keyword fit + source engagement + freshness,
//      keep the best N with a per-source quota.
//   2. LLM (one batch call): rate fit / curiosity / verifiability and turn the best into concrete video ideas.
// Final idea score (0-10) = weighted mix of the LLM ratings and the deterministic freshness/engagement.
const path = require('path');
const O = require('./ortak');
const LLM = require('./llm');
const H = require('./havuz');

// keyword test: short words (≤3 letters) must match a whole word; longer ones may carry Turkish suffixes
function anahtarEslesme(metin, liste) {
  const t = ' ' + O.norm(metin) + ' ';
  let n = 0;
  for (const k of liste || []) {
    const kn = O.norm(k); if (!kn) continue;
    const re = kn.length <= 3 ? new RegExp(`\\s${kn}\\s`, 'u') : new RegExp(`\\s${kn.replace(/\s+/g, '\\s+')}`, 'u');
    if (re.test(t)) n++;
  }
  return n;
}
const tazelik = (zaman, simdi = Date.now()) => zaman == null ? 0.5 : Math.max(0, Math.min(1, 1 - (simdi - zaman - 24 * 3600e3) / (6 * 24 * 3600e3)));

function onEleme(ogeler, ayar = {}, simdi = Date.now()) {
  const ak = ayar.anahtar_kelimeler || [], yasak = ayar.yasak_kelimeler || [];
  const kalan = [], elenen = [];
  for (const o of ogeler) {
    const metin = `${o.baslik} ${o.ozet || ''}`;
    if (anahtarEslesme(o.baslik + ' ' + (o.ozet || '').slice(0, 200), yasak)) { elenen.push({ ...o, neden: 'yasak kelime' }); continue; }
    const anahtar = Math.min(1, anahtarEslesme(metin, ak) * 0.35);
    const taze = tazelik(o.zaman, simdi);
    const on = 0.45 * anahtar + 0.35 * (o.etkilesim || 0) + 0.2 * taze;
    kalan.push({ ...o, on_puan: +on.toFixed(3), tazelik: +taze.toFixed(2) });
  }
  kalan.sort((a, b) => b.on_puan - a.on_puan);
  return { kalan, elenen };
}

// best N overall, but every active source gets at least `kaynak_basina_en_az` seats (Wikipedia's raw view
// counts would otherwise crowd out forum topics)
function kotaIleSec(liste, n, enAz) {
  const sec = new Map();
  const kaynaklar = [...new Set(liste.map(o => o.kaynak))];
  for (const k of kaynaklar) liste.filter(o => o.kaynak === k).slice(0, enAz).forEach(o => sec.set(o.id, o));
  for (const o of liste) { if (sec.size >= n) break; sec.set(o.id, o); }
  return [...sec.values()].slice(0, Math.max(n, kaynaklar.length * enAz)).sort((a, b) => b.on_puan - a.on_puan);
}

const metrikYazi = m => Object.entries(m || {}).filter(([k]) => k !== 'sira' || !m.goruntulenme).map(([k, v]) => `${k}=${v}`).join(', ');

function kimlikOzeti(k) {
  return { hesap: k.hesap, konu: k.konu, karakter: k.karakter, ton: k.ton, kufur: k.kufur, dogruluk: k.dogruluk, etiket: k.marka && k.marka.etiket, cta: k.marka && k.marka.cta };
}

function sonPuan(d, w) {
  const top = (w.uyum * d.uyum + w.merak * d.merak + w.dogrulanabilirlik * d.dogrulanabilirlik) / 10 + w.tazelik * d.tazelik + w.etkilesim * d.etkilesim;
  const agirlikToplam = w.uyum + w.merak + w.dogrulanabilirlik + w.tazelik + w.etkilesim;
  return +(10 * top / agirlikToplam).toFixed(1);
}

// Full scoring run over recent raw items not yet processed. `calistir` is for tests (fake LLM).
async function puanla(ctx, { ogeler, yaz = console.log, calistir } = {}) {
  const a = ctx.ayar, oe = a.on_eleme || {}, pa = a.puan || {};
  const W = { uyum: 0.3, merak: 0.25, dogrulanabilirlik: 0.2, tazelik: 0.1, etkilesim: 0.15, ...(pa.agirlik || {}) };
  const islenenF = path.join(ctx.kayit, 'islenen.json');
  const islenen = O.okuJson(islenenF, {});
  for (const [id, v] of Object.entries(islenen)) if (Date.now() - Date.parse(v.zaman) > 14 * 864e5) delete islenen[id];   // forget after 2 weeks
  const yeni = ogeler.filter(o => !islenen[o.id]);
  yaz(`${ogeler.length} ham konu, ${yeni.length} tanesi yeni.`);
  const { kalan, elenen } = onEleme(yeni, oe);
  const h = H.havuzOku(ctx);

  // sites that do not allow AI input: keep as raw topics for a human, never sent to the model
  const yasakli = kalan.filter(o => !o.llm_izni), uygun = kalan.filter(o => o.llm_izni);
  const hamlar = new Map((h.ham_konular || []).map(k => [k.url, k]));
  for (const o of yasakli) hamlar.set(o.url, { kaynak: o.kaynak, alt: o.alt, baslik: o.baslik, url: o.url, metrikler: o.metrikler, on_puan: o.on_puan, zaman: new Date().toISOString() });
  h.ham_konular = [...hamlar.values()].filter(k => Date.now() - Date.parse(k.zaman) < 3 * 864e5).sort((x, y) => y.on_puan - x.on_puan).slice(0, 40);

  const secilen = kotaIleSec(uygun, oe.llm_e_en_fazla || 40, oe.kaynak_basina_en_az || 5);
  yaz(`Ön eleme: ${elenen.length} konu yasak kelimeyle elendi, ${yasakli.length} konu yapay zekâya gönderilmeyecek (site kuralı), ${secilen.length} konu yapay zekâya gidiyor.`);
  const zaman = new Date().toISOString();
  for (const o of elenen) islenen[o.id] = { zaman, sonuc: 'elendi' };
  for (const o of yasakli) islenen[o.id] = { zaman, sonuc: 'ham' };
  if (!secilen.length) { H.havuzYaz(ctx, h); O.yazJson(islenenF, islenen); return { eklenen: 0, birlesen: 0, fikirler: [] }; }

  const kisa = secilen.map(o => ({ id: o.id, kaynak: `${o.kaynak} (${o.alt})`, baslik: o.baslik, ozet: O.ozet(o.ozet, 280), ilgi: metrikYazi(o.metrikler), dis_kaynak: o.dis_kaynak || undefined }));
  const mevcut = h.fikirler.filter(f => f.durum !== 'reddedildi').slice(-30).map(f => f.baslik);
  const reddedilen = h.fikirler.filter(f => f.durum === 'reddedildi').slice(-15).map(f => f.baslik);
  const istem = LLM.istem('puanla', {
    kimlik: kimlikOzeti(ctx.kimlik), ornek_baslik: O.ornekBaslik(ctx),
    fikir_sayisi: String(pa.fikir_en_fazla || 8), konular: kisa, mevcut, reddedilen,
  });
  yaz(`Yapay zekâ puanlıyor (${secilen.length} konu, tek çağrı)…`);
  const llm = a.llm || {};
  const r = await LLM.sor(istem, { is: 'puanla', ayar: llm, model: llm.model_puanlama, efor: llm.efor_puanlama || 'low', calistir });
  O.yazJson(path.join(ctx.kayit, 'son-puanlama.json'), { zaman: new Date().toISOString(), konular: kisa, yanit: r });   // for debugging a run
  const puanlar = new Map((r.puanlar || []).map(p => [p.id, p]));
  for (const o of secilen) islenen[o.id] = { zaman, sonuc: 'puanlandi', ...(puanlar.get(o.id) ? { uyum: puanlar.get(o.id).uyum, merak: puanlar.get(o.id).merak } : {}) };

  const byId = new Map(secilen.map(o => [o.id, o]));
  const fikirler = [];
  for (const f of r.fikirler || []) {
    const kaynak = (f.kaynak_idler || []).map(id => byId.get(id)).filter(Boolean);
    if (!kaynak.length || !f.baslik) continue;
    const d = {
      uyum: +f.uyum || 0, merak: +f.merak || 0, dogrulanabilirlik: +f.dogrulanabilirlik || 0,
      tazelik: Math.max(...kaynak.map(k => k.tazelik)), etkilesim: Math.max(...kaynak.map(k => k.etkilesim || 0)),
    };
    fikirler.push({
      baslik: f.baslik, oncul: f.oncul, kanca: f.kanca, tirmanis: (f.tirmanis || []).slice(0, 5), kapanis: f.kapanis, neden_uyar: f.neden_uyar,
      durum: 'yeni', puan: sonPuan(d, W), puan_detay: d,
      kaynaklar: kaynak.map(k => ({ kaynak: k.kaynak, alt: k.alt, baslik: k.baslik, url: k.url, metrikler: k.metrikler, ...(k.dis_kaynak ? { dis_kaynak: k.dis_kaynak } : {}) })),
      olusturma: zaman, guncelleme: zaman, video: null,
    });
  }
  const sonuc = H.fikirEkle(h, fikirler, { seri: O.seriKelimeleri(ctx) });
  H.havuzYaz(ctx, h);
  O.yazJson(islenenF, islenen);
  return { ...sonuc, fikirler };
}

module.exports = { onEleme, kotaIleSec, anahtarEslesme, tazelik, sonPuan, puanla };
