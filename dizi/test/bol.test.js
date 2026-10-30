// Offline tests for splitting a story into 3 episodes + fidelity check (stub model, no network).
//   node --test "dizi/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { bol, sesSec } = require('../bol');

const kelimeler = n => Array.from({ length: n }, (_, i) => 'kelime' + i).join(' ');
const ctx = (kimlik = {}, dir = os.tmpdir()) => ({ kanal: 'k', dir, kimlik: { anlaticilar: [], ...kimlik }, ayar: { llm: {} } });
const hikaye = n => ({ id: 'eksi-1', tur: 'eksi', url: 'https://x/1', baslik: 'b', metin: kelimeler(n), puan: 500, dil: 'tr' });
const bolCikti = n => ({ baslik_kisa: 'Kısa', anlatici: { cinsiyet: 'erkek', yas: 'genc', ton: 'sakin' }, bolumler: [1, 2, 3].map(() => ({ metin: kelimeler(n) })), degisen_isimler: { Ali: 'Kemal' } });
function stub(sadakat, bolum) {
  const f = async (istem) => { f.calls.push(istem); return { metin: JSON.stringify(/"gecti"/.test(istem) ? sadakat() : bolum()) }; };
  f.calls = [];
  return f;
}

test('source under 420 words is "kisa" with zero model calls', async () => {
  const c = stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(160));
  const r = await bol(ctx(), hikaye(300), { calistir: c });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.neden, 'kisa'); assert.strictEqual(c.calls.length, 0);
});

test('80-word episodes are "bicim"', async () => {
  const c = stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(80));
  const r = await bol(ctx(), hikaye(500), { calistir: c });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.neden, 'bicim');
});

test('fidelity failing twice is "sadakat" after exactly 4 calls', async () => {
  const c = stub(() => ({ gecti: false, eklenenler: ['uydurma şaka'] }), () => bolCikti(160));
  const r = await bol(ctx(), hikaye(500), { calistir: c });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.neden, 'sadakat');
  assert.deepStrictEqual(r.ayrinti, ['uydurma şaka']); assert.strictEqual(c.calls.length, 4);
  assert.match(c.calls[2], /uydurma şaka/);
});

test('valid output builds a 3-episode Dizi with the default voice', async () => {
  const c = stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(160));
  const r = await bol(ctx(), hikaye(500), { calistir: c });
  assert.strictEqual(r.ok, true);
  const d = r.dizi;
  assert.strictEqual(d.bolumler.length, 3);
  assert.ok(d.bolumler.every((b, i) => b.durum === 'metin' && b.n === i + 1));
  assert.strictEqual(d.anlatici.ses, 'l5wXOpZHEQpKhuIrBiCN');
  assert.strictEqual(d.id, 'eksi-1'); assert.strictEqual(d.kaynak.id, 'eksi-1'); assert.strictEqual(d.durum, 'aktif');
  assert.strictEqual(d.baslik_kisa, 'Kısa');
});

test('audio tags do not count as words', async () => {
  const o = bolCikti(160); o.bolumler[0].metin = '[sighs] ' + o.bolumler[0].metin + ' [laughs softly]';
  const r = await bol(ctx(), hikaye(500), { calistir: stub(() => ({ gecti: true, eklenenler: [] }), () => o) });
  assert.strictEqual(r.ok, true);
});

test('sesSec matches roster by gender and age, else Burak; missing example file never throws', async () => {
  const roster = [{ ad: 'Ayşe', elevenlabs_voice: 'V1', cinsiyet: 'kadin', yas: 'genc' }, { ad: 'Kemal', elevenlabs_voice: 'V2', cinsiyet: 'erkek', yas: 'yasli' }];
  assert.deepStrictEqual(sesSec({ cinsiyet: 'erkek', yas: 'yasli' }, roster), { ses: 'V2', ad: 'Kemal' });
  assert.deepStrictEqual(sesSec({ cinsiyet: 'erkek', yas: 'genc' }, roster), { ses: 'l5wXOpZHEQpKhuIrBiCN', ad: 'Burak' });
  assert.strictEqual(sesSec({}, undefined).ad, 'Burak');
  const r = await bol(ctx({ ornek_bolum: 'yok/yok.txt' }), hikaye(500), { calistir: stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(160)) });
  assert.strictEqual(r.ok, true);
});

test('example text from the kit is passed into the prompt', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bol-')); fs.writeFileSync(path.join(d, 'o.txt'), 'ORNEKMETIN123');
  const c = stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(160));
  await bol(ctx({ ornek_bolum: 'o.txt' }, d), hikaye(500), { calistir: c });
  assert.match(c.calls[0], /ORNEKMETIN123/);
});
