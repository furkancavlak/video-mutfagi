#!/usr/bin/env node
// Style measurement: measures how a channel edits its videos (cuts, camera moves, captions, colours, sound effects)
// so an agent can write the channel's style rules (stil/BENIOKU.md). Only ffmpeg/ffprobe and node; nothing is uploaded.
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
// (contact sheets the agent looks at). Sample videos and contact sheets never go into git (.gitignore).
const fs = require('fs'), path = require('path'), os = require('os');
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
function sayfa(f, cikti, n, filtre, tile, kare = 1) {
  if (!n.length) return null;
  const sec = n.map(i => `eq(n\\,${i})`).join('+');
  try { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', f, '-an', '-vf', `select='${sec}',${filtre},tile=${tile}`, '-fps_mode', 'passthrough', '-frames:v', String(kare), '-q:v', '3', cikti]); return path.basename(cikti); }
  catch (e) { console.log('  (kare sayfası yazılamadı: ' + path.basename(cikti) + ')'); return null; }
}

function konusmaOku(f, py) {
  const betik = path.join(__dirname, 'konusma.py');
  const r = spawnSync(py, [betik, f], { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (r.status !== 0) { console.log('  konuşma atlandı: ' + (r.stderr || r.error || '').toString().trim().split('\n').pop()); return null; }
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return null; }
}

async function olcVideo(f, kd, onek, o) {
  const P = probe(f), sinir = Math.min(P.sure, o.enFazla);
  const fps = Math.min(60, P.fps), w = 540, h = 2 * Math.round(540 * P.H / P.W / 2), olcek = 1920 / h;
  console.log(`\n${path.basename(f)}: ${P.W}x${P.H}, ${P.fps.toFixed(2)} fps, ${P.sure.toFixed(1)} sn${sinir < P.sure ? ` (ilk ${sinir} sn ölçülüyor)` : ''}`);

  // 1. cuts
  const K = await A.kesmeler(f, o.esik, sinir);
  console.log(`  kesme: ${K.zaman.length}`);
  // 2. frames: flashes, camera, text rows, caption cards
  const M = new A.KareOlcer(w, h, fps, K.zaman);
  await A.akis(['-hide_banner', '-loglevel', 'error', '-t', String(sinir), '-i', f, '-map', '0:v:0', '-an',
    '-vf', `${P.fps > 60 ? 'fps=60,' : ''}scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-'], w * h, b => M.kare(b));
  const N = M.lum.length, dk = N / fps / 60;
  const fl = M.flaslar(), bant = M.altyaziBandi();
  console.log(`  kare: ${N}, kamera ölçümü: ${M.kamera.length}, zoom kesmesi: ${M.ziplama.length}`);

  // camera summary
  const say = {}; M.kamera.forEach(k => say[k.tur] = (say[k.tur] || 0) + 1);
  const pay = t => +((say[t] || 0) / (M.kamera.length || 1)).toFixed(2);
  const zoomlar = []; let bas = null;
  M.kamera.forEach((k, i) => { const z = k.tur === 'zoom_ici' || k.tur === 'zoom_disi';
    if (z && bas == null) bas = i; if ((!z || i === M.kamera.length - 1) && bas != null) { zoomlar.push({ t: M.kamera[bas].t, sn: (i - bas + (z ? 1 : 0)) * M.ADIM / fps }); bas = null; } });
  const kamera = { olcum_sayisi: M.kamera.length, sabit_orani: pay('sabit'), yavas_itme_orani: pay('yavas_itme'), zoom_ici_orani: pay('zoom_ici'), zoom_disi_orani: pay('zoom_disi'),
    kaydirma_orani: pay('kaydirma'), icerik_hareketi_orani: pay('icerik'),
    hareketli_orani: +(pay('yavas_itme') + pay('zoom_ici') + pay('zoom_disi') + pay('kaydirma')).toFixed(2),
    zoom_hizi_yuzde_sn: A.yuv(A.ortanca(M.kamera.filter(k => k.tur.startsWith('zoom') || k.tur === 'yavas_itme').map(k => Math.abs(k.z) * 100)), 1),
    zoom_hareketi: { sayi: zoomlar.length, sure_sn: A.dagilim(zoomlar.map(z => z.sn)) } };

  // visual events: cuts, flashes, starts of zoom moves -> how often the picture changes
  const olaylar = [...new Set([...K.zaman, ...fl.flas, ...zoomlar.map(z => z.t)].map(t => +t.toFixed(2)))].sort((a, b) => a - b);
  const sinirlar = [0, ...olaylar, N / fps], plan = K.zaman.length ? [0, ...K.zaman, N / fps].slice(1).map((t, i, a) => t - (i ? a[i - 1] : 0)) : [N / fps];
  const aralik = sinirlar.slice(1).map((t, i) => t - sinirlar[i]).filter(x => x > .05);

  // 3. captions
  let yazi = { bant: { var: false, siklik: bant.siklik } };
  const sayfalar = {};
  if (bant.var) {
    const KR = M.kartlar(bant);
    const H = P.H / h;                             // 540-scale row -> source row
    const pay = Math.round((bant.alt - bant.ust + 1) * H * .35) + 6;     // a little room above and below the band
    const cy = Math.max(0, Math.floor(bant.ust * H) - pay), ch = Math.min(P.H - cy, Math.ceil((bant.alt - bant.ust + 1) * H) + 2 * pay) & ~1;
    // full-resolution crops of up to 40 cards (evenly spread): words, lines, letter height
    const secim = KR.kart.filter((_, i, a) => a.length <= 40 || i % Math.ceil(a.length / 40) === 0);
    const kirp = [];
    if (secim.length) await A.akis(['-hide_banner', '-loglevel', 'error', '-t', String(sinir), '-i', f, '-map', '0:v:0', '-an',
      '-vf', `${P.fps > 60 ? 'fps=60,' : ''}select='${secim.map(k => `eq(n\\,${k.orta})`).join('+')}',crop=${P.W}:${ch}:0:${cy},format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'],
      P.W * ch, b => kirp.push(A.yaziKirpim(b, P.W, ch)));
    const kartOl = kirp.filter(l => l.length);
    const kelime = kartOl.map(l => l.reduce((s, x) => s + x.kelime, 0)), satir = kartOl.map(l => l.length);
    const harf = kartOl.flatMap(l => l.map(x => x.yukseklik * 1920 / P.H));
    const dag = {}; kelime.forEach(k => dag[k] = (dag[k] || 0) + 1);
    const gecis = KR.degisim.map(d => d.kare);
    yazi = {
      bant: { var: true, siklik: bant.siklik, ust_y: Math.round(bant.ust * olcek), alt_y: Math.round(bant.alt * olcek), merkez_y: Math.round((bant.ust + bant.alt) / 2 * olcek) },
      harf_boyu_px: A.yuv(A.ortanca(harf), 0), harf_boyu_orani: A.yuv(A.ortanca(harf) / 1920, 3),
      antonTR_px: harf.length ? Math.round(A.ortanca(harf) / ANTON_ORAN) : null,
      kart: { sayi: KR.kart.length, dakikada: A.yuv(KR.kart.length / dk, 1), sure_sn: A.dagilim(KR.kart.map(k => (k.b - k.a) / fps)),
        kelime: A.ortanca(kelime), kelime_dagilimi: dag, satir: A.ortanca(satir) },
      gecis_kare: A.ortanca(gecis), gecis_kare_dagilim: A.dagilim(gecis),
      degisim_zamanlari: KR.degisim.map(d => +(d.n / fps).toFixed(2)),
    };
    // contact sheets: card motion frame by frame (first 8 changes, 2 before .. 5 after) and card crops for the font
    const deg = KR.degisim.filter(d => d.n > 2).filter((d, i, a) => !i || d.n - a[i - 1].n >= 9).slice(0, 8);   // windows must not overlap
    sayfalar.yazi_hareketi = sayfa(f, path.join(kd, `${onek}-yazi-hareketi.jpg`), deg.flatMap(d => Array.from({ length: 8 }, (_, i) => d.n - 2 + i)),
      `crop=${P.W}:${ch}:0:${cy},scale=360:-2`, `8x${Math.max(1, deg.length)}`);
    sayfalar.yazilar = sayfa(f, path.join(kd, `${onek}-yazilar.jpg`), secim.slice(0, 16).map(k => k.orta), `crop=${P.W}:${ch}:0:${cy},scale=540:-2`, `2x${Math.ceil(Math.min(16, secim.length) / 2)}`);
  }

  // 4. palette (2 frames a second)
  const px = [];
  await A.akis(['-hide_banner', '-loglevel', 'error', '-t', String(sinir), '-i', f, '-map', '0:v:0', '-an', '-vf', `fps=2,scale=48:${2 * Math.round(24 * P.H / P.W)},format=rgb24`, '-f', 'rawvideo', '-'],
    48 * 2 * Math.round(24 * P.H / P.W) * 3, b => px.push(Buffer.from(b)));
  const renkler = A.palet(Buffer.concat(px));
  const vurgu = renkler.filter(r => r.doygunluk >= .35 && r.pay >= .01).sort((a, b) => b.doygunluk * Math.sqrt(b.pay) - a.doygunluk * Math.sqrt(a.pay))[0] || null;
  const palet = { renkler, zemin: renkler[0].hex, vurgu: vurgu && vurgu.hex, acik_kare_orani: +(M.lum.filter(l => l > 150).length / N).toFixed(2), koyu_kare_orani: +(M.lum.filter(l => l < 70).length / N).toFixed(2) };

  // 5. sound
  let ses = null;
  if (P.ses) {
    const parca = [];
    await A.akis(['-hide_banner', '-loglevel', 'error', '-t', String(sinir), '-i', f, '-vn', '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], 4, b => parca.push(b.readFloatLE(0)));
    const S = A.sesOlaylari(Float32Array.from(parca), 22050);
    let lufs = null; await A.calistir(['-hide_banner', '-nostats', '-t', String(sinir), '-i', f, '-vn', '-af', 'ebur128', '-f', 'null', '-'], s => { const m = s.match(/^\s*I:\s*(-?[\d.]+) LUFS/); if (m) lufs = +m[1]; });
    const efekt = S.olay;
    const yakin = (t, liste) => liste.some(x => Math.abs(x.t - t) <= .1);
    ses = { lufs, sessizlik_orani: S.sessizlik, efekt_dakikada: A.yuv(efekt.length / dk, 1),
      bas_dakikada: A.yuv(efekt.filter(x => x.tur === 'bas').length / dk, 1), ton_dakikada: A.yuv(efekt.filter(x => x.tur === 'ton').length / dk, 1), genis_dakikada: A.yuv(efekt.filter(x => x.tur === 'genis').length / dk, 1),
      kesmede_efekt_orani: K.zaman.length ? +(K.zaman.filter(t => yakin(t, efekt)).length / K.zaman.length).toFixed(2) : null,
      kartta_efekt_orani: yazi.degisim_zamanlari && yazi.degisim_zamanlari.length ? +(yazi.degisim_zamanlari.filter(t => yakin(t, efekt)).length / yazi.degisim_zamanlari.length).toFixed(2) : null,
      efektler: efekt.slice(0, 80).map(x => ({ t: x.t, tur: x.tur, guc: x.guc })) };
  }

  // 6. speech (optional)
  let konusma = null;
  if (o.konusma && P.ses) {
    const K2 = konusmaOku(f, o.python);
    if (K2 && K2.length) {
      const kel = K2.filter(x => x[1] < sinir), basla = kel.map(x => x[1]);
      const kesmeKelime = K.zaman.filter(t => basla.some(b => Math.abs(b - t) <= .12)).length;
      const kartKelime = yazi.kart ? M.kartlar(bant).kart.map(k => kel.filter(x => x[1] >= k.a / fps && x[1] < k.b / fps).length).filter(n => n > 0) : [];
      konusma = { kelime_dakikada: A.yuv(kel.length / (sinir / 60), 0), kesme_kelimede_orani: K.zaman.length ? +(kesmeKelime / K.zaman.length).toFixed(2) : null,
        kart_basina_kelime_sesten: A.ortanca(kartKelime), metin: kel.map(x => x[0]).join(' ').slice(0, 600) };
    }
  }

  // contact sheets: overview + first frame of every shot
  const yon = P.H >= P.W ? '180:320' : '320:180';
  sayfalar.genel = sayfa(f, path.join(kd, `${onek}-genel.jpg`), Array.from({ length: 24 }, (_, i) => Math.round((i + .5) * N / 24)), `scale=${yon}`, '6x4');
  const ilk = [0, ...K.zaman.map(t => Math.round(t * fps) + 2)].slice(0, 48);
  sayfalar.kesmeler = sayfa(f, path.join(kd, `${onek}-kesmeler.jpg`), ilk, `scale=${yon}`, `8x${Math.ceil(ilk.length / 8)}`);

  return {
    dosya: path.basename(f), sure_sn: +P.sure.toFixed(2), olculen_sn: +(N / fps).toFixed(2), boyut: `${P.W}x${P.H}`, fps: +P.fps.toFixed(3), yon: P.H >= P.W ? 'dikey' : 'yatay',
    kesme: { sayi: K.zaman.length, dakikada: A.yuv(K.zaman.length / dk, 1), plan_sn: A.dagilim(plan), zoom_kesmesi: M.ziplama.length,
      zoom_kesmesi_olcek: A.yuv(A.ortanca(M.ziplama.map(z => z.s)), 2), flas: fl.flas.length, kararma: fl.kararma.length, zamanlar: K.zaman.map(t => +t.toFixed(2)) },
    kamera, gorsel_olay: { sayi: olaylar.length, aralik_sn: A.dagilim(aralik) }, yazi, palet, ses, konusma, kareler: sayfalar,
  };
}

// ---- summary over all videos: numbers (median, range) + yes/no features -> SABİT / SIK / ARA SIRA
const al = (o, p) => p.split('.').reduce((x, k) => x == null ? null : x[k], o);
const SAYISAL = [
  ['kesme.plan_sn.ortanca', 'Plan süresi (sn, ortanca)'],
  ['kesme.dakikada', 'Dakikada kesme'],
  ['gorsel_olay.aralik_sn.ortanca', 'Görüntü değişim aralığı (sn)'],
  ['kamera.hareketli_orani', 'Kameranın hareketli olduğu süre payı'],
  ['kamera.zoom_hizi_yuzde_sn', 'Zoom hızı (%/sn)'],
  ['yazi.bant.merkez_y', 'Altyazı bandı merkezi (1920 yükseklikte)'],
  ['yazi.harf_boyu_px', 'Altyazı harf boyu (px, 1920 yükseklikte)'],
  ['yazi.antonTR_px', 'Aynı boy için AntonTR font px'],
  ['yazi.kart.kelime', 'Kart başına kelime'],
  ['yazi.kart.satir', 'Kart başına satır'],
  ['yazi.kart.sure_sn.ortanca', 'Kart süresi (sn)'],
  ['yazi.gecis_kare', 'Kart geçişi (kare)'],
  ['palet.acik_kare_orani', 'Açık zeminli kare payı'],
  ['ses.lufs', 'Ses yüksekliği (LUFS)'],
  ['ses.efekt_dakikada', 'Dakikada ses efekti'],
  ['ses.kesmede_efekt_orani', 'Efektli kesme payı'],
  ['konusma.kelime_dakikada', 'Dakikada kelime'],
  ['konusma.kesme_kelimede_orani', 'Kelimeye denk gelen kesme payı'],
];
const OZELLIK = [
  ['Sabit altyazı bandı', v => al(v, 'yazi.bant.var')],
  ['Zoom kesmesi (aynı görüntüye ani yakınlaşma)', v => al(v, 'kesme.zoom_kesmesi') > 0],
  ['Beyaz flaş', v => al(v, 'kesme.flas') > 0],
  ['Kararma', v => al(v, 'kesme.kararma') > 0],
  ['Kamera sürenin %40\'ından fazlasında hareketli', v => al(v, 'kamera.hareketli_orani') > .4],
  ['Yavaş itme (sürünen yakınlaşma)', v => al(v, 'kamera.yavas_itme_orani') >= .1],
  ['Hızlı zoom hareketi', v => (al(v, 'kamera.zoom_ici_orani') || 0) + (al(v, 'kamera.zoom_disi_orani') || 0) >= .05],
  ['Açık zemin (karelerin %60\'ından fazlası)', v => al(v, 'palet.acik_kare_orani') > .6],
  ['Koyu zemin (karelerin %60\'ından fazlası)', v => al(v, 'palet.koyu_kare_orani') > .6],
  ['Kesmelerin en az üçte birinde ses efekti', v => al(v, 'ses.kesmede_efekt_orani') >= .33],
  ['Bas vuruşu (bum) dakikada 2+', v => al(v, 'ses.bas_dakikada') >= 2],
  ['Anında kart geçişi (2 kare ya da az)', v => al(v, 'yazi.gecis_kare') != null && al(v, 'yazi.gecis_kare') <= 2],
  ['Tek satırlık altyazı kartı', v => al(v, 'yazi.kart.satir') === 1],
  ['Kesmelerin çoğu kelime başına denk (%60+)', v => al(v, 'konusma.kesme_kelimede_orani') >= .6],
];
const katman = (k, n) => k === 0 ? 'YOK' : k === n ? 'SABİT' : k / n >= .6 ? 'SIK' : 'ARA SIRA';
function ozet(videolar) {
  const n = videolar.length, sayisal = {};
  for (const [p, ad] of SAYISAL) {
    const d = videolar.map(v => al(v, p)).filter(x => x != null && !Number.isNaN(x));
    if (d.length) sayisal[p] = { ad, degerler: d, ortanca: A.yuv(A.ortanca(d)), min: Math.min(...d), max: Math.max(...d) };
  }
  const ozellikler = OZELLIK.map(([ad, fn]) => { const k = videolar.filter(v => fn(v)).length; return { ad, kac: `${k}/${n}`, katman: katman(k, n) }; });
  const o = p => sayisal[p] && sayisal[p].ortanca;
  const ani = videolar.filter(v => v.kesme.zoom_kesmesi > 0).length >= n / 2;
  const motor = { altyazi: {}, kamera: {} };
  if (o('yazi.kart.kelime') != null) motor.altyazi.kelime_kart = Math.max(1, Math.min(8, Math.round(o('yazi.kart.kelime'))));
  if (o('yazi.antonTR_px') != null) motor.altyazi.font_px = Math.max(40, Math.min(160, Math.round(o('yazi.antonTR_px'))));
  if (o('gorsel_olay.aralik_sn.ortanca') != null) motor.kamera.plan_sn = +Math.max(.8, Math.min(12, o('gorsel_olay.aralik_sn.ortanca'))).toFixed(1);
  motor.kamera.hareket = ani ? 'ani' : 'yumusak';
  return { video_sayisi: n, uyari: n < 5 ? `Yalnız ${n} örnek var. Kurallar için en az 5 video önerilir.` : null, sayisal, ozellikler, onerilen_motor: motor };
}

const python = () => arg('--python') || path.join(KOK, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
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
  const o = secenek();
  if (o.konusma && !fs.existsSync(o.python)) { console.log('Uyarı: Python bulunamadı, konuşma ölçülmeyecek: ' + o.python); o.konusma = false; }
  const sonuc = [];
  for (let i = 0; i < videolar.length; i++) sonuc.push(await olcVideo(videolar[i], kd, `v${i + 1}`, o));
  const out = { arac: 'stil/olc.js', tarih: new Date().toISOString().slice(0, 10), ayar: { esik: o.esik, en_fazla_sn: o.enFazla }, ozet: ozet(sonuc), videolar: sonuc };
  fs.writeFileSync(path.join(dir, 'olcum.json'), JSON.stringify(out, null, 1));
  yazdir(out.ozet);
  console.log(`\nÖLÇÜM: ${path.join(dir, 'olcum.json')}\nKARELER: ${kd}\nSıradaki adım: stil/BENIOKU.md → adım 3 (kuralları yaz).`);
}

function yazdir(oz) {
  console.log(`\n=== ÖZET (${oz.video_sayisi} video) ===`);
  if (oz.uyari) console.log('! ' + oz.uyari);
  for (const p in oz.sayisal) { const s = oz.sayisal[p]; console.log(`  ${s.ad.padEnd(44)} ${String(s.ortanca).padStart(7)}   (${s.min} – ${s.max})`); }
  console.log('');
  for (const x of oz.ozellikler) if (x.katman !== 'YOK') console.log(`  ${x.katman.padEnd(9)} ${x.kac}  ${x.ad}`);
  console.log('\n  Motor için önerilen değerler: ' + JSON.stringify(oz.onerilen_motor));
}

// ---- compare one video (usually our own render) with the measured style
async function karsilastir() {
  const [, ad, video] = konum;
  if (!ad || !video) fail('kullanım: node stil/olc.js karsilastir <ad> <video.mp4>');
  const kok = path.resolve(arg('--cikti', path.join(KOK, 'stil'))), dir = path.join(kok, ad);
  const ref = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'olcum.json'), 'utf8')); } catch (e) { fail(`${path.join(dir, 'olcum.json')} yok. Önce: node stil/olc.js ${ad}`); } })();
  const kd = path.join(dir, 'karsilastirma'); fs.mkdirSync(kd, { recursive: true });
  const o = secenek(); if (o.konusma && !fs.existsSync(o.python)) o.konusma = false;
  const v = await olcVideo(path.resolve(video), kd, 'deneme', o);
  fs.writeFileSync(path.join(kd, 'olcum.json'), JSON.stringify(v, null, 1));
  console.log(`\n=== ${path.basename(video)} ↔ ${ad} ===`);
  let tut = 0, top = 0;
  for (const p in ref.ozet.sayisal) {
    const r = ref.ozet.sayisal[p], x = al(v, p); if (x == null) continue;
    const pay = Math.max(Math.abs(r.ortanca) * .15, (r.max - r.min) * .15, .05), ok = x >= r.min - pay && x <= r.max + pay;
    top++; if (ok) tut++;
    console.log(`  ${ok ? '✓' : '✗'} ${r.ad.padEnd(44)} bu video ${String(x).padStart(7)}   hedef ${r.ortanca} (${r.min} – ${r.max})`);
  }
  console.log(`\n  ${tut}/${top} ölçü hedef aralıkta. Kareler: ${kd}`);
}

(konum[0] === 'karsilastir' ? karsilastir() : olc()).catch(e => fail(e.message));
