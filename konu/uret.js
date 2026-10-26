// Auto-production of one idea: folder → script (LLM) → web fact-check (LLM) → paid-tier recipe (LLM) →
// 💳 voice → word times → mix → 💳 stills → still review (LLM) → 💳 clips → render → frame review (LLM) →
// posting-queue job file. It reuses the repo's own scripts (uretim/*.js, kelime.py); nothing is re-implemented.
//
// Every step is recorded in videolar/<video>/uretim.json, so a rerun continues where the last one stopped.
// Spend gates: without `onay` the run stops at the first paid step and prints what it would cost.
// `onay` is true (CLI --onay: every paid step) or { ses: maxKarakter, gorsel: maxKredi, klip: maxKredi } (the panel:
// only the steps whose price the user saw, up to that price). A stop at a gate leaves uretim.json → bekleyen.
// Anything that needs a human (failed fact-check, bad stills, low review score, free tier scenes) stops the run
// and marks the idea "insan-bekliyor" with the reason.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const O = require('./ortak');
const LLM = require('./llm');
const H = require('./havuz');
const A = require('./otomasyon');

const rel = f => path.relative(O.KOK, f).split(path.sep).join('/');
const md = f => fs.readFileSync(path.join(O.KOK, f), 'utf8');

class Dur extends Error {                          // a planned stop (gate or human needed), not a crash
  constructor(tur, mesaj) { super(mesaj); this.name = 'Dur'; this.tur = tur; }   // tur: onay | butce | insan
}

// one "## N. ..." section of dersler/HATALAR.md
function bolum(metin, no) {
  const p = metin.split(/^## /m).find(b => b.startsWith(no + '.'));
  return p ? '## ' + p.trim() : '';
}

// ---- child processes (no shell: paths with spaces and Turkish letters stay intact)
function kos(komut, args, { yakala = false } = {}) {
  const r = spawnSync(komut, args, { cwd: O.KOK, encoding: 'utf8', stdio: yakala ? ['ignore', 'pipe', 'pipe'] : 'inherit', maxBuffer: 64 << 20 });
  if (r.error) throw new Dur('insan', `${path.basename(komut)} çalıştırılamadı: ${r.error.message}`);
  return { ok: r.status === 0, cikti: ((r.stdout || '') + (r.stderr || '')).trim() };
}
const node = (betik, args, o) => kos(process.execPath, [path.join(O.KOK, betik), ...args], o);
function python() {
  const p = path.join(O.KOK, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!fs.existsSync(p)) throw new Dur('insan', 'Python ortamı (.venv) yok: kelime zamanları çıkarılamıyor. kurulum/KURULUM.md adım 3.');
  return p;
}

// ---- time expressions in ucretli.json, checked against ses/zaman.json without exiting (cekirdek.fail would)
const IFADE = /^([a-z-]+)(?::([^@+-]+))?(?:@(\d+))?([+-][\d.]+)?$/;
const kNorm = s => String(s).toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/g, '');
function ifadeCoz(e, Z) {
  if (typeof e === 'number') return e;
  const m = String(e).match(IFADE); if (!m) return null;
  const [, tur, a, satir, ofs] = m, o = ofs ? +ofs : 0, L = Z.satirlar;
  if (tur === 'satir') return L[+a] ? L[+a].bas + o : null;
  if (tur === 'satir-sonu') return L[+a] ? L[+a].son + o : null;
  if (tur === 'kelime') { const after = satir ? (L[+satir] || {}).bas : 0; if (after == null) return null; const k = Z.kelimeler.find(x => x.a >= after - .01 && kNorm(x.w).startsWith(kNorm(a))); return k ? k.a + o : null; }
  if (tur === 'anons') return Z.chime[+a] != null ? Z.chime[+a] + o : null;
  if (tur === 'sting') return Z.sting[+a] != null ? Z.sting[+a] + o : null;
  if (tur === 'son') return Z.toplam + o;
  return null;
}
// A word cue Whisper did not hear (split/joined words) falls back to the start of its line. Returns the notes.
// template data (simulasyon.json): unknown word cues fall back to the line, steps are kept in time order
function simIpucuOnar(S, Z) {
  const notlar = [];
  for (const a of S.adimlar || []) {
    if (a.an == null || ifadeCoz(a.an, Z) != null) continue;
    const m = String(a.an).match(IFADE), satir = m && m[3] != null ? +m[3] : 0;
    notlar.push(`"${a.an}" bulunamadı → "satir:${satir}+0.5"`);
    a.an = `satir:${satir}+0.5`;
  }
  S.adimlar = (S.adimlar || []).filter(a => ifadeCoz(a.an, Z) != null).sort((x, y) => ifadeCoz(x.an, Z) - ifadeCoz(y.an, Z));
  return notlar;
}
function simKontrol(S) {
  const s = [];
  if (!Array.isArray(S.adimlar) || S.adimlar.length < 3) s.push('en az 3 adım gerekli');
  const cetvel = S.zaman_cetveli || [];
  for (const [i, a] of (S.adimlar || []).entries()) {
    if (!a.an) s.push(`adım ${i}: an yok`);
    if (a.yil && cetvel.length && !cetvel.includes(a.yil)) s.push(`adım ${i}: yil "${a.yil}" cetvelde yok`);
    if (a.odak && !['genel', 'gok', 'kiyi', 'yuzey', 'deniz', 'dip'].includes(a.odak)) s.push(`adım ${i}: odak "${a.odak}" geçersiz`);
    if (a.kahraman) {
      if (!S.kahraman) s.push(`adım ${i}: kahraman adımı var ama en üstte "kahraman" tanımı yok`);
      if (!['deniz', 'yuzey', 'kiyi', 'balkon', 'kara', 'dip'].includes(a.kahraman.yer)) s.push(`adım ${i}: kahraman yeri "${a.kahraman.yer}" geçersiz`);
      if ((a.kahraman.yazi || '').length > 18) s.push(`adım ${i}: kahraman yazısı çok uzun, en fazla 18 karakter ("${a.kahraman.yazi}")`);
    }
  }
  return s;
}

