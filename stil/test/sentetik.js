// Synthetic test videos whose editing is known by construction, for checking stil/olc.js.
// Modelled on a real editor's reels that were measured by hand (see stil/BENIOKU.md, "Örnek"):
//   punch-in 1.22 -> 1.00 at the start of camera shots, then a slow 1.00 <-> 1.10 zoom rhythm,
//   a 1-frame white flash + blur-to-sharp on camera -> graphic, a whip pan graphic -> graphic, a hard cut back,
//   captions as a thin + bold pair (bold block at the end of the line) that change without animation,
//   a title that sharpens over ~0.35 s, a paragraph that opens line by line, a low "bum" on cuts, a "whoosh" on the whip,
//   speech-like sound under camera shots, no music, a fixed palette.
// Only ffmpeg and the repo's own font (uretim/fontlar) are used, so it runs on any machine that runs the engine.
//
//   const S = require('./sentetik');  const dogru = await S.uret('out.mp4', { fps: 30, kisa: true });
//   node stil/test/sentetik.js <out.mp4> [--fps 25] [--kisa] [--w 1080]   (writes <out>.dogru.json next to it)
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const FONT = path.join(__dirname, 'InterTight-800-latin.ttf');   // variable font, default (regular) instance
const RENK = { lacivert: '#1F2A44', camgobegi: '#2E8C8C', turuncu: '#F2711C', kagit: '#EFE6D2' };
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

const ff = (args, cwd, girdi) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd, input: girdi, maxBuffer: 1 << 28 });

// ---- scene stills drawn in node (rgb24), saved as PNG: textured enough for camera matching, colours only from the palette
function sahne(W, H, tohum, zemin, renkler, bosAlan) {
  let s = tohum; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const p = Buffer.alloc(W * H * 3), [zr, zg, zb] = rgb(zemin);
  for (let i = 0; i < W * H; i++) { p[i * 3] = zr; p[i * 3 + 1] = zg; p[i * 3 + 2] = zb; }
  const boya = (x0, y0, x1, y1, c, daire) => {
    const [R, G, B] = rgb(c), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
    for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1); x++) {
      if (daire && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      const i = (y * W + x) * 3; p[i] = R; p[i + 1] = G; p[i + 2] = B;
    }
  };
  const k = W / 1080;
  for (let i = 0; i < 260; i++) {
    const big = i < 40, sz = (big ? 120 + r() * 260 : 14 + r() * 90) * k, x = r() * W, y = r() * H;
    const c = renkler[Math.floor(r() * renkler.length)], tur = r();
    if (tur < .45) boya(x, y, x + sz, y + sz * (.3 + r() * 1.4), c, false);
    else if (tur < .85) boya(x, y, x + sz, y + sz, c, true);
    else boya(x, y, x + sz * 3, y + Math.max(3, sz * .08), c, false);       // thin stripes: fine detail
  }
  for (const [y0, y1] of bosAlan || []) boya(0, y0 * k, W, y1 * k, zemin, false);   // a clean area for text, like a real graphic
  return p;
}
const png = (dir, ad, W, H, p) => { ff(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', '-', '-frames:v', '1', ad], dir, p); return ad; };

// ---- text measured in the font engine itself (ffmpeg drawtext, white on black, no outline): ink box and stem width
function yaziOlc(dir, metin, px, kalin) {
  const Wc = 2 * Math.ceil((px * metin.length * .9 + 200) / 2), Hc = 2 * Math.ceil((px * 2 + 100) / 2);   // even sizes: odd widths shift rows
  const b = ff(['-f', 'lavfi', '-i', `color=black:s=${Wc}x${Hc}`, '-vf',
    `drawtext=fontfile=font.ttf:text='${metin}':fontsize=${px}:fontcolor=white:x=50:y=50${kalin ? `:borderw=${kalin}:bordercolor=white` : ''},format=gray`,
    '-frames:v', '1', '-f', 'rawvideo', '-'], dir);
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; const runs = [];
  for (let y = 0; y < Hc; y++) { let run = 0;
    for (let x = 0; x < Wc; x++) { const ink = b[y * Wc + x] > 127;
      if (ink) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); run++; }
      else if (run) { runs.push([y, run]); run = 0; } } }
  const ic = runs.filter(([y]) => y > y0 + (y1 - y0) * .2 && y < y1 - (y1 - y0) * .2).map(r => r[1]).sort((a, c) => a - c);
  return { sol: x0 - 50, ust: y0 - 50, en: x1 - x0 + 1, boy: y1 - y0 + 1, govde: ic[ic.length >> 1] };
}

