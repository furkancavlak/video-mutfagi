// Offline tests for vertical clips (no video, no language model).
//   node --test kesit/test/kesim.test.js
const test = require('node:test');
const assert = require('node:assert');
const KS = require('../kesim');

// a fake transcript: 3 s sentences, words 0.5 s apart
function dokum(cumleler) {
  const W = []; let t = 0;
  for (const c of cumleler) { for (const w of c.split(' ')) { W.push([w, +t.toFixed(2), +(t + 0.4).toFixed(2)]); t += 0.5; } t += 0.4; }
  return W;
}
const C = [
  'Bu videoda her şeyi anlatacağım.', 'Aynı parayla ciroyu dört katına çıkardım.', 'Bunu tek başıma yapmadım.',
  'Ekibimle birlikte üç ay çalıştık.', 'Her gün yeni bir şey denedik.', 'Sonunda bir sistem kurduk.',
  'Bu sistem gece bile çalışıyor.', 'Reklamları kendisi kontrol ediyor.', 'Peki bu sistem gerçekten işe yaradı mı?',
  'Evet, rakamlar ortada.', 'Ciro dört milyona çıktı.', 'Abone olmayı unutma.',
];

test('Whisper split tokens are glued back', () => {
  const W = KS.yapistir([['1', 0, .2], ['.5', .2, .4], ['milyon', .5, .8], ['TL', .9, 1], ["'lik", 1, 1.2], ['e', 2, 2.1], ['-ticaret', 2.1, 2.5]]);
  assert.deepStrictEqual(W.map(w => w[0]), ['1.5', 'milyon', "TL'lik", 'e-ticaret']);
  assert.strictEqual(W[0][2], .4);
});

test('sentences end on punctuation', () => {
  const S = KS.cumleler(dokum(C));
  assert.strictEqual(S.length, C.length);
  assert.strictEqual(S[8].metin, C[8]);
});

test('cuts resolve by sentence and by phrase, never into the next word', () => {
  const W = dokum(C), S = KS.cumleler(W);
  const r = KS.coz([['cumle', 1, 1], ['ses', 'peki bu', S[8].a, 'işe yaradı', S[8].b]], W, S, 'an');
  assert.strictEqual(r.kesit.length, 2);
  assert.strictEqual(r.kesit[1].metin, 'Peki bu sistem gerçekten işe yaradı');
  assert.ok(r.kesit[1].v1 <= W.find(w => w[0] === 'mı?')[1] - .05 + 1e-9);
  assert.strictEqual(r.kesit[1].l0, +(r.kesit[0].v1 - r.kesit[0].v0 + KS.BOSLUK).toFixed(3));
  assert.ok(r.kelimeler.every(k => k.a >= 0 && k.b <= r.son));
});

test('bad cut lists say why', () => {
  const W = dokum(C), S = KS.cumleler(W);
  const r = KS.coz([['ses', 'yokboyle', 3, 'kelime', 4], ['cumle', 0, 0]], W, S, 'tanitim');
  assert.ok(r.hata.some(h => h.includes('"yokboyle" bulunamadı')));
  assert.ok(r.hata.some(h => h.includes('arası olmalı')));
});

test('card question from a spoken question', () => {
  assert.strictEqual(KS.soruKart('Peki bu kadar kısa sürede çıkan bir şeye güvenilir mi?'), 'GÜVENİLİR Mİ?');
  assert.strictEqual(KS.soruKart('Sence hangisi editör?'), 'HANGİSİ EDİTÖR?');
});

test('offline picker: a teaser ends on a question that the video answers', () => {
  const W = dokum(C), S = KS.cumleler(W);
  const a = KS.sezgisel(W, S, 'tanitim', 1)[0];
  assert.ok(a, 'bir aday çıkmalı');
  const r = KS.coz(a.parcalar, W, S, 'tanitim');
  assert.deepStrictEqual(r.hata, []);
  assert.ok(r.kesit[r.kesit.length - 1].metin.endsWith('mı?'));
  assert.strictEqual(a.soru, 'İŞE YARADI MI?');
  assert.ok(!r.kesit.some(k => /Abone/.test(k.metin)));
});
