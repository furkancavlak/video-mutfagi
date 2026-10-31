// Offline tests for the formul layer: code extraction, the sandbox, the motor and the sample scene (no network, no spend).
//   node --test konu/test/formul.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');

const KOK = path.join(__dirname, '..', '..');
const K = require(path.join(KOK, 'uretim', 'cekirdek'));
const motor = require(path.join(KOK, 'uretim', 'motor'));
const U = require('../uret');

// a zaman.json built from the sample's committed word times (mix.js would also add the sting; ffmpeg is not needed here)
function ornekZaman(dir) {
  const ornek = path.join(KOK, 'videolar', 'oxygbio-ornek-formul');
  const kel = JSON.parse(fs.readFileSync(path.join(ornek, 'ses', 'kelimeler.json'), 'utf8'));
  const video = JSON.parse(fs.readFileSync(path.join(ornek, 'video.json'), 'utf8'));
  const { hizala } = require(path.join(KOK, 'uretim', 'hizala'));       // caption words come from the script, as in mix.js
  let t = .25; const satirlar = [], kelimeler = [];
  Object.entries(kel).forEach(([dosya, ham], i) => {
    const ws = hizala(video.satirlar[i].metin, ham) || ham;
    satirlar.push({ dosya, kim: 'yasli-dayi', bas: t, son: t + ws[ws.length - 1][2] });
    for (const [w, a, b] of ws) kelimeler.push({ w, a: t + a, b: t + b, kim: 'yasli-dayi', satir: i });
    t += ws[ws.length - 1][2] + .22;
  });
  const Z = { satirlar, kelimeler, sting: [satirlar[0].son + .1, t], chime: [], toplam: t + 2.4 };
  fs.mkdirSync(path.join(dir, 'ses'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'ses', 'zaman.json'), JSON.stringify(Z));
  return Z;
}

test('kodCikar: takes the js block that exports a function, the longest one wins', () => {
  assert.strictEqual(U.kodCikar('yok'), null);
  assert.strictEqual(U.kodCikar('```js\nconst a = 1;\n```'), null);
  const k = U.kodCikar('Önce şunu çizdim.\n```js\nmodule.exports = function () { return 1; };\n```\n```js\nmodule.exports = function () { return 22222; };\n```');
  assert.match(k, /22222/);
});

test('sandbox: scene code cannot require, read files or reach process', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formul-test-'));
  const kotu = path.join(dir, 'kotu.js');
  fs.writeFileSync(kotu, "module.exports = function () { return require('fs').readdirSync('.'); };");
  const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(KOK, 'uretim', 'cekirdek'))}).guvenliYukle(${JSON.stringify(kotu)})()`], { encoding: 'utf8' });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /require is not defined/);
  fs.writeFileSync(kotu, "module.exports = function () { return typeof process; };");
  const r2 = spawnSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(path.join(KOK, 'uretim', 'cekirdek'))}).guvenliYukle(${JSON.stringify(kotu)})())`], { encoding: 'utf8' });
  assert.strictEqual(r2.stdout.trim(), 'undefined');
});

test('motor: cuts, word cue and position wrapper', () => {
  const T = { L: [0, 2, 4], LE: [1.8, 3.8, 6], END: 7, cue: (w, after) => after + .5 };
  const M = motor({ T, at: K.at, f: K.f1 });
  M.kesmeler([0, 2, 4, 7]);
  M.sahne('a', '<rect/>'); M.kes('a', 1);
  assert.match(M.tl[0], /tl\.set\('#a',\{opacity:1\},2\.000\);tl\.set\('#a',\{opacity:0\},4\.000\)/);
  assert.strictEqual(M.k('x', 1), 2.5);
  // the class sits on the inner group, never on the one with the transform
  assert.match(M.yer(10, 20, '<i/>', { sinif: 'top', r: 5 }), /^<g transform="translate\(10\.0,20\.0\) rotate\(5\)"><g class="top"><i\/><\/g><\/g>$/);
  const out = M.bitir('.x{}');
  assert.match(out.css, /\.sh\{position:absolute;inset:0\}/);
});

