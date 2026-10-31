// Shared core for every video: paths, settings, timing cues, captions, brand screens, page wrapper, render.
// Scene code (free tier) and the paid-tier background both sit on top of this.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const KOK = path.join(__dirname, '..');
const AYAR_DIR = path.join(os.homedir(), '.video-mutfagi');   // secrets live here, never inside the repo
const W = 1080, H = 1920, FPS = 30;

const fail = msg => { console.error('\nHATA: ' + msg + '\n'); process.exit(1); };
const okuJson = (f, ne) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { fail(`${ne || f} okunamadı (${e.code === 'ENOENT' ? 'dosya yok' : e.message}): ${f}`); } };
const sh = (cmd, args, opt = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opt }).toString();
const sure = f => +sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]);

// A video folder holds video.json; it points at the channel identity (kimlik.json).
function videoYukle(klasor) {
  if (!klasor) fail('video klasörünü ver. Örnek: videolar/oxygbio-v01-ucak');
  const dir = path.resolve(klasor);
  const video = okuJson(path.join(dir, 'video.json'), 'video.json');
  const kimlik = okuJson(path.resolve(dir, video.kanal), 'kanal kimliği (kimlik.json)');
  return { dir, video, kimlik, kimlikDir: path.dirname(path.resolve(dir, video.kanal)), ad: path.basename(dir) };
}

// Scene code written by a language model (sahneler.js, kanal/<ad>/karakter.js) runs in a sandbox: no require, no process,
// no file or network access, 5 s CPU limit. It only builds strings. Repo templates (uretim/sablonlar/) are trusted and use require.
function guvenliYukle(dosya) {
  const vm = require('vm');
  const kod = fs.readFileSync(dosya, 'utf8');
  const kutu = { module: { exports: {} }, console: { log() {}, warn() {}, error() {} } };
  kutu.exports = kutu.module.exports;
  try { vm.runInNewContext(kod, kutu, { filename: dosya, timeout: 5000 }); }
  catch (e) { fail(`${path.basename(dosya)} çalışmadı: ${e.message}`); }
  const fn = kutu.module.exports;
  if (typeof fn !== 'function') fail(`${path.basename(dosya)} bir fonksiyon dışa aktarmalı (module.exports = function (...) { ... }).`);
  return (...args) => { try { return fn(...args); } catch (e) { fail(`${path.basename(dosya)} hata verdi: ${e.message}`); } };
}

function anahtar(ad, nereden) {
  const f = path.join(AYAR_DIR, ad);
  if (!fs.existsSync(f)) fail(`${ad} bulunamadı. ${nereden}\nAnahtarı sohbete YAPIŞTIRMA: tek satır olarak şu dosyaya kaydet: ${f}`);
  return fs.readFileSync(f, 'utf8').trim();
}

// ---- timing: zaman.json comes from mix.js (line starts + global word times + sting hits + chimes)
const norm = s => s.toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/g, '');
function zamanlama(dir) {
  const Z = okuJson(path.join(dir, 'ses', 'zaman.json'), 'ses/zaman.json (önce `node uretim/mix.js` çalıştır)');
  const L = Z.satirlar.map(s => s.bas), LE = Z.satirlar.map(s => s.son);
  // first word at/after `after` whose normalized form starts with `w`
  const cue = (w, after = 0) => { const k = Z.kelimeler.find(x => x.a >= after - .01 && norm(x.w).startsWith(norm(w))); if (!k) fail(`"${w}" kelimesi ${after.toFixed(2)} sn sonrasında bulunamadı. Whisper kelimeyi bölmüş olabilir: ses/kelimeler.json'a bak ve parçasını kullan.`); return k.a; };
  // text expressions used in ucretli.json: "satir:3", "satir-sonu:2+0.3", "kelime:pıt@1-0.35", "anons:1", "sting:0", "son", 12.5
  const ifade = e => {
    if (typeof e === 'number') return e;
    const m = String(e).match(/^([a-z-]+)(?::([^@+-]+))?(?:@(\d+))?([+-][\d.]+)?$/);
    if (!m) fail('anlaşılmayan zaman ifadesi: ' + e);
    const [, tur, a, satir, ofs] = m, o = ofs ? +ofs : 0;
    if (tur === 'satir') return L[+a] + o;
    if (tur === 'satir-sonu') return LE[+a] + o;
    if (tur === 'kelime') return cue(a, satir ? L[+satir] : 0) + o;
    if (tur === 'anons') return Z.chime[+a] + o;
    if (tur === 'sting') return Z.sting[+a] + o;
    if (tur === 'son') return Z.toplam + o;
    fail('bilinmeyen zaman türü: ' + tur);
  };
  return { Z, L, LE, cue, ifade, END: Z.toplam };
}

