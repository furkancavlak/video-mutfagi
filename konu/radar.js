#!/usr/bin/env node
// Topic radar: finds interesting topics on forums and trend pages, scores them against the channel identity,
// keeps an idea pool, and (only if the channel allows it) turns qualifying ideas into finished videos.
//
//   node konu/radar.js topla    <kanal>                 collect topics from the enabled sites (free)
//   node konu/radar.js puanla   <kanal>                 score new topics, write ideas (language model)
//   node konu/radar.js fikirler <kanal> [--hepsi]       list the idea pool (+ kanal/<kanal>/fikirler.md/.html)
//   node konu/radar.js sec      <kanal> <fikir-id>      mark an idea as chosen   (reddet: rejected)
//   node konu/radar.js ekle     <kanal> --baslik "..." [--oncul "..."]   put your own idea in the pool (already chosen)
//   node konu/radar.js uret     <kanal> <fikir-id> [--onay] [--yayin-dk N] [--onaysiz-paylas] [--not "..."]
//                               --not: rewrite the script with the reader's note (only before the voice)
//                               produce a video; without --onay it stops at the first paid step.
//                               --yayin-dk N: queue it N minutes after it is finished · --onaysiz-paylas: no extra posting approval
//   node konu/radar.js calistir <kanal> [--tam-otomatik]      one scheduled round, following konu.json → otomasyon
//   node konu/radar.js durum    <kanal>                 policy, budget use, pool counts
//
// Docs: konu/BENIOKU.md
const path = require('path');
const O = require('./ortak');

const [komut, kanal, ...rest] = process.argv.slice(2);
const bayrak = n => rest.includes(n);
const deger = n => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : null; };
const yaz = (...a) => console.log(...a);

function yardim() {
  yaz(`Konu radarı — kullanım:
  node konu/radar.js topla    <kanal>              siteleri tara (ücretsiz)
  node konu/radar.js puanla   <kanal>              yeni konuları puanla, fikir yaz (yapay zekâ)
  node konu/radar.js fikirler <kanal> [--hepsi]    fikir havuzunu göster
  node konu/radar.js sec      <kanal> <fikir-id>   fikri seç      (reddet: reddet)
  node konu/radar.js ekle     <kanal> --baslik "..." [--oncul "..."]   kendi fikrini havuza koy
  node konu/radar.js uret     <kanal> <fikir-id> [--onay] [--yayin-dk 10] [--onaysiz-paylas] [--not "..."]
                              --not "...": metni beğenmediysen notunla yeniden yazdır (sesten önce)
                              --yayin-dk N: video bitince N dk sonrasına kuyruğa koy
                              --onaysiz-paylas: paylaşım için ayrıca onay bekleme
  node konu/radar.js calistir <kanal> [--tam-otomatik]   zamanlayıcı için tek giriş
  node konu/radar.js durum    <kanal>
Ayrıntı: konu/BENIOKU.md`);
}

function fikirTablosu(ctx, h, hepsi) {
  const H = require('./havuz');
  const liste = H.sirala(h.fikirler).filter(f => hepsi || !['reddedildi', 'uretildi'].includes(f.durum));
  if (!liste.length) { yaz('Havuz boş. Önce: node konu/radar.js topla ' + ctx.kanal + ' && node konu/radar.js puanla ' + ctx.kanal); return; }
  yaz(`\n${'PUAN'.padEnd(5)} ${'ID'.padEnd(11)} ${'DURUM'.padEnd(15)} FİKİR  (kaynak)`);
  for (const f of liste) yaz(`${(f.puan ?? 0).toFixed(1).padEnd(5)} ${f.id.padEnd(11)} ${f.durum.padEnd(15)} ${f.baslik}  (${[...new Set(f.kaynaklar.map(k => k.kaynak))].join(', ')})`);
  if ((h.ham_konular || []).length) yaz(`\n+ ${h.ham_konular.length} ham konu (yapay zekâsı kapatılmış kaynaktan), fikirler.md'nin sonunda.`);
  yaz(`\nOkunaklı liste: ${path.relative(process.cwd(), path.join(ctx.dir, 'fikirler.html'))}`);
}

