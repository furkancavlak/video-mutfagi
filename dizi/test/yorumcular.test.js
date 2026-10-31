'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Y = require('../yorumcular');

const cevap = liste => async (url, o) => { cevap.son = { url, govde: JSON.parse(o.body), yetki: o.headers.Authorization }; return { ok: true, status: 201, json: async () => liste }; };
const ctx = { kanal: 'kanal_x', kimlik: { marka: { hesap: '@kanal_x' } } };

test('topla: commenters of every posted episode join the panel list, own account and duplicates out, replies in', async () => {
  const d = { id: 's', tesekkur: ['@elle_eklenen', 'ali'], bolumler: [{ n: 1, link: 'https://www.instagram.com/reel/A/' }, { n: 2, link: 'https://www.instagram.com/reel/B/' }, { n: 3 }] };
  const getir = cevap([
    { ownerUsername: 'veli', timestamp: '2026-10-31T10:00:00Z', replies: [{ ownerUsername: 'kanal_x' }, { ownerUsername: 'yanitlayan' }] },
    { ownerUsername: 'Ali', timestamp: '2026-10-30T10:00:00Z' }, { ownerUsername: 'bozuk/ad', timestamp: '2026-10-31T11:00:00Z' },
  ]);
  const r = await Y.topla(ctx, d, { token: 'apify_api_x', getir });
  assert.deepStrictEqual(r, ['elle_eklenen', 'ali', 'veli', 'yanitlayan']);
  assert.deepStrictEqual(d.tesekkur, r);
  assert.deepStrictEqual(cevap.son.govde.directUrls, ['https://www.instagram.com/reel/A/', 'https://www.instagram.com/reel/B/']);
  assert.strictEqual(cevap.son.yetki, 'Bearer apify_api_x');
});

test('topla: no token, no posted links or a failing service leave the panel list as it was', async () => {
  const d = { id: 's', tesekkur: ['ali'], bolumler: [{ n: 1, link: 'https://www.instagram.com/reel/A/' }] };
  assert.strictEqual(await Y.topla(ctx, d, { token: null }), null);
  assert.strictEqual(await Y.topla(ctx, { id: 't', bolumler: [{ n: 1 }] }, { token: 'x' }), null);
  const notlar = [];
  assert.strictEqual(await Y.topla(ctx, d, { token: 'x', getir: async () => ({ ok: false, status: 402 }), yaz: m => notlar.push(m) }), null);
  assert.deepStrictEqual(d.tesekkur, ['ali']);
  assert.match(notlar[0], /402/);
});
