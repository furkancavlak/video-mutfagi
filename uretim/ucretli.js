#!/usr/bin/env node
// Step 5 (PAID tier): Higgsfield stills + short image-to-video clips, locked to the same word cues as the free cut.
// Recipe: <video>/ucretli.json. Media lands in <video>/ucretli/ (not committed: large files).
//
//   node uretim/ucretli.js <video> gorsel            price of the missing stills (spends nothing)
//   node uretim/ucretli.js <video> gorsel --onay     generate them -> look at ucretli/gorseller.jpg before going on
//   node uretim/ucretli.js <video> klip              price of the missing clips
//   node uretim/ucretli.js <video> klip --onay       generate them -> ucretli/klipler.jpg
//   node uretim/ucretli.js <video> kurgu [--kare 3,12 | --render]
//
// Redo one still or clip: delete only that file and run the step again. Every spend is logged to ucretli/harcama.jsonl.
// The Higgsfield CLI always charges credits (even models that are "unlimited" on the website).
const fs = require('fs'), path = require('path');
const { execFileSync, execFile } = require('child_process');
const K = require('./cekirdek');

const { dir, video, kimlik, ad } = K.videoYukle(process.argv[2]);
const adim = process.argv[3], onay = process.argv.includes('--onay');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const U = K.okuJson(path.join(dir, 'ucretli.json'), 'ucretli.json');
const MD = path.join(dir, 'ucretli'), GD = path.join(MD, 'gorsel'), KD = path.join(MD, 'klip');
[GD, KD].forEach(d => fs.mkdirSync(d, { recursive: true }));
const gPath = n => path.join(GD, n + '.png'), kPath = n => path.join(KD, n + '.mp4');

// ---- Higgsfield CLI, called through node (no shell: prompts with quotes/apostrophes stay intact)
let HF;
function hfBin() {
  if (HF) return HF;
  let root; try { root = require('child_process').execSync('npm root -g').toString().trim(); } catch (e) { }
  HF = root && path.join(root, '@higgsfield', 'cli', 'bin', 'higgsfield.js');
  if (!HF || !fs.existsSync(HF)) K.fail('Higgsfield CLI kurulu değil. Kur: npm i -g @higgsfield/cli  — sonra: higgsfield auth login');
  return HF;
}
const hf = args => execFileSync(process.execPath, [hfBin(), ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const hfAsync = args => new Promise((res, rej) => execFile(process.execPath, [hfBin(), ...args], { maxBuffer: 1 << 24 }, (e, out, err) => e ? rej(new Error((err || e.message).toString().slice(0, 400))) : res(out)));
function bakiye() {
  let s; try { s = hf(['account', 'status']); } catch (e) { K.fail('Higgsfield oturumu yok ya da süresi doldu. Terminalde: higgsfield auth login'); }
  const m = s.match(/([\d.]+)\s*credits/); return m ? +m[1] : NaN;
}
const flags = o => Object.entries(o).filter(([k]) => k !== 'model').flatMap(([k, v]) => ['--' + k, String(v)]);
const fiyat = (model, args) => { const m = hf(['generate', 'cost', model, ...args]).match(/([\d.]+)\s*credits/); return m ? +m[1] : NaN; };
const logla = (tur, ne, kredi) => fs.appendFileSync(path.join(MD, 'harcama.jsonl'), JSON.stringify({ zaman: new Date().toISOString(), tur, ne, kredi }) + '\n');
const harcanan = () => { try { return fs.readFileSync(path.join(MD, 'harcama.jsonl'), 'utf8').trim().split('\n').filter(Boolean).reduce((a, l) => a + JSON.parse(l).kredi, 0); } catch (e) { return 0; } };
async function indir(url, file) { const r = await fetch(url); if (!r.ok) throw new Error('indirme ' + r.status); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); }

// One contact sheet so a human (or the review agent) checks everything before the next, pricier step.
function sayfa(files, out, cols) {
  if (!files.length) return;
  const ins = files.flatMap(f => f.endsWith('.mp4') ? ['-ss', '2', '-i', f] : ['-i', f]);
  const fc = files.map((_, i) => `[${i}:v]scale=300:533:force_original_aspect_ratio=increase,crop=300:533,setsar=1[v${i}]`).join(';') + ';' +
    files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * 300}_${Math.floor(i / cols) * 533}`).join('|')}:fill=0x222222`;
  K.sh('ffmpeg', ['-loglevel', 'error', '-y', ...ins, '-filter_complex', files.length > 1 ? fc : `[0:v]scale=300:-1`, '-frames:v', '1', out]);
}