const at = t => (+t).toFixed(3);
const f1 = n => (+n).toFixed(1);
function tohum(seed = 5) { let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; return { rnd, r2: (a, b) => a + (b - a) * rnd() }; }

// ---- palette + brand from the identity file
function palet(kimlik) { return Object.assign({ paper: '#F4EEDF', ink: '#1F2A30', coral: '#E8553A', o2: '#1FA9BE' }, kimlik.renkler || {}); }

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Whisper mishears some joined words; video.json "duzeltme" maps heard -> written (e.g. "yerde": "yer de").
const duzeltici = FIX => w => { const m = w.match(/^(.*?)([.,?!…]*)$/); const k = m[1].toLocaleLowerCase('tr'); if (!FIX[k]) return w; const v = FIX[k]; return (m[1][0] === m[1][0].toLocaleUpperCase('tr') ? v[0].toLocaleUpperCase('tr') + v.slice(1) : v) + m[2]; };

// short font names used by channel kits (scene parts, closing card, stroke captions); the files are the same ones sayfaYaz copies
const KISA_FONT = `@font-face{font-family:AN;src:url(assets/fonts/Anton-latin.woff2);unicode-range:U+0000-00FF,U+0131,U+2000-206F}
@font-face{font-family:AN;src:url(assets/fonts/Anton-latin-ext.woff2);unicode-range:U+0100-02AF,U+1E00-1E9F}
@font-face{font-family:IT;font-weight:600;src:url(assets/fonts/InterTight-600-latin.woff2);unicode-range:U+0000-00FF,U+0131,U+2000-206F}
@font-face{font-family:IT;font-weight:600;src:url(assets/fonts/InterTight-600-latin-ext.woff2);unicode-range:U+0100-02AF,U+1E00-1E9F}
@font-face{font-family:IT;font-weight:800;src:url(assets/fonts/InterTight-800-latin.woff2);unicode-range:U+0000-00FF,U+0131,U+2000-206F}
@font-face{font-family:IT;font-weight:800;src:url(assets/fonts/InterTight-800-latin-ext.woff2);unicode-range:U+0100-02AF,U+1E00-1E9F}`;

// ---- captions: the channel picks the look (kimlik.json → gorsel.altyazi): 'kutu' (default) or 'kontur'.
// kutu: 1-4 words per card in a light box, the spoken word lights up; announcer lines get a dark speaker card.
function altyazi(T, video, C, kimlik) {
  if ((((kimlik || {}).gorsel || {}).altyazi) === 'kontur') return altyaziKontur(T, video, C);
  const { Z } = T, HIT = Z.sting[0];
  const anons = new Set(video.anons_rolleri || []);
  const fixw = duzeltici(video.duzeltme || {});
  const chunks = [];
  Z.satirlar.forEach((s, li) => { const ws = Z.kelimeler.filter(k => k.satir === li); let cur = []; ws.forEach((w, i) => { cur.push(w);
    // 4 words per card, but never leave a clause's last word alone on the next card ("amına" / "koyayım.")
    const yetim = cur.length === 4 && ws[i + 1] && /[.,;:?!…]$/.test(ws[i + 1].w);
    if ((cur.length >= 4 && !yetim) || /[.,;:?!…]$/.test(w.w) || i === ws.length - 1) { chunks.push({ ws: cur, kim: s.kim, li }); cur = []; } }); });
  let html = ''; const tl = [];
  chunks.forEach((c, ci) => {
    const a = c.ws[0].a, nx = chunks[ci + 1];
    let b = nx && nx.li === c.li ? nx.ws[0].a : Z.satirlar[c.li].son + .15;
    if (c.li === 0 && HIT != null) b = Math.min(b, HIT - .3);          // hook captions clear before the sting
    const isA = anons.has(c.kim);
    html += `<div class="cap${isA ? ' anons' : ''} ch${ci}">${isA ? `<i>📢 ${c.kim.toLocaleUpperCase('tr')}</i>` : ''}${c.ws.map((w, wi) => `<span class="w${ci}_${wi}">${fixw(w.w)}</span>`).join(' ')}</div>`;
    tl.push(`gsap.set('.ch${ci}',{opacity:0});tl.set('.ch${ci}',{opacity:1},${at(a)});tl.set('.ch${ci}',{opacity:0},${at(b)});`);
    c.ws.forEach((w, wi) => tl.push(`tl.set('.w${ci}_${wi}',{color:'${C.coral}'},${at(w.a)});tl.set('.w${ci}_${wi}',{color:'${isA ? '#fff' : C.ink}'},${at(Math.max(w.b, w.a + .12))});`));
  });
  return { html: `<div id="caps">${html}</div>`, tl };
}

