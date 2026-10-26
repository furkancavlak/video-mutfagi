// Ground-truth test for stil/olc.js: synthetic clips whose editing is known by construction (stil/test/sentetik.js),
// measured by the real tool, every key number checked against the truth with an explicit tolerance.
//   node --test stil/test/olc.test.js        (ffmpeg needed; about 30 s; no network, no paid calls)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync, spawn } = require('child_process');
const S = require('./sentetik');

const OLC = path.join(__dirname, '..', 'olc.js');
let ffmpegVar = true; try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch (e) { ffmpegVar = false; }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stil-test-'));
const yakin = (olc, dogru, tol, ad) => assert.ok(olc != null && Math.abs(olc - dogru) <= tol, `${ad}: ölçülen ${olc}, doğru ${dogru} (±${tol})`);
const calistir = (ad, video) => new Promise((ok, hata) => {
  const p = spawn(process.execPath, [OLC, ad, video, '--cikti', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; p.stderr.on('data', d => err += d); p.stdout.on('data', () => { });
  p.on('close', c => c === 0 ? ok(JSON.parse(fs.readFileSync(path.join(dir, ad, 'olcum.json'), 'utf8'))) : hata(new Error(err)));
});

let D, O30, O360, O25;
test.before(async () => {
  if (!ffmpegVar) return;
  const v30 = path.join(dir, 'k30.mp4'), v360 = path.join(dir, 'k360.mp4'), v25 = path.join(dir, 'k30r25.mp4');
  D = await S.uret(v30, { fps: 30, kisa: true });
  // the trap from a real job: a 360p copy resampled to 25 fps; and a full-size copy resampled to 25 fps
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', v30, '-vf', 'scale=360:640:flags=bicubic,fps=25', '-c:v', 'libx264', '-crf', '26', '-preset', 'veryfast', '-c:a', 'aac', v360]);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', v30, '-vf', 'fps=25', '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-c:a', 'copy', v25]);
  [O30, O360, O25] = await Promise.all([calistir('k30', v30), calistir('k360', v360), calistir('k25', v25)]);
});
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const t = (ad, fn) => test(ad, { skip: !ffmpegVar && 'ffmpeg yok' }, fn);
const v = () => O30.videolar[0], kare = 1 / 30;

t('transitions: times and kinds (white flash, whip, plain cut)', () => {
  const g = v().kesme.gecisler;
  assert.strictEqual(g.length, D.kesmeler.length, JSON.stringify(g));
  D.kesmeler.forEach((k, i) => { yakin(g[i].t, k.t, kare + .01, `geçiş ${i + 1} zamanı`); assert.strictEqual(g[i].tur, k.tur, `geçiş ${i + 1} türü`); });
  assert.strictEqual(v().kesme.flas_kare, D.flas.kare, 'flaş kaç kare');
  const w = g.find(x => x.tur === 'whip'); yakin(w.kare / 30, D.whip.sn, 2 * kare + .01, 'whip süresi'); assert.strictEqual(w.yon, D.whip.yon);
  const b = g.find(x => x.bulanik_giris_sn != null); assert.ok(b && Math.abs(b.t - D.bulanik_giris.t) < .05, 'bulanıktan nete giriş flaştan sonra');
  yakin(b.bulanik_giris_sn, D.bulanik_giris.sn, 2 * kare + .01, 'bulanık giriş süresi');
});

t('zoom: punch-in 1.22 -> 1.00 at camera shots, then the 1.00 <-> 1.10 rhythm', () => {
  const k = v().kamera;
  assert.strictEqual(k.punch.sayi, D.punch.cekimler.length, 'punch olan çekim sayısı');
  yakin(k.punch.bas, D.punch.bas, .02, 'punch başlangıç ölçeği');
  yakin(k.punch.sure90_sn, D.punch.sure90_sn, kare + .005, 'punch %90 süresi');
  yakin(k.ritim.ust, D.ritim.ust, .015, 'ritim üst ölçek');
  yakin(k.ritim.yari_periyot_sn, D.ritim.yari_periyot_sn, .15, 'ritim yarım tur');
  // graphic shots do not zoom
  assert.ok(k.cekimler.filter(c => !c.punch && c.ritim).every(c => c.ritim.aralik < 1.02));
});