async function uret(tur) {
  const isG = tur === 'gorsel', model = isG ? U.gorsel_modeli : U.klip_modeli;
  const liste = isG ? U.gorseller : U.klipler, yol = isG ? gPath : kPath;
  const eksik = liste.filter(x => !fs.existsSync(yol(x.ad)));
  if (!eksik.length) { console.log(`Tüm ${isG ? 'görseller' : 'klipler'} hazır.`); return sonraki(tur); }
  if (!isG) { const yok = eksik.filter(x => !fs.existsSync(gPath(x.gorsel))); if (yok.length) K.fail('önce şu görseller lazım: ' + yok.map(x => x.gorsel).join(', ')); }
  const args = x => isG
    ? [...flags(model), '--prompt', `${x.istem} ${U.stil}`, ...(x.referans || []).flatMap(r => ['--image', gPath(r)])]
    : [...flags(model), '--duration', String(x.sure), '--start_image', gPath(x.gorsel), '--prompt', `${x.istem} ${U.klip_eki || ''}`.trim()];
  // pricing is checked without the media flags (the CLI would upload them just to price)
  const birim = x => fiyat(model.model, isG ? [...flags(model), '--prompt', 'x'] : [...flags(model), '--duration', String(x.sure), '--prompt', 'x']);
  const tablo = eksik.map(x => ({ ad: x.ad, kredi: birim(x) }));
  const toplam = tablo.reduce((a, x) => a + x.kredi, 0), once = harcanan(), kalan = bakiye();
  tablo.forEach(x => console.log(`  ${x.ad.padEnd(14)} ${x.kredi} kredi`));
  console.log(`Bu adım: ${toplam.toFixed(2)} kredi | bu videoda daha önce: ${once.toFixed(2)} | bütçe: ${U.butce} | hesapta: ${kalan}`);
  if (once + toplam > U.butce) K.fail(`Bütçe aşılıyor (${(once + toplam).toFixed(2)} > ${U.butce}). Klip sürelerini kısalt, sayısını azalt ya da ucretli.json'da bütçeyi bilerek yükselt.`);
  if (toplam > kalan) K.fail('Hesapta yeterli kredi yok.');
  if (!onay) { console.log('\nHiçbir şey üretilmedi. Onaylıyorsan aynı komutu --onay ile çalıştır.'); return; }
  // stills that reference other stills wait for them; everything that is ready runs in parallel
  let kalanIs = [...eksik];
  while (kalanIs.length) {
    const hazir = kalanIs.filter(x => isG ? (x.referans || []).every(r => fs.existsSync(gPath(r))) : true);
    if (!hazir.length) K.fail('referans döngüsü ya da eksik referans: ' + kalanIs.map(x => x.ad).join(', '));
    await Promise.all(hazir.map(async x => {
      try {
        const out = await hfAsync(['generate', 'create', model.model, ...args(x), '--wait', '--wait-timeout', '20m']);
        const url = (out.match(/https:\/\/\S+\.(png|jpg|jpeg|webp|mp4)/g) || []).pop();
        if (!url) throw new Error('sonuç adresi yok: ' + out.slice(0, 200));
        await indir(url, yol(x.ad));
        logla(tur, x.ad, tablo.find(t => t.ad === x.ad).kredi);
        console.log(`${x.ad} hazır`);
      } catch (e) { console.log(`${x.ad} BAŞARISIZ: ${e.message}`); }
    }));
    kalanIs = kalanIs.filter(x => !hazir.includes(x) && !fs.existsSync(yol(x.ad)));
    if (hazir.some(x => !fs.existsSync(yol(x.ad)))) break;
  }
  console.log(`Hesapta kalan: ${bakiye()} kredi.`);
  sonraki(tur);
}
function sonraki(tur) {
  if (tur === 'gorsel') {
    const f = path.join(MD, 'gorseller.jpg'); sayfa(U.gorseller.map(x => gPath(x.ad)).filter(fs.existsSync), f, 4);
    console.log(`\nResimlere bak: ${f}\nKontrol et: fazladan insan/yazı, bozuk el/yüz, karakter ve renkler sahneden sahneye aynı mı? Kötüyü sil, tekrar üret. Sonra: klip`);
  } else {
    const f = path.join(MD, 'klipler.jpg'); sayfa(U.klipler.map(x => kPath(x.ad)).filter(fs.existsSync), f, 5);
    console.log(`\nKliplerin 2. saniyesi: ${f}. Klipleri tek tek oynat. Sonra: kurgu`);
  }
}

