// The queue posting an episode with its cover (kuyruk.js paylas): klasor mode copies the jpg next to the mp4 under its
// own random name and removes both afterwards (also on failure); tunnel mode hands the local jpg to the same tunnel; a
// missing cover file only drops the cover. Fake publisher, temp web folder, no network.
//   node --test "kuyruk/test/*.test.js"
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { paylas } = require('../kuyruk.js');

const KOK = path.join(__dirname, '..', '..');
const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'kuyruk-kapak-'));
test.after(() => fs.rmSync(kok, { recursive: true, force: true }));
const mp4 = path.join(kok, 'v.mp4'), jpg = path.join(kok, 'v-kapak.jpg');
fs.writeFileSync(mp4, 'video'); fs.writeFileSync(jpg, 'kapak');
const rel = f => path.relative(KOK, f);       // jobs name files relative to the repo
const is = (ek = {}) => ({ mp4: rel(mp4), kapak: rel(jpg), aciklama: 'a', hesap: 'h', ...ek });

// records each gonder call and what sat in the web folder at that moment
function sahteP({ hata = null, sonuc = { media_id: 'M', link: 'L', kapak: true } } = {}) {
  const P = { cagri: [] };
  P.gonder = async (file, aciklama, kuru, hazirla, adres, hesap, ek) => {
    P.cagri.push({ file, adres, hesap, ek, klasorde: P.klasor ? fs.readdirSync(P.klasor).sort() : null });
    if (hata) throw new Error(hata);
    return sonuc;
  };
  return P;
}

test('klasor mode: the jpg is copied with a random name, passed as a public URL and removed with the mp4', async () => {
  const klasor = fs.mkdtempSync(path.join(kok, 'web-')), P = sahteP(); P.klasor = klasor;
  const r = await paylas(is(), { yayin: { yol: 'klasor', klasor, adres: 'https://sunucu/ig' } }, false, false, { P, yaz: () => { } });
  assert.strictEqual(r.media_id, 'M');
  const c = P.cagri[0];
  assert.strictEqual(c.klasorde.length, 2);
  const [k, v] = [c.klasorde.find(f => f.endsWith('.jpg')), c.klasorde.find(f => f.endsWith('.mp4'))];
  assert.match(k, /^vm-[0-9a-f]{16}\.jpg$/); assert.match(v, /^vm-[0-9a-f]{16}\.mp4$/);
  assert.strictEqual(c.adres, 'https://sunucu/ig/' + v);
  assert.deepStrictEqual(c.ek, { kapak: 'https://sunucu/ig/' + k });
  assert.deepStrictEqual(fs.readdirSync(klasor), [], 'both copies removed');
});

test('klasor mode: a failed post still removes both copies', async () => {
  const klasor = fs.mkdtempSync(path.join(kok, 'web-')), P = sahteP({ hata: 'Instagram reddetti' }); P.klasor = klasor;
  await assert.rejects(paylas(is(), { yayin: { yol: 'klasor', klasor, adres: 'https://sunucu/ig/' } }, false, false, { P, yaz: () => { } }), /reddetti/);
  assert.strictEqual(P.cagri[0].klasorde.length, 2);
  assert.deepStrictEqual(fs.readdirSync(klasor), []);
});

test('tunnel mode: the local jpg goes to gonder; a missing cover file is dropped and logged; a cover note is logged', async () => {
  const P = sahteP({ sonuc: { media_id: 'M', kapak: false, kapak_notu: 'kapakla reddedildi, kapaksız bir kez daha denendi: x' } }), notlar = [];
  await paylas(is(), { yayin: { yol: 'tunel', tunel_en_fazla_mb: 50 } }, false, false, { P, yaz: m => notlar.push(m) });
  assert.strictEqual(P.cagri[0].file, mp4);
  assert.strictEqual(P.cagri[0].adres, null);
  assert.deepStrictEqual(P.cagri[0].ek, { kapak: jpg });
  assert.match(notlar.join('\n'), /kapak: kapakla reddedildi/);
  await paylas(is({ kapak: rel(path.join(kok, 'yok.jpg')) }), { yayin: { yol: 'tunel', tunel_en_fazla_mb: 50 } }, false, false, { P, yaz: m => notlar.push(m) });
  assert.deepStrictEqual(P.cagri[1].ek, {});
  assert.match(notlar.join('\n'), /kapak dosyası yok/);
  // a job without a cover (older jobs, other channels) is posted exactly as before
  const klasor = fs.mkdtempSync(path.join(kok, 'web-')); P.klasor = klasor;
  await paylas(is({ kapak: undefined }), { yayin: { yol: 'klasor', klasor, adres: 'https://s/' } }, false, false, { P, yaz: () => { } });
  assert.deepStrictEqual(P.cagri[2].ek, {});
  assert.strictEqual(P.cagri[2].klasorde.length, 1);
});