function ipuclariniOnar(U, Z) {
  const notlar = [];
  const onar = (o, alan) => {
    if (o[alan] == null || ifadeCoz(o[alan], Z) != null) return;
    const m = String(o[alan]).match(IFADE), satir = m && m[3] != null ? +m[3] : 0;
    notlar.push(`"${o[alan]}" bulunamadı → "satir:${satir}"`);
    o[alan] = `satir:${satir}`;
  };
  for (const p of U.kurgu || []) ['kadar', 'baslat', 'an'].forEach(a => onar(p, a));
  for (const e of U.etiketler || []) ['bas', 'bit'].forEach(a => onar(e, a));
  let once = 0;
  for (const [i, p] of (U.kurgu || []).entries()) {
    const t = ifadeCoz(p.kadar, Z);
    if (!(t > once)) throw new Dur('insan', `ucretli.json kurgu parçası ${i} (${p.kadar}) bir öncekinden önce bitiyor. Kurgu sırasını elle düzelt.`);
    once = t;
  }
  return notlar;
}

// structural check of an LLM-written ucretli.json
function ucretliKontrol(U) {
  const G = new Set((U.gorseller || []).map(g => g.ad)), K = new Set((U.klipler || []).map(k => k.ad)), s = [];
  if (!G.size) s.push('hiç görsel yok');
  for (const g of U.gorseller || []) for (const r of g.referans || []) if (!G.has(r)) s.push(`${g.ad}: referans ${r} yok`);
  for (const k of U.klipler || []) if (!G.has(k.gorsel)) s.push(`klip ${k.ad}: görsel ${k.gorsel} yok`);
  for (const p of U.kurgu || []) {
    if (p.klip && !K.has(p.klip)) s.push(`kurgu: klip ${p.klip} yok`);
    if (p.gorsel && !G.has(p.gorsel)) s.push(`kurgu: görsel ${p.gorsel} yok`);
    if (p.gecis && !p.gecis.every(x => G.has(x))) s.push(`kurgu: geçiş ${p.gecis} eksik`);
    for (const a of ['kadar', 'baslat', 'an']) if (p[a] != null && typeof p[a] !== 'number' && !IFADE.test(p[a])) s.push(`kurgu: anlaşılmayan zaman "${p[a]}"`);
  }
  if (!(U.kurgu || []).length || U.kurgu[U.kurgu.length - 1].kadar !== 'son') s.push('kurgunun son parçası "son"a kadar sürmeli');
  return s;
}