// ---- background: one continuous video, each piece held/slowed so its key moment lands on its word
function arkaPlan(T) {
  const fit = `scale=${K.W}:${K.H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${K.W}:${K.H},setsar=1`;
  const enc = ['-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(K.FPS)];
  const tmp = path.join(MD, 'tmp'); fs.mkdirSync(tmp, { recursive: true });
  const B = [0, ...U.kurgu.map(p => T.ifade(p.kadar))];
  U.kurgu.forEach((p, i) => {
    const dur = B[i + 1] - B[i], out = path.join(tmp, `p${i}.mp4`);
    if (dur <= 0) K.fail(`kurgu parçası ${i} sıfır ya da eksi uzunlukta (${p.kadar}).`);
    if (p.klip) {
      if (!fs.existsSync(kPath(p.klip))) K.fail('klip yok: ' + p.klip);
      const pre = Math.max(0, T.ifade(p.baslat ?? B[i]) - B[i]), slow = p.yavas || 1;
      const mv = slow > 1.1 ? `,minterpolate=fps=${K.FPS}:mi_mode=mci:mc_mode=aobmc` : `,fps=${K.FPS}`;
      K.sh('ffmpeg', ['-loglevel', 'error', '-y', '-i', kPath(p.klip), '-vf', `setpts=${slow}*PTS${mv},${fit},tpad=start_duration=${pre.toFixed(3)}:start_mode=clone:stop_duration=${dur}:stop_mode=clone`, '-t', dur.toFixed(3), ...enc, out]);
    } else if (p.gecis) {
      const x = T.ifade(p.an) - B[i];
      K.sh('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', gPath(p.gecis[0]), '-loop', '1', '-i', gPath(p.gecis[1]), '-filter_complex',
        `[0]${fit},fps=${K.FPS},trim=duration=${dur.toFixed(3)}[a];[1]${fit},fps=${K.FPS},trim=duration=${dur.toFixed(3)}[b];[a][b]xfade=transition=dissolve:duration=0.7:offset=${Math.max(0, x).toFixed(3)}`, '-t', dur.toFixed(3), ...enc, out]);
    } else {
      K.sh('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', gPath(p.gorsel), '-vf', `${fit},fps=${K.FPS}`, '-t', dur.toFixed(3), ...enc, out]);
    }
    console.log(`parça ${i + 1}/${U.kurgu.length} (${B[i].toFixed(2)}–${B[i + 1].toFixed(2)} sn)`);
  });
  fs.writeFileSync(path.join(tmp, 'liste.txt'), U.kurgu.map((_, i) => `file 'p${i}.mp4'`).join('\n'));
  return { B, liste: path.join(tmp, 'liste.txt') };
}

