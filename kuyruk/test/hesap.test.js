// Per-account Instagram token paths, queue slots and daily limits.
const test = require('node:test'), assert = require('node:assert');
const { ayarYolu } = require('../../instagram/paylas.js');
const { sonrakiSlot, gunlukSayi } = require('../kuyruk.js');

const gun = d => new Date(d).toLocaleDateString('sv-SE');

test('ayarYolu: default account keeps instagram.json, others get their own file', () => {
  assert.ok(ayarYolu().endsWith('instagram.json'));
  assert.ok(ayarYolu('oxygbio').endsWith('instagram.json'));
  assert.ok(ayarYolu('dur_anlatayim').endsWith('instagram-dur_anlatayim.json'));
});

test('gunlukSayi counts only the given account', () => {
  const t = new Date(2026, 10, 1, 12, 0).toISOString();
  const jobs = [{ paylasildi: t, hesap: 'dur_anlatayim' }, { paylasildi: t, hesap: 'dur_anlatayim' }, { paylasildi: t }, { paylasildi: t, hesap: 'oxygbio' }, { paylasildi: new Date(2026, 10, 2, 12).toISOString(), hesap: 'dur_anlatayim' }];
  assert.equal(gunlukSayi(jobs, '2026-11-01', 'dur_anlatayim'), 2);
  assert.equal(gunlukSayi(jobs, '2026-11-01', 'oxygbio'), 2);
  assert.equal(gunlukSayi(jobs, '2026-11-01'), 2);
});

test('sonrakiSlot: per-account hours and limit, other account does not interfere', () => {
  const a = { paylasim_saatleri: ['19:00'], gunluk_en_fazla: 1, hesaplar: { dur_anlatayim: { paylasim_saatleri: ['12:00', '17:00', '21:00'], gunluk_en_fazla: 3 } } };
  const simdi = new Date(2026, 10, 1, 0, 0).getTime();
  const at = (d, h) => new Date(2026, 10, d, h, 0).toISOString();
  const dur = [12, 17, 21].map(h => ({ t: at(1, h), hesap: 'dur_anlatayim' }));
  // dur_anlatayim is full on the 1st -> next day 12:00 (even though oxygbio is free on the 1st)
  assert.equal(sonrakiSlot(a, dur, 'dur_anlatayim', simdi), at(2, 12));
  // oxygbio is not blocked by dur_anlatayim jobs and uses the global 19:00
  assert.equal(sonrakiSlot(a, dur, undefined, simdi), at(1, 19));
  // two of three used -> third slot of the same day
  assert.equal(sonrakiSlot(a, dur.slice(0, 2), 'dur_anlatayim', simdi), at(1, 21));
  assert.equal(gun(sonrakiSlot(a, [], 'dur_anlatayim', simdi)), '2026-11-01');
});

test('sonrakiSlot: plain ISO strings still count as oxygbio (backward compatible)', () => {
  const a = { paylasim_saatleri: ['19:00'], gunluk_en_fazla: 1 };
  const simdi = new Date(2026, 10, 1, 0, 0).getTime();
  assert.equal(sonrakiSlot(a, [new Date(2026, 10, 1, 19).toISOString()], undefined, simdi), new Date(2026, 10, 2, 19).toISOString());
});
