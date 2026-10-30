// Offline tests for the channel hooks in the core: caption style (kimlik.gorsel.altyazi) and a channel closing card
// (kimlik.marka.kapanis). oxygbio's output must stay byte-identical (snapshot taken before the hooks were added).
//   node --test konu/test/kanal-kit.test.js
// Rewrite the snapshot only on purpose: CEKIRDEK_SNAPSHOT=yaz node --test konu/test/kanal-kit.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');

const KOK = path.join(__dirname, '..', '..');
const K = require(path.join(KOK, 'uretim', 'cekirdek'));
const { hizala } = require(path.join(KOK, 'uretim', 'hizala'));
const SNAP = path.join(__dirname, 'ornekler', 'cekirdek-oxygbio.json');

// timing built like mix.js does from the committed word times (chime before announcer lines, sting after hook and end)
function zaman(video, kel, { sting = true, kapanis = null } = {}) {
  const anons = new Set(video.anons_rolleri || []);
  let t = .25; const Z = { satirlar: [], kelimeler: [], sting: [], chime: [] };
  Object.entries(kel).forEach(([dosya, ham], i, all) => {
    const kim = dosya.replace(/^\d+-/, '').replace(/\.[^.]+$/, '');
    if (anons.has(kim)) { Z.chime.push(+t.toFixed(3)); t += .75; }
    const ws = hizala(video.satirlar[i].metin, ham) || ham, son = t + ws[ws.length - 1][2];
    Z.satirlar.push({ dosya, kim, bas: +t.toFixed(3), son: +son.toFixed(3) });
    for (const [w, a, b] of ws) Z.kelimeler.push({ w, a: +(t + a).toFixed(3), b: +(t + b).toFixed(3), kim, satir: i });
    if (i === 0 && sting) { Z.sting.push(+(son + .1).toFixed(3)); t = son + .85; }
    else if (i === all.length - 1) {
      if (sting) { Z.sting.push(+(son + .45).toFixed(3)); t = son + 2.85; }
      else if (kapanis) { Z.kapanis = +(son + .5).toFixed(3); t = Z.kapanis + kapanis; }
      else t = son + 1;
    } else t = son + .22;
  });
  Z.toplam = +t.toFixed(3);
  return { Z, L: Z.satirlar.map(s => s.bas), LE: Z.satirlar.map(s => s.son), END: Z.toplam };
}

const okuJ = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const V01 = path.join(KOK, 'videolar', 'oxygbio-v01-ucak');

test('oxygbio: altyazi() and marka() output is byte-identical to the snapshot', () => {
  const video = okuJ(path.join(V01, 'video.json')), kimlik = okuJ(path.join(KOK, 'kanal', 'oxygbio', 'kimlik.json'));
  const T = zaman(video, okuJ(path.join(V01, 'ses', 'kelimeler.json'))), C = K.palet(kimlik);
  const cap = K.altyazi(T, video, C, kimlik), mk = K.marka(T, kimlik, C, { video, kimlikDir: path.join(KOK, 'kanal', 'oxygbio') });
  const simdi = { cap: { html: cap.html, tl: cap.tl }, mk: { html: mk.html, tl: mk.tl } };
  if (process.env.CEKIRDEK_SNAPSHOT === 'yaz') fs.writeFileSync(SNAP, JSON.stringify(simdi));
  assert.deepStrictEqual(simdi, okuJ(SNAP));
  // the old call shape (kesit.js, ucretli.js before the hooks) gives the same output
  assert.strictEqual(K.altyazi(T, video, C).html, cap.html);
  assert.strictEqual(K.marka(T, kimlik, C).html, mk.html);
  assert.ok(!cap.css && !mk.css, 'oxygbio adds no css');
});

// a throwaway channel: stroke captions + a fixture closing card (no real channel files in the public repo)
function geciciKanal() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanal-kit-'));
  const kimlik = {
    hesap: 'deneme_kanal', renkler: { paper: '#F5EEDF', ink: '#23283B', coral: '#E5533C', o2: '#2F8F83', krem: '#F5EEDF', domates: '#E5533C' },
    marka: { kapanis: 'kapanis.js', kapanis_muzigi: 'muzik/son.m4a', hesap: '@deneme_kanal', ses: null }, gorsel: { altyazi: 'kontur' },
  };
  fs.writeFileSync(path.join(dir, 'kimlik.json'), JSON.stringify(kimlik));
  fs.writeFileSync(path.join(dir, 'kapanis.js'), `module.exports = function ({ C, at, bas, sonraki, hesap }) {
  return { html: '<div class="sc" id="kapfix">KAPFIX ' + sonraki + ' ' + hesap + ' ' + C.domates + '</div>', tl: ["tl.set('#kapfix',{opacity:1}," + at(bas) + ");"], sure: 3, muzik: { bas: bas - .1, ses: .7 }, gorsel: 'fix.png',
    sfx: [['pop', bas + .05, .5], ['yok', bas + .5, .3], ['../kimlik', bas, 1], ['tik', bas - 15, .2]] };
};`);
  fs.writeFileSync(path.join(dir, 'fix.png'), 'png');
  fs.mkdirSync(path.join(dir, 'muzik'));
  for (const n of ['pop', 'tik']) fs.writeFileSync(path.join(dir, 'muzik', n + '.wav'), 'wav');
  return { dir, kimlik };
}

