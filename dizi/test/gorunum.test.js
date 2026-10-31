'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../gorunum');

const kimlik = { anlaticilar: [{ elevenlabs_voice: 'K1', cinsiyet: 'kadin', yas: 'orta' }, { elevenlabs_voice: 'E1', cinsiyet: 'erkek', yas: 'genc' }] };
const ctx = { kimlik, ayar: {} };
// a stand-in for the kit's stil(): records what it was given, returns a look naming the person
const kayit = [];
const stil = (k, tohum, kacin, ayni) => { kayit.push({ kim: k.kim, tohum, kacin: kacin.length, ayni: ayni.length }); return { tanim: `${k.kim} görünümü`, giysi: 'tisort' }; };

test('temizle: narrator first with the voice\'s gender and age, unknown fields dropped, unique kim, at most 6', () => {
  const l = G.temizle([{ kim: 'Es!', cinsiyet: 'erkek', yas: 'x', meslek: 'pilot' }, { kim: 'anlatici', cinsiyet: 'erkek', basortusu: true },
    { kim: 'es' }, ...['a', 'b', 'c', 'd', 'e'].map(kim => ({ kim }))], { cinsiyet: 'kadin', yas: 'orta' });
  assert.strictEqual(l.length, 6);
  assert.deepStrictEqual([l[0].kim, l[0].cinsiyet, l[0].yas, l[0].basortusu], ['anlatici', 'kadin', 'orta', true]);
  assert.deepStrictEqual([l[1].kim, l[1].yas, l[1].meslek], ['es', 'genc', 'diger']);
  assert.strictEqual(G.temizle([], { cinsiyet: 'erkek' })[0].kim, 'anlatici', 'empty list: the narrator alone');
});

test('ata: cast read once, a look per person, recent stories avoided, kept on later episodes', async () => {
  let soru = 0;
  const sor = async istem => { soru++; assert.match(istem, /kadın/); return { kisiler: [{ kim: 'anlatici' }, { kim: 'es', cinsiyet: 'erkek' }] }; };
  const eski = { id: 'v', olusturma: '2026-10-30', kisiler: [{ kim: 'anlatici', gorunum: { giysi: 'kazak' } }] };
  const d = { id: 'x', baslik: 'B', anlatici: { ses: 'K1' }, bolumler: [{ n: 1, metin: '[sad] Metin.' }] };
  await G.ata(ctx, d, [eski, d], { sor, stil });
  assert.strictEqual(soru, 1);
  assert.deepStrictEqual(d.kisiler.map(k => [k.kim, k.gorunum.tanim]), [['anlatici', 'anlatici görünümü'], ['es', 'es görünümü']]);
  assert.deepStrictEqual(kayit.map(k => [k.tohum, k.kacin, k.ayni]), [['x|anlatici', 1, 0], ['x|es', 1, 1]]);
  assert.strictEqual(G.anlatici(d).tanim, 'anlatici görünümü');
  assert.deepStrictEqual(Object.keys(G.haritasi(d)), ['es']);
  await G.ata(ctx, d, [eski, d], { sor, stil });
  assert.strictEqual(soru, 1, 'second episode: no new model call');
  assert.match(G.istemMetni(d.kisiler), /kim: 'es'/);
});

test('ata: a failing model call still gives the narrator a look; no stil in the kit means no cast', async () => {
  const d = { id: 'y', anlatici: { ses: 'E1' }, bolumler: [] };
  await G.ata(ctx, d, [], { sor: async () => { throw new Error('model yok'); }, stil });
  assert.deepStrictEqual(d.kisiler.map(k => [k.kim, k.cinsiyet]), [['anlatici', 'erkek']]);
  const d2 = { id: 'z', anlatici: { ses: 'E1' }, bolumler: [] };
  assert.deepStrictEqual(await G.ata({ kimlik }, d2, []), []);
  assert.strictEqual(G.anlatici(d2), null);
});