function kurgu() {
  const T = K.zamanlama(dir), C = K.palet(kimlik);
  const hfDir = path.join(dir, 'cikti', 'hf-ucretli');
  const { B, liste } = arkaPlan(T);
  fs.mkdirSync(path.join(hfDir, 'assets'), { recursive: true });
  K.sh('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy', path.join(hfDir, 'assets', 'bg.mp4')]);
  const tl = [];
  U.kurgu.forEach((p, i) => { if (!p.itme || p.itme === 1) return; tl.push(`tl.set('#bgw',{scale:1,transformOrigin:'${p.odak || '50% 45%'}'},${K.at(B[i])});tl.to('#bgw',{scale:${p.itme},duration:${K.at(B[i + 1] - B[i])},ease:'sine.inOut'},${K.at(B[i])});`); });
  const E = U.etiketler || [];
  const html = E.map((e, i) => `<div class="chip c${i}"${e.ust ? ` style="top:${e.ust}px"` : ''}>${e.metin}</div>`).join('');
  E.forEach((e, i) => {
    const a = T.ifade(e.bas); let b = T.ifade(e.bit);
    if (E[i + 1]) b = Math.min(b, T.ifade(E[i + 1].bas) - .05);       // chips never stack
    tl.push(`gsap.set('.c${i}',{opacity:0,y:24});tl.to('.c${i}',{opacity:1,y:0,duration:.4,ease:'power3.out'},${K.at(a)});tl.to('.c${i}',{opacity:0,duration:.2},${K.at(b - .2)});`);
  });
  const cap = K.altyazi(T, video, C), mk = K.marka(T, kimlik, C);
  const css = `#bgw{position:absolute;inset:0;overflow:hidden;transform-origin:50% 45%}#bgw video{position:absolute;left:0;top:0;width:${K.W}px;height:${K.H}px}
.chip{position:absolute;left:0;right:0;margin:0 auto;width:max-content;max-width:900px;top:300px;font:400 70px/1.05 "AntonTR";letter-spacing:.02em;color:${C.ink};background:rgba(247,243,234,.94);border-radius:22px;padding:20px 32px 16px;box-shadow:0 12px 34px rgba(60,45,25,.22);text-align:center}.chip span{color:${C.coral}}`;
  K.sayfaYaz(hfDir, {
    C, END: T.END, css, baslik: ad + ' ucretli', tl: [...tl, ...mk.tl, ...cap.tl],
    katmanlar: [`<div id="bgw"><video id="bg" src="assets/bg.mp4" muted playsinline data-start="0" data-duration="${T.END.toFixed(3)}" data-track-index="0"></video></div>`, html, mk.html, cap.html],
  });
  if (process.argv.includes('--render')) K.renderEt(hfDir, path.join(dir, 'ses', 'mix.wav'), path.join(dir, 'cikti', `${ad}-ucretli.mp4`));
  else {
    const kare = arg('--kare');
    // default stills: the moment every chip lands + the middle of every piece
    const sn = kare ? kare.split(',').map(Number) : [...new Set([...E.map(e => +(T.ifade(e.bas) + .5).toFixed(1)), ...B.slice(0, -1).map((b, i) => +((b + B[i + 1]) / 2).toFixed(1))])].sort((a, b) => a - b);
    K.kareler(hfDir, sn, path.join(dir, 'cikti', 'kareler-ucretli'));
    console.log('\nKarelere bak (cikti/kareler-ucretli/). Özellikle: etiket kahraman nesnenin üstüne biniyor mu, resim o an söyleneni gösteriyor mu? Beğenince: --render');
  }
}

if (adim === 'gorsel' || adim === 'klip') uret(adim);
else if (adim === 'kurgu') kurgu();
else K.fail('adım ver: gorsel | klip | kurgu');
