// Per-account Instagram token paths, queue slots and daily limits.
const test = require('node:test'), assert = require('node:assert');
const { ayarYolu } = require('../../instagram/paylas.js');
const { sonrakiSlot, gunlukSayi } = require('../kuyruk.js');

const gun = d => new Date(d).toLocaleDateString('sv-SE');

test('ayarYolu: default account keeps instagram.json, others get their own file', () => {
  assert.ok(ayarYolu().endsWith('instagram.json'));
  assert.ok(ayarYolu('oxygbio').endsWith('instagram.json'));
  assert.ok(ayarYolu('hesap_b').endsWith('instagram-hesap_b.json'));
});

test('gunlukSayi counts only the given account', () => {
  const t = new Date(2026, 10, 1, 12, 0).toISOString();
  const jobs = [{ paylasildi: t, hesap: 'hesap_b' }, { paylasildi: t, hesap: 'hesap_b' }, { paylasildi: t }, { paylasildi: t, hesap: 'oxygbio' }, { paylasildi: new Date(2026, 10, 2, 12).toISOString(), hesap: 'hesap_b' }];
  assert.equal(gunlukSayi(jobs, '2026-11-01', 'hesap_b'), 2);
  assert.equal(gunlukSayi(jobs, '2026-11-01', 'oxygbio'), 2);
  assert.equal(gunlukSayi(jobs, '2026-11-01'), 2);
});

test('sonrakiSlot: per-account hours and limit, other account does not interfere', () => {
  const a = { paylasim_saatleri: ['19:00'], gunluk_en_fazla: 1, hesaplar: { hesap_b: { paylasim_saatleri: ['12:00', '17:00', '21:00'], gunluk_en_fazla: 3 } } };
  const simdi = new Date(2026, 10, 1, 0, 0).getTime();
  const at = (d, h) => new Date(2026, 10, d, h, 0).toISOString();
  const dur = [12, 17, 21].map(h => ({ t: at(1, h), hesap: 'hesap_b' }));
  // hesap_b is full on the 1st -> next day 12:00 (even though oxygbio is free on the 1st)
  assert.equal(sonrakiSlot(a, dur, 'hesap_b', simdi), at(2, 12));
  // oxygbio is not blocked by hesap_b jobs and uses the global 19:00
  assert.equal(sonrakiSlot(a, dur, undefined, simdi), at(1, 19));
  // two of three used -> third slot of the same day
  assert.equal(sonrakiSlot(a, dur.slice(0, 2), 'hesap_b', simdi), at(1, 21));
  assert.equal(gun(sonrakiSlot(a, [], 'hesap_b', simdi)), '2026-11-01');
});

test('sonrakiSlot: plain ISO strings still count as oxygbio (backward compatible)', () => {
  const a = { paylasim_saatleri: ['19:00'], gunluk_en_fazla: 1 };
  const simdi = new Date(2026, 10, 1, 0, 0).getTime();
  assert.equal(sonrakiSlot(a, [new Date(2026, 10, 1, 19).toISOString()], undefined, simdi), new Date(2026, 10, 2, 19).toISOString());
});

// ---- the series channel's own hours and limit (konu.json → dizi) when ayarlar/kuyruk.json has no hesaplar.<hesap>
const fs = require('fs'), os = require('os'), path = require('path');
const { hesapAyar } = require('../kuyruk.js');
function kanalKok(dizi, hesap = '@Ornek_Hesap') {
  const k = fs.mkdtempSync(path.join(os.tmpdir(), 'kuyruk-kanal-'));
  const yaz = (rel, j) => { const f = path.join(k, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(j)); };
  yaz('kanal/seri/kimlik.json', { hesap }); yaz('kanal/seri/konu.json', dizi ? { dizi } : {});
  yaz('kanal/oxygbio/kimlik.json', { hesap: '@oxygbio' }); yaz('kanal/oxygbio/konu.json', { otomasyon: {} });
  return k;
}
const GENEL = { paylasim_saatleri: ['19:00'], gunluk_en_fazla: 1 };
const DZ = { saatler: ['12:00', '17:00', '21:00'], onay_donemi: true, onay_gunluk: 2, gunluk_hedef: 3 };

