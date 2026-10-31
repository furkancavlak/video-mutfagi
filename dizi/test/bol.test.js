// Offline tests for splitting a story into 2-5 episodes + fidelity check (stub model, no network).
//   node --test "dizi/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { bol, sesSec, bicimHatalari } = require('../bol');

const kelimeler = n => Array.from({ length: n }, (_, i) => 'kelime' + i).join(' ');
const ctx = (kimlik = {}, dir = os.tmpdir()) => ({ kanal: 'k', dir, kimlik: { anlaticilar: [], ...kimlik }, ayar: { llm: {} } });
const hikaye = n => ({ id: 'eksi-1', tur: 'eksi', url: 'https://x/1', baslik: 'b', metin: kelimeler(n), puan: 500, dil: 'tr' });
// episodes 2+ open with a one-sentence recap paragraph, as the prompt asks
const ozetli = (i, govde, ozet = 'Önceki bölümde kapı çalmıştı.') => i ? `${ozet}\n\n${govde}` : govde;
const bolCikti = (n, adet = 3) => ({ baslik_kisa: 'Kısa', anlatici: { cinsiyet: 'erkek', yas: 'genc', ton: 'sakin' }, bolumler: Array.from({ length: adet }, (_, i) => ({ metin: ozetli(i, kelimeler(n)) })), degisen_isimler: { Ali: 'Kemal' }, ton: { deger: 'komik', neden: 'yazar gülerek anlatıyor' } });
// split + fidelity calls go to f.calls; the story check (hikaye-mi, always first) to f.kontrol
// the sensitivity check (non-komik stories) goes to f.hassas
function stub(sadakat, bolum, hikaye = () => ({ hikaye: true, neden: 'anı' }), hassasiyet = () => ({ gecti: true, sorunlar: [] })) {
  const f = async (istem) => {
    if (/"hikaye": true, "neden"/.test(istem)) { f.kontrol.push(istem); return { metin: JSON.stringify(hikaye()) }; }
    if (/"gecti": true, "sorunlar"/.test(istem)) { f.hassas.push(istem); return { metin: JSON.stringify(hassasiyet()) }; }
    f.calls.push(istem); return { metin: JSON.stringify(/"gecti"/.test(istem) ? sadakat() : bolum()) };
  };
  f.calls = []; f.kontrol = []; f.hassas = [];
  return f;
}

test('source under 250 words is "kisa" with zero model calls', async () => {
  const c = stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(160));
  const r = await bol(ctx(), hikaye(240), { calistir: c });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.neden, 'kisa'); assert.strictEqual(c.calls.length, 0);
});

// Furkan 30.10: the story's flow sets the length; no word range rejects a split
test('episode length is never a rejection: short, long and uneven episodes pass', async () => {
  for (const o of [bolCikti(60), bolCikti(230), bolCikti(140, 2)]) {
    const r = await bol(ctx(), hikaye(400), { calistir: stub(() => ({ gecti: true, eklenenler: [] }), () => o) });
    assert.strictEqual(r.ok, true, JSON.stringify(r.ayrinti));
  }
  const o = bolCikti(150, 4); o.bolumler[3].metin = ozetli(3, kelimeler(40));
  assert.strictEqual((await bol(ctx(), hikaye(900), { calistir: stub(() => ({ gecti: true, eklenenler: [] }), () => o) })).ok, true);
});

test('2 to 5 episodes are accepted, with n and the text kept; 1 or 6 is "bicim"', async () => {
  for (const adet of [2, 5]) {
    const r = await bol(ctx(), hikaye(900), { calistir: stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(140, adet)) });
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.dizi.bolumler.map(b => b.n), Array.from({ length: adet }, (_, i) => i + 1));
  }
  for (const adet of [1, 6]) {
    const c = stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(140, adet));
    const r = await bol(ctx(), hikaye(900), { calistir: c });
    assert.strictEqual(r.neden, 'bicim'); assert.strictEqual(c.calls.length, 2, 'one retry, then rejected');
  }
});

test('the prompt gets the source length and a suggested episode count', async () => {
  const c = stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(140));
  await bol(ctx(), hikaye(1300), { calistir: c });
  assert.match(c.calls[0], /1300 kelime/);
  assert.match(c.calls[0], /yaklaşık \*\*5 bölüm\*\*/);
  assert.doesNotMatch(c.calls[0], /140–190/);
});

