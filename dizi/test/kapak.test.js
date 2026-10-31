// Offline tests for a series' cover identity (dizi/kapak.js): colour choice, hook title rules and choice, the fallback,
// and the split keeping the model's best title (stub model, no network).
//   node --test "dizi/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const KP = require('../kapak');
const { bol } = require('../bol');

const PALET = [
  { renk: '#E9B949', tonlar: ['komik'] }, { renk: '#E8909F', tonlar: ['komik', 'hüzünlü'] }, { renk: '#5DA9E9', tonlar: ['komik'] },
  { renk: '#3E8E9E', tonlar: ['ciddi', 'hüzünlü', 'ürkütücü'] }, { renk: '#4A5A80', tonlar: ['ürkütücü', 'ciddi'] }, { renk: '#7A9E7E', tonlar: ['hüzünlü', 'ciddi'] },
];
const tonu = renk => PALET.find(p => p.renk === renk).tonlar;
const eski = (id, renk, gun) => ({ id, renk, olusturma: `2026-10-${String(gun).padStart(2, '0')}T10:00:00Z` });

test('renkSec: farthest from the recent series\' colours, among the tone\'s own entries', () => {
  // recent series are mustard and rose: of the komik entries the sky blue is farthest from both
  assert.strictEqual(KP.renkSec({ id: 'a', ton: 'komik' }, [eski('x', '#E9B949', 20), eski('y', '#E8909F', 21)], PALET), '#5DA9E9');
  // a serious story never takes a komik-only colour
  for (const id of ['s1', 's2', 's3', 's4', 's5']) {
    const r = KP.renkSec({ id, ton: 'ciddi' }, [eski('x', '#3E8E9E', 20)], PALET);
    assert.ok(tonu(r).includes('ciddi'), r);
    assert.notStrictEqual(r, '#3E8E9E');
  }
  // only the last 20 series count: an old one with the same colour is forgotten
  const yirmi = Array.from({ length: 20 }, (_, i) => eski('n' + i, '#4A5A80', 10 + i));
  assert.strictEqual(KP.renkSec({ id: 'b', ton: 'ürkütücü' }, [eski('cok-eski', '#3E8E9E', 1), ...yirmi], PALET), '#3E8E9E');
  // no tagged entry for the tone -> the whole palette; plain '#hex' entries work
  assert.ok(['#111111', '#EEEEEE'].includes(KP.renkSec({ id: 'c', ton: 'komik' }, [], ['#111111', '#EEEEEE'])));
  assert.strictEqual(KP.renkSec({ id: 'c' }, [], []), null);
});

test('renkSec: stable for the same series, ties broken by its id', () => {
  const a = KP.renkSec({ id: 'eksi-1', ton: 'komik' }, [], PALET);
  for (let i = 0; i < 5; i++) assert.strictEqual(KP.renkSec({ id: 'eksi-1', ton: 'komik' }, [], PALET), a);
  const hepsi = new Set(Array.from({ length: 30 }, (_, i) => KP.renkSec({ id: 'eksi-' + i, ton: 'komik' }, [], PALET)));
  assert.ok(hepsi.size > 1, 'different ids spread over the tied colours');
  assert.ok([...hepsi].every(r => tonu(r).includes('komik')));
});

test('baslikDogru / baslikSec: 28 characters, 2-5 words, upper-case Turkish, not the topic; the shorter wins', () => {
  assert.strictEqual(KP.baslikTemiz(' çocuğum  yok ama veliyim. '), 'ÇOCUĞUM YOK AMA VELİYİM');
  assert.strictEqual(KP.baslikDogru('ÇOCUĞUM YOK AMA VELİYİM'), '');
  assert.strictEqual(KP.baslikDogru('9 yıl sonra gelen mesaj'), '');
  assert.match(KP.baslikDogru('BU BAŞLIK YİRMİ SEKİZ KARAKTERİ AŞIYOR'), /karakter/);
  assert.match(KP.baslikDogru('VELİ'), /kelime/);
  assert.match(KP.baslikDogru('BİR İKİ ÜÇ DÖRT BEŞ ALTI'), /kelime/);
  assert.match(KP.baslikDogru('3-J VELİ GRUBU', { baslik_kisa: '3-J veli grubu' }), /konu/);
  assert.match(KP.baslikDogru('VELİ GRUBU', { konu: 'aile', baslik_kisa: 'Veli grubu macerası' }), /konu/);
  assert.strictEqual(KP.baslikSec(['3-J VELİ GRUBU', 'ÇOCUĞUM YOK AMA VELİYİM', 'adını sormadım'], { baslik_kisa: '3-J veli grubu' }), 'ADINI SORMADIM');
  assert.strictEqual(KP.baslikSec(['UZUN BİR BAŞLIK BURADA VAR YANİ', 'TEK'], {}), null);
  assert.strictEqual(KP.baslikSec(null), null);
});

