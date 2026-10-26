#!/usr/bin/env node
// Vertical clips (Reels / Shorts) cut from a long horizontal video.
//
//   node kesit/kesit.js yazi  <uzun.mp4>                    Whisper word times -> <iş>/metin.txt (numbered sentences)
//   node kesit/kesit.js sec   <uzun.mp4> [--mod tanitim|an] [--adet 3] [--kanal <ad>] [--llm-yok] [--onay] [--not "..."]
//                                                            writers + 3 judges, two generations -> <iş>/adaylar.json
//   node kesit/kesit.js dene  <uzun.mp4> <liste.json>        what a hand-written cut list sounds like (spends nothing)
//   node kesit/kesit.js yap   <uzun.mp4> [--aday 1] [--cerceve bulanik|kirp] [--odak 0.5] [--yakin 1]
//                             [--kanal <ad>] [--muzik <dosya>] [--kancasiz] [--kare] [--liste <liste.json>] [--uzerine]
//                                                            stills (--kare) or the finished 1080x1920 clip
//   node kesit/kesit.js hepsi <uzun.mp4> [same flags]        yazi + sec + yap (first candidate)
//
// <iş> is the work folder: next to the long video as <ad>-kesit/ (or --klasor <yol>). Nothing goes into the repo.
// Teaser ("tanitim"): opens on the strongest sentence, stops right before the answer, then a ~5 s card with
// the question and CEVAP TAM VİDEODA while the music fades out. Moment ("an"): one self-contained stretch.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const K = require('../uretim/cekirdek');
const KS = require('./kesim');
const SL = require('./sesler');

const argv = process.argv.slice(2), komut = argv[0];
const arg = (n, v = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : v; };
const var_ = n => argv.includes(n);
const ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'];
const rel = f => { const r = path.relative(process.cwd(), f); return r && !r.startsWith('..') ? r : f; };
const q = s => `"${s}"`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function isYukle() {
  const kaynak = argv[1];
  if (!kaynak || kaynak.startsWith('--')) K.fail('uzun videonun yolunu ver. Örnek: node kesit/kesit.js yazi "C:\\Videolar\\uzun.mp4"');
  const src = path.resolve(kaynak);
  if (!fs.existsSync(src)) K.fail('video bulunamadı: ' + src);
  const ad = path.basename(src).replace(/\.[^.]+$/, '');
  const dir = path.resolve(arg('--klasor') || path.join(path.dirname(src), ad + '-kesit'));
  fs.mkdirSync(dir, { recursive: true });
  return { src, ad, dir };
}

function python() {
  const p = process.env.VIDEO_MUTFAGI_PYTHON || path.join(K.KOK, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!fs.existsSync(p)) K.fail('Python ortamı (.venv) yok: kelime zamanları çıkarılamıyor. kurulum/KURULUM.md adım 3.');
  return p;
}