test('sample scene: builds in the sandbox with the channel character, no NaN or undefined', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formul-ornek-'));
  ornekZaman(dir);
  const T = K.zamanlama(dir);
  const C = K.palet(JSON.parse(fs.readFileSync(path.join(KOK, 'kanal', 'oxygbio', 'kimlik.json'), 'utf8')));
  const { rnd, r2 } = K.tohum(5);
  const M = motor({ T, at: K.at, f: K.f1 });
  const karakter = K.guvenliYukle(path.join(KOK, 'kanal', 'oxygbio', 'karakter.js'))({ C, f: K.f1 });
  const S = K.guvenliYukle(path.join(KOK, 'videolar', 'oxygbio-ornek-formul', 'sahneler.js'))({ C, T, at: K.at, f: K.f1, r2, rnd, W: K.W, H: K.H, M, karakter });
  assert.ok(S.html.includes('id="cem1"'), 'the channel character is drawn');
  assert.ok(S.tl.length > 40);
  const hepsi = S.html + S.tl.join('\n');
  assert.ok(!/NaN|undefined/.test(hepsi), 'no NaN/undefined in the scene');
  assert.strictEqual((S.html.match(/class="sh"/g) || []).length, 8, 'one shot per line plus the 1000-year card');
});

// a long episode's scene file took the CLI past the 15 minute default (real run 30.10.2026): the scene call gets its own limit
test('scene writing: own time limit (konu.json llm.sahne_zaman_asimi_dk, default 45 min), passed through LLM.sor', async () => {
  assert.strictEqual(U.sahneZamanAsimi({}), 45 * 60e3);
  assert.strictEqual(U.sahneZamanAsimi({ sahne_zaman_asimi_dk: 60 }), 60 * 60e3);
  assert.strictEqual(U.sahneZamanAsimi({ sahne_zaman_asimi_dk: 'x' }), 45 * 60e3);
  const LLM = require('../llm');
  let gelen;
  await LLM.sor('istem', { json: false, zamanAsimiMs: 1234, calistir: async (i, o) => { gelen = o; return { metin: 'ok' }; } });
  assert.strictEqual(gelen.zamanAsimiMs, 1234);
});

// Furkan 30.10 (story ep 2 review): no invented text, no filler, no see-through overlays, no thin full-width lines.
// The channel's gorsel_dil.kurallar reach both the scene writer and the still reviewer, and a broken rule is a heavy fail.
test('scene prompts: channel rules (gorsel_dil.kurallar) and the four bans reach writer and reviewer', () => {
  const LLM = require('../llm');
  const gd = { cizgi: 'düz', kurallar: ['UYDURMA YAZI YOK: KURAL123'] };
  const yaz = LLM.istem('sahne-yaz', { ton: '', formul: '', renkler: {}, gorsel_dil: gd, karakter: '', motor: '', satirlar: '', sure: '1', marka: '0', ornek: '', duzeltme: '', kurallar: U.kesinKurallar(gd), parca: '', kutuphane: '' });
  assert.match(yaz, /KURAL123/);
  assert.match(yaz, /`kurallar` varsa her madde kesindir/);
  for (const re of [/Dolgu sahne yok/, /Metinde geçmeyen slogan/, /tam opak/, /ince çizgi/]) assert.match(yaz, re);
  const den = LLM.istem('sahne-denetim', { ton: '', sayfalar: 'a.jpg', gorsel_dil: gd, satirlar: '0: metin' });
  assert.match(den, /KURAL123/);
  assert.match(den, /Kural çiğneyen her kare `yuksek`/);
  for (const re of [/dolgu kare/, /uydurma yazı/, /yarı saydam katman/, /ince çizgi/]) assert.match(den, re);
});

// ---- chunked parallel scene writing (Furkan 31.10: ~27 min per episode -> 10-15)
const zaman = (bas, son, kapanis) => ({ satirlar: bas.map((b, i) => ({ bas: b, son: son[i] })), toplam: son[son.length - 1] + 3, kapanis });

test('sahneAyari: defaults 4 chunks, 3 at once, 2 rounds; konu.json overrides, nonsense clamps', () => {
  assert.deepStrictEqual(U.sahneAyari({}), { parcalar: 4, paralel: 3, turlar: 2 });
  assert.deepStrictEqual(U.sahneAyari(undefined), { parcalar: 4, paralel: 3, turlar: 2 });
  assert.deepStrictEqual(U.sahneAyari({ sahne_parca: 1, paralel: 5, sahne_tur: 3 }), { parcalar: 1, paralel: 5, turlar: 3 });
  assert.deepStrictEqual(U.sahneAyari({ sahne_parca: 0, paralel: -2, sahne_tur: 'x' }), { parcalar: 1, paralel: 1, turlar: 1 });
  assert.strictEqual(U.sahneAyari({ sahne_parca: 50 }).parcalar, 8);
});