test('new channel: kontur captions, no sting, top label and the channel closing card', () => {
  const { dir, kimlik } = geciciKanal();
  const video = { ...okuJ(path.join(V01, 'video.json')), anons_rolleri: [], etiket: 'Deneme hikâye', bolum: 2, toplam_bolum: 3 };
  const T = zaman(video, okuJ(path.join(V01, 'ses', 'kelimeler.json')), { sting: false, kapanis: 3 }), C = K.palet(kimlik);
  const cap = K.altyazi(T, video, C, kimlik);
  assert.match(cap.html, /class="dcap/);
  assert.ok(!/class="cap/.test(cap.html), 'no oxygbio caption box');
  assert.match(cap.tl.join(''), /color:'#FFC9BC'/);
  assert.match(cap.css, /\.dcap\{[^}]*top:1410px[^}]*-webkit-text-stroke:20px #23283B/);
  assert.match(cap.css, /font-family:AN/);
  // the last caption is gone before the card comes up
  const sonlar = cap.tl.map(s => s.match(/\{opacity:0\},([\d.]+)\);$/)).filter(Boolean).map(m => +m[1]);
  assert.ok(Math.max(...sonlar) <= T.Z.kapanis, 'captions clear before the card');

  const mk = K.marka(T, kimlik, C, { video, kimlikDir: dir });
  assert.match(mk.html, /KAPFIX 3 @deneme_kanal #E5533C/);
  assert.ok(!/id="st"/.test(mk.html) && !/id="st2"/.test(mk.html) && !/class="tag"/.test(mk.html), 'no oxygbio stings or corner tag');
  assert.match(mk.html, /<div class="etk"><i><\/i>DENEME HİKÂYE · BÖLÜM 2<\/div>/);
  // a label that already names the episode (dizi/uret-bolum.js) is not suffixed twice
  assert.match(K.marka(T, kimlik, C, { video: { ...video, etiket: 'DENEME HİKÂYE · BÖLÜM 2' }, kimlikDir: dir }).html, /<div class="etk"><i><\/i>DENEME HİKÂYE · BÖLÜM 2<\/div>/);
  assert.ok(mk.tl.includes(`tl.set('#kapfix',{opacity:1},${K.at(T.Z.kapanis)});`), 'card starts at Z.kapanis');
  assert.match(mk.tl.join(''), new RegExp(`tl\\.set\\('\\.etk',\\{opacity:0\\},${K.at(T.Z.kapanis).replace('.', '\\.')}\\)`));
  assert.deepStrictEqual(mk.varliklar, [{ kaynak: path.join(dir, 'fix.png'), ad: 'fix.png' }]);
  assert.match(mk.css, /\.etk\{/);

  // last episode: the card is told there is no next one
  const son = K.marka(T, kimlik, C, { video: { ...video, bolum: 3 }, kimlikDir: dir });
  assert.match(son.html, /KAPFIX null/);
  // no label text -> no label
  assert.ok(!/class="etk"/.test(K.marka(T, kimlik, C, { video: { bolum: 1 }, kimlikDir: dir }).html));
});

test('new channel: the card length is readable for mix.js (kapanisYukle)', () => {
  const { dir, kimlik } = geciciKanal();
  const k = K.kapanisYukle(kimlik, dir);
  const c = k({ C: K.palet(kimlik), at: K.at, bas: 10, sonraki: null, hesap: '@x' });
  assert.strictEqual(c.sure, 3);
  assert.deepStrictEqual({ ...c.muzik }, { bas: 9.9, ses: .7 });          // spread: the object comes from the sandbox realm
  assert.strictEqual(K.kapanisYukle(okuJ(path.join(KOK, 'kanal', 'oxygbio', 'kimlik.json')), path.join(KOK, 'kanal', 'oxygbio')), null);
});

test('new channel: card sound effects resolve to kanal/<kanal>/muzik/<name>.wav, missing or odd names are skipped', () => {
  const { dir, kimlik } = geciciKanal();
  const c = K.kapanisYukle(kimlik, dir)({ C: K.palet(kimlik), at: K.at, bas: 10, sonraki: null, hesap: '@x' });
  assert.deepStrictEqual(K.kapanisSesleri(c, dir), [[path.join(dir, 'muzik', 'pop.wav'), 10.05, .5], [path.join(dir, 'muzik', 'tik.wav'), 0, .2]]);
  assert.deepStrictEqual(K.kapanisSesleri({}, dir), []);
});
