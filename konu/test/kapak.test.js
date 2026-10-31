// Offline tests for the episode cover: the 2-line title split, scene plan and moment choice (uretim/kapak.js), the
// cover step that never fails an episode and the queue job carrying the cover (konu/uret.js). No browser, no ffmpeg.
//   node --test "konu/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const KP = require('../../uretim/kapak');
const U = require('../uret');

const tmp = ad => fs.mkdtempSync(path.join(os.tmpdir(), ad));

test('satirla: 2 balanced lines at a word boundary, the approved mock\'s breaks', () => {
  assert.deepStrictEqual(KP.satirla('ÇOCUĞUM YOK AMA VELİYİM').satirlar, ['ÇOCUĞUM YOK', 'AMA VELİYİM']);
  assert.deepStrictEqual(KP.satirla('İHANETİ KART ELE VERDİ').satirlar, ['İHANETİ KART', 'ELE VERDİ']);
  assert.deepStrictEqual(KP.satirla('9 YIL SONRA GELEN MESAJ').satirlar, ['9 YIL SONRA', 'GELEN MESAJ']);
  assert.deepStrictEqual(KP.satirla('ADINI SORMADIM').satirlar, ['ADINI', 'SORMADIM']);
  const b = KP.satirla('ÇOCUĞUM YOK AMA VELİYİM');
  assert.deepStrictEqual([b.px, b.satir], [118, 132], 'fits 900 px: no shrinking');
});

test('satirla: near-equal splits prefer the shorter first line; size shrinks only past 900 px', () => {
  // "BİR İKİ ÜÇ DÖRT": the two middle-ish splits are close, the one with the shorter top line is taken
  const s = KP.satirla('BİR İKİ ÜÇ DÖRT');
  assert.ok(KP.genislik(s.satirlar[0], 118) <= KP.genislik(s.satirlar[1], 118), JSON.stringify(s));
  const uzun = KP.satirla('MMMMMMMMMMMM WWWWWWWWWWWW');
  assert.ok(uzun.px < 118, 'a line wider than 900 px shrinks the font');
  assert.ok(Math.max(...uzun.satirlar.map(x => KP.genislik(x, uzun.px))) <= 900);
  assert.strictEqual(uzun.satir, Math.round(132 * uzun.px / 118));
});

test('kisiIsaretle + sahnePlani: figures per scene (one spot counts once), faces and windows from M.kes', () => {
  const K = KP.kisiIsaretle({ adam: o => '<g/>', cocuk: (x, y) => '<g/>', balon: () => '<b/>' });
  const kut = KP.kisiIsaretle({ amca: () => '<g/>' }, null);
  const html = `<div class="sh" id="s0"><svg>${K.adam({ x: 300, y: 1300 })}${K.adam({ x: 300, y: 1300, agiz: 'o' })}${K.balon()}</svg></div>
<div class="sh" id="s1"><svg>${K.cocuk(100, 500)}${K.cocuk(300, 500)}${K.adam({ x: 700, y: 1500, s: 1.2 })}${kut.amca()}</svg></div>
<div class="sh" id="s2"><svg></svg></div>`;
  const tl = ["gsap.set('#s0',{opacity:0});tl.set('#s0',{opacity:1},0.000);tl.set('#s0',{opacity:0},4.500);",
    "gsap.set('#s1',{opacity:0});tl.set('#s1',{opacity:1},4.500);tl.set('#s1',{opacity:0},9.000);",
    "gsap.set('#s2',{opacity:0});tl.set('#s2',{opacity:1},9.000);"];
  const p = KP.sahnePlani(html, tl);
  assert.deepStrictEqual(p.map(s => [s.id, s.kisi, s.bas, s.son]), [['s0', 1, 0, 4.5], ['s1', 4, 4.5, 9], ['s2', 0, 9, null]]);
  assert.deepStrictEqual(p[1].yuzler.sort((a, b) => a - b), [500, 500, 1140]);
});

test('anSec: the scene with the most people, never 0 s, never in the closing card; fallbacks after 3 s', () => {
  const plan = [{ id: 's0', kisi: 2, yuzler: [900], bas: 0, son: 4 }, { id: 's1', kisi: 5, yuzler: [600, 700], bas: 4, son: 8 }, { id: 's2', kisi: 1, bas: 8, son: 20 }];
  const a = KP.anSec(plan, { son: 30, kapanis: 25 });
  assert.ok(a.t > 4 && a.t < 8, JSON.stringify(a));
  assert.ok(a.odak >= 600 && a.odak <= 1500);
  // a tie: the scene after the first 3 s wins over the opening one
  const b = KP.anSec([{ id: 'a', kisi: 1, bas: 0, son: 3 }, { id: 'b', kisi: 1, bas: 5, son: 9 }], { kapanis: 20 });
  assert.ok(b.t >= 5 && b.t < 9);
  // only the opening scene has people: still not 0 s
  assert.ok(KP.anSec([{ id: 'a', kisi: 1, bas: 0, son: 3 }], {}).t >= 1);
  // nobody anywhere: the first scene after 3 s; no plan at all: after the first line that starts past 3 s
  assert.ok(KP.anSec([{ id: 'a', kisi: 0, bas: 0, son: 2 }, { id: 'b', kisi: 0, bas: 6, son: 9 }], {}).t >= 6);
  assert.strictEqual(KP.anSec([], { satirlar: [{ bas: .2 }, { bas: 4 }] }).t, 4.8);
  // a scene running into the closing card is cut at the card
  const c = KP.anSec([{ id: 'a', kisi: 3, bas: 10, son: null }], { son: 40, kapanis: 11 });
  assert.ok(c.t >= 10 && c.t < 11);
});