// kontur (story channels): 1-3 words straight over the scene, white Anton 83 px with a 16 px ink stroke (30.10: 20% under
// the first 104/20), top at y 1410, the spoken word
// lights up in #FFC9BC. A card breaks at punctuation or a pause; the last one is gone before the closing card.
function altyaziKontur(T, video, C) {
  const { Z } = T, fixw = duzeltici(video.duzeltme || {}), VURGU = '#FFC9BC';
  const chunks = [];
  Z.satirlar.forEach((s, li) => { const ws = Z.kelimeler.filter(k => k.satir === li); let cur = []; ws.forEach((w, i) => { cur.push(w); const nx = ws[i + 1];
    if (cur.length >= 3 || /[.,;:?!…]$/.test(w.w) || !nx || nx.a - w.b > .45) { chunks.push({ ws: cur, li }); cur = []; } }); });
  let html = ''; const tl = [];
  chunks.forEach((c, ci) => {
    const a = c.ws[0].a - .05, nx = chunks[ci + 1], son = c.ws[c.ws.length - 1].b;
    let b = nx ? Math.min(nx.ws[0].a - .05, son + .9) : Math.min(son + .9, Z.satirlar[c.li].son + .1);
    if (Z.kapanis != null) b = Math.min(b, Z.kapanis);
    html += `<div class="dcap dc${ci}">${c.ws.map((w, wi) => `<span class="dw${ci}_${wi}">${esc(fixw(w.w))}</span>`).join(' ')}</div>`;
    tl.push(`gsap.set('.dc${ci}',{opacity:0});tl.set('.dc${ci}',{opacity:1},${at(a)});tl.fromTo('.dc${ci}',{scale:.86},{scale:1,duration:.18,ease:'back.out(3)'},${at(a)});tl.set('.dc${ci}',{opacity:0},${at(b)});`);
    c.ws.forEach((w, wi) => tl.push(`tl.set('.dw${ci}_${wi}',{color:'${VURGU}'},${at(w.a)});tl.set('.dw${ci}_${wi}',{color:'#FFFFFF'},${at(Math.max(w.b, w.a + .15))});`));
  });
  const css = `${KISA_FONT}
.dcap{position:absolute;left:60px;right:60px;top:1410px;text-align:center;font:400 83px/1.06 AN;text-transform:uppercase;color:#fff;letter-spacing:1px;-webkit-text-stroke:16px ${C.ink};paint-order:stroke fill}`;
  return { html: `<div id="caps">${html}</div>`, tl, css };
}