// ---- timeline (seconds). kisa = the short clip used by the automated test
function zamanCizelgesi(kisa) {
  return kisa
    ? { A1: [0, 2.4], B: [2.4, 4.4], whip: [4.4, 4.6], B2: [4.6, 5.8], A2: [5.8, 7.2], baslik: 2.8, paragraf: 4.8, yariPeriyot: 1.0, kartSn: .8 }
    : { A1: [0, 4.0], B: [4.0, 8.0], whip: [8.0, 8.2], B2: [8.2, 10.0], A2: [10.0, 12.0], baslik: 5.0, paragraf: 8.6, yariPeriyot: 1.8, kartSn: 1.0 };
}
const PUNCH = { bas: 1.22, sure: .4 }, RITIM = { alt: 1.0, ust: 1.10 };
// zoom of a camera shot at shot time t: ease-out punch, then a cosine rhythm between 1.00 and 1.10
const zoomIfade = (hp, t = 't') => `if(lt(${t},${PUNCH.sure}),1+${PUNCH.bas - 1}*pow(1-${t}/${PUNCH.sure},3),1+${(RITIM.ust - 1) / 2}*(1-cos(PI*(${t}-${PUNCH.sure})/${hp})))`;
const zoomDeger = (t, hp) => t < PUNCH.sure ? 1 + (PUNCH.bas - 1) * (1 - t / PUNCH.sure) ** 3 : 1 + (RITIM.ust - 1) / 2 * (1 - Math.cos(Math.PI * (t - PUNCH.sure) / hp));

// ---- speech-like bed + sound effects, 48 kHz mono 16-bit WAV
function ses(sure, Z, efekt) {
  const sr = 48000, n = Math.round(sure * sr), x = new Float32Array(n);
  let s = 99; const r = () => (s = (s * 16807) % 2147483647) / 2147483647 * 2 - 1;
  // speech: f0 ~120 Hz harmonics shaped by two formants, syllables at ~4.5 Hz with pauses, under camera shots only
  for (const [a, b] of [Z.A1, Z.A2]) for (let i = Math.round(a * sr); i < Math.min(n, b * sr); i++) {
    const t = i / sr, hece = Math.max(0, Math.sin(2 * Math.PI * 4.5 * t)) ** 2 * (Math.sin(2 * Math.PI * .7 * t) > -.6 ? 1 : 0);
    const f0 = 120 + 15 * Math.sin(2 * Math.PI * 1.3 * t); let v = 0;
    for (let h = 1; h <= 30; h++) { const f = f0 * h, g = Math.exp(-(((f - 550) / 250) ** 2)) + .5 * Math.exp(-(((f - 1600) / 400) ** 2)) + .02; v += g * Math.sin(2 * Math.PI * f * t + h); }
    x[i] += .09 * hece * v;
  }
  for (const e of efekt) {
    const i0 = Math.round(e.t * sr);
    if (e.tur === 'bas') for (let i = 0; i < .45 * sr && i0 + i < n; i++) { const t = i / sr; x[i0 + i] += .8 * Math.min(1, t / .004) * Math.exp(-t / .12) * Math.sin(2 * Math.PI * (55 + 40 * Math.exp(-t / .03)) * t); }
    if (e.tur === 'whoosh') { let lp = 0, lp2 = 0;
      for (let i = 0; i < .35 * sr && i0 + i < n; i++) { const t = i / sr, env = Math.sin(Math.PI * t / .35) ** 1.5, w = r();
        lp += .35 * (w - lp); lp2 += .05 * (lp - lp2); x[i0 + i] += .55 * env * (w - lp2 * 1.2); } }
  }
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  return b;
}