t('captions: thin + bold pair, letter height, outline, cards', () => {
  const y = v().yazi, A = D.altyazi;
  yakin(y.harf_boyu_px, A.harf_boyu_px, 3, 'harf boyu');
  yakin(y.kontur_px, A.kontur_px, 1, 'kontur');
  yakin(y.ince_kalin.ince_govde_px, A.ince_govde_px, 1.5, 'ince gövde');
  yakin(y.ince_kalin.kalin_govde_px, A.kalin_govde_px, 2, 'kalın gövde');
  yakin(y.ince_kalin.kalinlik_orani, A.kalinlik_orani, .3, 'kalınlık oranı');
  const konum = Object.entries(y.ince_kalin.kalin_konum).sort((a, b) => b[1] - a[1])[0][0];
  assert.strictEqual(konum, A.kalin_konum, 'kalın blok yeri');
  assert.strictEqual(y.kart.sayi, A.kart_sayisi, 'kart sayısı');
  yakin(y.kart.kelime, A.kelime, 1, 'kart başına kelime');
  assert.strictEqual(y.gecis_kare, A.gecis_kare, 'kart geçişi kare');
  assert.strictEqual(y.degisim_zamanlari.length, A.degisim.length, `kart değişimleri ${y.degisim_zamanlari}`);
  A.degisim.forEach(d => assert.ok(y.degisim_zamanlari.some(x => Math.abs(x - d) <= kare + .01), `kart değişimi ${d}`));
});

t('text appearing: title sharpens over ~0.35 s, paragraph opens line by line', () => {
  const e = v().yazi_belirme.olaylar, bas = e.find(x => Math.abs(x.t - D.baslik.t) < .1), par = e.find(x => Math.abs(x.t - D.paragraf.t) < .1);
  assert.strictEqual(e.length, 2, JSON.stringify(e.map(x => [x.t, x.sn])));
  yakin(bas.sn, D.baslik.belirme_sn, 2 * kare + .005, 'başlık belirme süresi');
  assert.strictEqual(bas.tur, D.baslik.tur);
  yakin(Math.max(...bas.harf_boyu_px), D.baslik.harf_boyu_px, 4, 'başlık harf boyu');
  assert.strictEqual(par.satir, D.paragraf.satir); assert.ok(par.satir_satir);
  yakin(par.satir_arasi_sn, D.paragraf.satir_arasi_sn, kare + .01, 'paragraf satır arası');
  yakin(par.sn, D.paragraf.toplam_sn, 2 * kare + .01, 'paragraf toplam');
});

t('sound: low bum on the cuts, whoosh on the whip, speech not counted', () => {
  const ef = v().ses.efektler;
  assert.strictEqual(ef.length, D.ses.length, JSON.stringify(ef));
  D.ses.forEach(s => { const m = ef.find(x => Math.abs(x.t - s.t) <= .06); assert.ok(m, `ses ${s.t}`); assert.strictEqual(m.tur, s.tur === 'bas' ? 'bas' : 'hisirti'); });
});

t('palette: every colour of the set is found', () => {
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), r = v().palet.renkler.map(x => hex(x.hex));
  for (const c of D.palet) assert.ok(r.some(m => Math.hypot(...hex(c).map((x, i) => x - m[i])) <= 20), `renk ${c}`);
});

t('a clean source raises no warning', () => {
  assert.deepStrictEqual(v().guven.uyarilar, []);
  assert.strictEqual(O30.ozet.kaynak_uyarilari.length, 0);
});

t('360p copy resampled to 25 fps: warned, letters and timings left out, cuts and zoom still right', () => {
  const x = O360.videolar[0];
  assert.ok(x.guven.dusuk_cozunurluk, 'düşük çözünürlük uyarısı');
  assert.ok(x.guven.kare_hizi.yeniden_orneklenmis, 'kare hızı dönüşümü fark edildi');
  assert.strictEqual(x.guven.kare_hizi.kadans.p, 5, '30 -> 25: her 5 karede bir atlanmış kare');
  assert.strictEqual(x.yazi.guvenilir, false); assert.strictEqual(x.yazi_belirme.guvenilir, false);
  for (const p of ['yazi.harf_boyu_px', 'yazi.ince_kalin.kalinlik_orani', 'yazi_belirme.sn', 'yazi.gecis_kare'])
    assert.strictEqual(O360.ozet.sayisal[p].guvenilmez_video, 1, `${p} özete girmemeli`);
  assert.strictEqual(x.kesme.gecisler.length, D.kesmeler.length);
  yakin(x.kamera.punch.bas, D.punch.bas, .02, '360p punch');
  yakin(x.kamera.ritim.ust, D.ritim.ust, .015, '360p ritim');
});

t('full size resampled to 25 fps: only the frame-rate warning', () => {
  const x = O25.videolar[0];
  assert.ok(!x.guven.dusuk_cozunurluk);
  assert.ok(x.guven.kare_hizi.yeniden_orneklenmis);
  assert.strictEqual(x.guven.uyarilar.length, 1);
  assert.strictEqual(x.yazi.guvenilir, true);
});
