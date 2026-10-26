#!/usr/bin/env node
// Style measurement: measures how a channel edits its videos (transitions, punch-in and zoom rhythm, captions, text
// appearing, colours, sound effects) so an agent can write the channel's style rules (stil/BENIOKU.md).
// Only ffmpeg/ffprobe and node; nothing is uploaded. Checked against synthetic clips of known editing: stil/test/.
// A low-resolution or frame-rate-converted source is reported (guven), and its letter sizes and timings stay out of the summary.
//
//   node stil/olc.js <ad> [video.mp4 ...]       measure; no videos given = every video in stil/<ad>/ornekler/
//        --konusma                               also transcribe speech (Whisper in .venv): words per minute, cuts on words
//        --python <python.exe>                   Python with faster-whisper (default: .venv of the repo)
//        --esik 0.3                              scene score that counts as a cut (lower = more cuts)
//        --en-fazla 300                          measure at most this many seconds of each video
//        --cikti <klasor>                        write to <klasor>/<ad>/ instead of stil/<ad>/
//   node stil/olc.js karsilastir <ad> <video.mp4>  measure one video (e.g. our own render) against stil/<ad>/olcum.json
//
// Output: stil/<ad>/olcum.json (every number per video + summary + suggested engine values) and stil/<ad>/kareler/*.jpg
// (contact sheets the agent looks at: overview, shots, transitions, captions, text appearing frame by frame).
// Sample videos and contact sheets never go into git (.gitignore).
const fs = require('fs'), path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const A = require('./analiz');

const KOK = path.join(__dirname, '..');
const fail = msg => { console.error('\nHATA: ' + msg + '\n'); process.exit(1); };
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const DEGERLI = new Set(['--python', '--esik', '--en-fazla', '--cikti']);
const konum = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !DEGERLI.has(all[i - 1]));
const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i;

// AntonTR cap height / font size, measured on a render of the engine's own captions (84 px AntonTR, all caps).
// Used to turn a measured letter height into the engine's caption font size.
const ANTON_ORAN = 0.86;

const probe = f => {
  let j; try { j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).toString()); }
  catch (e) { fail('video okunamadı: ' + f); }
  const v = j.streams.find(s => s.codec_type === 'video'); if (!v) fail('görüntü yok: ' + f);
  const [a, b] = (v.avg_frame_rate !== '0/0' ? v.avg_frame_rate : v.r_frame_rate).split('/').map(Number);
  const rot = Math.abs(+((v.side_data_list || []).find(s => s.rotation != null) || {}).rotation || 0) % 180 === 90;
  return { W: rot ? v.height : v.width, H: rot ? v.width : v.height, fps: b ? a / b : a, sure: +j.format.duration, ses: j.streams.some(s => s.codec_type === 'audio') };
};

// ---- contact sheets (ffmpeg select + tile)
// n = frame numbers at the measured rate (F60 = 'fps=60,' when the source is faster than 60 fps).
// etiket = fps: print each frame's number on it (needs a system font; the sheet is written without numbers if that fails)
function sayfa(f, cikti, n, filtre, tile, F60 = '', etiket = 0) {
  n = n.filter(i => i >= 0);
  if (!n.length) return null;
  const sec = n.map(i => `eq(n\\,${i})`).join('+');
  const yaz = ek => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', f, '-an', '-vf', `${F60}select='${sec}',${filtre}${ek},tile=${tile}`, '-fps_mode', 'passthrough', '-frames:v', '1', '-q:v', '3', cikti], { stdio: ['ignore', 'ignore', 'pipe'] });
  try { if (etiket) { try { yaz(`,drawtext=text='%{eif\\:t*${etiket}+0.5\\:d}':x=4:y=4:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6`); return path.basename(cikti); } catch (e) { } } yaz(''); return path.basename(cikti); }
  catch (e) { console.log('  (kare sayfası yazılamadı: ' + path.basename(cikti) + ')'); return null; }
}

// contact sheets this tool wrote on an earlier run (a new run may write fewer); nothing else in the folder is touched
const eskiSayfalar = (kd, onek) => { for (const f of fs.readdirSync(kd)) if (onek.test(f) && /-(genel|kesmeler|gecisler|yazilar|yazi-hareketi|yazi-belirme-\d+)\.jpg$/.test(f)) fs.rmSync(path.join(kd, f)); };

