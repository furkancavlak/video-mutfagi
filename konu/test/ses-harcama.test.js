// The budget ledger logs the real ElevenLabs charge (uretim/ses-harcama.js), the script length only as a marked estimate.
//   node --test "konu/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const SH = require('../../uretim/ses-harcama');

test('basliktanKarakter: character-cost / x-character-count header, Headers or plain object; junk is null', () => {
  assert.strictEqual(SH.basliktanKarakter(new Headers({ 'character-cost': '137' })), 137);
  assert.strictEqual(SH.basliktanKarakter({ 'x-character-count': '88' }), 88);
  assert.strictEqual(SH.basliktanKarakter(new Headers({ 'character-cost': 'abc' })), null);
  assert.strictEqual(SH.basliktanKarakter(new Headers()), null);
  assert.strictEqual(SH.basliktanKarakter(null), null);
});

test('hesapla: headers when every request had one, else the subscription delta, else the estimate marked tahmini', () => {
  assert.deepStrictEqual(SH.hesapla({ basliklar: [100, 120, 80, 90], once: 1, sonra: 999, tahmin: 971 }), { karakter: 390, kaynak: 'baslik' });
  // aşk ep1, 30.10.2026: 36958 -> 37346 on a 971-character script
  assert.deepStrictEqual(SH.hesapla({ basliklar: [100, null], once: 36958, sonra: 37346, tahmin: 971 }), { karakter: 388, kaynak: 'abonelik' });
  assert.deepStrictEqual(SH.hesapla({ basliklar: [], once: 100, sonra: null, tahmin: 971 }), { karakter: 971, kaynak: 'tahmin', tahmini: true });
  assert.strictEqual(SH.hesapla({ once: 500, sonra: 400, tahmin: 50 }).kaynak, 'tahmin', 'a counter that went down (monthly reset) is no measure');
  assert.strictEqual(SH.hesapla({ once: 0, sonra: 10000, tahmin: 900 }).kaynak, 'tahmin', 'a jump far above the script (another job spent too) is no measure');
});

test('oku: the record in ses/harcama.json, the estimate when it is missing or broken', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ses-harcama-'));
  assert.deepStrictEqual(SH.oku(dir, 971), { karakter: 971, kaynak: 'tahmin', tahmini: true });
  fs.mkdirSync(path.join(dir, 'ses'));
  fs.writeFileSync(SH.dosya(dir), JSON.stringify({ karakter: 388, kaynak: 'abonelik', tahmin: 971 }));
  assert.deepStrictEqual(SH.oku(dir, 971), { karakter: 388, kaynak: 'abonelik' });
  fs.writeFileSync(SH.dosya(dir), '{bozuk');
  assert.strictEqual(SH.oku(dir, 971).tahmini, true);
});

test('harcamaYaz keeps the extra fields (kaynak, metin_uzunlugu, tahmini)', () => {
  const O = require('../ortak');
  const kayit = fs.mkdtempSync(path.join(os.tmpdir(), 'defter-'));
  O.harcamaYaz({ kayit }, 'karakter', 388, 'v1', { kaynak: 'abonelik', metin_uzunlugu: 971 });
  O.harcamaYaz({ kayit }, 'karakter', 500, 'v2', { kaynak: 'tahmin', metin_uzunlugu: 500, tahmini: true });
  const l = O.satirlarOku(path.join(kayit, 'harcama.jsonl'));
  assert.deepStrictEqual(l.map(x => [x.miktar, x.kaynak, x.metin_uzunlugu, x.tahmini]), [[388, 'abonelik', 971, undefined], [500, 'tahmin', 500, true]]);
  assert.deepStrictEqual(O.harcamaToplam({ kayit }, 'karakter'), { gun: 888, ay: 888 });
});