// Furkan 30.10: the recap is 1 sentence of at most 15 words; over 2 sentences or 25 words is rejected and retried
test('recap rule: a long recap is retried with the reason, then accepted once fixed', async () => {
  const uzun = 'Önceki bölümde ' + kelimeler(30) + '.';
  let i = 0;
  const c = stub(() => ({ gecti: true, eklenenler: [] }), () => { const o = bolCikti(140); if (i++ === 0) o.bolumler[1].metin = ozetli(1, kelimeler(140), uzun); return o; });
  const r = await bol(ctx(), hikaye(500), { calistir: c });
  assert.strictEqual(r.ok, true);
  assert.match(c.calls[1], /Bölüm 2: özet 1 cümle, 32 kelime/);
  assert.strictEqual(c.calls.length, 3, 'split, retry, fidelity');
});

test('recap rule: still too long after the retry is "bicim" with the reasons', async () => {
  const o = bolCikti(140); o.bolumler[2].metin = ozetli(2, kelimeler(140), 'Önceki bölümde kapı çaldı. Sonra sustu. Sonra yine çaldı.');
  const c = stub(() => ({ gecti: true, eklenenler: [] }), () => o);
  const r = await bol(ctx(), hikaye(500), { calistir: c });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.neden, 'bicim');
  assert.match(r.ayrinti.hatalar[0], /Bölüm 3: özet 3 cümle/);
  assert.strictEqual(c.calls.length, 2);
});

test('bicimHatalari: recap limits, recap paragraph, no recap in episode 1', () => {
  const B = (...m) => ({ ton: { deger: 'komik' }, bolumler: m.map(metin => ({ metin })) });
  const govde = kelimeler(100);
  assert.deepStrictEqual(bicimHatalari(B(govde, 'Önceki bölümde kapı çalmıştı.\n\n' + govde)), []);
  // two sentences within 25 words still pass (hard limit), an ellipsis is no sentence end
  assert.deepStrictEqual(bicimHatalari(B(govde, 'Önceki bölümde kapı çaldı... kimse yoktu. Ben de bekledim.\n\n' + govde)), []);
  assert.deepStrictEqual(bicimHatalari(B(govde, '[sighs] Önceki bölümde kapı çaldı.\n\n' + govde)), [], 'audio tags are ignored');
  assert.match(bicimHatalari(B(govde, 'Önceki bölümde ' + kelimeler(24) + '.\n\n' + govde))[0], /26 kelime/);
  assert.match(bicimHatalari(B(govde, govde))[0], /Önceki bölümde/);
  assert.match(bicimHatalari(B(govde, 'Önceki bölümde kapı çaldı. ' + govde))[0], /ayrı bir paragraf/);
  assert.match(bicimHatalari(B('Önceki bölümde yok.\n\n' + govde, 'Önceki bölümde x.\n\n' + govde))[0], /Bölüm 1/);
  assert.match(bicimHatalari(B(govde, ''))[0], /Bölüm 2 boş/);
  assert.match(bicimHatalari({})[0], /bolumler/);
});

test('fidelity failing twice is "sadakat" after exactly 4 calls', async () => {
  const c = stub(() => ({ gecti: false, eklenenler: ['uydurma şaka'] }), () => bolCikti(160));
  const r = await bol(ctx(), hikaye(500), { calistir: c });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.neden, 'sadakat');
  assert.deepStrictEqual(r.ayrinti, ['uydurma şaka']); assert.strictEqual(c.calls.length, 4);
  assert.match(c.calls[2], /uydurma şaka/);
});

test('valid output builds the Dizi with the default voice', async () => {
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

test('an essay or review is "hikaye_degil" after the story check alone, nothing split', async () => {
  const c = stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(140), () => ({ hikaye: false, neden: 'kitap-film karşılaştırması' }));
  const r = await bol(ctx(), hikaye(1500), { calistir: c });
  assert.deepStrictEqual([r.ok, r.neden, r.ayrinti], [false, 'hikaye_degil', 'kitap-film karşılaştırması']);
  assert.strictEqual(c.kontrol.length, 1); assert.strictEqual(c.calls.length, 0);
  assert.match(c.kontrol[0], /film\/kitap\/dizi incelemesi/);
  // a malformed answer is no pass
  const c2 = stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(140), () => ({}));
  assert.strictEqual((await bol(ctx(), hikaye(500), { calistir: c2 })).neden, 'hikaye_degil');
});

test('hikayeMi: a real anecdote passes; the check runs once before the split', async () => {
  const { hikayeMi } = require('../bol');
  const c = stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(140));
  assert.deepStrictEqual(await hikayeMi(ctx(), hikaye(300), { calistir: c }), { hikaye: true, neden: 'anı', ozet: '' });
  const c2 = stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(140));
  assert.strictEqual((await bol(ctx(), hikaye(500), { calistir: c2 })).ok, true);
  assert.strictEqual(c2.kontrol.length, 1);
});

// ---- tone (Furkan 31.10: serious stories are welcome, told with respect)
const tonlu = (deger, ek = {}) => () => ({ ...bolCikti(140), ton: { deger, neden: 'kayıp' }, hassasiyet: 'gerçek bir ölüm var', ...ek });