test('parcala: consecutive lines, near-equal time, windows touch, first from 0, last to the closing card', () => {
  const Z = zaman([0.3, 23.8, 40.5, 54.9], [23.6, 40.3, 54.7, 68.9], 69.39);
  assert.deepStrictEqual(U.parcala(Z, 4).map(p => [p.satirlar, p.bas, p.son]), [[[0], 0, 23.8], [[1], 23.8, 40.5], [[2], 40.5, 54.9], [[3], 54.9, 69.39]]);
  assert.deepStrictEqual(U.parcala(Z, 2).map(p => p.satirlar), [[0, 1], [2, 3]]);
  assert.deepStrictEqual(U.parcala(Z, 1).map(p => [p.satirlar, p.bas, p.son]), [[[0, 1, 2, 3], 0, 69.39]]);
  assert.strictEqual(U.parcala(Z, 9).length, 4, 'never more chunks than lines');
  // 12 short lines into 3 chunks: every line once, in order, no empty chunk; no closing card -> to the end
  const Z12 = zaman(Array.from({ length: 12 }, (_, i) => i * 5), Array.from({ length: 12 }, (_, i) => i * 5 + 4.5));
  const P = U.parcala(Z12, 3);
  assert.strictEqual(P.length, 3);
  assert.deepStrictEqual(P.flatMap(p => p.satirlar), Array.from({ length: 12 }, (_, i) => i));
  assert.ok(P.every(p => p.satirlar.length >= 3));
  assert.strictEqual(P[2].son, Z12.toplam);
  P.slice(1).forEach((p, k) => assert.strictEqual(p.bas, P[k].son));
});

test('sorunDagit: issues go to the chunk holding their second; no second -> every chunk', () => {
  const P = [{ bas: 0, son: 20 }, { bas: 20, son: 40 }, { bas: 40, son: 60 }];
  const r = U.sorunDagit([{ saniye: 20.1, sorun: 'a' }, { saniye: 5, sorun: 'b' }, { sorun: 'c' }, { saniye: 75, sorun: 'd' }], P);
  assert.deepStrictEqual(r.map(l => l.map(x => x.sorun)), [['b', 'c'], ['a', 'c'], ['c', 'd']]);
});

test('paralel: at most n jobs at once, all of them run', async () => {
  let ayni = 0, en = 0; const bitti = [];
  await U.paralel([1, 2, 3, 4, 5].map(i => async () => { ayni++; en = Math.max(en, ayni); await new Promise(r => setTimeout(r, 15)); ayni--; bitti.push(i); }), 3);
  assert.strictEqual(en, 3); assert.deepStrictEqual(bitti.sort(), [1, 2, 3, 4, 5]);
});