// ---- 1. words + numbered sentences (uretim/kelime.py does the listening, as for every other video)
function yazi(is) {
  const ses = path.join(is.dir, 'ses'), wav = path.join(ses, '01-kaynak.wav');
  fs.mkdirSync(ses, { recursive: true });
  if (!fs.existsSync(wav)) { console.log('Ses ayrılıyor…'); K.sh('ffmpeg', ['-loglevel', 'error', '-y', '-i', is.src, '-vn', '-ac', '1', '-ar', '16000', wav]); }
  const kel = path.join(ses, 'kelimeler.json');
  if (!fs.existsSync(kel) || !K.okuJson(kel)['01-kaynak.wav']) {
    console.log(`Whisper dinliyor (${Math.round(K.sure(is.src) / 60)} dk video, CPU'da birkaç dakika sürer)…`);
    const r = spawnSync(python(), [path.join(K.KOK, 'uretim', 'kelime.py'), is.dir], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    if (r.status !== 0) K.fail('kelime.py başarısız (çıktı yukarıda).');
  }
  const { W, S } = kelimeYukle(is);
  fs.writeFileSync(path.join(is.dir, 'metin.txt'), KS.metinTxt(S));
  console.log(`${W.length} kelime, ${S.length} cümle → ${rel(path.join(is.dir, 'metin.txt'))}`);
  console.log(`Whisper'ın yanlış yazdığı kelimeler altyazıda düzelsin istersen ${rel(path.join(is.dir, 'duzeltme.json'))} yaz: {"yanlis": "doğru"}`);
}

function kelimeYukle(is) {
  const f = path.join(is.dir, 'ses', 'kelimeler.json');
  if (!fs.existsSync(f)) K.fail('kelime zamanları yok. Önce: node kesit/kesit.js yazi ' + q(is.src));
  const W = KS.yapistir((K.okuJson(f)['01-kaynak.wav'] || []).filter(w => w[0]));
  if (W.length < 20) K.fail('videoda konuşma bulunamadı (Whisper 20 kelimeden az duydu).');
  return { W, S: KS.cumleler(W) };
}

// ---- 2. choose the clip
// Which language model route the choice will take (the channel's konu.json → llm, as for the topic radar).
// Says how many calls it makes before the first one; the paid API route stops unless --onay is given.
function llmYolu() {
  const LLM = require('../konu/llm'), { CAGRI } = require('./secim');
  const kanal = arg('--kanal'), kf = kanal ? path.join(K.KOK, 'kanal', kanal, 'konu.json') : null;
  const ayar = (kf && fs.existsSync(kf) && K.okuJson(kf).llm) || {};
  let yol;
  try { yol = LLM.yolSec(ayar); } catch (e) { console.log(`\n${e.message}\nYapay zekâsız seçime geçiliyor.`); return null; }
  const sayi = `${CAGRI.en_az}-${CAGRI.en_cok} yapay zekâ çağrısı`;
  if (yol === 'api') {
    console.log(`\nSeçim ${sayi} yapacak, ÜCRETLİ API yolundan (ANTHROPIC_API_KEY, kullandıkça ödenir). Her çağrıya konuşmanın tüm dökümü gider; uzun videoda tutar artar.`);
    if (!var_('--onay')) K.fail(`ücretli yol onaysız çalışmaz. Onaylıyorsan:\n  node kesit/kesit.js ${argv.map(x => /[\s"]/.test(x) ? q(x) : x).join(' ')} --onay\nÜcretsiz seçim için --llm-yok ekle.`);
  } else console.log(`\nSeçim ${sayi} yapacak, Claude aboneliğinden (claude -p): ek ücret yok, aboneliğin kullanım sınırından düşer. Birkaç dakika sürer.`);
  return { yol, ayar };
}

async function sec(is) {
  const { W, S } = kelimeYukle(is);
  const mod = arg('--mod', 'tanitim'), adet = Math.max(1, +arg('--adet', 1) || 1);
  if (!KS.MODLAR[mod]) K.fail('--mod tanitim ya da an olmalı.');
  let sonuc = null, yontem = 'sezgisel';
  const yol = var_('--llm-yok') ? null : llmYolu();
  if (yol) {
    try {
      const { nesil } = require('./secim');
      sonuc = await nesil({ W, S, mod, adet, not: arg('--not', ''), model: arg('--model') || yol.ayar.model_metin, ayar: yol.ayar });
      yontem = 'nesil';
    } catch (e) {
      console.log(`\nYapay zekâyla seçim olmadı (${e.message}).\nYapay zekâsız seçime geçiliyor: cümleler basit işaretlere göre puanlanır (soru, rakam, güçlü kelime).`);
    }
  }
  const adaylar = sonuc ? sonuc.secilen : KS.sezgisel(W, S, mod, adet);
  if (!adaylar.length) K.fail(`uygun kesit bulunamadı. metin.txt'ye bakıp listeyi elle yaz, sonra: node kesit/kesit.js dene <video> liste.json`);
  const kayit = { kaynak: is.src, mod, yontem, zaman: new Date().toISOString(), adaylar: adaylar.map(a => ({ ...a, mod })) };
  if (sonuc) kayit.gecmis = { nesil1: sonuc.nesil1, nesil2: sonuc.nesil2 };
  const af = path.join(is.dir, 'adaylar.json');
  if (fs.existsSync(af)) fs.copyFileSync(af, path.join(is.dir, 'adaylar.onceki.json'));     // the last choice is kept once
  fs.writeFileSync(af, JSON.stringify(kayit, null, 1));
  console.log(`\nSeçilen ${adaylar.length} kesit (${yontem === 'nesil' ? 'yazarlar + 3 jüri, iki nesil' : 'yapay zekâsız'}):`);
  adaylar.forEach((a, i) => {
    const r = KS.coz(a.parcalar, W, S, mod);
    console.log(`\n#${i + 1}${a.skor != null ? `  puan ${a.skor}` : ''}  kanca: ${a.kanca || '-'}  kart: ${a.soru || '-'}\n${KS.deneMetni(r)}${a.neden ? '\nneden: ' + a.neden : ''}`);
  });
  console.log(`\nKayıt: ${rel(path.join(is.dir, 'adaylar.json'))}\nKareler: node kesit/kesit.js yap ${q(is.src)} --aday 1 --kare`);
}

function dene(is) {
  const { W, S } = kelimeYukle(is), f = argv[2];
  if (!f || f.startsWith('--')) K.fail('liste dosyasını ver: {"parcalar": [["cumle", 12, 14], ["ses", "peki", 311.3, "mi", 318]]}');
  const j = K.okuJson(path.resolve(f));
  for (const [i, a] of (j.adaylar || [j]).entries()) console.log(`${i ? '\n' : ''}#${i + 1}\n${KS.deneMetni(KS.coz(a.parcalar, W, S, a.mod || j.mod || arg('--mod', 'tanitim')))}`);
}

// ---- 3. the clip
function cerceve(gir, cik, w, h) {
  const tur = arg('--cerceve', 'bulanik'), odak = Math.min(1, Math.max(0, +arg('--odak', 0.5))), yakin = Math.max(1, +arg('--yakin', 1) || 1);
  if (w / h <= K.W / K.H + 0.01) return `${gir}scale=${K.W}:${K.H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${K.W}:${K.H},setsar=1${cik}`;
  if (tur === 'kirp') return `${gir}scale=-2:${K.H}:flags=lanczos,crop=${K.W}:${K.H}:(iw-${K.W})*${odak}:0,setsar=1${cik}`;
  if (tur !== 'bulanik') K.fail('--cerceve bulanik ya da kirp olmalı.');
  // the whole frame in the middle, the same picture blurred and dimmed behind it (blurred small = fast)
  const id = cik.replace(/\W/g, ''), fw = Math.round(K.W * yakin / 2) * 2;
  return `${gir}split[${id}a][${id}b];[${id}a]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,gblur=sigma=20,eq=brightness=-0.08:saturation=1.1,scale=${K.W}:${K.H}[${id}g];` +
    `[${id}b]scale=${fw}:-2:flags=lanczos,crop=${K.W}:ih[${id}o];[${id}g][${id}o]overlay=(W-w)/2:(H-h)/2,setsar=1${cik}`;
}

function resim(is, r, hedef) {
  const [w, h] = K.sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', is.src]).trim().split(',').map(Number);
  const ins = [], fc = [];
  r.kesit.forEach((k, j) => {
    const uz = (j + 1 < r.kesit.length ? r.kesit[j + 1].l0 : r.son) - k.l0;     // the cut + its breath
    ins.push('-ss', k.v0.toFixed(3), '-t', uz.toFixed(3), '-i', is.src);
    fc.push(cerceve(`[${j}:v]fps=${K.FPS},setpts=PTS-STARTPTS,`, `[p${j}]`, w, h));
  });
  fc.push(`${r.kesit.map((_, j) => `[p${j}]`).join('')}concat=n=${r.kesit.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${(r.kart + 1).toFixed(2)}[v]`);
  K.sh('ffmpeg', ['-loglevel', 'error', '-y', ...ins, '-filter_complex', fc.join(';'), '-map', '[v]', '-t', r.sure.toFixed(3), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(K.FPS), hedef]);
}

// voice cuts (from the long video's own sound) + whooshes at the joins + card music, two-pass -14 LUFS
function ses(is, r, tmp, hedef) {
  const ins = [], fc = [], lab = [];
  const inp = (...a) => { ins.push(...a); return ins.filter(x => x === '-i').length - 1; };
  r.kesit.forEach((k, j) => {
    const d = k.v1 - k.v0, ms = Math.round(k.l0 * 1000), i = inp('-ss', k.v0.toFixed(3), '-t', d.toFixed(3), '-i', is.src);
    fc.push(`[${i}:a]aresample=${SL.SR},aformat=channel_layouts=stereo,afade=t=in:d=0.03,afade=t=out:st=${(d - 0.05).toFixed(3)}:d=0.05,adelay=${ms}|${ms}[s${j}]`); lab.push(`[s${j}]`);
  });
  const vuus = path.join(tmp, 'vuus.wav');
  SL.vuusYatagi(vuus, r.sure, [...r.kesit.slice(1).map(k => k.l0), r.son]);
  lab.push(`[${inp('-i', vuus)}:a]`);
  const muzik = arg('--muzik'), SONUS = 1.8;            // the music always fades out slowly: never an abrupt stop
  if (muzik) {
    if (!fs.existsSync(muzik)) K.fail('müzik dosyası yok: ' + muzik);
    // a quiet bed under the voice that comes up on the card, then fades with it; looped, so a short track never runs out
    const i = inp('-stream_loop', '-1', '-i', path.resolve(muzik));
    fc.push(`[${i}:a]atrim=0:${r.sure.toFixed(3)},aresample=${SL.SR},aformat=channel_layouts=stereo,loudnorm=I=-30:TP=-6,aresample=${SL.SR},afade=t=in:d=0.6,` +
      `volume='1+2.2*clip((t-${(r.son - 0.3).toFixed(2)})/0.6,0,1)':eval=frame,afade=t=out:st=${(r.sure - SONUS).toFixed(3)}:d=${SONUS}[m]`); lab.push('[m]');
  } else {
    const kart = path.join(tmp, 'kart.wav'), giris = 0.4;
    SL.kartMuzigi(kart, r.kart + giris, { giris, sonus: SONUS });
    const ms = Math.round((r.son - giris) * 1000), i = inp('-i', kart);
    fc.push(`[${i}:a]adelay=${ms}|${ms}[m]`); lab.push('[m]');
  }
  const k0 = path.join(tmp, 'ses0.wav');
  K.sh('ffmpeg', ['-loglevel', 'error', '-y', ...ins, '-filter_complex', `${fc.join(';')};${lab.join('')}amix=inputs=${lab.length}:normalize=0:duration=longest,apad,atrim=0:${r.sure.toFixed(3)}[a]`, '-map', '[a]', '-c:a', 'pcm_s24le', k0]);
  const olc = spawnSync('ffmpeg', ['-hide_banner', '-i', k0, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const m = JSON.parse(olc.slice(olc.lastIndexOf('{'), olc.lastIndexOf('}') + 1));
  K.sh('ffmpeg', ['-loglevel', 'error', '-y', '-i', k0, '-af', `loudnorm=I=-14:TP=-1.5:LRA=9:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=${SL.SR}`, '-c:a', 'pcm_s24le', hedef]);
  fs.unlinkSync(k0);
}

// lines for a big title: the last word in the accent colour; font size so the longest line fits the width
function baslikSatirlari(metin, enBuyuk, vurgu = true) {
  const w = esc(metin).toLocaleUpperCase('tr').split(/\s+/).filter(Boolean);
  const satir = w.length > 2 ? [w.slice(0, Math.ceil(w.length / 2)).join(' '), w.slice(Math.ceil(w.length / 2)).join(' ')] : w.length === 2 && w.join(' ').length > 12 ? w : [w.join(' ')];
  if (vurgu) { const l = satir.length - 1, p = satir[l].split(' '); p[p.length - 1] = `<span>${p[p.length - 1]}</span>`; satir[l] = p.join(' '); }
  const uzun = Math.max(...satir.map(s => s.replace(/<[^>]+>/g, '').length));
  return { html: satir.join('<br>'), boy: Math.min(enBuyuk, Math.floor(980 / (0.47 * uzun))) };
}

function sayfa(is, a, r, hfDir, kimlik) {
  const C = K.palet(kimlik || {}), at = K.at, mod = a.mod || 'tanitim';
  const T = { Z: { satirlar: r.kesit.map(k => ({ bas: k.l0, son: +(k.l0 + k.v1 - k.v0).toFixed(3), kim: 'ses' })), kelimeler: r.kelimeler, sting: [] } };
  const duzF = path.join(is.dir, 'duzeltme.json');
  const cap = K.altyazi(T, { duzeltme: fs.existsSync(duzF) ? K.okuJson(duzF) : {}, anons_rolleri: [] }, C);
  const html = [`<div id="bgw"><video id="bg" src="assets/bg.mp4" muted playsinline data-start="0" data-duration="${r.sure.toFixed(3)}" data-track-index="0"></video></div>`];
  const tl = [];
  if (a.kanca && !var_('--kancasiz')) {                 // the hook title stands on frame 0, gone before the second sentence
    const b = baslikSatirlari(a.kanca, 140, false);
    html.push(`<div class="kanca" style="font-size:${b.boy}px">${b.html}</div>`);
    tl.push(`tl.to('.kanca',{opacity:0,duration:.35},${at(Math.min(2.4, r.son - 1))});`);
  }
  const soru = mod === 'tanitim' ? (a.soru || KS.soruKart(r.kesit[r.kesit.length - 1].metin)) : (a.soru || '');
  const s = soru ? baslikSatirlari(soru, 170) : null, m = kimlik && kimlik.marka;
  html.push(`<div id="kart"><div class="k-ic">${s ? `<div class="k-soru" style="font-size:${s.boy}px">${s.html}</div><div class="k-cizgi"></div>` : ''}` +
    `<div class="k-alt">${mod === 'tanitim' ? 'CEVAP TAM VİDEODA' : 'TAM VİDEO KANALDA'}</div>${m && m.logo ? `<div class="k-logo">${esc(m.logo[0])}<span>${esc(m.logo[1])}</span></div>` : ''}</div></div>`);
  const S0 = r.son;
  tl.push(`gsap.set('#kart',{opacity:0});tl.to('#kart',{opacity:1,duration:.25},${at(S0 - 0.05)});`,
    `tl.fromTo('.k-ic',{scale:1},{scale:1.04,duration:${at(r.kart)},ease:'sine.inOut'},${at(S0)});`,
    `gsap.set('.k-soru',{opacity:0,y:30});tl.to('.k-soru',{opacity:1,y:0,duration:.45,ease:'power3.out'},${at(S0 + 0.1)});`,
    `gsap.set('.k-cizgi',{scaleX:0});tl.to('.k-cizgi',{scaleX:1,duration:.5,ease:'power2.out'},${at(S0 + 0.5)});`,
    `gsap.set('.k-alt',{opacity:0,y:24});tl.to('.k-alt',{opacity:1,y:0,duration:.45,ease:'power3.out'},${at(S0 + (s ? 1.1 : 0.3))});`,
    `gsap.set('.k-logo',{opacity:0});tl.to('.k-logo',{opacity:1,duration:.4},${at(S0 + 1.5)});`);
  const css = `#bgw{position:absolute;inset:0;overflow:hidden}#bgw video{position:absolute;left:0;top:0;width:${K.W}px;height:${K.H}px}
.cap span{white-space:nowrap}
.kanca{position:absolute;left:40px;right:40px;top:230px;text-align:center;font:400 140px/1.02 "AntonTR";letter-spacing:.01em;color:${C.paper};text-shadow:0 6px 28px rgba(20,12,4,.85),0 0 60px rgba(20,12,4,.55)}
#kart{position:absolute;inset:0;background:${C.paper}}.k-ic{position:absolute;inset:0;transform-origin:50% 45%}
.k-soru{position:absolute;left:50px;right:50px;top:600px;text-align:center;font:400 170px/1.0 "AntonTR";color:${C.ink}}.k-soru span{color:${C.coral}}
.k-cizgi{position:absolute;left:390px;width:300px;top:1110px;height:10px;border-radius:5px;background:${C.coral};transform-origin:50% 50%}
.k-alt{position:absolute;left:0;width:${K.W}px;top:${s ? 1200 : 880}px;text-align:center;font:400 72px/1 "AntonTR";letter-spacing:.14em;color:${C.o2}}
.k-logo{position:absolute;left:0;width:${K.W}px;top:1660px;text-align:center;font:400 64px/1 "AntonTR";letter-spacing:.04em;color:${C.ink}}.k-logo span{color:${C.o2}}`;
  K.sayfaYaz(hfDir, { C, END: r.sure, css, baslik: is.ad + ' kesit', katmanlar: [...html, cap.html], tl: [...tl, ...cap.tl] });
  return soru;
}

function yap(is) {
  const { W, S } = kelimeYukle(is);
  let a, n = Math.max(1, +arg('--aday', 1) || 1);
  const liste = arg('--liste');
  if (liste) { const j = K.okuJson(path.resolve(liste)); a = j.adaylar ? j.adaylar[n - 1] : j; if (a) a.mod = a.mod || j.mod; }
  else {
    const f = path.join(is.dir, 'adaylar.json');
    if (!fs.existsSync(f)) K.fail('aday yok. Önce: node kesit/kesit.js sec ' + q(is.src));
    const j = K.okuJson(f); a = j.adaylar[n - 1];
    if (a) a.mod = a.mod || j.mod;
  }
  if (!a) K.fail(`${n}. aday yok.`);
  a.mod = a.mod || arg('--mod', 'tanitim');
  const r = KS.coz(a.parcalar, W, S, a.mod);
  console.log(KS.deneMetni(r));
  if (r.hata.length) K.fail('kesit listesi geçersiz: ' + r.hata.join('; '));
  const kimlik = arg('--kanal') ? K.okuJson(path.join(K.KOK, 'kanal', arg('--kanal'), 'kimlik.json'), 'kanal kimliği') : null;
  // a hand-written list gets its own folder and file name, so it never replaces candidate n's video
  const ek = liste ? `liste${n}` : `${n}`, mp4 = path.join(is.dir, `${is.ad}-kesit${ek}.mp4`);
  if (!var_('--kare') && fs.existsSync(mp4) && !var_('--uzerine')) K.fail(`${rel(mp4)} zaten var. Üstüne yazmak için --uzerine ekle (ya da eski videoyu başka bir ada taşı).`);
  const kd = path.join(is.dir, liste ? `l${n}` : `k${n}`), hfDir = path.join(kd, 'hf'), tmp = path.join(kd, 'tmp');
  fs.mkdirSync(path.join(hfDir, 'assets'), { recursive: true }); fs.mkdirSync(tmp, { recursive: true });
  console.log('\nGörüntü dikeye çevriliyor…');
  resim(is, r, path.join(hfDir, 'assets', 'bg.mp4'));
  const soru = sayfa(is, a, r, hfDir, kimlik);
  if (var_('--kare')) {
    const sn = [0.3, ...r.kesit.map((k, j) => +(k.l0 + (k.v1 - k.v0) / 2).toFixed(1)), +(r.son + 1.6).toFixed(1), +(r.sure - 0.2).toFixed(1)];
    K.kareler(hfDir, sn, path.join(kd, 'kareler'));
    console.log(`\nKarelere bak: ${rel(path.join(kd, 'kareler'))}. Beğenince --kare olmadan çalıştır.`);
    return;
  }
  console.log('Ses hazırlanıyor…');
  const wav = path.join(kd, 'ses.wav');
  ses(is, r, tmp, wav);
  K.renderEt(hfDir, wav, mp4, ENC);
  const aciklama = [soru && a.mod === 'tanitim' ? soru.charAt(0) + soru.slice(1).toLocaleLowerCase('tr') : '', 'Tam video kanalda.'].filter(Boolean).join(' ');
  console.log(`\n${r.sure.toFixed(1)} sn. İzle, sonra karelere bak (denetim/DENETIM.md).`);
  console.log(`Paylaşım sırasına koymak istersen (kendiliğinden eklenmez):\n  node kuyruk/kuyruk.js ekle ${q(mp4)} --aciklama ${q(aciklama)} --onay-gerekli`);
}

(async () => {
  const is = ['yazi', 'sec', 'dene', 'yap', 'hepsi'].includes(komut) ? isYukle() : K.fail('komut ver: yazi | sec | dene | yap | hepsi  (kesit/BENIOKU.md)');
  if (komut === 'yazi') yazi(is);
  else if (komut === 'sec') await sec(is);
  else if (komut === 'dene') dene(is);
  else if (komut === 'yap') yap(is);
  else { yazi(is); await sec(is); yap(is); }
})().catch(e => K.fail(e.message));
