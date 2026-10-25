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
  return { dir, video, kimlik, ad: path.basename(dir) };
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

// ---- captions: 1-4 words per card, the spoken word lights up; announcer lines get a dark speaker card.
// Whisper mishears some joined words; video.json "duzeltme" maps heard -> written (e.g. "yerde": "yer de").
function altyazi(T, video, C) {
  const { Z } = T, FIX = video.duzeltme || {}, HIT = Z.sting[0];
  const anons = new Set(video.anons_rolleri || []);
  const fixw = w => { const m = w.match(/^(.*?)([.,?!…]*)$/); const k = m[1].toLocaleLowerCase('tr'); if (!FIX[k]) return w; const v = FIX[k]; return (m[1][0] === m[1][0].toLocaleUpperCase('tr') ? v[0].toLocaleUpperCase('tr') + v.slice(1) : v) + m[2]; };
  const chunks = [];
  Z.satirlar.forEach((s, li) => { const ws = Z.kelimeler.filter(k => k.satir === li); let cur = []; ws.forEach((w, i) => { cur.push(w); if (cur.length >= 4 || /[.,?!…]$/.test(w.w) || i === ws.length - 1) { chunks.push({ ws: cur, kim: s.kim, li }); cur = []; } }); });
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

// ---- brand screens: opening sting after the hook, closing sting + call to action; corner tag in between
function marka(T, kimlik, C) {
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

const FONT_CSS = `@font-face{font-family:"AntonTR";src:url(assets/fonts/Anton-latin-ext.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1EFF,U+20A0-20C0,U+2C60-2C7F,U+A720-A7FF;}
@font-face{font-family:"AntonTR";src:url(assets/fonts/Anton-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+2153,U+20AC,U+2122,U+2212,U+FEFF,U+FFFD;}
@font-face{font-family:"Inter Tight";font-weight:800;src:url(assets/fonts/InterTight-800-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+2000-206F;}
@font-face{font-family:"Inter Tight";font-weight:800;src:url(assets/fonts/InterTight-800-latin-ext.woff2) format("woff2");unicode-range:U+0100-02FF,U+1E00-1EFF;}`;

const temelCss = C => `${FONT_CSS}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${C.paper}}
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
function renderEt(hfDir, mixWav, outMp4) {
  // silent render goes to a short temp path: HyperFrames builds a long transaction folder name next to its output,
  // which breaks the 260-character Windows path limit when the repo sits in a deep folder
  const ham = path.join(os.tmpdir(), `vm-${process.pid}-${Date.now()}.mp4`);
  hf(['render', '.', '-f', String(FPS), '--crf', '18', '-w', '1', '-o', ham], hfDir);
  sh('ffmpeg', ['-loglevel', 'error', '-y', '-i', ham, '-i', mixWav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', outMp4]);
  fs.unlinkSync(ham);
  console.log(`\nHAZIR: ${outMp4} (${(fs.statSync(outMp4).size / 1048576).toFixed(1)} MB)`);
}

module.exports = { KOK, AYAR_DIR, W, H, FPS, fail, okuJson, sh, sure, videoYukle, anahtar, zamanlama, at, f1, tohum, palet, altyazi, marka, sayfaYaz, kareler, renderEt, norm };
