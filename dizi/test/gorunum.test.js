'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../gorunum');

const kimlik = {
  anlaticilar: [{ elevenlabs_voice: 'E1', cinsiyet: 'erkek', yas: 'genc' }, { elevenlabs_voice: 'K1', cinsiyet: 'kadin', yas: 'genc' }],
  gorsel_dil: { karakter: { gorunumler: [
    { id: 'a', cinsiyet: 'erkek', yas: 'genc' }, { id: 'b', cinsiyet: 'erkek', yas: 'genc' },
    { id: 'c', cinsiyet: 'erkek', yas: 'orta' }, { id: 'k', cinsiyet: 'kadin', yas: 'genc' },
  ] } },
};
const dizi = (id, ses, gorunum, olusturma) => ({ id, anlatici: { ses }, ...(gorunum ? { gorunum } : {}), olusturma });

test('sec: unused look first, then the one used longest ago; gender and age follow the narrator voice', () => {
  assert.strictEqual(G.sec(dizi('x', 'E1'), [], kimlik), 'a');
  assert.strictEqual(G.sec(dizi('x', 'E1'), [dizi('v', 'E1', 'a', '2026-10-30')], kimlik), 'b');
  assert.strictEqual(G.sec(dizi('x', 'E1'), [dizi('v', 'E1', 'a', '2026-10-30'), dizi('w', 'E1', 'b', '2026-10-31')], kimlik), 'a');
  assert.strictEqual(G.sec(dizi('x', 'K1'), [], kimlik), 'k');
  assert.strictEqual(G.sec(dizi('x', 'ZZ'), [], kimlik), 'a', 'unknown voice: any look');
  assert.strictEqual(G.sec(dizi('x', 'E1'), [], {}), null, 'no catalogue: no look');
});

test('ata: assigned once, kept on later episodes, replaced only when the look left the catalogue', () => {
  const d = dizi('x', 'E1');
  assert.strictEqual(G.ata(d, [d], kimlik), 'a');
  assert.strictEqual(G.ata(d, [d, dizi('v', 'E1', 'b', '2026-10-01')], kimlik), 'a');
  d.gorunum = 'silinmis';
  assert.strictEqual(G.ata(d, [d], kimlik), 'a');
  assert.deepStrictEqual(G.bul(kimlik, 'k'), { id: 'k', cinsiyet: 'kadin', yas: 'genc' });
});