function konusmaOku(f, py) {
  const betik = path.join(__dirname, 'konusma.py');
  const r = spawnSync(py, [betik, f], { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (r.status !== 0) { console.log('  konuşma atlandı: ' + (r.stderr || r.error || '').toString().trim().split('\n').pop()); return null; }
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return null; }
}

async function olcVideo(f, kd, onek, o) {
  const P = probe(f), sinir = Math.min(P.sure, o.enFazla);
  const fps = Math.min(60, P.fps), w = 540, h = 2 * Math.round(540 * P.H / P.W / 2), olcek = 1920 / h, F60 = P.fps > 60 ? 'fps=60,' : '';
  console.log(`\n${path.basename(f)}: ${P.W}x${P.H}, ${P.fps.toFixed(2)} fps, ${P.sure.toFixed(1)} sn${sinir < P.sure ? ` (ilk ${sinir} sn ölçülüyor)` : ''}`);
  const uyarilar = [], dusuk = Math.min(P.W, P.H) < 720;
  if (dusuk) uyarilar.push(`Kaynak düşük çözünürlüklü (${P.W}x${P.H}). Yazı boyu, harf kalınlığı ve yazı belirme süresi bu kopyadan güvenilir ölçülemez: aynı videonun en yüksek çözünürlüğünü indir (yt-dlp -f "bv*+ba/b").`);
  if (P.fps > 60) uyarilar.push(`Kaynak ${P.fps.toFixed(0)} fps; ölçüm 60 fps'e indirilerek yapıldı.`);

  // 1. cuts
  const K = await A.kesmeler(f, o.esik, sinir);
  // 2. frames: flashes, whips, camera, text rows, caption cards (one pass, gray, 540 px wide, the source's own fps)
  const M = new A.KareOlcer(w, h, fps, K.zaman);
  await A.akis(['-hide_banner', '-loglevel', 'error', '-t', String(sinir), '-i', f, '-map', '0:v:0', '-an',
    '-vf', `${F60}scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-'], w * h, b => M.kare(b));
  const N = M.lum.length, dk = N / fps / 60;
  const fl = M.flaslar(), bant = M.altyaziBandi();
  // flash frames (and the frames right after them) cannot be whips
  const flasKare = new Set(); [[fl.flas, fl.flas_kare], [fl.kararma, fl.kararma_kare]].forEach(([l, k]) => l.forEach((t, i) => { const n = Math.round(t * fps); for (let j = n - 1; j <= n + k[i]; j++) flasKare.add(j); }));
  const wh = M.whipler(flasKare);

  // transitions: every cut gets a kind (whip / flash / plain); whips and flashes without a detected cut count too
  const gecis = [], kesmeKare = K.zaman.map(t => Math.round(t * fps));
  for (const w2 of wh) gecis.push({ n: w2.n, son: w2.n + w2.kare - 1, tur: 'whip', yon: w2.yon, kare: w2.kare });
  fl.flas.forEach((t, i) => { const n = Math.round(t * fps), son = n + fl.flas_kare[i] - 1;
    if (!gecis.some(g => n >= g.n - 2 && n <= g.son + 2)) gecis.push({ n, son, tur: 'flas', kare: fl.flas_kare[i], kesmesiz: !kesmeKare.some(c => c >= n - 2 && c <= son + 2) }); });
  fl.kararma.forEach((t, i) => { const n = Math.round(t * fps), son = n + fl.kararma_kare[i] - 1;
    if (!gecis.some(g => n >= g.n - 2 && n <= g.son + 2)) gecis.push({ n, son, tur: 'kararma', kare: fl.kararma_kare[i], kesmesiz: !kesmeKare.some(c => c >= n - 2 && c <= son + 2) }); });
  for (const c of kesmeKare) if (!gecis.some(g => c >= g.n - 2 && c <= g.son + 2)) gecis.push({ n: c, son: c - 1, tur: 'duz' });   // a plain cut: the new shot starts at its own frame
  gecis.sort((a, b) => a.n - b.n);
  // a flash in the middle of a shot (no cut around it) is an effect, not a transition between shots
  const sahneGecis = gecis.filter(g => !g.kesmesiz);
  for (const g of sahneGecis) { const b = M.bulanikGiris(g.son + 1); if (b) g.bulanik_giris = b; g.t = +(g.n / fps).toFixed(3); }
  const disla = new Set(); for (const g of gecis) for (let n = g.n - 3; n <= g.son + 3 + ((g.bulanik_giris && g.bulanik_giris.kare) || 0); n++) disla.add(n);
  console.log(`  geçiş: ${sahneGecis.length} (${['duz', 'flas', 'whip', 'kararma'].map(t => `${t} ${sahneGecis.filter(g => g.tur === t).length}`).join(', ')}), kare: ${N}`);

  // 3. zoom per shot (tracker): punch-in at the start, slow rhythm after it
  const sinirlar = [0]; for (const g of sahneGecis) { sinirlar.push(g.n, g.son + 1 + ((g.bulanik_giris && g.bulanik_giris.kare) || 0)); } sinirlar.push(N);
  const cekimler = M.zoomSeyri([...new Set(sinirlar)].sort((a, b) => a - b));
  const punchlar = cekimler.filter(c => c.punch), ritimler = cekimler.filter(c => c.ritim && c.ritim.aralik >= 1.02);
  const izlenen = cekimler.filter(c => !c.izlenemedi);

  // camera summary (per 0.2 s window: still / slow push / fast zoom / pan / moving content)
  const say = {}; M.kamera.forEach(k => say[k.tur] = (say[k.tur] || 0) + 1);
  const pay = t => +((say[t] || 0) / (M.kamera.length || 1)).toFixed(2);
  const zoomlar = []; let bas = null;
  M.kamera.forEach((k, i) => { const z = k.tur === 'zoom_ici' || k.tur === 'zoom_disi';
    if (z && bas == null) bas = i; if ((!z || i === M.kamera.length - 1) && bas != null) { zoomlar.push({ t: M.kamera[bas].t, sn: (i - bas + (z ? 1 : 0)) * M.ADIM / fps }); bas = null; } });
  const kamera = { olcum_sayisi: M.kamera.length, sabit_orani: pay('sabit'), yavas_itme_orani: pay('yavas_itme'), zoom_ici_orani: pay('zoom_ici'), zoom_disi_orani: pay('zoom_disi'),
    kaydirma_orani: pay('kaydirma'), icerik_hareketi_orani: pay('icerik'),
    hareketli_orani: +(pay('yavas_itme') + pay('zoom_ici') + pay('zoom_disi') + pay('kaydirma')).toFixed(2),
    zoom_hizi_yuzde_sn: A.yuv(A.ortanca(M.kamera.filter(k => k.tur.startsWith('zoom') || k.tur === 'yavas_itme').map(k => Math.abs(k.z) * 100)), 1),
    zoom_hareketi: { sayi: zoomlar.length, sure_sn: A.dagilim(zoomlar.map(z => z.sn)) },
    // zoom tracker over shots: 1.00 = the widest frame of each shot
    cekim_sayisi: cekimler.length, izlenen_cekim: izlenen.length,
    punch: { sayi: punchlar.length, cekim_orani: izlenen.length ? +(punchlar.length / izlenen.length).toFixed(2) : null,
      bas: A.yuv(A.ortanca(punchlar.map(c => c.punch.bas)), 3), sure90_sn: A.yuv(A.ortanca(punchlar.map(c => c.punch.sure90_sn)), 3) },
    ritim: { cekim: ritimler.length, ust: ritimler.length ? Math.max(...ritimler.map(c => c.ritim.ust)) : null, ust_ortanca: A.yuv(A.ortanca(ritimler.map(c => c.ritim.ust)), 3),
      yari_periyot_sn: A.yuv(A.ortanca(ritimler.map(c => c.ritim.yari_periyot_sn).filter(x => x != null)), 2) },
    cekimler };

  // visual events: transitions, mid-shot flashes, starts of zoom moves -> how often the picture changes
  const olaylar = [...new Set([...gecis.map(g => g.n / fps), ...zoomlar.map(z => z.t), ...punchlar.map(c => c.t)].map(t => +t.toFixed(2)))].sort((a, b) => a - b);
  const sinirT = [0, ...olaylar, N / fps], gecisT = sahneGecis.map(g => g.n / fps);
  const plan = gecisT.length ? [0, ...gecisT, N / fps].slice(1).map((t, i, a) => t - (i ? a[i - 1] : 0)) : [N / fps];
  const aralik = sinirT.slice(1).map((t, i) => t - sinirT[i]).filter(x => x > .05);

  // 4. captions (fixed band): cards, letters at full resolution
  let yazi = { bant: { var: false, siklik: bant.siklik } };
  const sayfalar = {};
  if (bant.var) {
    const KR = M.kartlar(bant);
    const H = P.H / h;                             // 540-scale row -> source row
    const payY = Math.round((bant.alt - bant.ust + 1) * H * .35) + 6;     // a little room above and below the band
    const cy = Math.max(0, Math.floor(bant.ust * H) - payY), ch = Math.min(P.H - cy, Math.ceil((bant.alt - bant.ust + 1) * H) + 2 * payY) & ~1;
    // full-resolution crops of up to 40 cards (evenly spread): words, lines, letter height, stems
    const secim = KR.kart.filter((_, i, a) => a.length <= 40 || i % Math.ceil(a.length / 40) === 0);
    const kirp = [];
    if (secim.length) await A.akis(['-hide_banner', '-loglevel', 'error', '-t', String(sinir), '-i', f, '-map', '0:v:0', '-an',
      '-vf', `${F60}select='${secim.map(k => `eq(n\\,${k.orta})`).join('+')}',crop=${P.W}:${ch}:0:${cy},format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'],
      P.W * ch, b => kirp.push(A.yaziKirpim(b, P.W, ch)));
    const kartOl = kirp.filter(l => l.length), satirlar = kartOl.flat();
    const kelime = kartOl.map(l => l.reduce((s, x) => s + x.kelime, 0)), satir = kartOl.map(l => l.length);
    const k19 = 1920 / P.H, harf = satirlar.map(x => x.yukseklik * k19);
    const dag = {}; kelime.forEach(k => dag[k] = (dag[k] || 0) + 1);
    // card changes at a transition belong to the shot change, not to the caption rhythm
    // (and so do changes in the first 0.15 s of a shot, while a punch-in moves everything under the text)
    const ac = Math.round(.15 * fps), kartDeg = KR.degisim.filter(d => d.n > ac && !gecis.some(g => d.n >= g.n - 2 && d.n <= g.son + 3 + ac));
    const gecisK = kartDeg.map(d => d.kare);
    const ikili = satirlar.filter(x => x.kalin_konum), oranlar = ikili.map(x => x.kalinlik_orani), kontur = satirlar.map(x => x.kontur).filter(x => x != null);
    const px = (a, k = 1) => { const m = A.ortanca(a.filter(x => x != null)); return m == null ? null : A.yuv(m * k19, k); };
    const konum = {}; ikili.forEach(x => konum[x.kalin_konum] = (konum[x.kalin_konum] || 0) + 1);
    yazi = {
      bant: { var: true, siklik: bant.siklik, ust_y: Math.round(bant.ust * olcek), alt_y: Math.round(bant.alt * olcek), merkez_y: Math.round((bant.ust + bant.alt) / 2 * olcek) },
      harf_boyu_px: A.yuv(A.ortanca(harf), 0), harf_boyu_orani: A.yuv(A.ortanca(harf) / 1920, 3),
      antonTR_px: harf.length ? Math.round(A.ortanca(harf) / ANTON_ORAN) : null,
      kontur_px: kontur.length >= satirlar.length / 3 ? A.yuv(A.ortanca(kontur) * k19, 0) : null, kartli: satirlar.filter(x => x.kart).length >= satirlar.length / 2,
      kutup: satirlar.filter(x => x.kutup === 'acik').length >= satirlar.length / 2 ? 'acik_yazi' : 'koyu_yazi',
      govde_px: px(satirlar.map(x => x.govde)),
      ince_kalin: { satir_orani: satirlar.length ? +(ikili.length / satirlar.length).toFixed(2) : null, kalinlik_orani: A.yuv(A.ortanca(oranlar), 2),
        ince_govde_px: px(ikili.map(x => x.ince_govde)), kalin_govde_px: px(ikili.map(x => x.kalin_govde)), kalin_konum: konum },
      kart: { sayi: KR.kart.length, dakikada: A.yuv(KR.kart.length / dk, 1), sure_sn: A.dagilim(KR.kart.map(k => (k.b - k.a) / fps)),
        kelime: A.ortanca(kelime), kelime_dagilimi: dag, satir: A.ortanca(satir) },
      gecis_kare: A.ortanca(gecisK), gecis_kare_dagilim: A.dagilim(gecisK),
      degisim_zamanlari: kartDeg.map(d => +(d.n / fps).toFixed(2)),
      guvenilir: !dusuk,
    };
    // contact sheets: card motion frame by frame (first 8 changes, 2 before .. 5 after) and card crops for the font
    const deg = kartDeg.filter(d => d.n > 2).filter((d, i, a) => !i || d.n - a[i - 1].n >= 9).slice(0, 8);   // windows must not overlap
    sayfalar.yazi_hareketi = sayfa(f, path.join(kd, `${onek}-yazi-hareketi.jpg`), deg.flatMap(d => Array.from({ length: 8 }, (_, i) => d.n - 2 + i)),
      `crop=${P.W}:${ch}:0:${cy},scale=360:-2`, `8x${Math.max(1, deg.length)}`, F60, fps);
    sayfalar.yazilar = sayfa(f, path.join(kd, `${onek}-yazilar.jpg`), secim.slice(0, 16).map(k => k.orta), `crop=${P.W}:${ch}:0:${cy},scale=540:-2`, `2x${Math.ceil(Math.min(16, secim.length) / 2)}`, F60);
  }

  // 5. text that appears over a steady picture outside the band (titles, labels, paragraphs): timed at full resolution
  const belirme = []; let hareketliZemin = 0;
  const yb = M.yaziBelirmeleri(bant, disla).slice(0, 12), Hs = P.H / h, Ws = P.W / w;
  for (const e of yb) {
    const ust = gecis.filter(g => g.n <= e.a).map(g => g.son + 1 + ((g.bulanik_giris && g.bulanik_giris.kare) || 0)), alt = gecis.filter(g => g.n > e.b).map(g => g.n - 1);
    const a = Math.max(0, e.a - 12, ...ust), b = Math.min(N - 1, e.b + 20, ...alt);
    const x = Math.max(0, Math.floor((e.x0 - 20) * Ws)) & ~1, y = Math.max(0, Math.floor((e.y0 - 20) * Hs)) & ~1;
    const cw = Math.min(P.W - x, Math.ceil((e.x1 - e.x0 + 40) * Ws)) & ~1, ch = Math.min(P.H - y, Math.ceil((e.y1 - e.y0 + 40) * Hs)) & ~1;
    if (b - a < 6 || cw < 16 || ch < 16) continue;
    // text over a moving picture (zoom, pan) cannot be timed this way: everything under it changes too
    const iz = M.iz.filter(q => q.n >= a && q.n <= b), zin = new Set(iz.map(q => q.z));
    if (iz.length < (b - a + 1) * .8 || zin.size > 1 || Math.max(...iz.map(q => q.ls)) - Math.min(...iz.map(q => q.ls)) > .01
      || Math.max(...iz.map(q => Math.hypot(q.dx, q.dy))) > 1) { hareketliZemin++; continue; }
    const kareler = [];
    await A.akis(['-hide_banner', '-loglevel', 'error', '-t', String(sinir), '-i', f, '-map', '0:v:0', '-an',
      '-vf', `${F60}select='between(n\\,${a}\\,${b})',crop=${cw}:${ch}:${x}:${y},format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], cw * ch, buf => kareler.push(Buffer.from(buf)));
    const r = A.belirmeOlc(kareler, cw, ch, fps); if (!r) continue;
    // letters: on the last frame, cropped to the pixels that changed (plus a margin), so the picture around does not count
    const kx0 = Math.max(0, r.kutu.x0 - 12), kx1 = Math.min(cw - 1, r.kutu.x1 + 12), ky0 = Math.max(0, r.kutu.y0 - 12), ky1 = Math.min(ch - 1, r.kutu.y1 + 12);
    const kw = kx1 - kx0 + 1, kh = ky1 - ky0 + 1, son = kareler[kareler.length - 1], kk = Buffer.alloc(kw * kh);
    for (let yy = 0; yy < kh; yy++) son.copy(kk, yy * kw, (ky0 + yy) * cw + kx0, (ky0 + yy) * cw + kx0 + kw);
    const satir = A.yaziKirpim(kk, kw, kh);
    belirme.push({ t: +((a + r.kb - 1) / fps).toFixed(3), sn: r.sn, kare: r.kare, tur: r.tur, satir: r.satir, satir_satir: r.satir_satir, satir_arasi_sn: r.satir_arasi_sn,
      harf_boyu_px: satir.map(s => Math.round(s.yukseklik * 1920 / P.H)), kalinlik_orani: satir.map(s => s.kalinlik_orani).filter(Boolean),
      kutu: { x, y, w: cw, h: ch }, pencere: [a, b], kb: a + r.kb, ka: a + r.ka });
  }
  if (belirme.length) {
    // frame-by-frame strips of the first 4 appearances (the agent checks the timing here, at full resolution)
    const sec = belirme.slice(0, 4);
    sayfalar.yazi_belirme = sec.map((e, i) => { const n0 = Math.max(e.pencere[0], e.kb - 2), adet = Math.min(16, e.ka - e.kb + 5);
      return sayfa(f, path.join(kd, `${onek}-yazi-belirme-${i + 1}.jpg`), Array.from({ length: adet }, (_, j) => n0 + j),
        `crop=${e.kutu.w}:${e.kutu.h}:${e.kutu.x}:${e.kutu.y},scale=${Math.min(360, e.kutu.w)}:-2`, `4x${Math.ceil(adet / 4)}`, F60, fps); });
  }

  // 6. palette (2 frames a second, point-sampled so edges do not invent mixed colours)
  const pw = 96, ph = 2 * Math.round(48 * P.H / P.W), px = [];
  await A.akis(['-hide_banner', '-loglevel', 'error', '-t', String(sinir), '-i', f, '-map', '0:v:0', '-an', '-vf', `fps=2,scale=${pw}:${ph}:flags=neighbor,format=rgb24`, '-f', 'rawvideo', '-'],
    pw * ph * 3, b => px.push(Buffer.from(b)));
  const renkler = A.palet(Buffer.concat(px));
  const vurgu = renkler.filter(r => r.doygunluk >= .35 && r.pay >= .01).sort((a, b) => b.doygunluk * Math.sqrt(b.pay) - a.doygunluk * Math.sqrt(a.pay))[0] || null;
  const palet = { renkler, zemin: renkler[0].hex, vurgu: vurgu && vurgu.hex, acik_kare_orani: +(M.lum.filter(l => l > 150).length / N).toFixed(2), koyu_kare_orani: +(M.lum.filter(l => l < 70).length / N).toFixed(2) };

  // 7. sound
  let ses = null;
  if (P.ses) {
    const parca = [];
    await A.akis(['-hide_banner', '-loglevel', 'error', '-t', String(sinir), '-i', f, '-vn', '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], 4, b => parca.push(b.readFloatLE(0)));
    const S = A.sesOlaylari(Float32Array.from(parca), 22050);
    let lufs = null; await A.calistir(['-hide_banner', '-nostats', '-t', String(sinir), '-i', f, '-vn', '-af', 'ebur128', '-f', 'null', '-'], s => { const m = s.match(/^\s*I:\s*(-?[\d.]+) LUFS/); if (m) lufs = +m[1]; });
    const efekt = S.olay;
    const yakin = (t, liste) => liste.some(x => Math.abs(x.t - t) <= .12);
    const turSay = t => A.yuv(efekt.filter(x => x.tur === t).length / dk, 1);
    ses = { lufs, sessizlik_orani: S.sessizlik, efekt_dakikada: A.yuv(efekt.length / dk, 1),
      bas_dakikada: turSay('bas'), ton_dakikada: turSay('ton'), genis_dakikada: turSay('genis'), hisirti_dakikada: turSay('hisirti'),
      kesmede_efekt_orani: gecisT.length ? +(gecisT.filter(t => yakin(t, efekt)).length / gecisT.length).toFixed(2) : null,
      kartta_efekt_orani: yazi.degisim_zamanlari && yazi.degisim_zamanlari.length ? +(yazi.degisim_zamanlari.filter(t => yakin(t, efekt)).length / yazi.degisim_zamanlari.length).toFixed(2) : null,
      gecis_sesi: sahneGecis.map(g => { const e = efekt.find(x => Math.abs(x.t - g.n / fps) <= .15); return { t: g.t, gecis: g.tur, ses: e ? e.tur : null }; }),
      efektler: efekt.slice(0, 80).map(x => ({ t: x.t, tur: x.tur, guc: x.guc })) };
  }

  // 8. speech (optional)
  let konusma = null;
  if (o.konusma && P.ses) {
    const K2 = konusmaOku(f, o.python);
    if (K2 && K2.length) {
      const kel = K2.filter(x => x[1] < sinir), basla = kel.map(x => x[1]);
      const kesmeKelime = gecisT.filter(t => basla.some(b => Math.abs(b - t) <= .12)).length;
      const kartKelime = yazi.kart ? M.kartlar(bant).kart.map(k => kel.filter(x => x[1] >= k.a / fps && x[1] < k.b / fps).length).filter(n => n > 0) : [];
      konusma = { kelime_dakikada: A.yuv(kel.length / (sinir / 60), 0), kesme_kelimede_orani: gecisT.length ? +(kesmeKelime / gecisT.length).toFixed(2) : null,
        kart_basina_kelime_sesten: A.ortanca(kartKelime), metin: kel.map(x => x[0]).join(' ').slice(0, 600) };
    }
  }

  // 9. how far the numbers can be trusted: low resolution and frame-rate conversion
  const kd2 = new Set(disla); for (const e of belirme) for (let n = e.pencere[0]; n <= e.pencere[1]; n++) kd2.add(n);
  if (yazi.degisim_zamanlari) for (const t of yazi.degisim_zamanlari) for (let n = Math.round(t * fps) - 2; n <= Math.round(t * fps) + 2; n++) kd2.add(n);
  const kad = M.kadans(kd2);
  if (kad.yeniden_orneklenmis) uyarilar.push(`Kare hızı dönüştürülmüş görünüyor (${kad.kadans ? `her ${kad.kadans.p} karede bir ${kad.kadans.tur === 'atlanan_kare' ? 'atlanmış' : 'tekrarlanmış'} kare` : 'tekrarlanan kareler'}). Bu kopya aslı değil: süreler (yazı belirme, punch, flaş) kare kaybı yüzünden kısa ya da yanlış çıkabilir. Kaynağı kendi fps'inde, en yüksek kalitede indir.`);
  if (dusuk || kad.yeniden_orneklenmis) for (const e of belirme) e.guvenilir = false;
  const guven = { dusuk_cozunurluk: dusuk, kare_hizi: kad, uyarilar };
  for (const u of uyarilar) console.log('  ! ' + u);

  // contact sheets: overview + first frame of every shot + each transition frame by frame
  const yon = P.H >= P.W ? '180:320' : '320:180';
  sayfalar.genel = sayfa(f, path.join(kd, `${onek}-genel.jpg`), Array.from({ length: 24 }, (_, i) => Math.round((i + .5) * N / 24)), `scale=${yon}`, '6x4', F60);
  const ilk = [0, ...sahneGecis.map(g => g.son + 2)].slice(0, 48);
  sayfalar.kesmeler = sayfa(f, path.join(kd, `${onek}-kesmeler.jpg`), ilk, `scale=${yon}`, `8x${Math.ceil(ilk.length / 8)}`, F60);
  const gs = sahneGecis.slice(0, 8);
  if (gs.length) sayfalar.gecisler = sayfa(f, path.join(kd, `${onek}-gecisler.jpg`), gs.flatMap(g => Array.from({ length: 8 }, (_, i) => g.n - 2 + i)),
    `scale=${yon}`, `8x${gs.length}`, F60, fps);

  return {
    dosya: path.basename(f), sure_sn: +P.sure.toFixed(2), olculen_sn: +(N / fps).toFixed(2), boyut: `${P.W}x${P.H}`, fps: +P.fps.toFixed(3), yon: P.H >= P.W ? 'dikey' : 'yatay',
    guven,
    kesme: { sayi: sahneGecis.length, dakikada: A.yuv(sahneGecis.length / dk, 1), plan_sn: A.dagilim(plan), zoom_kesmesi: M.ziplama.length,
      zoom_kesmesi_olcek: A.yuv(A.ortanca(M.ziplama.map(z => z.s)), 2), flas: gecis.filter(g => g.tur === 'flas').length, flas_kare: A.ortanca(gecis.filter(g => g.tur === 'flas').map(g => g.kare)),
      kararma: gecis.filter(g => g.tur === 'kararma').length, whip: sahneGecis.filter(g => g.tur === 'whip').length,
      bulanik_giris: sahneGecis.filter(g => g.bulanik_giris).length, zamanlar: gecisT.map(t => +t.toFixed(2)),
      gecisler: sahneGecis.map(g => ({ t: g.t, tur: g.tur, kare: g.son - g.n + 1, ...(g.yon ? { yon: g.yon } : {}), ...(g.bulanik_giris ? { bulanik_giris_sn: g.bulanik_giris.sn } : {}) })) },
    kamera, gorsel_olay: { sayi: olaylar.length, aralik_sn: A.dagilim(aralik) }, yazi,
    yazi_belirme: { sayi: belirme.length, hareketli_zeminde_olculmedi: hareketliZemin, sn: A.yuv(A.ortanca(belirme.filter(e => !e.satir_satir).map(e => e.sn)), 3),
      paragraf_sn: A.yuv(A.ortanca(belirme.filter(e => e.satir_satir).map(e => e.sn)), 3), satir_satir: belirme.filter(e => e.satir_satir).length,
      satir_arasi_sn: A.yuv(A.ortanca(belirme.map(e => e.satir_arasi_sn).filter(x => x != null && x > 0)), 3), guvenilir: !(dusuk || kad.yeniden_orneklenmis), olaylar: belirme },
    palet, ses, konusma, kareler: sayfalar,
  };
}

// ---- summary over all videos: numbers (median, range) + yes/no features -> SABİT / SIK / ARA SIRA
const al = (o, p) => p.split('.').reduce((x, k) => x == null ? null : x[k], o);
// how far a video's numbers can be trusted: letters need a sharp copy, timings need the source's own frames
const NET = v => !(v.guven && v.guven.dusuk_cozunurluk);
const KARE = v => !(v.guven && v.guven.kare_hizi && v.guven.kare_hizi.yeniden_orneklenmis);
const HER = () => true, YAZI = NET, SURE = KARE, YAZI_SURE = v => NET(v) && KARE(v);
const SAYISAL = [
  ['kesme.plan_sn.ortanca', 'Plan süresi (sn, ortanca)', HER],
  ['kesme.dakikada', 'Dakikada geçiş (kesme, flaş, whip)', HER],
  ['gorsel_olay.aralik_sn.ortanca', 'Görüntü değişim aralığı (sn)', HER],
  ['kesme.flas_kare', 'Beyaz flaş süresi (kare)', SURE],
  ['kamera.hareketli_orani', 'Kameranın hareketli olduğu süre payı', HER],
  ['kamera.zoom_hizi_yuzde_sn', 'Zoom hızı (%/sn)', HER],
  ['kamera.punch.cekim_orani', 'Punch-in ile açılan çekim payı', HER],
  ['kamera.punch.bas', 'Punch-in başlangıç ölçeği (1.00 = en geniş)', HER],
  ['kamera.punch.sure90_sn', 'Punch-in süresi (%90\'ı, sn)', SURE],
  ['kamera.ritim.ust', 'Zoom ritmi üst ölçek', HER],
  ['kamera.ritim.yari_periyot_sn', 'Zoom ritmi yarım tur (sn)', HER],
  ['yazi.bant.merkez_y', 'Altyazı bandı merkezi (1920 yükseklikte)', HER],
  ['yazi.harf_boyu_px', 'Altyazı harf boyu (px, 1920 yükseklikte)', YAZI],
  ['yazi.antonTR_px', 'Aynı boy için AntonTR font px', YAZI],
  ['yazi.govde_px', 'Harf gövdesi kalınlığı (px)', YAZI],
  ['yazi.ince_kalin.kalinlik_orani', 'Kalın / ince gövde oranı', YAZI],
  ['yazi.kontur_px', 'Altyazı konturu (px)', YAZI],
  ['yazi.kart.kelime', 'Kart başına kelime (±1)', YAZI],
  ['yazi.kart.satir', 'Kart başına satır', HER],
  ['yazi.kart.sure_sn.ortanca', 'Kart süresi (sn)', HER],
  ['yazi.gecis_kare', 'Kart geçişi (kare)', SURE],
  ['yazi_belirme.sn', 'Başlık / etiket belirme süresi (sn)', YAZI_SURE],
  ['yazi_belirme.paragraf_sn', 'Paragrafın tümüyle açılma süresi (sn)', YAZI_SURE],
  ['yazi_belirme.satir_arasi_sn', 'Paragraf satır arası (sn)', SURE],
  ['palet.acik_kare_orani', 'Açık zeminli kare payı', HER],
  ['ses.lufs', 'Ses yüksekliği (LUFS)', HER],
  ['ses.efekt_dakikada', 'Dakikada ses efekti', HER],
  ['ses.kesmede_efekt_orani', 'Efektli geçiş payı', HER],
  ['konusma.kelime_dakikada', 'Dakikada kelime', HER],
  ['konusma.kesme_kelimede_orani', 'Kelimeye denk gelen kesme payı', HER],
];
// yes / no features; null = cannot be told from this copy (left out of the count)
const enCok = o => o && Object.keys(o).length ? Object.entries(o).sort((a, b) => b[1] - a[1])[0][0] : null;
const OZELLIK = [
  ['Sabit altyazı bandı', v => al(v, 'yazi.bant.var')],
  ['Beyaz flaş', v => al(v, 'kesme.flas') > 0],
  ['Whip geçiş (hızlı kaydırma)', v => al(v, 'kesme.whip') > 0],
  ['Bulanıktan nete giriş (kesmeden sonra)', v => al(v, 'kesme.bulanik_giris') > 0],
  ['Kararma', v => al(v, 'kesme.kararma') > 0],
  ['Zoom kesmesi (aynı görüntüye ani yakınlaşma)', v => al(v, 'kesme.zoom_kesmesi') > 0],
  ['Punch-in (çekim yakın açılıp hızla geri çekilir)', v => al(v, 'kamera.punch.sayi') > 0],
  ['Zoom ritmi (yavaş yakınlaş/uzaklaş, %4+)', v => (al(v, 'kamera.ritim.ust') || 0) >= 1.04],
  ['Kamera sürenin %40\'ından fazlasında hareketli', v => al(v, 'kamera.hareketli_orani') > .4],
  ['Yavaş itme (sürünen yakınlaşma)', v => al(v, 'kamera.yavas_itme_orani') >= .1],
  ['Hızlı zoom hareketi', v => (al(v, 'kamera.zoom_ici_orani') || 0) + (al(v, 'kamera.zoom_disi_orani') || 0) >= .05],
  ['Açık zemin (karelerin %60\'ından fazlası)', v => al(v, 'palet.acik_kare_orani') > .6],
  ['Koyu zemin (karelerin %60\'ından fazlası)', v => al(v, 'palet.koyu_kare_orani') > .6],
  ['Geçişlerin en az üçte birinde ses efekti', v => al(v, 'ses.kesmede_efekt_orani') == null ? null : al(v, 'ses.kesmede_efekt_orani') >= .33],
  ['Bas vuruşu (bum) dakikada 2+', v => !v.ses ? null : al(v, 'ses.bas_dakikada') >= 2],
  ['Hışırtı (whoosh) sesi', v => !v.ses ? null : al(v, 'ses.hisirti_dakikada') > 0],
  ['Anında kart geçişi (2 kare ya da az)', v => !SURE(v) ? null : al(v, 'yazi.gecis_kare') != null && al(v, 'yazi.gecis_kare') <= 2],
  ['Tek satırlık altyazı kartı', v => al(v, 'yazi.kart.satir') === 1],
  ['Altyazı kart (kutu) üstünde', v => al(v, 'yazi.kartli')],
  ['Altyazıda ince + kalın ikilisi', v => !YAZI(v) || !al(v, 'yazi.bant.var') ? null : (al(v, 'yazi.ince_kalin.satir_orani') || 0) >= .3],
  ['Kalın blok satırın sonunda', v => !YAZI(v) || !al(v, 'yazi.bant.var') ? null : enCok(al(v, 'yazi.ince_kalin.kalin_konum')) === 'son'],
  ['Altyazı harflerinde kontur', v => !YAZI(v) || !al(v, 'yazi.bant.var') ? null : (al(v, 'yazi.kontur_px') || 0) >= 1],
  ['Yazı bulanıktan nete belirir', v => !YAZI_SURE(v) ? null : (al(v, 'yazi_belirme.olaylar') || []).some(e => e.tur === 'bulaniktan_nete')],
  ['Paragraf satır satır açılır', v => !SURE(v) ? null : al(v, 'yazi_belirme.satir_satir') > 0],
  ['Kesmelerin çoğu kelime başına denk (%60+)', v => al(v, 'konusma.kesme_kelimede_orani') == null ? null : al(v, 'konusma.kesme_kelimede_orani') >= .6],
];
const katman = (k, n) => k === 0 ? 'YOK' : k === n ? 'SABİT' : k / n >= .6 ? 'SIK' : 'ARA SIRA';
function ozet(videolar) {
  const n = videolar.length, sayisal = {};
  for (const [p, ad, guven] of SAYISAL) {
    const ok = videolar.filter(guven), d = ok.map(v => al(v, p)).filter(x => x != null && !Number.isNaN(x));
    const disarida = n - ok.length;
    if (d.length) sayisal[p] = { ad, degerler: d, ortanca: A.yuv(A.ortanca(d)), min: Math.min(...d), max: Math.max(...d), ...(disarida ? { guvenilmez_video: disarida } : {}) };
    else if (disarida) sayisal[p] = { ad, degerler: [], ortanca: null, guvenilmez_video: disarida };
  }
  const ozellikler = OZELLIK.map(([ad, fn]) => {
    const r = videolar.map(v => { const x = fn(v); return x == null ? null : !!x; }), bilinen = r.filter(x => x != null), k = bilinen.filter(Boolean).length;
    return { ad, kac: `${k}/${bilinen.length}`, katman: bilinen.length ? katman(k, bilinen.length) : 'BİLİNMİYOR', ...(bilinen.length < n ? { olculemeyen: n - bilinen.length } : {}) };
  });
  const o = p => sayisal[p] && sayisal[p].ortanca;
  const ani = videolar.filter(v => v.kesme.zoom_kesmesi > 0).length >= n / 2;
  const motor = { altyazi: {}, kamera: {} };
  if (o('yazi.kart.kelime') != null) motor.altyazi.kelime_kart = Math.max(1, Math.min(8, Math.round(o('yazi.kart.kelime'))));
  if (o('yazi.antonTR_px') != null) motor.altyazi.font_px = Math.max(40, Math.min(160, Math.round(o('yazi.antonTR_px'))));
  if (o('gorsel_olay.aralik_sn.ortanca') != null) motor.kamera.plan_sn = +Math.max(.8, Math.min(12, o('gorsel_olay.aralik_sn.ortanca'))).toFixed(1);
  motor.kamera.hareket = ani ? 'ani' : 'yumusak';
  const uyarilar = videolar.flatMap(v => ((v.guven && v.guven.uyarilar) || []).map(u => `${v.dosya}: ${u}`));
  return { video_sayisi: n, uyari: n < 5 ? `Yalnız ${n} örnek var. Kurallar için en az 5 video önerilir.` : null, kaynak_uyarilari: uyarilar, sayisal, ozellikler, onerilen_motor: motor };
}

const python = () => arg('--python') || path.join(KOK, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const pythonVar = p => !/[\\/]/.test(p) || fs.existsSync(p);          // a bare name (python3) is looked up on PATH when run
const secenek = () => ({ esik: +arg('--esik', .3), enFazla: +arg('--en-fazla', 300), konusma: process.argv.includes('--konusma'), python: python() });

async function olc() {
  const [ad, ...verilen] = konum;
  if (!ad || !/^[a-z0-9-]+$/.test(ad)) fail('stil adını ver (küçük harf, rakam, tire). Örnek: node stil/olc.js referans-kanal stil/referans-kanal/ornekler/*.mp4');
  const kok = path.resolve(arg('--cikti', path.join(KOK, 'stil'))), dir = path.join(kok, ad), kd = path.join(dir, 'kareler');
  let videolar = verilen.map(v => path.resolve(v));
  if (!videolar.length) { const od = path.join(KOK, 'stil', ad, 'ornekler'); videolar = fs.existsSync(od) ? fs.readdirSync(od).filter(x => VIDEO.test(x)).sort().map(x => path.join(od, x)) : []; }
  if (!videolar.length) fail(`örnek video yok. Videoları stil/${ad}/ornekler/ içine koy ya da komuta yaz.`);
  videolar.forEach(v => { if (!fs.existsSync(v)) fail('video bulunamadı: ' + v); });
  fs.mkdirSync(kd, { recursive: true });
  eskiSayfalar(kd, /^v\d+-/);
  const o = secenek();
  if (o.konusma && !pythonVar(o.python)) { console.log('Uyarı: Python bulunamadı, konuşma ölçülmeyecek: ' + o.python); o.konusma = false; }
  const sonuc = [];
  for (let i = 0; i < videolar.length; i++) sonuc.push(await olcVideo(videolar[i], kd, `v${i + 1}`, o));
  const out = { arac: 'stil/olc.js', tarih: new Date().toISOString().slice(0, 10), ayar: { esik: o.esik, en_fazla_sn: o.enFazla }, ozet: ozet(sonuc), videolar: sonuc };
  fs.writeFileSync(path.join(dir, 'olcum.json'), JSON.stringify(out, null, 1));
  yazdir(out.ozet);
  console.log(`\nÖLÇÜM: ${path.join(dir, 'olcum.json')}\nKARELER: ${kd}\nSıradaki adım: stil/BENIOKU.md → adım 3 (kareleri aç, sayıları gözle doğrula) ve adım 4 (kuralları yaz).`);
}

function yazdir(oz) {
  console.log(`\n=== ÖZET (${oz.video_sayisi} video) ===`);
  if (oz.uyari) console.log('! ' + oz.uyari);
  for (const u of oz.kaynak_uyarilari || []) console.log('! ' + u);
  for (const p in oz.sayisal) { const s = oz.sayisal[p];
    const not = s.guvenilmez_video ? `   [${s.guvenilmez_video} video güvenilmez kopya, sayılmadı]` : '';
    console.log(`  ${s.ad.padEnd(44)} ${String(s.ortanca ?? '—').padStart(7)}   ${s.ortanca == null ? '' : `(${s.min} – ${s.max})`}${not}`); }
  console.log('');
  for (const x of oz.ozellikler) if (x.katman !== 'YOK') console.log(`  ${x.katman.padEnd(10)} ${x.kac.padEnd(5)} ${x.ad}${x.olculemeyen ? `   [${x.olculemeyen} videoda ölçülemedi]` : ''}`);
  console.log('\n  Motor için önerilen değerler: ' + JSON.stringify(oz.onerilen_motor));
}

// ---- compare one video (usually our own render) with the measured style
async function karsilastir() {
  const [, ad, video] = konum;
  if (!ad || !video) fail('kullanım: node stil/olc.js karsilastir <ad> <video.mp4>');
  const kok = path.resolve(arg('--cikti', path.join(KOK, 'stil'))), dir = path.join(kok, ad);
  const ref = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'olcum.json'), 'utf8')); } catch (e) { fail(`${path.join(dir, 'olcum.json')} yok. Önce: node stil/olc.js ${ad}`); } })();
  const kd = path.join(dir, 'karsilastirma'); fs.mkdirSync(kd, { recursive: true }); eskiSayfalar(kd, /^deneme-/);
  const o = secenek(); if (o.konusma && !pythonVar(o.python)) o.konusma = false;
  const v = await olcVideo(path.resolve(video), kd, 'deneme', o);
  fs.writeFileSync(path.join(kd, 'olcum.json'), JSON.stringify(v, null, 1));
  console.log(`\n=== ${path.basename(video)} ↔ ${ad} ===`);
  let tut = 0, top = 0;
  for (const p in ref.ozet.sayisal) {
    const r = ref.ozet.sayisal[p], x = al(v, p); if (x == null || r.ortanca == null) continue;
    const pay = Math.max(Math.abs(r.ortanca) * .15, (r.max - r.min) * .15, .05), ok = x >= r.min - pay && x <= r.max + pay;
    top++; if (ok) tut++;
    console.log(`  ${ok ? '✓' : '✗'} ${r.ad.padEnd(44)} bu video ${String(x).padStart(7)}   hedef ${r.ortanca} (${r.min} – ${r.max})`);
  }
  // yes / no features: what the channel ALWAYS does (SABİT) should be here, what it NEVER does (YOK) should not
  console.log('');
  let ftut = 0, ftop = 0;
  for (const f of ref.ozet.ozellikler) {
    if (f.katman !== 'SABİT' && f.katman !== 'YOK') continue;
    const tanim = OZELLIK.find(([ad]) => ad === f.ad); if (!tanim) continue;
    const x = tanim[1](v); if (x == null) continue;
    const ok = !!x === (f.katman === 'SABİT'); ftop++; if (ok) ftut++;
    console.log(`  ${ok ? '✓' : '✗'} ${f.katman.padEnd(6)} ${f.ad.padEnd(52)} bu videoda ${x ? 'var' : 'yok'}`);
  }
  console.log(`\n  ${tut}/${top} ölçü hedef aralıkta, ${ftut}/${ftop} sabit özellik tutuyor. Kareler: ${kd}`);
}

(konum[0] === 'karsilastir' ? karsilastir() : olc()).catch(e => fail(e.message));