test('odakSec: the band holding the most faces', () => {
  assert.strictEqual(KP.odakSec([]), null);
  const o = KP.odakSec([470, 470, 660, 850, 1360]);
  assert.ok(o - 442 <= 470 - 120 && o + 442 >= 850 + 200, 'the three rows of the class photo fit, the outlier does not');
});

test('etiket and hesapAdi', () => {
  assert.strictEqual(KP.etiket({ bolum: 2, toplam_bolum: 3 }), 'BÖLÜM 2');
  assert.strictEqual(KP.etiket({ bolum: 3, toplam_bolum: 3 }), 'FİNAL');
  assert.strictEqual(KP.hesapAdi({ hesap: 'kanal_a' }), '@kanal_a');
  assert.strictEqual(KP.hesapAdi({ marka: { hesap: '@kanal_b' } }), '@kanal_b');
});

// ---- konu/uret.js
function bolumKlasoru() {
  const kok = tmp('kapak-uret-'), dir = path.join(kok, 'videolar', 'k-eksi-1-b1');
  fs.mkdirSync(path.join(dir, 'cikti'), { recursive: true });
  return { kok, dir, ad: 'k-eksi-1-b1' };
}
const ctxKapak = { kimlik: { marka: { kapak: { renkler: ['#E9B949'] } } } };
const video = { kapak: { renk: '#E9B949', baslik: 'ADINI SORMADIM' } };

test('kapakAdimi: a failing or crashing cover step logs and returns null (production goes on)', () => {
  const { kok, dir, ad } = bolumKlasoru(), notlar = [];
  const r1 = U.kapakAdimi({ ctx: ctxKapak, video, dir, ad, kok, yaz: m => notlar.push(m), kos: () => ({ ok: false, cikti: 'HATA: hyperframes başarısız' }) });
  assert.strictEqual(r1, null);
  assert.match(notlar.join('\n'), /kapaksız paylaşılacak.*hyperframes/);
  const r2 = U.kapakAdimi({ ctx: ctxKapak, video, dir, ad, kok, yaz: m => notlar.push(m), kos: () => { throw new Error('spawn patladı'); } });
  assert.strictEqual(r2, null);
  // ok but no file written counts as a failure too
  assert.strictEqual(U.kapakAdimi({ ctx: ctxKapak, video, dir, ad, kok, yaz: () => { }, kos: () => ({ ok: true }) }), null);
});

test('kapakAdimi: draws once, redraws when the title changes, skips channels without marka.kapak', () => {
  const { kok, dir, ad } = bolumKlasoru();
  let cagri = 0, isaret = null;
  const kos = (betik, args) => { cagri++; assert.strictEqual(betik, 'uretim/kapak.js'); assert.deepStrictEqual(args, [dir]); fs.writeFileSync(path.join(dir, 'cikti', `${ad}-kapak.jpg`), 'jpg'); return { ok: true }; };
  const r = U.kapakAdimi({ ctx: ctxKapak, video, dir, ad, kok, yaz: () => { }, kos, isaretle: (a, ek) => { isaret = ek; } });
  assert.strictEqual(r, `videolar/${ad}/cikti/${ad}-kapak.jpg`);
  assert.strictEqual(cagri, 1);
  U.kapakAdimi({ ctx: ctxKapak, video, dir, ad, kok, yaz: () => { }, kos, adim: isaret });
  assert.strictEqual(cagri, 1, 'same colour and title: not redrawn');
  U.kapakAdimi({ ctx: ctxKapak, video: { kapak: { ...video.kapak, baslik: 'YENİ BAŞLIK' } }, dir, ad, kok, yaz: () => { }, kos, adim: isaret });
  assert.strictEqual(cagri, 2);
  assert.strictEqual(U.kapakAdimi({ ctx: { kimlik: {} }, video, dir, ad, kok, kos }), null);
  assert.strictEqual(U.kapakAdimi({ ctx: ctxKapak, video: {}, dir, ad, kok, kos }), null);
  assert.strictEqual(cagri, 2);
});

test('kuyrugaYaz: the job carries kapak only when the jpg exists', () => {
  const { kok, dir, ad } = bolumKlasoru(), jpg = `videolar/${ad}/cikti/${ad}-kapak.jpg`;
  const f1 = U.kuyrugaYaz({ video: `videolar/${ad}`, mp4: `videolar/${ad}/cikti/x.mp4`, aciklama: 'a', onayGerekli: false, kaynak: 'dizi', kapak: jpg }, kok);
  assert.ok(!('kapak' in JSON.parse(fs.readFileSync(f1, 'utf8'))), 'no file yet: no kapak field');
  fs.unlinkSync(f1);
  fs.writeFileSync(path.join(kok, jpg), 'jpg');
  const f2 = U.kuyrugaYaz({ video: `videolar/${ad}`, mp4: `videolar/${ad}/cikti/x.mp4`, aciklama: 'a', onayGerekli: false, kaynak: 'dizi', kapak: jpg }, kok);
  assert.strictEqual(JSON.parse(fs.readFileSync(f2, 'utf8')).kapak, jpg);
  assert.ok(dir);
});