// The channel's own closing card (kimlik.json → marka.kapanis, a file in the channel folder), sandboxed like karakter.js.
//   kapanis({ C, at, bas, sonraki, hesap }) -> { html, tl, sure, muzik?: {bas, ses}, gorsel?: file in the channel folder, css? }
function kapanisYukle(kimlik, kimlikDir) {
  const m = kimlik.marka || {};
  if (!m.kapanis) return null;
  if (!kimlikDir) fail('kapanış kartı için kanal klasörü verilmedi (marka(T, kimlik, C, { video, kimlikDir })).');
  const f = path.join(kimlikDir, m.kapanis);
  if (!fs.existsSync(f)) fail(`kapanış kartı yok: ${f} (kimlik.json → marka.kapanis)`);
  return guvenliYukle(f);
}
// The channel's episode cover (kimlik.json → marka.kapak.dosya, default kapak.js), sandboxed like the closing card.
//   kapak({ C, renk, baslik, satirlar, px, etiket, hesap, sahne }) -> { html, css }   (uretim/kapak.js renders it)
function kapakYukle(kimlik, kimlikDir) {
  const m = (kimlik.marka || {}).kapak;
  if (!m) return null;
  const f = path.join(kimlikDir || '', (typeof m === 'object' && m.dosya) || 'kapak.js');
  if (!fs.existsSync(f)) fail(`kapak dosyası yok: ${f} (kimlik.json → marka.kapak.dosya)`);
  return guvenliYukle(f);
}
// ---- story tone (video.json ton: komik | hüzünlü | ürkütücü | ciddi; dizi/ton.js). Anything but komik is told with respect:
// no comic sound, calmer voice settings, a softer closing bed (or none).
const ciddiTon = ton => ['hüzünlü', 'ürkütücü', 'ciddi'].includes(ton);
// the kit's tts settings for this tone (kimlik.json → tts.ton_ayarlari[ton] over tts.voice_settings)
const tonSesAyari = (tts, ton) => ({ ...((tts || {}).voice_settings || {}), ...((((tts || {}).ton_ayarlari) || {})[ton] || {}) });
// the names a last episode's closing card thanks (video.json → tesekkur: commenters' usernames), cleaned and unique
const tesekkurListesi = video => [...new Set((Array.isArray(video.tesekkur) ? video.tesekkur : []).map(x => String(x || '').trim().replace(/^@+/, '')).filter(x => /^[\w.]{1,30}$/.test(x)))];
// the closing bed: marka.kapanis_muzigi for komik, marka.kapanis_muzigi_ciddi (or nothing) for a serious tone
const kapanisMuzigi = (marka, ton) => (ciddiTon(ton) ? (marka || {}).kapanis_muzigi_ciddi : (marka || {}).kapanis_muzigi) || null;
// the thanks outro's own bed, looped to the card's length; falls back to the closing bed. marka.tesekkur_muzigi is a file,
// or one file per tone ({ komik, hüzünlü, ürkütücü, ciddi }; a missing tone takes komik for komik, else any calm one)
function tesekkurMuzigi(marka, ton) {
  const m = (marka || {}).tesekkur_muzigi;
  if (m && typeof m === 'object') return m[ton] || (ciddiTon(ton) ? m.ciddi || m['hüzünlü'] || m['ürkütücü'] : m.komik) || null;
  return (ciddiTon(ton) ? (marka || {}).tesekkur_muzigi_ciddi : m) || null;
}

// The card's sound effects ({sfx: [[name, time, volume]]}) as mix inputs: kanal/<kanal>/muzik/<name>.wav. A name that is
// not a plain word or has no file is skipped, a non-numeric volume plays at 1 (the card still plays, just without that sound).
// A serious tone keeps only soft effects (names starting with "yumusak"): no pop, whoosh, tick, ding or sting.
function kapanisSesleri(k, kimlikDir, ton) {
  const out = [];
  for (const e of (k && k.sfx) || []) {
    const [ad, t, ses] = [].concat(e), f = /^[\w-]+$/.test(String(ad)) ? path.join(kimlikDir, 'muzik', ad + '.wav') : null;
    if (ciddiTon(ton) && !/^yumusak/.test(String(ad))) continue;
    if (f && fs.existsSync(f) && isFinite(t)) out.push([f, Math.max(0, +t), isFinite(ses) && ses !== null && ses !== '' ? +ses : 1]);   // odd volume -> 1, never NaN
  }
  return out;
}