async function uret(cikti, o = {}) {
  const fps = o.fps || 30, W = o.w || 1080, H = Math.round(W * 16 / 9 / 2) * 2, k = W / 1080, Z = zamanCizelgesi(o.kisa);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stil-sentetik-'));
  try {
    fs.copyFileSync(FONT, path.join(dir, 'font.ttf'));
    const F = t => Math.round(t * fps);                       // seconds -> frame index
    const sure = Z.A2[1], N = F(sure);
    // scenes: A = "camera" (dark, busy), B / B2 = "graphics" (paper + orange sun + navy ink)
    const A = sahne(W, H, 11, RENK.lacivert, [RENK.camgobegi, RENK.turuncu, RENK.lacivert, RENK.camgobegi]);
    const A2 = sahne(W, H, 23, RENK.lacivert, [RENK.camgobegi, RENK.turuncu, RENK.camgobegi]);
    const B = sahne(W, H, 37, RENK.kagit, [RENK.turuncu, RENK.lacivert, RENK.kagit], [[620, 1000]]);
    const B2 = sahne(W, H, 51, RENK.kagit, [RENK.lacivert, RENK.turuncu, RENK.kagit, RENK.kagit], [[970, 1300]]);
    const serit = Buffer.alloc(W * 2 * H * 3);                 // B | B2 side by side for the whip pan
    for (let y = 0; y < H; y++) { B.copy(serit, y * W * 6, y * W * 3, (y + 1) * W * 3); B2.copy(serit, y * W * 6 + W * 3, y * W * 3, (y + 1) * W * 3); }
    png(dir, 'a.png', W, H, A); png(dir, 'a2.png', W, H, A2); png(dir, 'b.png', W, H, B); png(dir, 'b2.png', W, H, B2); png(dir, 'serit.png', 2 * W, H, serit);

    // text: thin = regular instance; bold = the same glyphs thickened with a same-colour border (a weight jump like 320 -> 760)
    const KALIN = Math.max(1, Math.round(3 * k)), KONTUR = Math.max(1, Math.round(3 * k));
    const capPx = Math.round(68 * k), baslikPx = Math.round(120 * k), altPx = Math.round(50 * k);
    const ince = yaziOlc(dir, 'AYLARDIR', capPx, 0);
    // a real bold weight has the same cap height as the thin one: shrink the thickened glyphs by the border
    const kalinPx = Math.round(capPx - 2 * KALIN * capPx / ince.boy), kalin = yaziOlc(dir, 'AYLARDIR', kalinPx, KALIN);
    const kartlar = [['SADECE', 'UC ADIM'], ['AYLARDIR', 'AYNI CIRODA'], ['BU YUZDEN', 'KAYBEDIYOR'], ['HER GUN', 'BIR VIDEO'], ['ASIL FARK', 'BURADA'], ['PEKI', 'NEDEN']];
    const kartZaman = [];
    for (const [a, b] of [Z.A1, Z.A2]) for (let t = a; t < b - 1e-6; t += Z.kartSn) kartZaman.push([t, Math.min(b, t + Z.kartSn)]);
    const capY = Math.round(1500 * k);                       // top of the drawtext box
    const dt = (metin, x, y, px, renk, kenar, ek) => `drawtext=fontfile=font.ttf:text='${metin}':fontsize=${px}:fontcolor=${renk}:x=${x}:y=${y}${kenar ? `:borderw=${kenar[0]}:bordercolor=${kenar[1]}` : ''}${ek || ''}`;
    const capF = [];
    kartZaman.forEach(([a, b], i) => {
      const [t1, t2] = kartlar[i % kartlar.length], m1 = yaziOlc(dir, t1, capPx, 0), m2 = yaziOlc(dir, t2, kalinPx, KALIN);
      const bosluk = Math.round(capPx * .3), top = m1.en + bosluk + m2.en, x1 = Math.round((W - top) / 2) - m1.sol, x2 = x1 + m1.sol + m1.en + bosluk - m2.sol;
      const en = `:enable='between(n,${F(a)},${F(b) - 1})'`;
      capF.push(dt(t1, x1, capY, capPx, 'white', [KONTUR, '0x101820'], en));
      const y2 = capY + (m1.ust + m1.boy) - (m2.ust + m2.boy);       // same baseline
      capF.push(dt(t2, x2, y2, kalinPx, 'white', [KALIN + KONTUR, '0x101820'], en), dt(t2, x2, y2, kalinPx, 'white', [KALIN, 'white'], en));
    });

    // camera shots: scale per frame around the centre, then crop back to W x H
    // camera shots: zoom around the centre with sub-pixel precision (perspective maps the centre 1/z of the frame onto it;
    // its frame counter `in` is 1 on the first frame)
    const kamera = (giris, [a, b], ad) => { const z = `(${zoomIfade(Z.yariPeriyot, `(max(0,in-1)/${fps})`)})`, x0 = `W/2-W/2/${z}`, x1 = `W/2+W/2/${z}`, y0 = `H/2-H/2/${z}`, y1 = `H/2+H/2/${z}`;
      return `[${giris}:v]format=yuv420p,trim=end_frame=${F(b) - F(a)},setpts=PTS-STARTPTS,perspective=x0='${x0}':y0='${y0}':x1='${x1}':y1='${y0}':x2='${x0}':y2='${y1}':x3='${x1}':y3='${y1}':interpolation=linear:eval=frame,setsar=1[${ad}]`; };
    // graphic B: blur-to-sharp entrance over 0.2 s after the flash frame (sigma per frame through sendcmd; sigmaV must be
    // sent too, it only follows sigma at start-up)
    const girisKare = F(.2), girisCmd = Array.from({ length: girisKare }, (_, i) => (g => `${((i + 1) / fps - .0005).toFixed(4)} gblur@g sigma ${g}, gblur@g sigmaV ${g}`)((10 * k * (1 - (i + 1) / girisKare) ** 1.5 + .01).toFixed(3))).join(';');
    // whip: B slides out to the left, B2 in from the right, eased, with horizontal motion blur
    const wn = F(Z.whip[1]) - F(Z.whip[0]);
    // title: fades in over 0.1 s, then sharpens slowly with a long faint tail (blur 8 px -> 1.5 px over ~0.35 s, then sharp).
    // The tail is visible at 1080p but not on a 360p copy: the trap where 0.35 s was once measured as 0.18 s.
    const bk = F(.35), bY = Math.round(640 * k), lh = Math.round(420 * k);
    const baslikCmd = Array.from({ length: bk + 1 }, (_, i) => (g => `${((F(Z.baslik) + i) / fps - .0005).toFixed(4)} gblur@t sigma ${g}, gblur@t sigmaV ${g}`)(((i < bk ? 1.5 + 6.5 * (1 - i / bk) ** 2 : .01) * k).toFixed(3))).join(';');
    const bm = yaziOlc(dir, 'BUYUME', baslikPx, Math.round(4 * k)), am = yaziOlc(dir, 'UC AYDA IKI KAT', altPx, 0);
    const baslikKatman = `color=c=black@0:s=${W}x${lh}:r=${fps},format=rgba,`
      + dt('BUYUME', Math.round((W - bm.en) / 2) - bm.sol, Math.round(40 * k), baslikPx, '0x1F2A44', [Math.round(4 * k), '0x1F2A44']) + ','
      + dt('UC AYDA IKI KAT', Math.round((W - am.en) / 2) - am.sol, Math.round(230 * k), altPx, '0x1F2A44') + ','
      + `sendcmd=c='${baslikCmd}',gblur@t=sigma=${(8 * k).toFixed(2)},fade=t=in:st=${(F(Z.baslik) / fps).toFixed(4)}:d=${(F(.1) / fps).toFixed(4)}:alpha=1[ttl]`;
    // paragraph: 3 thin lines, each fades in over 0.2 s, 0.25 s apart -> about 0.7 s for the whole paragraph
    const pSatir = ['ILK AY SADECE IZLEDIK', 'IKINCI AY OLCTUK', 'UCUNCU AY KOPYALADIK'], pY = Math.round(1000 * k), pAra = Math.round(90 * k);
    const pBas = pSatir.map((_, i) => F(Z.paragraf + i * .25)), pSure = F(.2);
    const parKatman = pSatir.map((s, i) => `color=c=black@0:s=${W}x${pAra}:r=${fps},format=rgba,${dt(s, Math.round(120 * k), Math.round(10 * k), altPx, '0x1F2A44')},fade=t=in:st=${(pBas[i] / fps).toFixed(4)}:d=${(pSure / fps).toFixed(4)}:alpha=1[p${i}]`);

    const efekt = [{ t: Z.B[0], tur: 'bas' }, { t: Z.whip[0] - .05, tur: 'whoosh' }, { t: Z.A2[0], tur: 'bas' }];
    fs.writeFileSync(path.join(dir, 'ses.wav'), ses(sure, Z, efekt));

    const g = [
      kamera(0, Z.A1, 's1'),
      `[1:v]trim=end_frame=${F(Z.B[1]) - F(Z.B[0])},setpts=PTS-STARTPTS,sendcmd=c='${girisCmd}',gblur@g=sigma=0.01,setsar=1,format=yuv420p[s2]`,
      `[2:v]trim=end_frame=${wn},setpts=PTS-STARTPTS,crop=${W}:${H}:x='${W}*(1-cos(PI*(n+1)/${wn + 1}))/2':y=0,dblur=angle=0:radius=${Math.round(70 * k)},setsar=1,format=yuv420p[s3]`,
      `[3:v]trim=end_frame=${F(Z.B2[1]) - F(Z.B2[0])},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[s4]`,
      kamera(4, Z.A2, 's5'),
      `[s1][s2][s3][s4][s5]concat=n=5:v=1:a=0,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(n,${F(Z.B[0])})',${capF.join(',')}[v0]`,
      baslikKatman,
      ...parKatman,
      `[v0][ttl]overlay=x=0:y=${bY}:shortest=1:enable='between(n,${F(Z.baslik)},${F(Z.B[1]) - 1})'[v1]`,
      ...pSatir.map((_, i) => `[v${i + 1}][p${i}]overlay=x=0:y=${pY + i * pAra}:shortest=1:enable='between(n,${pBas[i]},${F(Z.B2[1]) - 1})'[v${i + 2}]`),
    ].join(';\n');
    const im = f => ['-loop', '1', '-framerate', String(fps), '-i', f];
    ff([...im('a.png'), ...im('b.png'), ...im('serit.png'), ...im('b2.png'), ...im('a2.png'), '-i', 'ses.wav',
      '-filter_complex', g, '-map', `[v${pSatir.length + 1}]`, '-map', '5:a', '-frames:v', String(N), '-r', String(fps),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', path.resolve(cikti)], dir);

    // ground truth (what the measurement should find)
    const hp = Z.yariPeriyot, t90 = PUNCH.sure * (1 - Math.cbrt(.1));          // time at which 90% of the punch is done
    return {
      boyut: `${W}x${H}`, fps, sure_sn: N / fps,
      kesmeler: [{ t: F(Z.B[0]) / fps, tur: 'flas' }, { t: F(Z.whip[0]) / fps, tur: 'whip' }, { t: F(Z.A2[0]) / fps, tur: 'duz' }],
      flas: { t: F(Z.B[0]) / fps, kare: 1 },
      bulanik_giris: { t: F(Z.B[0]) / fps, sn: (girisKare - 1) / fps },        // the last of the blur frames is already sharp
      whip: { bas: F(Z.whip[0]) / fps, sn: wn / fps, yon: 'yatay' },
      punch: { bas: PUNCH.bas, bit: 1.0, sure90_sn: +t90.toFixed(3), cekimler: [F(Z.A1[0]) / fps, F(Z.A2[0]) / fps] },
      ritim: { alt: RITIM.alt, ust: RITIM.ust, yari_periyot_sn: hp, ornek: Array.from({ length: 9 }, (_, i) => +zoomDeger(i * .5, hp).toFixed(3)) },
      altyazi: { kart_sayisi: kartZaman.length, kart_sn: Z.kartSn, gecis_kare: 1, harf_boyu_px: Math.round(ince.boy * 1920 / H), kalin_harf_boyu_px: Math.round(kalin.boy * 1920 / H), kontur_px: KONTUR * 1920 / H, ince_govde_px: ince.govde * 1920 / H, kalin_govde_px: kalin.govde * 1920 / H,
        kalinlik_orani: +(kalin.govde / ince.govde).toFixed(2), kalin_konum: 'son', font_px: capPx * 1920 / H,
        kelime: (a => a[a.length >> 1])(kartZaman.map((_, i) => kartlar[i % kartlar.length].join(' ').split(' ').length).sort((a, b) => a - b)),
        degisim: kartZaman.map(([a]) => F(a) / fps).filter(a => a !== F(Z.A1[0]) / fps && a !== F(Z.A2[0]) / fps) },
      baslik: { t: F(Z.baslik) / fps, belirme_sn: bk / fps, harf_boyu_px: Math.round(bm.boy * 1920 / H), tur: 'bulaniktan_nete' },
      paragraf: { t: pBas[0] / fps, satir: pSatir.length, satir_arasi_sn: +((pBas[1] - pBas[0]) / fps).toFixed(3), toplam_sn: +((pBas[pBas.length - 1] + pSure - pBas[0]) / fps).toFixed(3) },
      ses: efekt.map(e => ({ t: e.t, tur: e.tur === 'bas' ? 'bas' : 'hisirti' })),
      palet: Object.values(RENK),
    };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

module.exports = { uret, zoomDeger, RENK };

if (require.main === module) {
  const a = process.argv.slice(2), arg = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
  const out = a.find(x => x.endsWith('.mp4')); if (!out) { console.error('kullanım: node stil/test/sentetik.js <out.mp4> [--fps 25] [--kisa] [--w 1080]'); process.exit(1); }
  uret(out, { fps: +arg('--fps', 30), w: +arg('--w', 1080), kisa: a.includes('--kisa') })
    .then(d => { fs.writeFileSync(out.replace(/\.mp4$/, '.dogru.json'), JSON.stringify(d, null, 1)); console.log(JSON.stringify(d)); })
    .catch(e => { console.error(e.message); process.exit(1); });
}