test('tone: stored on the Dizi with its reason; a non-komik story carries its sensitivity note, a komik one none', async () => {
  const c = stub(() => ({ gecti: true, eklenenler: [] }), tonlu('hüzünlü'));
  const r = await bol(ctx(), hikaye(500), { calistir: c });
  assert.deepStrictEqual([r.ok, r.dizi.ton, r.dizi.ton_neden, r.dizi.hassasiyet_notu], [true, 'hüzünlü', 'kayıp', 'gerçek bir ölüm var']);
  assert.strictEqual(c.hassas.length, 1, 'non-komik: one sensitivity check');
  assert.match(c.calls[0], /Ton \(önce buna karar ver\)/);
  const k = await bol(ctx(), hikaye(500), { calistir: stub(() => ({ gecti: true, eklenenler: [] }), () => bolCikti(140)) });
  assert.deepStrictEqual([k.dizi.ton, 'hassasiyet_notu' in k.dizi], ['komik', false]);
});

test('tone: a missing/unknown tone and a playful tag in a sad story are shape errors (retried once)', () => {
  const B = (deger, ...m) => ({ ton: deger ? { deger } : undefined, bolumler: m.map(metin => ({ metin })) });
  const govde = kelimeler(100);
  assert.match(bicimHatalari(B(null, govde, 'Önceki bölümde x oldu.\n\n' + govde))[0], /ton\.deger/);
  assert.match(bicimHatalari(B('neşeli', govde, 'Önceki bölümde x oldu.\n\n' + govde))[0], /komik, hüzünlü, ürkütücü ya da ciddi/);
  const h = bicimHatalari(B('hüzünlü', '[sarcastic] ' + govde, 'Önceki bölümde x oldu.\n\n[laughs softly] ' + govde + ' [sighs]'));
  assert.deepStrictEqual(h, ['Bölüm 1: hüzünlü bir hikâyede şakacı ses etiketi olmaz: [sarcastic]', 'Bölüm 2: hüzünlü bir hikâyede şakacı ses etiketi olmaz: [laughs softly]']);
  assert.deepStrictEqual(bicimHatalari(B('ciddi', '[softly] ' + govde + ' [whispers]', 'Önceki bölümde x oldu.\n\n[sad] ' + govde)), [], 'soft tags are fine');
  assert.deepStrictEqual(bicimHatalari(B('komik', '[sarcastic] ' + govde, 'Önceki bölümde x oldu.\n\n' + govde)), [], 'a komik story may joke where the source does');
});

test('sensitivity: flagged once -> rewritten with the notes and checked again; flagged twice -> "hassasiyet"', async () => {
  let n = 0;
  const c = stub(() => ({ gecti: true, eklenenler: [] }), tonlu('ciddi'), undefined, () => (n++ === 0 ? { gecti: false, sorunlar: ['Bölüm 2: hastane adı geçiyor'] } : { gecti: true, sorunlar: [] }));
  const r = await bol(ctx(), hikaye(500), { calistir: c });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(c.hassas.length, 2);
  assert.match(c.calls.find(x => /hassasiyet sorunları/.test(x)), /hastane adı geçiyor/);
  const c2 = stub(() => ({ gecti: true, eklenenler: [] }), tonlu('ürkütücü'), undefined, () => ({ gecti: false, sorunlar: ['Bölüm 1: alaycı'] }));
  const r2 = await bol(ctx(), hikaye(500), { calistir: c2 });
  assert.deepStrictEqual([r2.ok, r2.neden, r2.ayrinti], [false, 'hassasiyet', ['Bölüm 1: alaycı']]);
  assert.strictEqual(c2.hassas.length, 2);
  assert.match(c2.hassas[0], /ürkütücü bir gerçek hikâyeden/);
});

test('sesSec: among voices of the right gender and age, one that lists the tone comes first', () => {
  const roster = [{ ad: 'Neşeli', elevenlabs_voice: 'V1', cinsiyet: 'erkek', yas: 'genc', ton: ['komik'] }, { ad: 'Sakin', elevenlabs_voice: 'V2', cinsiyet: 'erkek', yas: 'genc', ton: ['hüzünlü', 'ciddi'] }];
  assert.strictEqual(sesSec({ cinsiyet: 'erkek', yas: 'genc' }, roster, 'hüzünlü').ad, 'Sakin');
  assert.strictEqual(sesSec({ cinsiyet: 'erkek', yas: 'genc' }, roster, 'komik').ad, 'Neşeli');
  assert.strictEqual(sesSec({ cinsiyet: 'erkek', yas: 'genc' }, roster, 'ürkütücü').ad, 'Neşeli', 'no voice lists it: the first of the right gender and age');
});