// ---- metin.md from the script + verified fact table
function metinMd(m, dogrulama) {
  const s = [`# ${m.baslik} (metin v1, otomatik)`, '', `**Öncül:** ${m.oncul}`, '', '_Bu metni konu radarı yazdı ve bilgileri internette doğruladı. Ses üretmeden önce oku._', '', '---', ''];
  m.satirlar.forEach((x, i) => {
    s.push(`**[${i === 0 ? 'KANCA, ' : ''}${x.rol}]**`, x.metin.replace(/\[[^\]]+\]\s*/g, '').trim(), '');
    if (i === 0) s.push('**[MARKA SESİ]**', '');
  });
  s.push('---', '', '## Bilgi kontrolü', '', '| Cümle | Doğru mu | Kaynak / hesap |', '|---|---|---|');
  const isaret = { dogru: '✔', oncul: 'öncülün sonucu', saka: 'şaka (absürt)', yanlis: '✘', kaynaksiz: '? kaynak yok' };
  for (const b of dogrulama.bilgiler) s.push(`| ${String(b.cumle).replace(/\|/g, '/')} | ${isaret[b.durum] || b.durum} | ${[b.kaynak, b.not].filter(Boolean).join(' · ').replace(/\|/g, '/')} |`);
  return s.join('\n') + '\n';
}

function dogrulamaSorunlari(d) {
  const kotu = (d.bilgiler || []).filter(b => b.durum === 'yanlis' || b.durum === 'kaynaksiz');
  return [...kotu.map(b => `- "${b.cumle}": ${b.durum === 'yanlis' ? 'YANLIŞ' : 'kaynak bulunamadı'}. ${b.not || ''}`), ...(d.eksik || []).map(e => `- "${e.cumle}": bilgiler listesinde yok (${e.neden || 'doğrulanmamış iddia'})`)];
}