async function toplaVePuanla(ctx) {
  const T = require('./topla'), P = require('./puan');
  yaz(`\n[${ctx.kanal}] Konular toplanıyor…`);
  const t = await T.topla(ctx, { yaz });
  yaz(`${t.ogeler.length} konu → ${path.relative(O.KOK, t.dosya)}`);
  yaz(`\n[${ctx.kanal}] Puanlanıyor…`);
  const r = await P.puanla(ctx, { ogeler: T.sonHamlar(ctx), yaz });
  yaz(`${r.eklenen} yeni fikir, ${r.birlesen} fikir mevcut olanla birleşti.`);
  return { t, r };
}

async function calistir(ctx) {
  const A = require('./otomasyon'), H = require('./havuz'), { uret } = require('./uret');
  const p = A.politika(ctx, { tamBayrak: bayrak('--tam-otomatik') });
  for (const u of p.uyarilar) yaz('\n⚠ ' + u);
  const ozet = { zaman: O.simdi().toISOString(), seviye: p.etkin, uretilen: [] };
  if (p.etkin === 'kapali') { yaz(`[${ctx.kanal}] Otomasyon kapalı (konu.json → otomasyon.seviye). Hiçbir şey yapılmadı.`); return; }
  const birak = O.kilitAl(ctx, 'calistir');
  try {
    try { const { t, r } = await toplaVePuanla(ctx); Object.assign(ozet, { konu: t.ogeler.length, yeni_fikir: r.eklenen }); }
    catch (e) { yaz('Puanlama yapılamadı: ' + e.message); ozet.hata = e.message; }
    if (p.etkin === 'uret' || p.etkin === 'tam') {
      const b = A.butceDurumu(ctx);
      let kalan = b.video.gunSinir - b.video.gun;
      const h = H.havuzOku(ctx);
      // first finish what automation already started (e.g. waited for budget), then new qualifying ideas
      const yarim = h.fikirler.filter(f => f.durum === 'uretiliyor' && f.video && O.okuJson(path.join(O.KOK, f.video, 'uretim.json'), {}).otomatik);
      const yeni = A.uygunFikirler(ctx, h);
      yaz(`\nOtomasyon (${p.etkin}): ${yarim.length} yarım, ${yeni.length} eşiği geçen fikir. Bugün üretilebilecek video: ${Math.max(0, kalan)}.`);
      for (const f of [...yarim, ...yeni]) {
        const yarimMi = yarim.includes(f);
        if (!yarimMi && kalan <= 0) { yaz('Günlük video sınırı doldu.'); break; }
        yaz(`\n▶ ${f.id} ${f.baslik} (puan ${f.puan})`);
        const r = await uret(ctx, f.id, { onay: true, otomatik: true, onayGerekli: p.onayGerekli, yaz });
        ozet.uretilen.push({ fikir: f.id, durum: r.durum });
        if (!yarimMi) kalan--;
        if (r.durum === 'butce-bekliyor') break;          // the rest would hit the same cap
      }
    }
  } finally { birak(); }
  O.satirEkle(path.join(ctx.kayit, 'calismalar.jsonl'), ozet);
  yaz(`\nTur bitti. Fikirler: ${path.relative(process.cwd(), path.join(ctx.dir, 'fikirler.html'))}`);
}

function durum(ctx) {
  const A = require('./otomasyon'), H = require('./havuz');
  const p = A.politika(ctx, { tamBayrak: bayrak('--tam-otomatik') }), e = A.esikler(ctx), b = A.butceDurumu(ctx), h = H.havuzOku(ctx);
  const sayi = H.DURUMLAR.map(d => `${d} ${h.fikirler.filter(f => f.durum === d).length}`).join(' · ');
  const sinir = (x, s) => s ? `${x}/${s}` : `${x} (sınır yok${p.etkin === 'uret' || p.etkin === 'tam' ? ', otomasyon harcamaz' : ''})`;
  const kaynaklar = Object.entries(ctx.ayar.kaynaklar || {}).map(([k, v]) => `${k}${v.aktif ? '' : ' (kapalı)'}`).join(', ');
  const son = O.satirlarOku(path.join(ctx.kayit, 'calismalar.jsonl')).pop();
  yaz(`[${ctx.kanal}] Otomasyon: ${p.seviye}${p.etkin !== p.seviye ? ` → şu an ${p.etkin}` : ''}
Kaynaklar: ${kaynaklar}
Eşik: puan ≥ ${e.puan}, kaynak ilgisi ≥ ${e.etkilesim_min}${Object.keys(e.kaynak_metrik).length ? ', ' + JSON.stringify(e.kaynak_metrik) : ''}
Bugün: video ${sinir(b.video.gun, b.video.gunSinir)} · kredi ${sinir(b.kredi.gun, b.kredi.gunSinir)} · karakter ${sinir(b.karakter.gun, b.karakter.gunSinir)}
Bu ay: kredi ${sinir(b.kredi.ay, b.kredi.aySinir)} · karakter ${sinir(b.karakter.ay, b.karakter.aySinir)}
Havuz: ${sayi}
Son tur: ${son ? `${son.zaman} (${son.seviye})${son.hata ? ' HATA: ' + son.hata : ''}` : 'yok'}`);
  for (const u of p.uyarilar) yaz('⚠ ' + u);
}