test('hesapAyar: channel dizi block gives the hours; onay_gunluk in the approval period, gunluk_hedef after it', () => {
  assert.deepEqual(hesapAyar(GENEL, 'ornek_hesap', kanalKok(DZ)), { paylasim_saatleri: DZ.saatler, gunluk_en_fazla: 2 });
  assert.deepEqual(hesapAyar(GENEL, '@ORNEK_hesap ', kanalKok(DZ)).gunluk_en_fazla, 2, 'account name normalised');
  assert.equal(hesapAyar(GENEL, 'ornek_hesap', kanalKok({ ...DZ, onay_donemi: false })).gunluk_en_fazla, 3);
  const { onay_donemi, ...yok } = DZ;
  assert.equal(hesapAyar(GENEL, 'ornek_hesap', kanalKok(yok)).gunluk_en_fazla, 2, 'missing onay_donemi = approval on');
});

test('hesapAyar: hesaplar.<hesap> wins over the channel; no dizi block or another account = global', () => {
  const a = { ...GENEL, hesaplar: { ornek_hesap: { paylasim_saatleri: ['08:00'], gunluk_en_fazla: 5 } } };
  assert.deepEqual(hesapAyar(a, 'ornek_hesap', kanalKok(DZ)), { paylasim_saatleri: ['08:00'], gunluk_en_fazla: 5 });
  assert.deepEqual(hesapAyar(GENEL, 'ornek_hesap', kanalKok(null)), GENEL);
  assert.deepEqual(hesapAyar(GENEL, 'hesap_b', kanalKok(DZ)), GENEL);
});

test('hesapAyar: oxygbio (no dizi block) is unchanged, with or without a hesap', () => {
  const k = kanalKok(DZ);
  assert.deepEqual(hesapAyar(GENEL, undefined, k), GENEL);
  assert.deepEqual(hesapAyar(GENEL, '@oxygbio', k), GENEL);
  const simdi = new Date(2026, 10, 1, 0, 0).getTime();
  assert.equal(sonrakiSlot(GENEL, [], undefined, simdi, k), new Date(2026, 10, 1, 19).toISOString());
});

test('sonrakiSlot uses the channel hours and limit', () => {
  const k = kanalKok(DZ), simdi = new Date(2026, 10, 1, 0, 0).getTime(), at = (d, h) => new Date(2026, 10, d, h, 0).toISOString();
  assert.equal(sonrakiSlot(GENEL, [], 'ornek_hesap', simdi, k), at(1, 12));
  const dolu = [{ t: at(1, 12), hesap: 'ornek_hesap' }, { t: at(1, 17), hesap: 'ornek_hesap' }];
  assert.equal(sonrakiSlot(GENEL, dolu, 'ornek_hesap', simdi, k), at(2, 12), 'limit 2 in the approval period');
});

test('ayarYolu: the account name is normalised and validated; anything else throws', () => {
  assert.ok(ayarYolu(' @Hesap_B ').endsWith('instagram-hesap_b.json'));
  assert.ok(ayarYolu('@oxygbio').endsWith('instagram.json'));
  for (const h of ['../x', 'a/b', 'a b', 'a\\b', '..\\x', 'x;y']) assert.throws(() => ayarYolu(h), /hesap/, h);
});

test('onayZamani: approving a job whose time has passed moves it to the next free slot; a future time stays', () => {
  const { onayZamani } = require('../kuyruk.js');
  const a = { paylasim_saatleri: ['12:00', '19:00'], gunluk_en_fazla: 2 };
  const simdi = new Date(2026, 10, 1, 13, 0).getTime(), at = (d, h) => new Date(2026, 10, d, h, 0).toISOString();
  assert.equal(onayZamani({ ne_zaman: at(1, 19) }, a, [], simdi), at(1, 19));
  assert.equal(onayZamani({ ne_zaman: at(1, 12) }, a, [], simdi), at(1, 19));
  assert.equal(onayZamani({ ne_zaman: null }, a, [], simdi), at(1, 19));
  assert.equal(onayZamani({ ne_zaman: at(1, 12), hesap: 'hesap_b' }, a, [{ t: at(1, 19), hesap: 'hesap_b' }], simdi), at(2, 12));
});