// ---- the run
async function uret(ctx, fikirId, { onay = false, otomatik = false, onayGerekli = true, neZaman = null, yaz = console.log, calistir } = {}) {
  const h = H.havuzOku(ctx);
  const fikir = H.fikirBul(h, fikirId);
  if (fikir.durum === 'reddedildi') O.hata('Bu fikir reddedilmiş. Önce seç: node konu/radar.js sec ' + ctx.kanal + ' ' + fikir.id);
  const oto = ctx.ayar.otomasyon || {}, katman = oto.katman || 'ucretli', llm = ctx.ayar.llm || {};
  const sor = (istem, o) => LLM.sor(istem, { ayar: llm, model: llm.model_metin, efor: llm.efor_metin || 'high', calistir, ...o });

  // 1. folder
  let dir;
  if (fikir.video && fs.existsSync(path.join(O.KOK, fikir.video))) dir = path.join(O.KOK, fikir.video);
  else {
    const vs = O.kanalVideolari(ctx.kanal), no = String((vs.length ? vs[vs.length - 1].no : 0) + 1).padStart(2, '0');
    const seri = new Set(O.seriKelimeleri(ctx));               // "evrendeki-butun-oksijen" would name every episode the same
    const ayirt = O.kelimeler(fikir.baslik).filter(w => !seri.has(w));
    dir = path.join(O.KOK, 'videolar', `${ctx.kanal}-v${no}-${O.slug((ayirt.length ? ayirt : O.kelimeler(fikir.baslik)).slice(0, 3).join(' '))}`);
    fs.mkdirSync(dir, { recursive: true });
    const sablon = path.join(O.KOK, 'videolar', '_sablon');
    for (const f of fs.readdirSync(sablon)) fs.copyFileSync(path.join(sablon, f), path.join(dir, f));
    fikir.video = rel(dir);
  }
  const ad = path.basename(dir), durumF = path.join(dir, 'uretim.json');
  const D = O.okuJson(durumF, { fikir: fikir.id, kanal: ctx.kanal, katman, baslangic: O.simdi().toISOString(), adimlar: {} });
  if (otomatik) D.otomatik = true;      // only runs started by automation are resumed by the scheduler
  const bitti = a => !!D.adimlar[a];
  const isaretle = (a, ek = {}) => { D.adimlar[a] = { zaman: O.simdi().toISOString(), ...ek }; if (D.bekleyen && D.bekleyen.adim === a) delete D.bekleyen; O.yazJson(durumF, D); };
  const izinli = (adim, miktar) => onay === true || (!!onay && typeof onay === 'object' && onay[adim] != null && miktar <= onay[adim]);
  const bekle = (adim, ek, mesaj) => { D.bekleyen = { adim, ...ek, zaman: O.simdi().toISOString() }; O.yazJson(durumF, D); return new Dur('onay', mesaj); };
  const kaydet = (durum, not) => { const h2 = H.havuzOku(ctx); const f2 = H.fikirBul(h2, fikir.id); f2.video = fikir.video; H.durumYap(h2, fikir.id, durum, not); H.havuzYaz(ctx, h2); };
  kaydet('uretiliyor', bitti('klasor') ? null : `üretim başladı: ${fikir.video}`);
  isaretle('klasor', { yol: fikir.video });
  yaz(`\nVideo klasörü: ${fikir.video}`);

  try {
    const videoF = path.join(dir, 'video.json'), ucretliF = path.join(dir, 'ucretli.json');
    // 2-3. script + fact-check (at most two fix rounds)
    if (!bitti('metin')) {
      const anl = ctx.kimlik.anlaticilar || [];
      if (!anl.length) throw new Dur('insan', 'kimlik.json → anlaticilar boş: ses için anlatıcı tanımlı değil.');
      const ana = anl[(O.kanalVideolari(ctx.kanal).length - 1) % anl.length] || anl[0];       // narrators take turns
      const { anlaticilar, tts, ...kimlikMetin } = ctx.kimlik;
      const ornekVideo = O.okuJson(path.join(O.KOK, 'videolar', 'oxygbio-v01-ucak', 'video.json'));
      const temel = {
        kimlik: kimlikMetin, metin_kurallari: md('dersler/METIN.md'), metin_hatalari: bolum(md('dersler/HATALAR.md'), 5),
        ornek_metin: md('videolar/oxygbio-v01-ucak/metin.md'), ornek_satirlar: ornekVideo.satirlar,
        fikir: { baslik: fikir.baslik, oncul: fikir.oncul, kanca: fikir.kanca, tirmanis: fikir.tirmanis, kapanis: fikir.kapanis, kaynaklar: fikir.kaynaklar.map(k => ({ baslik: k.baslik, url: k.url, dis_kaynak: k.dis_kaynak })) },
        roller: anl.map(a => `${a.ad} (${a.not || ''})`).join(', '), ana_rol: ana.ad,
      };
      let m, d, sorunlar = [];
      for (let tur = 0; tur < 3; tur++) {
        const duzeltme = sorunlar.length ? `## Önceki taslağın sorunları (düzelt)\n\nDoğrulayıcı şunları buldu. Yanlış bilgiyi doğrusuyla değiştir; kaynağı bulunamayanı metinden çıkar, yerine doğrulanabilir bir bilgi koy ya da satırı kısalt. Akışı bozma.\n\n${sorunlar.join('\n')}\n\nÖnceki taslak:\n${JSON.stringify({ satirlar: m.satirlar, bilgiler: m.bilgiler }, null, 1)}` : '';
        yaz(tur ? `Metin düzeltiliyor (tur ${tur + 1})…` : 'Metin yazılıyor…');
        m = await sor(LLM.istem('metin-yaz', { ...temel, duzeltme }), { is: 'metin-yaz' });
        if (!Array.isArray(m.satirlar) || m.satirlar.length < 3) throw new Dur('insan', 'Yapay zekâ geçerli metin yazamadı.');
        const roller = new Set(anl.map(a => a.ad));
        for (const s of m.satirlar) if (!roller.has(s.rol)) s.rol = ana.ad;
        yaz(`Bilgiler internette doğrulanıyor (${(m.bilgiler || []).length} bilgi)…`);
        d = await sor(LLM.istem('dogrula', { satirlar: m.satirlar, bilgiler: m.bilgiler || [] }), { is: 'dogrula', araclar: ['WebSearch', 'WebFetch'] });
        sorunlar = dogrulamaSorunlari(d);
        const say = s => (d.bilgiler || []).filter(b => b.durum === s).length;
        yaz(`  doğru ${say('dogru')} · öncül ${say('oncul')} · şaka ${say('saka')} · yanlış ${say('yanlis')} · kaynaksız ${say('kaynaksiz')} · listede olmayan ${(d.eksik || []).length}`);
        if (!sorunlar.length) break;
      }
      fs.writeFileSync(path.join(dir, 'metin.md'), metinMd(m, d));
      if (sorunlar.length) throw new Dur('insan', `Bilgi doğrulaması iki düzeltmeden sonra da geçmedi:\n${sorunlar.join('\n')}\nmetin.md'deki tabloya bak, metni elle düzelt.`);
      const kullanilan = [...new Set(m.satirlar.map(s => s.rol))];
      O.yazJson(videoF, {
        _aciklama: 'Konu radarı yazdı (konu/uret.js). Fikir: ' + fikir.id,
        kanal: `../../kanal/${ctx.kanal}/kimlik.json`, baslik: m.baslik,
        anlaticilar: Object.fromEntries(kullanilan.map(r => [r, anl.find(a => a.ad === r).elevenlabs_voice])),
        anons_rolleri: (m.anons_rolleri || []).filter(r => kullanilan.includes(r)), hiz: 1.15, duzeltme: {},
        satirlar: m.satirlar.map(s => ({ rol: s.rol, metin: s.metin })), aciklama_instagram: m.aciklama_instagram,
      });
      isaretle('metin', { bilgi: (d.bilgiler || []).length });
      yaz(`Metin hazır ve doğrulandı: ${rel(path.join(dir, 'metin.md'))}`);
    }
    const video = O.okuJson(videoF);

    // 4. paid-tier recipe
    if (katman === 'ucretli' && !bitti('ucretli_tarif')) {
      const butce = (oto.butce || {}).video_basi_kredi || 50;
      yaz('Görsel tarifi (ucretli.json) yazılıyor…');
      const ornek = O.okuJson(path.join(O.KOK, 'videolar', 'oxygbio-v01-ucak', 'ucretli.json'));
      let U = await sor(LLM.istem('ucretli-yaz', {
        renkler: ctx.kimlik.renkler || {}, satirlar: video.satirlar.map((s, i) => `${i}: ${s.metin}`).join('\n'), ornek,
        gorsel_hatalari: bolum(md('dersler/HATALAR.md'), 7), butce: String(butce), en_fazla_resim: '8', en_fazla_klip: String(Math.max(1, Math.floor((butce - 10) / 6))),
      }), { is: 'ucretli-yaz' });
      const s = ucretliKontrol(U);
      if (s.length) throw new Dur('insan', 'Yapay zekânın yazdığı ucretli.json tutarsız: ' + s.join('; '));
      U = { _aciklama: 'Konu radarı yazdı (konu/uret.js). Biçim: videolar/oxygbio-v01-ucak/ucretli.json', ...U, butce };
      O.yazJson(ucretliF, U);
      isaretle('ucretli_tarif', { gorsel: U.gorseller.length, klip: (U.klipler || []).length });
    }

    // 4b. free template recipe (the template draws; the model only fills in the data)
    const sablonAd = oto.sablon || 'simulasyon', simF = path.join(dir, 'simulasyon.json');
    if (katman === 'sablon' && !bitti('sablon_tarif')) {
      yaz(`Şablon verisi (${sablonAd}) yazılıyor…`);
      // the template's header comment is its manual
      const belge = fs.readFileSync(path.join(O.KOK, 'uretim', 'sablonlar', sablonAd + '.js'), 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.replace(/^\/\/ ?/, '')).join('\n');
      const ornekF = path.join(O.KOK, 'uretim', 'sablonlar', sablonAd + '-ornek.json');
      const S = await sor(LLM.istem('simulasyon-yaz', { sablon_belgesi: belge, ornek: fs.existsSync(ornekF) ? fs.readFileSync(ornekF, 'utf8') : '{}', satirlar: video.satirlar.map((x, i) => `${i}: ${x.metin}`).join('\n') }), { is: 'simulasyon-yaz' });
      const sk = simKontrol(S);
      if (sk.length) throw new Dur('insan', 'Yapay zekânın yazdığı simulasyon.json tutarsız: ' + sk.join('; '));
      O.yazJson(simF, S);
      O.yazJson(videoF, { ...O.okuJson(videoF), sablon: sablonAd });
      isaretle('sablon_tarif', { adim: S.adimlar.length });
    }

    // 5. 💳 voice
    const sesDir = path.join(dir, 'ses');
    if (!bitti('ses')) {
      const eksik = video.satirlar.filter((s, i) => !fs.existsSync(path.join(sesDir, `${String(i + 1).padStart(2, '0')}-${s.rol}.mp3`)));
      const karakter = eksik.reduce((a, s) => a + s.metin.length, 0);
      yaz(`\n💳 SES: ${eksik.length} satır, ~${karakter} ElevenLabs karakteri.`);
      const sesBilgi = node('uretim/ses.js', [dir], { yakala: true });
      if (sesBilgi.cikti) yaz(sesBilgi.cikti.split('\n').map(l => '   ' + l).join('\n'));
      let krediTahmin = null;
      if (katman === 'ucretli') {
        const U = O.okuJson(ucretliF), klipSn = (U.klipler || []).reduce((a, k) => a + (k.sure || 5), 0);
        krediTahmin = Math.round(U.gorseller.length * 1.1 + klipSn);
        yaz(`💳 GÖRÜNTÜ (tahmin): ${U.gorseller.length} resim ~${(U.gorseller.length * 1.1).toFixed(0)} kredi + ${(U.klipler || []).length} klip (${klipSn} sn) ~${klipSn} kredi. Video bütçesi: ${U.butce} kredi. Kesin fiyat her adımda Higgsfield'dan alınır.`);
      }
      const izin = A.harcamaIzni(ctx, 'karakter', karakter, { otomatik });
      if (!izin.izin) throw new Dur(otomatik ? 'butce' : 'onay', izin.neden);
      if (!izinli('ses', karakter)) throw bekle('ses', { karakter, satir: eksik.length, kredi_tahmin: krediTahmin }, `Hiçbir şey harcanmadı. Önce metni oku: ${rel(path.join(dir, 'metin.md'))}\nBeğendiysen devam: node konu/radar.js uret ${ctx.kanal} ${fikir.id} --onay`);
      if (karakter) {
        if (!sesBilgi.ok) throw new Dur('insan', 'ses.js çalışmadı (anahtar ya da kota). Çıktı yukarıda.');
        const r = node('uretim/ses.js', [dir, '--onay']);
        if (!r.ok) throw new Dur('insan', 'Ses üretimi yarıda kaldı (ElevenLabs). Çıktı yukarıda; tekrar çalıştırınca eksik satırlardan devam eder.');
        O.harcamaYaz(ctx, 'karakter', karakter, ad);
        if (!O.satirlarOku(path.join(ctx.kayit, 'harcama.jsonl')).some(x => x.tur === 'video' && x.video === ad)) O.harcamaYaz(ctx, 'video', 1, ad);
      }
      isaretle('ses', { karakter });
    }

    // 6-7. word times + mix (free)
    if (!bitti('kelime')) { yaz('\nKelime zamanları (Whisper)…'); if (!kos(python(), [path.join(O.KOK, 'uretim', 'kelime.py'), dir]).ok) throw new Dur('insan', 'kelime.py başarısız (çıktı yukarıda).'); isaretle('kelime'); }
    if (!bitti('mix')) { yaz('\nSes karışımı…'); if (!node('uretim/mix.js', [dir]).ok) throw new Dur('insan', 'mix.js başarısız (çıktı yukarıda).'); isaretle('mix'); }

    if (katman !== 'ucretli' && katman !== 'sablon') throw new Dur('insan', 'Ücretsiz katman seçili: sahneler.js (kodla animasyon) otomatik yazılmıyor, çünkü kare kare bakıp düzeltmeden güvenilir çıkmıyor. Ajan ya da insan sahneler.js yazmalı (uretim/TARIF.md 5a). Ses hazır.');

    // 8. repair word cues against what Whisper actually heard
    const Z = O.okuJson(path.join(sesDir, 'zaman.json'));
    if (katman === 'sablon' && !bitti('ipucu')) {
      const S = O.okuJson(simF), notlar = simIpucuOnar(S, Z);
      O.yazJson(simF, S);
      if (notlar.length) yaz('Zaman ipuçları onarıldı: ' + notlar.join('; '));
      isaretle('ipucu', { onarilan: notlar.length });
    }
    const U = katman === 'ucretli' ? O.okuJson(ucretliF) : null;
    if (katman === 'ucretli' && !bitti('ipucu')) {
      const notlar = ipuclariniOnar(U, Z);
      if (notlar.length) { O.yazJson(ucretliF, U); yaz('Zaman ipuçları onarıldı: ' + notlar.join('; ')); }
      isaretle('ipucu', { onarilan: notlar.length });
    }

    // 9-11. 💳 stills → review → 💳 clips
    for (const adim of katman === 'ucretli' ? ['gorsel', 'klip'] : []) {
      if (bitti(adim)) continue;
      const fiyat = node('uretim/ucretli.js', [dir, adim], { yakala: true });
      yaz(`\n💳 ${adim === 'gorsel' ? 'RESİMLER' : 'KLİPLER'}:\n` + fiyat.cikti.split('\n').map(l => '   ' + l).join('\n'));
      const m = fiyat.cikti.match(/Bu adım: ([\d.]+) kredi/);
      if (!fiyat.ok) throw new Dur('insan', `Higgsfield fiyatı alınamadı (${adim}). Çıktı yukarıda.`);
      if (!m && !/hazır/.test(fiyat.cikti)) throw new Dur('insan', `Higgsfield fiyatı okunamadı (${adim}); ucretli.js çıktısının biçimi değişmiş olabilir.`);
      const kredi = m ? +m[1] : 0;
      if (kredi) {
        const izin = A.harcamaIzni(ctx, 'kredi', kredi, { otomatik });
        if (!izin.izin) throw new Dur(otomatik ? 'butce' : 'onay', izin.neden);
        if (!izinli(adim, kredi)) throw bekle(adim, { kredi, butce: U.butce }, `Hiçbir şey harcanmadı. Devam: node konu/radar.js uret ${ctx.kanal} ${fikir.id} --onay`);
        const r = node('uretim/ucretli.js', [dir, adim, '--onay']);
        O.harcamaYaz(ctx, 'kredi', kredi, ad);              // logged even on partial failure: credits may be gone
        if (!r.ok) throw new Dur('insan', `${adim} üretimi başarısız (çıktı yukarıda).`);
      }
      if (adim === 'gorsel') {
        const sayfa = path.join(dir, 'ucretli', 'gorseller.jpg');
        if (fs.existsSync(sayfa)) {
          yaz('Resimler kontrol ediliyor (klipten önce)…');
          const g = await sor(LLM.istem('gorsel-denetim', { sayfa: path.resolve(sayfa), gorseller: U.gorseller.map((x, i) => `${i + 1}. ${x.ad}: ${x.istem}`).join('\n') }), { is: 'gorsel-denetim', resimler: [sayfa], efor: 'medium' });
          const agir = (g.sorunlar || []).filter(s => s.agirlik !== 'dusuk');
          if (agir.length) throw new Dur('insan', 'Resimlerde sorun var, klip üretilmedi:\n' + agir.map(s => `- ${s.ad}: ${s.sorun}`).join('\n') + `\nKötü resmi ${rel(path.join(dir, 'ucretli', 'gorsel'))} içinden sil ve tekrar çalıştır (yalnız o resim yeniden üretilir).`);
        }
      }
      isaretle(adim, { kredi });
    }

    // 12. render
    const mp4 = path.join(dir, 'cikti', `${ad}-${katman === 'ucretli' ? 'ucretli' : 'ucretsiz'}.mp4`);
    if (!bitti('render') || !fs.existsSync(mp4)) {
      yaz('\nRender…');
      const r = katman === 'ucretli' ? node('uretim/ucretli.js', [dir, 'kurgu', '--render']) : node('uretim/kurgu.js', [dir, '--render']);
      if (!r.ok) throw new Dur('insan', 'Render başarısız (çıktı yukarıda).');
      isaretle('render');
    }

    // 13. frame review (denetim/kare-denetci.md rules)
    if (!bitti('denetim')) {
      const ddir = path.join(dir, 'cikti', 'denetim');
      fs.mkdirSync(ddir, { recursive: true });
      for (const f of fs.readdirSync(ddir)) if (/^sayfa-\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(ddir, f));   // our own old sheets
      const kr = kos('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp4, '-vf', 'fps=1,scale=360:-1,tile=4x3:padding=8:color=0x222222', '-start_number', '1', path.join(ddir, 'sayfa-%02d.jpg')]);
      if (!kr.ok) throw new Dur('insan', 'Kare sayfaları çıkarılamadı (ffmpeg).');
      const sayfalar = fs.readdirSync(ddir).filter(f => /^sayfa-\d+\.jpg$/.test(f)).sort().map(f => path.join(ddir, f));
      yaz(`Denetçi ${sayfalar.length} kare sayfasına bakıyor…`);
      const metin = await sor(LLM.istem('video-denetim', {
        denetci: md('denetim/kare-denetci.md'), sayfalar: sayfalar.map((f, i) => `sayfa ${i + 1}: ${f}`).join('\n'),
        satirlar: video.satirlar.map((s, i) => `${i}: ${s.metin}`).join('\n'), sure: String(Math.round(Z.toplam)),
      }), { is: 'video-denetim', resimler: sayfalar, json: false, efor: 'high' });
      fs.writeFileSync(path.join(ddir, 'rapor.md'), `# Denetim raporu (otomatik)\n\n${metin}\n`);
      const j = LLM.jsonCikar(metin), esik = oto.denetim_esik ?? 7;
      isaretle('denetim', { puan: j.puan });
      if (!(j.puan >= esik)) throw new Dur('insan', `Denetim puanı ${j.puan}/10, eşik ${esik}. Rapor: ${rel(path.join(ddir, 'rapor.md'))}. Bulguları karelerle doğrula, düzelt, sonra devam et.`);
      yaz(`Denetim puanı ${j.puan}/10 (eşik ${esik}).`);
    }

    // 14. hand-off to the posting queue (kuyruk/ is built separately; we only drop the job file)
    // yayinDk: the job is timed N minutes after the video is finished (otherwise the queue picks the next free slot)
    const is = kuyrugaYaz({ video: rel(dir), mp4: rel(mp4), aciklama: video.aciklama_instagram || video.baslik, onayGerekli, neZaman: typeof neZaman === 'number' ? new Date(Date.now() + neZaman * 60e3).toISOString() : neZaman });
    isaretle('kuyruk', { is: rel(is) });
    kaydet('uretildi', `video hazır, kuyrukta: ${rel(is)}${onayGerekli ? ' (paylaşım için onay bekliyor)' : ' (onaysız, tam otomatik)'}`);
    yaz(`\nHAZIR: ${rel(mp4)}\nKuyruk işi: ${rel(is)}${onayGerekli ? '\nPaylaşılmadan önce videoyu izle ve onayla.' : ''}`);
    return { durum: 'uretildi', dir, mp4, is };
  } catch (e) {
    if (!(e instanceof Dur)) { kaydet('insan-bekliyor', 'beklenmeyen hata: ' + e.message); throw e; }
    if (e.tur === 'onay') { kaydet('uretiliyor', null); yaz('\n⏸  ' + e.message); return { durum: 'onay-bekliyor', dir }; }
    if (e.tur === 'butce') { kaydet('uretiliyor', 'bütçe bekleniyor: ' + e.message); yaz('\n⏸  BÜTÇE: ' + e.message); return { durum: 'butce-bekliyor', dir, neden: e.message }; }
    kaydet('insan-bekliyor', e.message);
    yaz('\n✋ İNSAN GEREKİYOR: ' + e.message);
    return { durum: 'insan-bekliyor', dir, neden: e.message };
  }
}

// Posting queue contract: kuyruk/bekleyen/<YYYYMMDD-HHMM>-<video-adi>.json
function kuyrugaYaz({ video, mp4, aciklama, onayGerekli, neZaman = null }, kok = O.KOK) {
  const d = path.join(kok, 'kuyruk', 'bekleyen');
  fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, `${O.damga()}-${path.basename(video)}.json`);
  O.yazJson(f, { video, mp4, aciklama, ne_zaman: neZaman, kaynak: 'konu-radari', onay_gerekli: !!onayGerekli });
  return f;
}

module.exports = { uret, kuyrugaYaz, ipuclariniOnar, ifadeCoz, ucretliKontrol, metinMd, dogrulamaSorunlari, bolum, Dur };
