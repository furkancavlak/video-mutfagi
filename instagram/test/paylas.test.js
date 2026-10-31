// Reels publishing with an episode cover (instagram/paylas.js gonder): cover_url goes with the /media POST, a rejection
// with a cover is retried once without it, the local server carries the cover next to the video. Fake Graph API
// (global fetch replaced), no tunnel, no token file, no network.
//   node --test "instagram/test/*.test.js"
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const P = require('../paylas.js');

P.zaman.bekle = async () => { };
const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'paylas-kapak-'));
test.after(() => fs.rmSync(kok, { recursive: true, force: true }));
const AYAR = { user_id: 'U1', token: 'GIZLI' };
const sus = async fn => { const o = console.log; console.log = () => { }; try { return await fn(); } finally { console.log = o; } };

// a fake graph: `medya(params, n)` answers each /media POST (n = 0, 1, ...), `durum(id)` the container status
function sahteGraph({ medya, durum = () => 'FINISHED' }) {
  const g = { postlar: [], eski: global.fetch };
  global.fetch = async (url, o = {}) => {
    const u = new URL(String(url)), ok = j => ({ ok: true, status: 200, json: async () => j, arrayBuffer: async () => new ArrayBuffer(0) });
    if (o.method === 'HEAD') return ok({});
    if (o.method === 'POST' && u.pathname.endsWith('/U1/media')) {
      const p = Object.fromEntries(new URLSearchParams(String(o.body)));
      g.postlar.push(p);
      const r = medya(p, g.postlar.length - 1);
      return r.error ? { ok: false, status: 400, json: async () => r } : ok(r);
    }
    if (o.method === 'POST' && u.pathname.endsWith('/media_publish')) return ok({ id: 'M1' });
    if (u.pathname.endsWith('/M1')) return ok({ permalink: 'https://i/p/M1', timestamp: 't' });
    const id = u.pathname.split('/').pop();
    return ok({ status_code: durum(id), status: durum(id) });
  };
  g.geri = () => { global.fetch = g.eski; };
  return g;
}
const gonder = kapak => sus(() => P.gonder('x.mp4', 'açıklama', false, false, 'https://sunucu/v.mp4', 'h', { ...(kapak ? { kapak } : {}), ayar: AYAR, kayit: path.join(kok, 'kayit.jsonl') }));

test('cover_url goes with the /media POST', async () => {
  const g = sahteGraph({ medya: () => ({ id: 'C1' }) });
  try {
    const r = await gonder('https://sunucu/k.jpg');
    assert.strictEqual(g.postlar.length, 1);
    assert.strictEqual(g.postlar[0].cover_url, 'https://sunucu/k.jpg');
    assert.strictEqual(g.postlar[0].video_url, 'https://sunucu/v.mp4');
    assert.deepStrictEqual([r.media_id, r.kapak, r.kapak_notu], ['M1', true, undefined]);
  } finally { g.geri(); }
});

test('no cover: no cover_url field', async () => {
  const g = sahteGraph({ medya: () => ({ id: 'C1' }) });
  try { await gonder(null); assert.ok(!('cover_url' in g.postlar[0])); } finally { g.geri(); }
});

test('a /media POST rejected with a cover is retried once without it and noted', async () => {
  const g = sahteGraph({ medya: p => p.cover_url ? { error: { message: 'cover_url geçersiz', code: 100 } } : { id: 'C2' } });
  try {
    const r = await gonder('https://sunucu/k.jpg');
    assert.deepStrictEqual(g.postlar.map(p => 'cover_url' in p), [true, false]);
    assert.strictEqual(r.media_id, 'M1');
    assert.strictEqual(r.kapak, false);
    assert.match(r.kapak_notu, /kapaksız bir kez daha.*cover_url geçersiz/);
  } finally { g.geri(); }
});

test('a container that fails with a cover is retried once without it; a second failure is the real error', async () => {
  const g = sahteGraph({ medya: (p, n) => ({ id: 'C' + n }), durum: id => id === 'C0' ? 'ERROR' : 'FINISHED' });
  try {
    const r = await gonder('https://sunucu/k.jpg');
    assert.strictEqual(g.postlar.length, 2);
    assert.strictEqual(r.kapak, false);
  } finally { g.geri(); }
  const g2 = sahteGraph({ medya: () => ({ error: { message: 'video bozuk', code: 2207026 } }) });
  try {
    await assert.rejects(gonder('https://sunucu/k.jpg'), /video bozuk/);
    assert.strictEqual(g2.postlar.length, 2, 'exactly one retry');
  } finally { g2.geri(); }
  // without a cover there is nothing to retry
  const g3 = sahteGraph({ medya: () => ({ error: { message: 'video bozuk', code: 1 } }) });
  try { await assert.rejects(gonder(null), /video bozuk/); assert.strictEqual(g3.postlar.length, 1); } finally { g3.geri(); }
});

test('serve: the video and the cover from one server, each under its own name and type', async () => {
  const v = path.join(kok, 'bolum 1.mp4'), k = path.join(kok, 'bolum-kapak.jpg');
  fs.writeFileSync(v, Buffer.alloc(2000, 1)); fs.writeFileSync(k, Buffer.alloc(300, 2));
  const s = await P.serve(v, [k]);
  try {
    const al = ad => new Promise((ok, no) => http.get({ host: '127.0.0.1', port: s.port, path: ad }, r => { let n = 0; r.on('data', d => n += d.length); r.on('end', () => ok({ kod: r.statusCode, tur: r.headers['content-type'], n })); }).on('error', no));
    assert.strictEqual(s.name, s.adlar[0]);
    assert.deepStrictEqual(await al(s.adlar[0]), { kod: 200, tur: 'video/mp4', n: 2000 });
    assert.deepStrictEqual(await al(s.adlar[1]), { kod: 200, tur: 'image/jpeg', n: 300 });
    assert.strictEqual((await al('/baska.jpg')).kod, 404);
  } finally { s.srv.close(); }
});
