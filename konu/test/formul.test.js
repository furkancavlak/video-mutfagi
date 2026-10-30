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