// ---- brand screens. Default: opening sting after the hook, closing sting + call to action; corner tag in between.
// A channel with marka.kapanis gets no stings: a top label (video.json etiket · BÖLÜM n) and its closing card at Z.kapanis.
// `ek` = { video, kimlikDir } (needed only for the closing card).
function marka(T, kimlik, C, ek = {}) {
  if (kimlik.marka && kimlik.marka.kapanis) return markaKapanis(T, kimlik, C, ek);
  const m = kimlik.marka, { Z, L } = T, html = [], tl = [];
  const logo = `${m.logo[0]}<span>${m.logo[1]}</span>`;
  const ekran = (id, extra = '') => `<div class="sc" id="${id}"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${C.paper}"/>
    <circle class="${id}-dot" cx="540" cy="900" r="60" fill="${C.o2}"/><circle class="${id}-ring" cx="540" cy="900" r="300" fill="none" stroke="${C.o2}" stroke-width="12"/></svg>
    <div class="st-logo ${id}-logo">${logo}</div>${extra}</div>`;
  const vurus = (id, hit, fadeIn) => {
    tl.push(`gsap.set('#${id}',{opacity:0});tl.to('#${id}',{opacity:1,duration:${fadeIn}},${at(hit - .2)});`);
    tl.push(`gsap.set('.${id}-dot',{scale:0,svgOrigin:'540 900'});tl.to('.${id}-dot',{scale:1,duration:.5,ease:'power2.in'},${at(hit - .55)});tl.to('.${id}-dot',{scale:0,duration:.2},${at(hit)});`);
    tl.push(`gsap.set('.${id}-ring',{scale:0,svgOrigin:'540 900',opacity:1});tl.to('.${id}-ring',{scale:1.2,opacity:0,duration:1,ease:'expo.out'},${at(hit)});`);
    tl.push(`gsap.set('.${id}-logo',{opacity:0,scale:.85});tl.to('.${id}-logo',{opacity:1,scale:1,duration:.5,ease:'power3.out'},${at(hit)});`);
  };
  html.push(ekran('st'));
  vurus('st', Z.sting[0], .15);
  tl.push(`tl.to('#st',{opacity:0,duration:.3},${at(L[1] + .25)});`);
  if (Z.sting[1] != null) {
    html.push(ekran('st2', `<div class="cta2">${m.cta[0]}<br><span>${m.cta[1]}</span></div>`));
    vurus('st2', Z.sting[1], .2);
    tl.push(`gsap.set('.cta2',{opacity:0,y:30});tl.to('.cta2',{opacity:1,y:0,duration:.45,ease:'power3.out'},${at(Z.sting[1] + .6)});`);
  }
  html.push(`<div class="tag">${logo} · ${m.etiket}</div>`);
  tl.push(`tl.to('.tag',{opacity:0,duration:.2},${at(Z.sting[0] - .3)});tl.to('.tag',{opacity:1,duration:.3},${at(L[1] + .3)});`);
  if (Z.sting[1] != null) tl.push(`tl.to('.tag',{opacity:0,duration:.2},${at(Z.sting[1] - .4)});`);
  return { html: html.join('\n'), tl };
}

// top label "<TITLE> · BÖLÜM n": title and marker apart, font from the total length (30 px up to 30 characters, down to 22)
function etiketParcala(etiket, bolum) {
  const etk = String(etiket || '').toLocaleUpperCase('tr').trim(), ek = bolum ? ` · BÖLÜM ${bolum}` : '';
  const ad = ek && etk.endsWith(ek) ? etk.slice(0, -ek.length) : etk, n = ad.length + ek.length;
  return { ad, ek, px: n <= 30 ? 30 : n <= 36 ? 27 : n <= 42 ? 24 : 22 };
}