test('yedekBaslik: baslik_kisa cleaned, cut at a word boundary to 28 characters and 5 words', () => {
  assert.strictEqual(KP.yedekBaslik({ baslik_kisa: 'Uçakta adını sormadığım kız' }), 'UÇAKTA ADINI SORMADIĞIM KIZ');
  const y = KP.yedekBaslik({ baslik_kisa: 'Bir veli grubunda yanlışlıkla kalan bekâr adam' });
  assert.ok(y.length <= 28 && y.split(' ').length <= 5, y);
  assert.ok('BİR VELİ GRUBUNDA YANLIŞLIKLA KALAN BEKÂR ADAM'.startsWith(y));
});

const ctx = (marka = { kapak: { renkler: PALET } }) => ({ kanal: 'k', kimlik: { marka }, ayar: { llm: {} } });

test('hazirla: colour and title once, kept on later episodes; an existing title (panel edit) is never replaced', async () => {
  let soru = 0;
  const sor = async istem => { soru++; assert.match(istem, /kapak_basliklari/); return { kapak_basliklari: ['KISA AD', 'ADINI SORMADIM', 'ÇOK UZUN BİR KAPAK BAŞLIĞI ÖNERİSİ'] }; };
  const d = { id: 'eksi-9', ton: 'komik', baslik_kisa: 'Kısa ad', bolumler: [{ n: 1, metin: '[laughs] Metin.' }] };
  const r = await KP.hazirla(ctx(), d, [eski('x', '#E9B949', 20)], { sor });
  assert.deepStrictEqual(r, { renk: d.renk, baslik: 'ADINI SORMADIM' }, 'the topic name is skipped, the valid one taken');
  assert.ok(tonu(d.renk).includes('komik'));
  const renk = d.renk;
  await KP.hazirla(ctx(), d, [eski('x', '#5DA9E9', 22)], { sor });
  assert.strictEqual(soru, 1, 'no second model call');
  assert.strictEqual(d.renk, renk, 'colour kept');
  d.kapak_baslik = 'sahibin başlığı';
  assert.strictEqual((await KP.hazirla(ctx(), d, [], { sor })).baslik, 'SAHİBİN BAŞLIĞI');
  assert.strictEqual(soru, 1);
});

test('hazirla: a failing or useless model call falls back to the short title; no marka.kapak -> nothing at all', async () => {
  const d = { id: 'e1', ton: 'ciddi', baslik_kisa: 'Kartın dökümü', bolumler: [] };
  const notlar = [];
  const r = await KP.hazirla(ctx(), d, [], { sor: async () => { throw new Error('model yok'); }, yaz: m => notlar.push(m) });
  assert.strictEqual(r.baslik, 'KARTIN DÖKÜMÜ');
  assert.ok(tonu(r.renk).includes('ciddi'));
  assert.match(notlar.join('\n'), /istenemedi/);
  const d2 = { id: 'e2', baslik_kisa: 'Uçaktaki kız', bolumler: [] };
  assert.strictEqual((await KP.hazirla(ctx(), d2, [], { sor: async () => ({ kapak_basliklari: ['UÇAKTAKİ KIZ'] }) })).baslik, 'UÇAKTAKİ KIZ', 'only option is the topic itself -> fallback');
  const d3 = { id: 'e3', baslik_kisa: 'X Y', bolumler: [] };
  let cagri = 0;
  assert.strictEqual(await KP.hazirla(ctx({}), d3, [], { sor: async () => { cagri++; return {}; } }), null);
  assert.strictEqual(cagri, 0);
  assert.ok(!('renk' in d3) && !('kapak_baslik' in d3));
});