test('birlestir: chunks run in order on one M with their own cuts, ids stay apart, css is kept', () => {
  const T = { L: [0, 10, 20], LE: [9, 19, 29], END: 30, cue: (w, a) => a + .5 };
  const parca = (id, a, b, css) => `const yardim = x => x;\nmodule.exports = function ({ M }) {\n  M.kesmeler([${a}, ${b}]);\n  M.sahne('${id}', '<rect/>'); M.kes('${id}', 0);\n  return M.bitir(${JSON.stringify(css)});\n};`;
  const kod = U.birlestir([parca('p1-a', 0, 10, '.x{}'), parca('p2-a', 10, 20, '.y{}'), parca('p3-a', 20, 30, '')]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formul-birlestir-')), f = path.join(dir, 'sahneler.js');
  fs.writeFileSync(f, kod);
  const M = motor({ T, at: K.at, f: K.f1 });
  const S = K.guvenliYukle(f)({ M, T, at: K.at });
  assert.deepStrictEqual((S.html.match(/id="(p\d-a)"/g) || []), ['id="p1-a"', 'id="p2-a"', 'id="p3-a"']);
  assert.match(S.tl.join(''), /tl\.set\('#p2-a',\{opacity:1\},10\.000\);tl\.set\('#p2-a',\{opacity:0\},20\.000\)/);
  assert.match(S.css, /^\.sh\{position:absolute;inset:0\}\n\.x\{\}\n\.y\{\}/);
  assert.strictEqual((S.css.match(/\.sh\{/g) || []).length, 1, 'the base css once');
});

test('parcaIstemi: one chunk is the whole file (empty); a chunk names its lines, window, prefix and neighbours', () => {
  const Z = zaman([0.3, 23.8, 40.5, 54.9], [23.6, 40.3, 54.7, 68.9], 69.39);
  const sm = (i) => `satır ${i}`;
  assert.strictEqual(U.parcaIstemi(U.parcala(Z, 1), U.parcala(Z, 1)[0], sm), '');
  const P = U.parcala(Z, 4), m = U.parcaIstemi(P, P[1], sm);
  assert.match(m, /parça 2\/4/); assert.match(m, /\*\*1\. satırı\*\*/); assert.match(m, /tam 23\.80 sn'de başlar/); assert.match(m, /tam 40\.50 sn'de biter/);
  assert.match(m, /`p2-` öneki/); assert.match(m, /Önceki parçanın son satırı.*satır 0/); assert.match(m, /Sonraki parçanın ilk satırı.*satır 2/);
  assert.match(U.parcaIstemi(P, P[3], sm), /kapanış kartının başladığı ana kadar/);
});

test('kesinKurallar: channel rules as a list at the top of the scene prompt', () => {
  assert.strictEqual(U.kesinKurallar({ kurallar: ['A', 'B'] }), '- A\n- B');
  assert.match(U.kesinKurallar({}), /ek kuralı yok/);
  const LLM = require('../llm');
  const s = LLM.istem('sahne-yaz', { ton: 'TON5', formul: '', renkler: {}, gorsel_dil: {}, karakter: '', motor: '', satirlar: '', sure: '1', marka: '0', ornek: '', duzeltme: '', kurallar: '- KURAL9', parca: 'PARCA7', kutuphane: 'KUTUP3' });
  assert.ok(s.indexOf('KURAL9') < s.indexOf('## Kurallar (uy)') && s.indexOf('PARCA7') < s.indexOf('## Motor'), 'hard rules and the chunk note come first');
  assert.match(s, /Havada asılı nesne yok/);
});

// ---- blind still review and character library (adapted from ersinkoc/YoutubeStudio, with permission)
test('anlarMetni: the words heard just before a still; korSorunlari: every unrecognised key object is a heavy issue', () => {
  const Z = { kelimeler: [{ w: 'arkasından', a: 60 }, { w: 'baktım', a: 61 }, { w: 'bir', a: 62.5 }, { w: 'arabayla', a: 63 }, { w: 'uzaklaşıyordu', a: 63.6 }, { w: 'sonra', a: 70 }] };
  assert.strictEqual(U.anlarMetni(Z, 64), 'arkasından baktım bir arabayla uzaklaşıyordu');
  const s = U.korSorunlari([{ saniye: '64.04', beklenen: 'uzaklaşan araba', gorulen: 'boş yol ve bir adam' }, { saniye: 5 }, null, { beklenen: 'x' }]);
  assert.strictEqual(s.length, 1);
  assert.deepStrictEqual([s[0].saniye, s[0].agirlik, s[0].kor], [64, 'yuksek', true]);
  assert.match(s[0].sorun, /"uzaklaşan araba" karede tanınmıyor.*boş yol ve bir adam/);
  assert.deepStrictEqual(U.korSorunlari(undefined), []);
  // the blind prompts carry no script, the compare prompt does
  const LLM = require('../llm');
  assert.doesNotMatch(LLM.istem('kare-kor', { sayfalar: 'a.jpg' }), /söylenen/);
  assert.match(LLM.istem('kare-karsilastir', { ton: '', kareler: '- 64.0 sn | söylenen: "araba"' }), /"eksikler"/);
});

test('kutuphane: approved characters of the channel and of this story only, sandboxed, usage noted', () => {
  const Kut = require(path.join(KOK, 'uretim', 'kutuphane'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kutuphane-')), kd = path.join(dir, 'karakterler');
  fs.mkdirSync(kd);
  fs.writeFileSync(path.join(kd, 'kiz.js'), "// Kız: the girl\n//   kutuphane.kiz({ x, y })\nmodule.exports = function ({ C }) { return o => `<g data-x=\"${o.x}\" fill=\"${C.ink}\"></g>`; };\n");
  fs.writeFileSync(path.join(kd, 'kotu.js'), "module.exports = function () { return require('fs'); };\n");
  fs.writeFileSync(path.join(kd, 'karakterler.json'), JSON.stringify({ karakterler: [
    { id: 'anlatici', ad: 'Anlatıcı', gorunum: 'yeşil kapüşonlu', kullanim: 'karakter.adam({ x, y })', onay: true, bolumler: [] },
    { id: 'kiz', ad: 'Kız', gorunum: 'kırmızı üst', dosya: 'kiz.js', dizi: 'd1', onay: true, bolumler: [] },
    { id: 'taslak', ad: 'Taslak', dosya: 'kiz.js', onay: false },
    { id: 'Kotu Id', ad: 'x', dosya: 'kiz.js', onay: true },
  ] }));
  assert.deepStrictEqual(Kut.liste(dir, 'd1').map(k => k.id), ['anlatici', 'kiz']);
  assert.deepStrictEqual(Kut.liste(dir, 'd2').map(k => k.id), ['anlatici'], 'a story character stays in its story');
  assert.deepStrictEqual(Kut.liste(path.join(dir, 'yok'), 'd1'), []);
  const k = Kut.yukle(dir, 'd1', { C: { ink: '#23283B' } });
  assert.deepStrictEqual(Object.keys(k), ['kiz']);
  assert.strictEqual(k.kiz({ x: 5 }), '<g data-x="5" fill="#23283B"></g>');
  const m = Kut.istemMetni(dir, 'd1');
  assert.match(m, /### Kız \(bu hikâyenin tekrar eden kişisi\): kutuphane\.kiz\(\{ \.\.\. \}\)/);
  assert.match(m, /kutuphane\.kiz\(\{ x, y \}\)/, 'the file manual is included');
  assert.match(m, /karakter\.adam\(\{ x, y \}\)/);
  assert.match(Kut.istemMetni(path.join(dir, 'yok')), /hazır karakter yok/);
  const ids = Kut.kullanilanlar("const a = kutuphane.kiz({x:1}); karakter.adam({})", Kut.liste(dir, 'd1'));
  assert.deepStrictEqual(ids, ['anlatici', 'kiz']);
  Kut.kullanimEkle(dir, ids, 'videolar/k-d1-b2'); Kut.kullanimEkle(dir, ids, 'videolar/k-d1-b2');
  assert.deepStrictEqual(Kut.oku(dir).karakterler.find(x => x.id === 'kiz').bolumler, ['videolar/k-d1-b2']);
});

// ---- story tone in the scenes (Furkan 31.10)
test('tonMetni: a serious tone gets the muted / gentle / respectful rules plus the kit lines; komik the usual note', () => {
  const m = U.tonMetni('hüzünlü', { ton_kurallari: { 'hüzünlü': ['KITKURAL'] } });
  assert.match(m, /tonu: \*\*hüzünlü\*\*/); assert.match(m, /ter damlası, şok çizgileri/); assert.match(m, /çıplak gösterilmez/); assert.match(m, /- KITKURAL$/);
  assert.match(U.tonMetni('komik', {}), /komik: kanalın her zamanki/);
  assert.match(U.tonMetni(undefined, {}), /komik/);
  const LLM = require('../llm');
  for (const [ad, deg] of [['sahne-denetim', { sayfalar: 'a', gorsel_dil: {}, satirlar: '' }], ['kare-karsilastir', { kareler: '' }]]) assert.match(LLM.istem(ad, { ...deg, ton: 'TONX' }), /TONX/);
});

test('korSorunlari: comic exaggeration seen by the blind reviewer in a serious story is a heavy issue', () => {
  const s = U.korSorunlari([], [{ saniye: 12, sorun: 'cenazede ter damlalı yüz' }, { sorun: 'saniyesiz' }]);
  assert.deepStrictEqual(s.map(x => [x.saniye, x.agirlik]), [[12, 'yuksek']]);
  assert.match(s[0].sorun, /tonuna uymuyor: cenazede ter damlalı yüz/);
});