function markaKapanis(T, kimlik, C, { video = {}, kimlikDir } = {}) {
  const m = kimlik.marka, { Z } = T, html = [], tl = [];
  const kart = kapanisYukle(kimlik, kimlikDir);
  const bolum = +video.bolum || null, toplam = +video.toplam_bolum || null;
  const sonraki = bolum && (!toplam || bolum < toplam) ? bolum + 1 : null;
  const hesap = m.hesap || kimlik.hesap;
  // zaman.json from mix.js carries the card start; an older one without it gets the card at the very end
  const ton = video.ton || 'komik', tesekkur = sonraki ? [] : tesekkurListesi(video);
  const bas = Z.kapanis != null ? Z.kapanis : T.END - kart({ C, at, bas: 0, sonraki, hesap, ton, tesekkur }).sure;
  const k = kart({ C, at, bas, sonraki, hesap, ton, tesekkur });
  if (video.etiket) {
    // the episode marker always shows: a long title gets a smaller font, and only the title part is cut with "…"
    const { ad, ek, px } = etiketParcala(video.etiket, bolum);
    html.push(`<div class="etk" style="font-size:${px}px"><i></i><span class="etk-ad">${esc(ad)}</span>${ek ? `<span class="etk-no">${esc(ek.trim())}</span>` : ''}</div>`);
    tl.push(`gsap.set('.etk',{opacity:0,y:-30});tl.to('.etk',{opacity:1,y:0,duration:.4,ease:'power3.out'},0.2);tl.set('.etk',{opacity:0},${at(bas)});`);
  }
  html.push(k.html); tl.push(...k.tl);
  const css = `${KISA_FONT}
.etk{position:absolute;left:60px;top:150px;box-sizing:border-box;display:flex;max-width:880px;height:64px;padding:0 32px 0 58px;border-radius:32px;background:${C.ink};color:#FFFDF8;font:800 30px/64px IT;letter-spacing:2px;white-space:nowrap;overflow:hidden}
.etk-ad{min-width:0;overflow:hidden;text-overflow:ellipsis}.etk-no{flex:none;padding-left:.32em}
.etk i{position:absolute;left:24px;top:22px;width:20px;height:20px;border-radius:50%;background:${C.domates || C.coral}}${k.css ? '\n' + k.css : ''}`;
  const varliklar = k.gorsel ? [{ kaynak: path.join(kimlikDir, k.gorsel), ad: k.gorsel }] : [];
  return { html: html.join('\n'), tl, css, varliklar };
}

const FONT_CSS = `@font-face{font-family:"AntonTR";src:url(assets/fonts/Anton-latin-ext.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1EFF,U+20A0-20C0,U+2C60-2C7F,U+A720-A7FF;}
@font-face{font-family:"AntonTR";src:url(assets/fonts/Anton-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+2153,U+20AC,U+2122,U+2212,U+FEFF,U+FFFD;}
@font-face{font-family:"Inter Tight";font-weight:800;src:url(assets/fonts/InterTight-800-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+2000-206F;}
@font-face{font-family:"Inter Tight";font-weight:800;src:url(assets/fonts/InterTight-800-latin-ext.woff2) format("woff2");unicode-range:U+0100-02FF,U+1E00-1EFF;}`;

// cover mode (uretim/kapak.js): the scene snapshot for an episode cover puts class="kapak" on <body>, which hides the
// captions, the top episode label and the corner tag, so the cover shows the clean scene
const temelCss = C => `${FONT_CSS}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${C.paper}}
body.kapak #caps,body.kapak .etk,body.kapak .tag{display:none!important}
.sc{position:absolute;inset:0;overflow:hidden}.sc svg{position:absolute;left:0;top:0}
.st-logo{position:absolute;left:0;top:830px;width:${W}px;text-align:center;font:400 170px/1 "AntonTR";letter-spacing:.04em;color:${C.ink}}.st-logo span{color:${C.o2}}
.tag{position:absolute;left:60px;top:150px;font:400 42px/1 "AntonTR";letter-spacing:.06em;color:${C.ink};background:rgba(244,238,223,.85);padding:12px 20px;border-radius:12px}.tag span{color:${C.o2}}
.cap{position:absolute;left:70px;right:70px;top:1590px;text-align:center;font:400 84px/1.08 "AntonTR";text-transform:uppercase;color:${C.ink};background:rgba(247,243,234,.92);border-radius:28px;padding:22px 28px 18px;box-shadow:0 12px 34px rgba(60,45,25,.18)}
.cap.anons{left:110px;right:110px;top:1570px;background:${C.ink};color:#fff;box-shadow:0 12px 34px rgba(0,0,0,.25);border-radius:30px;padding:24px 30px 20px}
.cap.anons i{display:block;font:800 30px/1 "Inter Tight";font-style:normal;letter-spacing:.18em;margin-bottom:10px;color:${C.coral}}
.cta2{position:absolute;left:0;top:1240px;width:${W}px;text-align:center;font:400 78px/1.1 "AntonTR";color:${C.ink}}.cta2 span{color:${C.coral}}`;

