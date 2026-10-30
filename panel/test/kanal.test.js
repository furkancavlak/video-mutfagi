// Panel: per-channel queue filter, channel list and the per-account Instagram cache (no network, no tokens).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-kanal-'));
const yaz = (rel, j) => { const f = path.join(KOK, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof j === 'string' ? j : JSON.stringify(j)); };
yaz('kanal/kanal_a/kimlik.json', { hesap: '@oxygbio', ad: 'A' }); yaz('kanal/kanal_a/konu.json', {});
yaz('kanal/kanal_b/kimlik.json', { hesap: 'ornek_hesap', ad: 'B' }); yaz('kanal/kanal_b/konu.json', {});
yaz('kanal/kanal_c/konu.json', {});
const ne = new Date(Date.now() + 36e5).toISOString();
yaz('kuyruk/bekleyen/j-eski.json', { mp4: 'a.mp4', ne_zaman: ne });                                  // no hesap = oxygbio
yaz('kuyruk/bekleyen/j-b.json', { mp4: 'b.mp4', ne_zaman: ne, hesap: 'ornek_hesap' });
yaz('kuyruk/bekleyen/j-x.json', { mp4: 'x.mp4', ne_zaman: ne, hesap: 'hesap_b' });
yaz('kuyruk/hatali/h-b.json', { mp4: 'hb.mp4', hesap: 'ornek_hesap', son_hata: 'x' });
yaz('ayarlar/kuyruk.json', { paylasim_saatleri: ['19:00'], gunluk_en_fazla: 1, hesaplar: { ornek_hesap: { paylasim_saatleri: ['12:00', '21:00'], gunluk_en_fazla: 2 } } });

process.argv.push('--kok', KOK);
const P = require('../panel.js');
const idler = o => o.kuyruk.map(j => j.id).sort();

test('kuyrukOzet filters by the channel account', () => {
  assert.deepEqual(idler(P.kuyrukOzet('kanal_b')), ['j-b']);
  assert.equal(P.kuyrukOzet('kanal_b').hatali.length, 1);
  assert.deepEqual(idler(P.kuyrukOzet('kanal_a')), ['j-eski']);   // '@oxygbio' in kimlik, job without hesap
  assert.equal(P.kuyrukOzet('kanal_a').hatali.length, 0);
});

test('kuyrukOzet without a channel keeps showing everything', () => {
  assert.deepEqual(idler(P.kuyrukOzet()), ['j-b', 'j-eski', 'j-x']);
});

test('kuyrukOzet shows the account hours and limit', () => {
  const o = P.kuyrukOzet('kanal_b');
  assert.deepEqual(o.saatler, ['12:00', '21:00']); assert.equal(o.gunluk, 2);
  assert.deepEqual(P.kuyrukOzet('kanal_a').saatler, ['19:00']);
});

test('kanalBilgi lists channels with their account (or null)', () => {
  const k = Object.fromEntries(P.kanalBilgi().map(x => [x.ad, x.hesap]));
  assert.deepEqual(k, { kanal_a: '@oxygbio', kanal_b: 'ornek_hesap', kanal_c: null });
});

test('instagram caches per account', async () => {
  let cagri = 0;
  const sahte = { readAyar: h => (cagri++, { token: 't-' + h }), me: async () => ({ username: 'u' }), graph: async () => ({ data: [] }), sonuc: async () => ({}) };
  const a = await P.instagram(false, 'ornek_hesap', sahte);
  assert.equal(a.bagli, true); assert.equal(a.hesap, 'u');
  assert.ok(fs.existsSync(path.join(KOK, 'kayit', 'panel-instagram-ornek_hesap.json')));
  await P.instagram(false, 'ornek_hesap', sahte);
  assert.equal(cagri, 1, 'second call is served from the cache');
  await P.instagram(false, 'hesap_b', sahte);
  assert.equal(cagri, 2, 'another account has its own cache');
  assert.ok(fs.existsSync(path.join(KOK, 'kayit', 'panel-instagram-hesap_b.json')));
  await assert.rejects(() => P.instagram(false, '../kacak', sahte));
});
