// Automatic Instagram token refresh (instagram/yenile.js): gates, success, failure, no token in output. Stubbed fetch.
//   node --test "kuyruk/test/*.test.js"
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const Y = require('../../instagram/yenile.js');

const GUN = 864e5, SIMDI = Date.parse('2026-11-20T10:00:00Z');
const once = g => new Date(SIMDI - g * GUN).toISOString();
function ortam(tokenlar) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-yenile-'));
  for (const [f, v] of Object.entries(tokenlar)) fs.writeFileSync(path.join(dir, f), JSON.stringify(v));
  return { dir, durumF: path.join(dir, 'durum', 'token-yenileme.json') };
}
const oku = f => JSON.parse(fs.readFileSync(f, 'utf8'));
function sahte(cevap) {
  const f = async url => { f.urls.push(url); if (cevap instanceof Error) throw cevap; return { json: async () => cevap }; };
  f.urls = [];
  return f;
}

test('zamaniGeldi: younger than 24 h or within 7 days of the last refresh is too early', () => {
  assert.strictEqual(Y.zamaniGeldi({ kaydedildi: new Date(SIMDI - 3600e3).toISOString() }, SIMDI).gerek, false);
  assert.strictEqual(Y.zamaniGeldi({ kaydedildi: once(6) }, SIMDI).gerek, false);
  assert.strictEqual(Y.zamaniGeldi({ kaydedildi: once(30), yenilendi: once(3) }, SIMDI).gerek, false, 'yenilendi wins over kaydedildi');
  assert.strictEqual(Y.zamaniGeldi({ kaydedildi: once(8) }, SIMDI).gerek, true);
  assert.strictEqual(Y.zamaniGeldi({}, SIMDI).gerek, false);
});

test('due account is refreshed: new token and yenilendi written, others untouched, token never in the result', async () => {
  const { dir, durumF } = ortam({ 'instagram.json': { token: 'ESKI-A', username: 'oxygbio', kaydedildi: once(9) }, 'instagram-hesap_b.json': { token: 'ESKI-B', kaydedildi: once(2) } });
  const getir = sahte({ access_token: 'YENI-A', expires_in: 5184000 });
  const r = await Y.otoYenile({ simdi: SIMDI, dir, durumF, getir });
  assert.deepStrictEqual(r.map(x => [x.hesap, x.sonuc]).sort(), [['hesap_b', 'erken'], ['oxygbio', 'yenilendi']]);
  const a = oku(path.join(dir, 'instagram.json'));
  assert.deepStrictEqual([a.token, a.username, a.yenilendi], ['YENI-A', 'oxygbio', new Date(SIMDI).toISOString()]);
  assert.strictEqual(oku(path.join(dir, 'instagram-hesap_b.json')).token, 'ESKI-B');
  assert.strictEqual(getir.urls.length, 1); assert.match(getir.urls[0], /grant_type=ig_refresh_token&access_token=ESKI-A$/);
  const d = fs.readFileSync(durumF, 'utf8') + JSON.stringify(r);
  assert.ok(!/ESKI|YENI/.test(d), 'no token in the state file or the result');
  assert.deepStrictEqual(Y.uyarilar(durumF), []);
});

test('at most one try per account per 24 h', async () => {
  const { dir, durumF } = ortam({ 'instagram.json': { token: 'T', kaydedildi: once(9) } });
  const getir = sahte({ error: { message: 'kapalı' } });
  await Y.otoYenile({ simdi: SIMDI, dir, durumF, getir });
  const r2 = await Y.otoYenile({ simdi: SIMDI + 5 * 60e3, dir, durumF, getir });
  assert.deepStrictEqual(r2, [{ hesap: 'oxygbio', sonuc: 'beklemede' }]);
  assert.strictEqual(getir.urls.length, 1);
  await Y.otoYenile({ simdi: SIMDI + GUN + 1, dir, durumF, getir });
  assert.strictEqual(getir.urls.length, 2, 'tried again the next day');
});

test('failure keeps the old token, shows a health warning without the token, success clears it', async () => {
  const { dir, durumF } = ortam({ 'instagram-hesap_b.json': { token: 'GIZLI-123', kaydedildi: once(20) } });
  const r = await Y.otoYenile({ simdi: SIMDI, dir, durumF, getir: sahte({ error: { message: 'Invalid token GIZLI-123' } }) });
  assert.strictEqual(r[0].sonuc, 'hata');
  assert.strictEqual(oku(path.join(dir, 'instagram-hesap_b.json')).token, 'GIZLI-123', 'old token untouched');
  const u = Y.uyarilar(durumF);
  assert.strictEqual(u.length, 1); assert.match(u[0], /^Instagram anahtarı yenilenemedi \(@hesap_b\)/);
  assert.ok(!/GIZLI/.test(u[0] + fs.readFileSync(durumF, 'utf8')), 'the token is masked');
  assert.deepStrictEqual(Y.uyarilar(durumF, 'oxygbio'), [], 'filtered by account');
  // network error: same handling
  const { dir: d2, durumF: f2 } = ortam({ 'instagram.json': { token: 'X', kaydedildi: once(20) } });
  assert.match((await Y.otoYenile({ simdi: SIMDI, dir: d2, durumF: f2, getir: sahte(new Error('ECONNRESET')) }))[0].neden, /bağlantı hatası: ECONNRESET/);
  // next day it works: the warning is gone
  await Y.otoYenile({ simdi: SIMDI + GUN + 1, dir, durumF, getir: sahte({ access_token: 'YENI', expires_in: 5184000 }) });
  assert.deepStrictEqual(Y.uyarilar(durumF), []);
});

test('no token folder: nothing to do, no throw', async () => {
  assert.deepStrictEqual(await Y.otoYenile({ simdi: SIMDI, dir: path.join(os.tmpdir(), 'yok-' + Date.now()), durumF: path.join(os.tmpdir(), 'x.json'), getir: sahte({}) }), []);
});