// the split asks for 3 cover titles and keeps the shortest usable one; none usable -> no field (asked again later)
const kelimeler = n => Array.from({ length: n }, (_, i) => 'kelime' + i).join(' ');
function bolStub(kapak) {
  return async istem => {
    if (/"hikaye": true, "neden"/.test(istem)) return { metin: JSON.stringify({ hikaye: true, neden: 'anı' }) };
    if (/"gecti"/.test(istem)) return { metin: JSON.stringify({ gecti: true, eklenenler: [] }) };
    assert.match(istem, /kapak_basliklari/);
    return { metin: JSON.stringify({ baslik_kisa: '3-J veli grubu', kapak_basliklari: kapak, anlatici: { cinsiyet: 'erkek', yas: 'genc' },
      bolumler: [{ metin: kelimeler(150) }, { metin: 'Önceki bölümde gruba eklendim.\n\n' + kelimeler(150) }], degisen_isimler: {}, ton: { deger: 'komik', neden: 'gülerek' } }) };
  };
}

test('bol: kapak_baslik is the shortest valid option; none valid leaves it unset', async () => {
  const h = { id: 'eksi-5', tur: 'eksi', url: 'u', baslik: 'b', metin: kelimeler(400), dil: 'tr' };
  const c = { kanal: 'k', dir: os.tmpdir(), kimlik: { anlaticilar: [] }, ayar: { llm: {} } };
  const r = await bol(c, h, { calistir: bolStub(['3-J VELİ GRUBU', 'çocuğum yok ama veliyim', 'VELİYİM AMA ÇOCUK YOK']) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.dizi.kapak_baslik, 'VELİYİM AMA ÇOCUK YOK');
  const r2 = await bol(c, h, { calistir: bolStub(['3-J VELİ GRUBU']) });
  assert.strictEqual(r2.ok, true);
  assert.ok(!('kapak_baslik' in r2.dizi));
});

test('uretBolum: the episode carries the series\' cover identity into video.json (video_ek.kapak)', async () => {
  const { uretBolum } = require('../uret-bolum');
  const kok = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'kapak-ub-'));
  const c = { kanal: 'k', kimlik: { hesap: 'kanal_a', marka: { kapak: { renkler: PALET } } }, ayar: { llm: {}, dizi: {} } };
  const d = { id: 'eksi-77', ton: 'hüzünlü', baslik_kisa: 'Annemin telefonu', anlatici: { ses: 'S' }, bolumler: [{ n: 1, metin: 'Bir mesaj geldi.' }, { n: 2, metin: 'Önceki bölümde mesaj geldi.\n\nSonra.' }] };
  let hazir = null, istem = '';
  const calistir = async i => { istem = i; return { metin: JSON.stringify({ kapak_basliklari: ['ANNEMİN TELEFONUNA MESAJ GELDİ', 'ÖLÜMÜNDEN SONRA GELEN MESAJ'] }) }; };
  const uret = async (ctx, id, o) => { hazir = o.hazir; return { durum: 'uretildi', dir: require('path').join(kok, 'videolar', 'k-eksi-77-b1') }; };
  await uretBolum(c, d, 1, { kok, uret, calistir, yaz: () => { }, yorumcular: null, diziler: [d] });
  assert.match(istem, /Annemin telefonu/);
  assert.deepStrictEqual(hazir.video_ek.kapak, { renk: d.renk, baslik: 'ÖLÜMÜNDEN SONRA GELEN MESAJ' });
  assert.ok(tonu(d.renk).includes('hüzünlü'));
  assert.strictEqual(d.kapak_baslik, 'ÖLÜMÜNDEN SONRA GELEN MESAJ', 'stored on the series for the next episodes');
});
