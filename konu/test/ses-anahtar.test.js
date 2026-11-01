// Several ElevenLabs keys used together (uretim/ses-anahtar.js): order, unknown remainder, room per line.
//   node --test "konu/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const SA = require('../../uretim/ses-anahtar');

test('anahtarlar: elevenlabs.txt first, then elevenlabs-*.txt by name; empty files skipped', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ses-anahtar-'));
  fs.writeFileSync(path.join(d, 'elevenlabs-yedek.txt'), 'sk_b\n');
  fs.writeFileSync(path.join(d, 'elevenlabs-2.txt'), '  ');
  fs.writeFileSync(path.join(d, 'elevenlabs.txt'), 'sk_a');
  fs.writeFileSync(path.join(d, 'openrouter.txt'), 'x');
  assert.deepStrictEqual(SA.anahtarlar(d), [{ ad: 'elevenlabs.txt', key: 'sk_a' }, { ad: 'elevenlabs-yedek.txt', key: 'sk_b' }]);
});

test('durumOku: remainder from the subscription; a key without user_read is unknown, a bad key invalid', async () => {
  const yanit = (status, govde) => async () => ({ status, json: async () => govde, text: async () => JSON.stringify(govde) });
  assert.strictEqual((await SA.durumOku({ ad: 'a', key: 'k' }, yanit(200, { character_limit: 40000, character_count: 39063 }))).kalan, 937);
  const b = await SA.durumOku({ ad: 'b', key: 'k' }, yanit(401, { detail: { status: 'missing_permissions', message: 'missing the permission user_read' } }));
  assert.strictEqual(b.kalan, null); assert.ok(!b.gecersiz);
  assert.ok((await SA.durumOku({ ad: 'c', key: 'k' }, yanit(401, { detail: { status: 'invalid_api_key' } }))).gecersiz);
});

test('sec / toplamYeter: the main remainder is used first, then the backup; unknown counts as room', () => {
  const D = [{ ad: 'a', kalan: 937 }, { ad: 'b', kalan: null }];
  assert.strictEqual(SA.sec(D, 400).ad, 'a');
  assert.strictEqual(SA.sec(D, 1000).ad, 'b');
  D[1].bitti = true; assert.strictEqual(SA.sec(D, 1000), null);
  assert.ok(SA.toplamYeter([{ kalan: 937 }, { kalan: null }], 5000));
  assert.ok(!SA.toplamYeter([{ kalan: 937 }, { kalan: 200 }], 1266));
  assert.ok(SA.toplamYeter([{ kalan: 937 }, { kalan: 30000 }], 1266));
  assert.ok(!SA.toplamYeter([{ kalan: 900, gecersiz: true }], 10));
});

test('kotaBitti: quota errors move to the next key, other errors do not', () => {
  assert.ok(SA.kotaBitti(401, '{"detail":{"status":"quota_exceeded"}}'));
  assert.ok(!SA.kotaBitti(401, '{"detail":{"status":"invalid_api_key"}}'));
  assert.ok(SA.kotaBitti(401, '{"detail":{"type":"payment_required","code":"payment_issue","message":"Your subscription has a failed or incomplete payment."}}'));
  assert.ok(!SA.kotaBitti(500, 'quota'));
});