(async () => {
  if (!komut || ['-h', '--help', 'yardim'].includes(komut)) return yardim();
  const ctx = O.kanalYukle(kanal);
  if (komut === 'topla') { const T = require('./topla'); const t = await T.topla(ctx, { yaz }); yaz(`\n${t.ogeler.length} konu kaydedildi: ${path.relative(O.KOK, t.dosya)}\nSıradaki: node konu/radar.js puanla ${ctx.kanal}`); }
  else if (komut === 'puanla') {
    const T = require('./topla'), P = require('./puan');
    const og = T.sonHamlar(ctx);
    if (!og.length) O.hata('Son 48 saatte toplanmış konu yok. Önce: node konu/radar.js topla ' + ctx.kanal);
    const r = await P.puanla(ctx, { ogeler: og, yaz });
    yaz(`\n${r.eklenen} yeni fikir, ${r.birlesen} fikir mevcut olanla birleşti.`);
    fikirTablosu(ctx, require('./havuz').havuzOku(ctx), false);
  }
  else if (komut === 'fikirler') { const H = require('./havuz'); const h = H.havuzOku(ctx); H.raporYaz(ctx, h); fikirTablosu(ctx, h, bayrak('--hepsi')); }
  else if (komut === 'sec' || komut === 'reddet') {
    const H = require('./havuz'), h = H.havuzOku(ctx);
    const f = H.durumYap(h, rest[0], komut === 'sec' ? 'secildi' : 'reddedildi', deger('--not') || (komut === 'sec' ? 'seçildi' : 'reddedildi'));
    H.havuzYaz(ctx, h); yaz(`${f.id} → ${f.durum}: ${f.baslik}`);
  }
  else if (komut === 'ekle') {
    const H = require('./havuz'), h = H.havuzOku(ctx), baslik = deger('--baslik');
    if (!baslik) O.hata('fikrin başlığını ver: --baslik "Denizde oksijen biterse 1000 yıl sonra ne olur?"');
    const f = { baslik, oncul: deger('--oncul') || '', kanca: '', tirmanis: [], kapanis: '', neden_uyar: 'kanal sahibi elle ekledi', durum: 'secildi', puan: 10, puan_detay: { elle: true },
      kaynaklar: [{ kaynak: 'elle', baslik, url: '' }], olusturma: O.simdi().toISOString() };
    const r = H.fikirEkle(h, [f]); H.havuzYaz(ctx, h);
    const son = r.eklenen ? h.fikirler[h.fikirler.length - 1] : H.esiniBul(h, f);
    yaz(`${r.eklenen ? 'Eklendi' : 'Benzeri zaten var'}: ${son.id} — ${son.baslik}
Üretmek için: node konu/radar.js uret ${ctx.kanal} ${son.id}`);
  }
  else if (komut === 'uret') {
    if (!rest[0]) O.hata('fikir kimliğini ver. Örnek: node konu/radar.js uret ' + ctx.kanal + ' f-1a2b3c4d');
    const birak = O.kilitAl(ctx, 'uret ' + rest[0]);
    const dk = deger('--yayin-dk');
    try { await require('./uret').uret(ctx, rest[0], { onay: bayrak('--onay'), otomatik: false, onayGerekli: !bayrak('--onaysiz-paylas'), neZaman: dk ? +dk : null, not: deger('--not'), yaz }); } finally { birak(); }
  }
  else if (komut === 'calistir') await calistir(ctx);
  else if (komut === 'durum') durum(ctx);
  else { yaz(`Bilinmeyen komut: ${komut}\n`); yardim(); process.exitCode = 1; }
})().catch(e => {
  console.error('\nHATA: ' + e.message + (e.name === 'KonuHatasi' || e.name === 'LlmHatasi' ? '' : '\n' + e.stack));
  process.exit(1);
});