// Writes a HyperFrames project (index.html + fonts + gsap) into `hfDir`. Layers are stacked in order.
function sayfaYaz(hfDir, { C, END, css = '', katmanlar, tl, baslik }) {
  const assets = path.join(hfDir, 'assets');
  fs.mkdirSync(path.join(assets, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(KOK, 'uretim', 'fontlar'))) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(KOK, 'uretim', 'fontlar', f), path.join(assets, 'fonts', f));
  const gsap = path.join(KOK, 'node_modules', 'gsap', 'dist', 'gsap.min.js');
  if (!fs.existsSync(gsap)) fail('gsap bulunamadı. Repo klasöründe `npm install` çalıştır.');
  fs.copyFileSync(gsap, path.join(assets, 'gsap.min.js'));
  const html = `<!doctype html><html lang="tr"><head><meta charset="UTF-8"/><title>${baslik}</title><style>
${temelCss(C)}
${css}
</style><script src="assets/gsap.min.js"></script></head><body>
<div id="root" data-composition-id="root" data-width="${W}" data-height="${H}" data-start="0" data-duration="${END.toFixed(3)}">
${katmanlar.join('\n')}
<script>
const tl = gsap.timeline({paused:true});
${tl.join('\n')}
tl.set({}, {}, ${END.toFixed(3)});
window.__timelines = window.__timelines || {}; window.__timelines['root'] = tl;
</script></div></body></html>`;
  fs.writeFileSync(path.join(hfDir, 'index.html'), html);
}

// Runs the repo's own HyperFrames through node directly: no shell, so folder names with spaces or Turkish letters are safe.
function hf(args, cwd) {
  const bin = path.join(KOK, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
  if (!fs.existsSync(bin)) fail('hyperframes bulunamadı. Repo klasöründe `npm install` çalıştır.');
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, stdio: 'inherit' });
  if (r.status !== 0) fail('hyperframes ' + args[0] + ' başarısız oldu (çıktı yukarıda).');
}
// Stills at given seconds for a quick look before a full render.
function kareler(hfDir, saniyeler, outDir) { hf(['snapshot', '.', '--at', saniyeler.join(','), '--no-end', '--describe', 'false', '-o', outDir], hfDir); }
// Full render (one worker: several workers can flicker frame to frame) + narration mux.
// `kodlama` overrides the final encode (kesit/ uses a smaller one for short teasers).
const KODLAMA = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k'];
function renderEt(hfDir, mixWav, outMp4, kodlama = KODLAMA) {
  // silent render goes to a short temp path: HyperFrames builds a long transaction folder name next to its output,
  // which breaks the 260-character Windows path limit when the repo sits in a deep folder
  const ham = path.join(os.tmpdir(), `vm-${process.pid}-${Date.now()}.mp4`);
  hf(['render', '.', '-f', String(FPS), '--crf', '18', '-w', '1', '-o', ham], hfDir);
  sh('ffmpeg', ['-loglevel', 'error', '-y', '-i', ham, '-i', mixWav, '-map', '0:v', '-map', '1:a', ...kodlama, '-shortest', '-movflags', '+faststart', outMp4]);
  fs.unlinkSync(ham);
  console.log(`\nHAZIR: ${outMp4} (${(fs.statSync(outMp4).size / 1048576).toFixed(1)} MB)`);
}

module.exports = { ciddiTon, tonSesAyari, kapanisMuzigi, tesekkurMuzigi, tesekkurListesi, etiketParcala, KOK, AYAR_DIR, W, H, FPS, fail, okuJson, sh, sure, videoYukle, guvenliYukle, anahtar, zamanlama, at, f1, tohum, palet, altyazi, marka, kapanisYukle, kapakYukle, kapanisSesleri, KISA_FONT, esc, sayfaYaz, kareler, renderEt, norm };
