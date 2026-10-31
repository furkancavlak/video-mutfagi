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
//
// `hazir` (a ready script, e.g. a story episode from dizi/): {ad, baslik?, satirlar:[{rol, metin}], anlaticilar:{rol: voiceId},
// video_ek:{...extra video.json fields}, aciklama_instagram, hiz?}. The folder is videolar/<kanal>-<ad>/ under `kok`, the
// idea pool and the script stage are skipped, video.json comes from `hazir`; every later stage is the same.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const O = require('./ortak');
const LLM = require('./llm');
const Kut = require('../uretim/kutuphane');
const H = require('./havuz');
const A = require('./otomasyon');
const ESYA = require('../uretim/sablonlar/esya');

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
  // a prop's own word cue that Whisper did not hear: the prop comes with its step instead
  for (const a of S.adimlar || []) for (const e of [].concat(a.esya || [])) if (e && e.an != null && ifadeCoz(e.an, Z) == null) { notlar.push(`eşya "${e.an}" bulunamadı → adımla birlikte`); delete e.an; }
  for (const a of S.adimlar || []) {
    if (a.an == null || ifadeCoz(a.an, Z) != null) continue;
    const m = String(a.an).match(IFADE), satir = m && m[3] != null ? +m[3] : 0;
    notlar.push(`"${a.an}" bulunamadı → "satir:${satir}+0.5"`);
    a.an = `satir:${satir}+0.5`;
  }
  S.adimlar = (S.adimlar || []).filter(a => ifadeCoz(a.an, Z) != null).sort((x, y) => ifadeCoz(x.an, Z) - ifadeCoz(y.an, Z));
  return notlar;
}
// props the template does not know are dropped (the step keeps its other fields); returns the notes
function simEsyaOnar(S) {
  const notlar = [];
  for (const a of S.adimlar || []) {
    if (a.esya == null) continue;
    const liste = [].concat(a.esya).filter(e => {
      const ok = e && typeof e === 'object' && ESYA.cozumle({ ...e, tur: e.ad || e.tur });
      if (!ok) notlar.push(`bilinmeyen eşya "${e && (e.ad || e.tur)}" çıkarıldı`);
      return ok;
    });
    if (!liste.length) delete a.esya; else a.esya = liste.length === 1 ? liste[0] : liste;
  }
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
    const esya = [].concat(a.esya || []);
    if (esya.length > 2) s.push(`adım ${i}: en fazla iki eşya`);
    for (const e of esya) if ([...String((e && e.yazi) || '')].length > 16) s.push(`adım ${i}: eşya yazısı çok uzun, en fazla 16 karakter ("${e.yazi}")`);
    if (a.kahraman) {
      if (!S.kahraman) s.push(`adım ${i}: kahraman adımı var ama en üstte "kahraman" tanımı yok`);
      if (!['deniz', 'yuzey', 'kiyi', 'balkon', 'kara', 'dip', 'esya'].includes(a.kahraman.yer)) s.push(`adım ${i}: kahraman yeri "${a.kahraman.yer}" geçersiz`);
      if (a.kahraman.yer === 'esya' && !esya.some(e => { const c = e && ESYA.cozumle({ ...e, tur: e.ad || e.tur }); return c && ESYA.ESYA[c.tur].koltuk; })) s.push(`adım ${i}: kahraman eşyada oturuyor ama adımda oturulacak eşya yok (dolmus, tekne, apartman, belediye, fabrika)`);
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

// Video length is a channel setting: konu.json → otomasyon.sure_sn [min, max] (default 60-80 s). About 14 characters
// a second (the approved sample: 1,070 characters, 76 s); the narrator's voice budget follows from it.
function sureAyari(sure = [60, 80]) {
  const [a, b] = Array.isArray(sure) ? sure : [sure, sure], yuvarla = x => Math.round(x / 50) * 50;
  return { sure: `${a}-${b}`, sure_ust: String(b), karakter: `${yuvarla(a * 14.5)}-${yuvarla(b * 14.5)}`, satir_sayisi: `${Math.max(4, Math.round(a / 10))}-${Math.max(5, Math.round(b / 9))}` };
}

// ---- formul layer helpers
// the scene file is the longest answer of the run: a long episode took the CLI past its 15 min default (30.10.2026)
const sahneZamanAsimi = llm => ((llm && +llm.sahne_zaman_asimi_dk > 0) ? +llm.sahne_zaman_asimi_dk : 45) * 60e3;
// the ```js block of a model answer (the longest one that exports a function); null if none
function kodCikar(metin) {
  const bloklar = [...String(metin).matchAll(/```(?:js|javascript)?[ \t]*\r?\n([\s\S]*?)```/g)].map(m => m[1]).filter(k => /module\.exports\s*=/.test(k));
  return bloklar.length ? bloklar.sort((a, b) => b.length - a.length)[0].trim() + '\n' : null;
}
// ---- formul scene stage, chunked: konu.json llm.sahne_parca (chunks, default 4), llm.paralel (calls at once, default 3),
// llm.sahne_tur (rounds, default 2), llm.model_denetim (still reviewer model, default model_metin)
const sahneAyari = llm => ({
  parcalar: Math.max(1, Math.min(8, Math.round(+((llm || {}).sahne_parca ?? 4)) || 1)),
  paralel: Math.max(1, Math.round(+((llm || {}).paralel ?? 3)) || 1),
  turlar: Math.max(1, Math.round(+((llm || {}).sahne_tur ?? 2)) || 1),
});
// consecutive lines -> n chunks of near-equal duration; chunk k is drawn from `bas` to `son` (the next chunk's bas, the
// closing card or the end): [{k, satirlar: [i..], bas, son}]
function parcala(Z, n) {
  const S = Z.satirlar, N = Math.max(1, Math.min(n, S.length));
  const sonT = Z.kapanis != null ? Z.kapanis : Z.toplam, t0 = S[0].bas, top = S[S.length - 1].son - t0;
  const gruplar = [];
  S.forEach((s, i) => {
    const acilacak = N - gruplar.length, g = gruplar[gruplar.length - 1];
    // a new chunk starts when this line passes the next k/N time mark, or when every line left must open one
    if (!g || (acilacak > 0 && (S.length - i <= acilacak || s.bas - t0 >= top * gruplar.length / N))) gruplar.push([i]);
    else g.push(i);
  });
  return gruplar.map((satirlar, k) => ({ k, satirlar, bas: k ? S[satirlar[0]].bas : 0, son: k < gruplar.length - 1 ? S[gruplar[k + 1][0]].bas : sonT }));
}
function parcaIstemi(P, p, satirMetni) {
  if (P.length === 1) return '';
  const ilk = p.satirlar[0], son = p.satirlar[p.satirlar.length - 1], f = x => x.toFixed(2);
  return `## Bu dosya videonun yalnız bir parçası (parça ${p.k + 1}/${P.length})\n\n` +
    `Video ${P.length} parçaya bölündü; her parçayı ayrı bir yönetmen aynı anda çiziyor, dosyalar sonra sırayla çalıştırılıp birleştirilir. ` +
    `Sen yalnız **${ilk === son ? `${ilk}. satırı` : `${ilk}-${son}. satırları`}** çiz. İlk sahnen tam ${f(p.bas)} sn'de başlar, son sahnen tam ${f(p.son)} sn'de biter (sert kesme). ` +
    `M.kesmeler'i yalnız bu aralığın sınırlarıyla çağır (ilki ${f(p.bas)}, sonuncusu ${f(p.son)}). Bütün id'lere \`p${p.k + 1}-\` öneki koy. Başka satırların sahnesini çizme; anlatıcı ve renkler öbür parçalarla aynı kalsın.\n\n` +
    (p.k ? `Önceki parçanın son satırı (geçiş için bil, çizme): ${satirMetni(P[p.k - 1].satirlar[P[p.k - 1].satirlar.length - 1], false)}\n` : 'Bu ilk parça: video bununla açılır.\n') +
    (p.k < P.length - 1 ? `Sonraki parçanın ilk satırı (çizme): ${satirMetni(P[p.k + 1].satirlar[0], false)}\n` : 'Bu son parça: sahnen kapanış kartının başladığı ana kadar sürer.\n');
}
// chunk files run one after another on the same M (each sets its own cuts); the css of all of them is kept
function birlestir(kodlar) {
  const parca = (k, i) => `// ---- parça ${i + 1}\nparcalar.push((function () {\n  const module = { exports: null };\n${k.trim()}\n  return module.exports;\n})());`;
  return `// sahneler.js merged from ${kodlar.length} chunks written in parallel (konu/uret.js formul); each draws its own lines\nconst parcalar = [];\n${kodlar.map(parca).join('\n')}\n` +
    `module.exports = function (g) {\n  const css = [];\n  for (const p of parcalar) { const r = p(g); if (r && r.css) css.push(String(r.css).replace(/^\\.sh\\{position:absolute;inset:0\\}\\n?/, '')); }\n  return g.M.bitir(css.join('\\n'));\n};\n`;
}
// heavy review issues -> per chunk (by their second); an issue without a second goes to every chunk
function sorunDagit(sorunlar, P) {
  const out = P.map(() => []);
  for (const x of sorunlar) {
    const t = x && x.saniye != null && !isNaN(+x.saniye) ? +x.saniye : null;
    const i = t == null ? -1 : P.findIndex((p, k) => t >= p.bas && (t < p.son || k === P.length - 1));
    if (i < 0) out.forEach(l => l.push(x)); else out[i].push(x);
  }
  return out;
}
// run async jobs with at most n at once
async function paralel(isler, n) {
  const kuyruk = isler.slice(), calisan = [];
  const bir = async () => { while (kuyruk.length) await kuyruk.shift()(); };
  for (let i = 0; i < Math.max(1, n); i++) calisan.push(bir());
  await Promise.all(calisan);
}
// blind still review (adapted from ersinkoc/YoutubeStudio, with permission: packages/agents/src/review.ts assetGuess):
// a reviewer who does not know the script says what a frame shows; a cheap text call compares that with what was being
// said at that second. A key object or event it did not recognise is a heavy fault of that chunk.
// the words heard around second t (a little before it: the frame shows what was just said)
const anlarMetni = (Z, t) => Z.kelimeler.filter(k => k.a >= t - 4 && k.a <= t + .5).map(k => k.w).join(' ');
const korSorunlari = (eksikler, tonSorunlari) => [
  ...(Array.isArray(eksikler) ? eksikler : []).filter(x => x && x.beklenen && x.saniye != null && !isNaN(+x.saniye)).map(x => ({
    saniye: +(+x.saniye).toFixed(1), agirlik: 'yuksek', kor: true,
    sorun: `Metnin söylediği "${x.beklenen}" karede tanınmıyor; metni bilmeyen denetçi şunu gördü: ${x.gorulen || '(hiçbir şey)'}`,
    duzeltme: `"${x.beklenen}" o an büyük, net ve tek bakışta tanınır biçimde görünsün`,
  })),
  // a serious story drawn with comic exaggeration (seen by the blind reviewer) is a heavy fault too
  ...(Array.isArray(tonSorunlari) ? tonSorunlari : []).filter(x => x && x.sorun && x.saniye != null && !isNaN(+x.saniye)).map(x => ({
    saniye: +(+x.saniye).toFixed(1), agirlik: 'yuksek', kor: true,
    sorun: `Hikâyenin tonuna uymuyor: ${x.sorun}`, duzeltme: 'Komik abartıyı kaldır; sakin renk, sade ifade, yumuşak hareket, saygılı ve dolaylı imge kullan',
  })),
];

// the channel's hard scene rules (gorsel_dil.kurallar), put at the top of the scene prompt
// the story's tone for the scenes (video.json ton): a serious tone gets muted, gentle, respectful pictures. The kit may add
// its own lines (gorsel_dil.ton_kurallari[ton]); these defaults hold for any channel.
const TON_VARSAYILAN = [
  'Bu hikâye komik DEĞİL: saygıyla çiz. Dinleyen kimse dalga geçildiğini hissetmemeli.',
  'Paletin sakin, soluk tonlarını kullan (aynı çizgi tarzı içinde): parlak domates kırmızısı ve sarı geniş alanlarda yok; gece, gri-mavi, krem.',
  'Çizgi film abartısı yok: ter damlası, şok çizgileri, fırlayan gözler, yıldızlar, emoji gibi yüzler, zıplayan nesneler, komik tabela ya da yazı yok.',
  'Hareket yavaş ve yumuşak: zıplama, titreme, sallanma, damga vurma yok; belirme ve kayma yeter.',
  'Ölüm, hastalık, kaza ya da şiddet hiçbir zaman çıplak gösterilmez: boş sandalye, kapalı kapı, pencere, bir eşya, iki kişinin sessizce oturması gibi dolaylı ve saygılı imgeler.',
  'Kişinin yüzü acıyı sade bir ifadeyle taşır (hüzünlü kaş, kapalı ağız); gülen ya da alaycı ifade yok.',
];
function tonMetni(ton, gd) {
  if (!['hüzünlü', 'ürkütücü', 'ciddi'].includes(ton)) return 'Bu hikâye komik: kanalın her zamanki canlı dili geçerli (kaynakta olmayan şaka yine eklenmez).';
  const kit = ((gd || {}).ton_kurallari || {})[ton];
  return `Bu hikâyenin tonu: **${ton}**.\n` + [...TON_VARSAYILAN, ...(Array.isArray(kit) ? kit : [])].map(x => '- ' + x).join('\n');
}

const kesinKurallar = gd => (Array.isArray((gd || {}).kurallar) && gd.kurallar.length) ? gd.kurallar.map(k => '- ' + k).join('\n') : '- (kanalın ek kuralı yok)';

// the leading // comment block of a file is its manual
const basYorum = f => { const out = []; for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (!l.startsWith('//')) break; out.push(l.replace(/^\/\/ ?/, '')); } return out.join('\n'); };

// the queue job's account: kimlik.hesap normalised like the panel and dizi/calistir.js (strip @, trim, lowercase).
// The default account (oxygbio) gets no hesap field, as before. A series channel (konu.json → dizi) must name a valid
// account: without one its episodes would be posted from oxygbio.
function isHesabi(ctx) {
  const h = String((ctx.kimlik || {}).hesap || '').trim().replace(/^@/, '').trim().toLowerCase();
  const gecerli = /^[\w.-]+$/.test(h) ? h : null, dizi = ctx.ayar && ctx.ayar.dizi;
  if (!gecerli && dizi && typeof dizi === 'object') throw new Dur('insan', 'kanalın Instagram hesabı tanımlı değil');
  return gecerli && gecerli !== 'oxygbio' ? gecerli : null;
}

// ---- the run
async function uret(ctx, fikirId, { onay = false, otomatik = false, onayGerekli = true, neZaman = null, yaz = console.log, calistir, not = null, hazir = null, kok = O.KOK, sesKontrol, sonAdim = null } = {}) {
  if (hazir && !/^[\w.-]+$/.test(hazir.ad || '')) O.hata(`hazir.ad geçersiz: "${hazir.ad}" (harf, rakam, - _ . olmalı)`);
  const fikir = hazir ? { id: hazir.ad, baslik: hazir.baslik || hazir.ad } : H.fikirBul(H.havuzOku(ctx), fikirId);
  if (!hazir && fikir.durum === 'reddedildi') O.hata('Bu fikir reddedilmiş. Önce seç: node konu/radar.js sec ' + ctx.kanal + ' ' + fikir.id);
  const oto = ctx.ayar.otomasyon || {}, katman = oto.katman || 'ucretli', llm = ctx.ayar.llm || {};
  const sor = (istem, o) => LLM.sor(istem, { ayar: llm, model: llm.model_metin, efor: llm.efor_metin || 'high', calistir, ...o });

  // 1. folder
  let dir;
  const sablonKopyala = d => { fs.mkdirSync(d, { recursive: true }); const sablon = path.join(O.KOK, 'videolar', '_sablon'); for (const f of fs.readdirSync(sablon)) fs.copyFileSync(path.join(sablon, f), path.join(d, f)); };
  if (hazir) {
    dir = path.join(kok, 'videolar', `${ctx.kanal}-${hazir.ad}`);
    if (!fs.existsSync(path.join(dir, 'video.json'))) sablonKopyala(dir);
    fikir.video = rel(dir);
  } else if (fikir.video && fs.existsSync(path.join(O.KOK, fikir.video))) dir = path.join(O.KOK, fikir.video);
  else {
    const vs = O.kanalVideolari(ctx.kanal), no = String((vs.length ? vs[vs.length - 1].no : 0) + 1).padStart(2, '0');
    const seri = new Set(O.seriKelimeleri(ctx));               // "evrendeki-butun-oksijen" would name every episode the same
    const ayirt = O.kelimeler(fikir.baslik).filter(w => !seri.has(w));
    dir = path.join(O.KOK, 'videolar', `${ctx.kanal}-v${no}-${O.slug((ayirt.length ? ayirt : O.kelimeler(fikir.baslik)).slice(0, 3).join(' '))}`);
    sablonKopyala(dir);
    fikir.video = rel(dir);
  }
  const ad = path.basename(dir), durumF = path.join(dir, 'uretim.json');
  const D = O.okuJson(durumF, { fikir: hazir ? null : fikir.id, ...(hazir ? { hazir: hazir.ad } : {}), kanal: ctx.kanal, katman, baslangic: O.simdi().toISOString(), adimlar: {} });
  if (otomatik) D.otomatik = true;      // only runs started by automation are resumed by the scheduler
  const bitti = a => !!D.adimlar[a];
  // each stage's mark carries its duration (seconds since the previous mark of this run)
  let sonIsaret = Date.now();
  const isaretle = (a, ek = {}) => { D.adimlar[a] = { zaman: O.simdi().toISOString(), sure_sn: Math.round((Date.now() - sonIsaret) / 1000), ...ek }; sonIsaret = Date.now(); if (D.bekleyen && D.bekleyen.adim === a) delete D.bekleyen; O.yazJson(durumF, D); };
  const izinli = (adim, miktar) => onay === true || (!!onay && typeof onay === 'object' && onay[adim] != null && miktar <= onay[adim]);
  const bekle = (adim, ek, mesaj) => { D.bekleyen = { adim, ...ek, zaman: O.simdi().toISOString() }; O.yazJson(durumF, D); return new Dur('onay', mesaj); };
  const devam = hazir ? `node dizi/calistir.js ${ctx.kanal}` : `node konu/radar.js uret ${ctx.kanal} ${fikir.id} --onay`;
  // a ready script has no idea in the pool: nothing to record there
  const kaydet = hazir ? () => { } : (durum, not) => { const h2 = H.havuzOku(ctx); const f2 = H.fikirBul(h2, fikir.id); f2.video = fikir.video; H.durumYap(h2, fikir.id, durum, not); H.havuzYaz(ctx, h2); };
  kaydet('uretiliyor', bitti('klasor') ? null : `üretim başladı: ${fikir.video}`);
  isaretle('klasor', { yol: fikir.video });
  yaz(`\nVideo klasörü: ${fikir.video}`);

  try {
    const hesap = isHesabi(ctx);          // first: nothing is spent on a video that has no account to go to
    const videoF = path.join(dir, 'video.json'), ucretliF = path.join(dir, 'ucretli.json');
    // --not "...": the reader didn't like the script; rewrite it with their note (only before the voice is paid for)
    let onceki = null;
    if (not && !hazir && fs.existsSync(path.join(dir, 'metin.md'))) {     // metin.md exists only once a draft was written
      if (bitti('ses')) throw new Dur('insan', 'Ses zaten üretildi; metni şimdi değiştirmek o harcamayı boşa çıkarır. --not yalnız sesten önce çalışır.');
      onceki = O.okuJson(videoF).satirlar;
      if (bitti('metin')) { delete D.adimlar.metin; O.yazJson(durumF, D); }
    }
    // 2. ready script: video.json straight from `hazir` (no model, no fact-check: the caller vouches for the text)
    if (hazir && !bitti('metin')) {
      if (!Array.isArray(hazir.satirlar) || !hazir.satirlar.length) throw new Dur('insan', 'Hazır metinde satır yok.');
      const baslik = hazir.baslik || hazir.ad;
      O.yazJson(videoF, {
        _aciklama: 'Hazır metinden yazıldı (konu/uret.js, hazir): ' + hazir.ad,
        kanal: `../../kanal/${ctx.kanal}/kimlik.json`, baslik,
        anlaticilar: hazir.anlaticilar || {}, anons_rolleri: [], hiz: hazir.hiz || 1, duzeltme: {},
        satirlar: hazir.satirlar.map(s => ({ rol: s.rol, metin: s.metin })), aciklama_instagram: hazir.aciklama_instagram,
        ...(hazir.video_ek || {}),
      });
      fs.writeFileSync(path.join(dir, 'metin.md'), [`# ${baslik} (hazır metin)`, '', '_Bu metin hazır geldi; ses üretmeden önce oku._', '', '---', '', ...hazir.satirlar.flatMap(s => [`**[${s.rol}]**`, s.metin, ''])].join('\n'));
      isaretle('metin', { hazir: true, satir: hazir.satirlar.length });
      yaz(`Hazır metin yazıldı: ${rel(videoF)}`);
    }
    // 2-3. script + fact-check (at most two fix rounds)
    if (!bitti('metin')) {
      const anl = ctx.kimlik.anlaticilar || [];
      if (!anl.length) throw new Dur('insan', 'kimlik.json → anlaticilar boş: ses için anlatıcı tanımlı değil.');
      const ana = anl[(O.kanalVideolari(ctx.kanal).length - 1) % anl.length] || anl[0];       // narrators take turns
      const { anlaticilar, tts, ornek_video, ...kimlikMetin } = ctx.kimlik;
      const ornekAd = ornek_video || 'oxygbio-v01-ucak';          // the channel's own sample video, else the repo's
      const ornekVideo = O.okuJson(path.join(O.KOK, 'videolar', ornekAd, 'video.json'));
      const temel = {
        kimlik: kimlikMetin, metin_kurallari: md('dersler/METIN.md'), metin_hatalari: bolum(md('dersler/HATALAR.md'), 5),
        ornek_metin: md(`videolar/${ornekAd}/metin.md`), ornek_satirlar: ornekVideo.satirlar, ...sureAyari(oto.sure_sn),
        fikir: { baslik: fikir.baslik, oncul: fikir.oncul, kanca: fikir.kanca, tirmanis: fikir.tirmanis, kapanis: fikir.kapanis, kaynaklar: fikir.kaynaklar.map(k => ({ baslik: k.baslik, url: k.url, dis_kaynak: k.dis_kaynak })) },
        roller: anl.map(a => `${a.ad} (${a.not || ''})`).join(', '), ana_rol: ana.ad,
      };
      let m, d, sorunlar = [];
      for (let tur = 0; tur < 3; tur++) {
        const notIstem = !tur && onceki ? `## Okurun notu (bu taslağı beğenmedi, notu uygulayarak yeniden yaz)\n\n${not}\n\nÖnceki taslak:\n${JSON.stringify(onceki, null, 1)}` : '';
        const duzeltme = notIstem || sorunlar.length ? notIstem || `## Önceki taslağın sorunları (düzelt)\n\nDoğrulayıcı şunları buldu. Yanlış bilgiyi doğrusuyla değiştir; kaynağı bulunamayanı metinden çıkar, yerine doğrulanabilir bir bilgi koy ya da satırı kısalt. Akışı bozma.\n\n${sorunlar.join('\n')}\n\nÖnceki taslak:\n${JSON.stringify({ satirlar: m.satirlar, bilgiler: m.bilgiler }, null, 1)}` : '';
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

    async function formulSahne() {
      const Z = O.okuJson(path.join(dir, 'ses', 'zaman.json'));
      const gd = ctx.kimlik.gorsel_dil || {}, kf = path.join(ctx.dir, (gd.karakter || {}).dosya || 'karakter.js');
      const { _aciklama, karakter: _k, ...gdMetin } = gd;
      const satirMetni = (i, kelime = true) => `${i} [${Z.satirlar[i].bas.toFixed(2)}-${Z.satirlar[i].son.toFixed(2)} sn]: ${video.satirlar[i].metin}${kelime ? `\n   kelimeler: ${Z.kelimeler.filter(k => k.satir === i).map(k => `${k.w}@${k.a.toFixed(2)}`).join(' ')}` : ''}`;
      const kareDir = path.join(dir, 'cikti', 'kareler-ucretsiz'), sf = path.join(dir, 'sahneler.js');
      // two stills per line: just after the cut and near the end, where the line's action has landed
      const saniyeler = Z.satirlar.flatMap(s => [s.bas + (s.son - s.bas) * .3, s.bas + (s.son - s.bas) * .85]).map(x => +x.toFixed(2));
      const { parcalar: parcaSayisi, turlar: TUR, paralel: es } = sahneAyari(llm);
      const P = parcala(Z, parcaSayisi);
      const ortak = {
        formul: md('dersler/FORMUL.md'), renkler: ctx.kimlik.renkler || {}, gorsel_dil: gdMetin, kurallar: kesinKurallar(gd),
        karakter: fs.existsSync(kf) ? basYorum(kf) : 'Bu kanalın tekrar eden karakteri yok: karakter null gelir.',
        motor: basYorum(path.join(O.KOK, 'uretim', 'motor.js')), sure: Z.toplam.toFixed(1), marka: (Z.sting[0] || 0).toFixed(2),
        ornek: md('videolar/oxygbio-ornek-formul/sahneler.js'), kutuphane: Kut.istemMetni(ctx.dir, video.dizi || null), ton: tonMetni(video.ton, gd),
      };
      const satirListesi = p => video.satirlar.map((_, i) => satirMetni(i, P.length === 1 || p.satirlar.includes(i))).join('\n');
      const sureler = [];
      let kodlar = P.map(() => null), sorunlar = P.map(() => []), puan = null, en = null;     // en: the best attempt that ran
      for (let tur = 0; tur < TUR; tur++) {
        const yazilacak = P.filter(p => !kodlar[p.k] || sorunlar[p.k].length);
        yaz(tur ? `Sahne düzeltiliyor (tur ${tur + 1}, ${yazilacak.length}/${P.length} parça)…` : `Sahne çiziliyor (formül: bu videoya özel çizim${P.length > 1 ? `, ${P.length} parça, aynı anda ${Math.min(es, P.length)}` : ''})…`);
        const t0 = Date.now();
        await paralel(yazilacak.map(p => async () => {
          const s = sorunlar[p.k];
          const duzeltme = s.length ? `## Önceki denemenin sorunları (düzelt, geri kalanını bozma)\n\n${s.join('\n')}${kodlar[p.k] ? `\n\nÖnceki dosya:\n\n\`\`\`js\n${kodlar[p.k]}\`\`\`` : ''}` : '';
          const cevap = await sor(LLM.istem('sahne-yaz', { ...ortak, satirlar: satirListesi(p), parca: parcaIstemi(P, p, satirMetni), duzeltme }),
            { is: 'sahne-yaz', json: false, efor: llm.efor_sahne || 'high', zamanAsimiMs: sahneZamanAsimi(llm) });   // fast / cheap models can think themselves out of an answer: lower it per channel
          const yeni = kodCikar(cevap);
          if (yeni) { kodlar[p.k] = yeni; sorunlar[p.k] = []; }
          else sorunlar[p.k] = ['- Cevapta module.exports içeren bir ```js kod bloğu yok. Dosyanın tamamını tek blokta döndür.'];
        }), es);
        const olcum = { tur: tur + 1, parca: yazilacak.length, yaz_sn: Math.round((Date.now() - t0) / 1000) };
        sureler.push(olcum);
        if (kodlar.some(k => !k)) continue;
        const kod = P.length === 1 ? kodlar[0] : birlestir(kodlar);
        fs.writeFileSync(sf, kod);
        if (P.length > 1) kodlar.forEach((k, i) => fs.writeFileSync(path.join(dir, `sahneler-parca-${i + 1}.js`), k));
        fs.mkdirSync(kareDir, { recursive: true });
        for (const f of fs.readdirSync(kareDir)) if (/^(frame-|contact-sheet)/.test(f)) fs.unlinkSync(path.join(kareDir, f));   // our own old stills
        const t1 = Date.now(), r = node('uretim/kurgu.js', [dir, '--kare', saniyeler.join(',')], { yakala: true });
        olcum.kare_sn = Math.round((Date.now() - t1) / 1000);
        if (!r.ok) {
          // a merged file that does not run cannot be blamed on one chunk: every chunk gets the error
          const hata = '- Dosya çalışmadı ya da kare alınamadı: ' + r.cikti.split('\n').filter(Boolean).slice(-4).join(' | ');
          sorunlar = P.map(() => [hata]);
          continue;
        }
        const sayfalar = fs.readdirSync(kareDir).filter(f => /^contact-sheet.*\.jpg$/.test(f)).sort().map(f => path.join(kareDir, f));
        yaz(`Sahne kareleri kontrol ediliyor (${saniyeler.length} kare)…`);
        const t2 = Date.now();
        // the scored review and the blind one (what is on the frame, without the script) run side by side
        const denetimModeli = llm.model_denetim || llm.model_metin, sayfaListesi = sayfalar.map(f => path.resolve(f)).join(', ');
        const korDenetim = async () => {
          if (llm.kor_denetim === false) return [];
          const k = await sor(LLM.istem('kare-kor', { sayfalar: sayfaListesi }), { is: 'kare-kor', resimler: sayfalar, model: denetimModeli, efor: 'low' });
          const kareler = (k && Array.isArray(k.kareler) ? k.kareler : []).filter(x => x && x.saniye != null && !isNaN(+x.saniye));
          if (!kareler.length) return [];
          const m = await sor(LLM.istem('kare-karsilastir', { ton: tonMetni(video.ton, gd), kareler: kareler.map(x => `- ${(+x.saniye).toFixed(1)} sn | söylenen: "${anlarMetni(Z, +x.saniye)}" | kör denetçinin gördüğü: ${x.goruyorum || '(boş)'}`).join('\n') }),
            { is: 'kare-karsilastir', model: denetimModeli, efor: 'low' });
          return korSorunlari(m && m.eksikler, m && m.ton_sorunlari);
        };
        let d, kor = [];
        try {
          [d, kor] = await Promise.all([
            sor(LLM.istem('sahne-denetim', {
              sayfalar: sayfaListesi, gorsel_dil: gdMetin, ton: tonMetni(video.ton, gd),
              satirlar: video.satirlar.map((s, i) => `${i} [${Z.satirlar[i].bas.toFixed(1)}-${Z.satirlar[i].son.toFixed(1)} sn]: ${s.metin}`).join('\n'),
            }), { is: 'sahne-denetim', resimler: sayfalar, model: denetimModeli, efor: llm.efor_sahne === 'low' ? 'low' : 'medium' }),
            korDenetim().catch(e => { yaz('  Kör denetim yapılamadı: ' + e.message); return []; }),
          ]);
        } catch (e) {
          // a text-only model cannot look at the stills: keep the attempt that ran, unreviewed, and say so
          if (!/image|resim|vision|görsel/i.test(e.message)) throw e;
          yaz('  Bu model resim göremiyor: sahne kontrolsüz kullanılıyor.');
          return { ok: true, tur: tur + 1, puan: null, kalan: ['- Sahne kontrol edilmedi: seçilen model resim göremiyor. Paylaşmadan önce videoyu baştan sona izle.'], sureler };
        }
        Object.assign(olcum, { denetim_sn: Math.round((Date.now() - t2) / 1000), puan: d.puan, kor: kor.length });
        puan = d.puan;
        // a key object the blind reviewer did not recognise is a heavy fault of that chunk
        const agir = [...(d.sorunlar || []).filter(x => x.agirlik !== 'dusuk'), ...kor];
        const satir = x => `- ${x.saniye != null ? x.saniye + ' sn: ' : ''}${x.sorun} → ${x.duzeltme || ''}`;
        const kalan = agir.map(satir);
        olcum.agir = agir.length;
        if (!en || (+d.puan || 0) > en.puan || ((+d.puan || 0) === en.puan && agir.length < en.sorunlar.length)) en = { kod, puan: +d.puan || 0, sorunlar: kalan, tur: tur + 1 };
        yaz(`  puan ${d.puan ?? '?'}/10, ağır sorun ${agir.length}${kor.length ? ` (kör denetimden ${kor.length})` : ""}`);
        if (!agir.length) return { ok: true, tur: tur + 1, puan, kalan: [], sureler };
        // only the chunks whose time window holds a heavy issue are written again
        sorunlar = sorunDagit(agir, P).map(l => l.map(satir));
      }
      // no attempt passed clean: the best one that ran is used and its remaining notes go to the run record
      if (en) { fs.writeFileSync(sf, en.kod); return { ok: true, tur: en.tur, puan: en.puan, kalan: en.sorunlar, sureler }; }
      return { ok: false, sorunlar: sorunlar.flat(), puan, sureler };
    }

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
    const sablonTarif = async () => {
      yaz(`Şablon verisi (${sablonAd}) yazılıyor…`);
      // the template's header comment is its manual
      const belge = fs.readFileSync(path.join(O.KOK, 'uretim', 'sablonlar', sablonAd + '.js'), 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.replace(/^\/\/ ?/, '')).join('\n');
      const ornekF = path.join(O.KOK, 'uretim', 'sablonlar', sablonAd + '-ornek.json');
      const S = await sor(LLM.istem('simulasyon-yaz', { sablon_belgesi: belge, ornek: fs.existsSync(ornekF) ? fs.readFileSync(ornekF, 'utf8') : '{}', satirlar: video.satirlar.map((x, i) => `${i}: ${x.metin}`).join('\n') }), { is: 'simulasyon-yaz' });
      const en = simEsyaOnar(S);
      if (en.length) yaz('Şablon verisi onarıldı: ' + en.join('; '));
      const sk = simKontrol(S);
      if (sk.length) throw new Dur('insan', 'Yapay zekânın yazdığı simulasyon.json tutarsız: ' + sk.join('; '));
      O.yazJson(simF, S);
      O.yazJson(videoF, { ...O.okuJson(videoF), sablon: sablonAd });
      isaretle('sablon_tarif', { adim: S.adimlar.length });
    };
    if (katman === 'sablon' && !bitti('sablon_tarif')) await sablonTarif();

    // 5. 💳 voice
    const sesDir = path.join(dir, 'ses');
    if (!bitti('ses')) {
      const eksik = video.satirlar.filter((s, i) => !fs.existsSync(path.join(sesDir, `${String(i + 1).padStart(2, '0')}-${s.rol}.mp3`)));
      const karakter = eksik.reduce((a, s) => a + s.metin.length, 0);
      let harcanan = null;
      yaz(`\n💳 SES: ${eksik.length} satır, ~${karakter} ElevenLabs karakteri.`);
      const sesBilgi = sesKontrol ? sesKontrol(dir) : node('uretim/ses.js', [dir], { yakala: true });   // stdout + stderr
      if (sesBilgi.cikti) yaz(sesBilgi.cikti.split('\n').map(l => '   ' + l).join('\n'));
      let krediTahmin = null;
      if (katman === 'ucretli') {
        const U = O.okuJson(ucretliF), klipSn = (U.klipler || []).reduce((a, k) => a + (k.sure || 5), 0);
        krediTahmin = Math.round(U.gorseller.length * 1.1 + klipSn);
        yaz(`💳 GÖRÜNTÜ (tahmin): ${U.gorseller.length} resim ~${(U.gorseller.length * 1.1).toFixed(0)} kredi + ${(U.klipler || []).length} klip (${klipSn} sn) ~${klipSn} kredi. Video bütçesi: ${U.butce} kredi. Kesin fiyat her adımda Higgsfield'dan alınır.`);
      }
      const izin = A.harcamaIzni(ctx, 'karakter', karakter, { otomatik });
      if (!izin.izin) throw new Dur(otomatik ? 'butce' : 'onay', izin.neden);
      if (!izinli('ses', karakter)) throw bekle('ses', { karakter, satir: eksik.length, kredi_tahmin: krediTahmin }, `Hiçbir şey harcanmadı. Önce metni oku: ${rel(path.join(dir, 'metin.md'))}\nBeğendiysen devam: ${devam}`);
      if (karakter) {
        // a story episode out of monthly ElevenLabs characters waits like a budget stop (the scheduler retries it)
        if (!sesBilgi.ok && hazir && /kalan karakter yetmiyor/.test(sesBilgi.cikti || '')) throw new Dur('butce', 'ElevenLabs bu ay kalan karakter yetmiyor; kota yenilenince ya da plan yükselince devam eder.');
        if (!sesBilgi.ok) throw new Dur('insan', 'ses.js çalışmadı (anahtar ya da kota). Çıktı yukarıda.');
        const r = node('uretim/ses.js', [dir, '--onay']);
        if (!r.ok) throw new Dur('insan', 'Ses üretimi yarıda kaldı (ElevenLabs). Çıktı yukarıda; tekrar çalıştırınca eksik satırlardan devam eder.');
        // the ledger gets the real ElevenLabs charge (uretim/ses.js → ses/harcama.json); the script length only as a marked estimate
        const gercek = require('../uretim/ses-harcama').oku(dir, karakter);
        O.harcamaYaz(ctx, 'karakter', gercek.karakter, ad, { kaynak: gercek.kaynak, metin_uzunlugu: karakter, ...(gercek.tahmini ? { tahmini: true } : {}) });
        harcanan = gercek;
        if (!O.satirlarOku(path.join(ctx.kayit, 'harcama.jsonl')).some(x => x.tur === 'video' && x.video === ad)) O.harcamaYaz(ctx, 'video', 1, ad);
      }
      isaretle('ses', { karakter: harcanan ? harcanan.karakter : karakter, metin_uzunlugu: karakter, ...(harcanan && harcanan.tahmini ? { tahmini: true } : {}) });
    }

    // 6-7. word times + mix (free)
    if (!bitti('kelime')) { yaz('\nKelime zamanları (Whisper)…'); if (!kos(python(), [path.join(O.KOK, 'uretim', 'kelime.py'), dir]).ok) throw new Dur('insan', 'kelime.py başarısız (çıktı yukarıda).'); isaretle('kelime'); }
    if (!bitti('mix')) { yaz('\nSes karışımı…'); if (!node('uretim/mix.js', [dir]).ok) throw new Dur('insan', 'mix.js başarısız (çıktı yukarıda).'); isaretle('mix'); }

    // 7b. formul: the model draws this video's scenes itself (dersler/FORMUL.md), looks at its own frames and fixes at
    // most twice; the best attempt is used. There is no fallback to the template (the user's call, 29.10.2026): if no
    // attempt even ran, the run stops for a human.
    if (katman === 'formul' && !bitti('sahne')) {
      const r = await formulSahne();
      if (!r.ok) throw new Dur('insan', `Sahne kodu ${sahneAyari(llm).turlar} denemede de çalışmadı` + ' (kare alınamadı):\n' + r.sorunlar.join('\n') + `\nSon deneme: ${rel(path.join(dir, 'sahneler.js'))}. Düzelt ya da sil, sonra aynı komutla devam et.`);
      if (r.kalan.length) yaz(`Sahne en iyi denemeyle (tur ${r.tur}, puan ${r.puan}/10) kullanılıyor; kontrolün kalan notları (paylaşmadan önce bak):\n` + r.kalan.map(x => '  ' + x).join('\n'));
      // the library characters this episode used (kit karakterler.json → bolumler)
      try { Kut.kullanimEkle(ctx.dir, Kut.kullanilanlar(fs.readFileSync(path.join(dir, 'sahneler.js'), 'utf8'), Kut.liste(ctx.dir, video.dizi || null)), rel(dir)); } catch (e) { }
      isaretle('sahne', { tur: r.tur, puan: r.puan, kalan: r.kalan, turlar: r.sureler });
    }
    // stills-only runs (timing the scene stage on an existing voice) stop here: no render, no queue job
    if (sonAdim === 'sahne') return { durum: 'sahne-bitti', dir };

    if (katman !== 'ucretli' && katman !== 'sablon' && katman !== 'formul') throw new Dur('insan', 'Ücretsiz katman seçili: sahneler.js (kodla animasyon) otomatik yazılmıyor, çünkü kare kare bakıp düzeltmeden güvenilir çıkmıyor. Ajan ya da insan sahneler.js yazmalı (uretim/TARIF.md 5a). Ses hazır.');

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
        if (!izinli(adim, kredi)) throw bekle(adim, { kredi, butce: U.butce }, `Hiçbir şey harcanmadı. Devam: ${devam}`);
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

    // 13. frame review (denetim/kare-denetci.md rules). The formul layer already looked at its own frames and fixed them
    // in the scene rounds, so its last scene score stands in for this pass (no second look at the same frames).
    if (katman === 'formul' && !bitti('denetim')) isaretle('denetim', { puan: (D.adimlar.sahne || {}).puan ?? null, kaynak: 'sahne turları' });
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
    // the job names its account (isHesabi, checked at the start; none for the default account)
    const relK = f => path.relative(kok, f).split(path.sep).join('/');
    const is = kuyrugaYaz({ video: relK(dir), mp4: relK(mp4), aciklama: video.aciklama_instagram || video.baslik, onayGerekli, neZaman: typeof neZaman === 'number' ? new Date(Date.now() + neZaman * 60e3).toISOString() : neZaman, hesap, kaynak: hazir ? 'dizi' : undefined }, kok);
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

// a waiting or posted job for this video folder (a failed or cancelled one does not count: a retry needs a new job)
function kuyruktaVar(video, kok = O.KOK) {
  if (!video) return null;
  for (const k of ['bekleyen', 'paylasilan']) {
    const d = path.join(kok, 'kuyruk', k);
    let ad = []; try { ad = fs.readdirSync(d).filter(f => f.endsWith('.json')); } catch (e) { }
    for (const f of ad) { try { if (O.okuJson(path.join(d, f)).video === video) return path.join(d, f); } catch (e) { } }
  }
  return null;
}
// Posting queue contract: kuyruk/bekleyen/<YYYYMMDD-HHMM>-<video-adi>.json. A rerun of a finished video never adds a
// second job: the existing waiting or posted one is returned instead.
function kuyrugaYaz({ video, mp4, aciklama, onayGerekli, neZaman = null, hesap = null, kaynak = 'konu-radari' }, kok = O.KOK) {
  const var_ = kuyruktaVar(video, kok);
  if (var_) return var_;
  const d = path.join(kok, 'kuyruk', 'bekleyen');
  fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, `${O.damga()}-${path.basename(video)}.json`);
  O.yazJson(f, { video, mp4, aciklama, ne_zaman: neZaman, ...(hesap ? { hesap } : {}), kaynak, onay_gerekli: !!onayGerekli });
  return f;
}

module.exports = { uret, isHesabi, kodCikar, sahneZamanAsimi, anlarMetni, korSorunlari, tonMetni, sahneAyari, parcala, parcaIstemi, birlestir, sorunDagit, paralel, kesinKurallar, sureAyari, kuyrugaYaz, kuyruktaVar, ipuclariniOnar, ifadeCoz, ucretliKontrol, simKontrol, simEsyaOnar, simIpucuOnar, metinMd, dogrulamaSorunlari, bolum, Dur };
