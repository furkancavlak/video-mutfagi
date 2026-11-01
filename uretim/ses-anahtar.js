// Several ElevenLabs accounts used together: ~/.video-mutfagi/elevenlabs.txt first, then elevenlabs-*.txt (name order).
// Each line goes to the first key that still has room, so the main account's remainder is spent before a backup's.
//   anahtarlar(ayarDir)              -> [{ ad, key }]
//   durumOku(k, fetchFn)             -> { ...k, kalan, kullanilan } (kalan null = unknown: the key may not read the subscription)
//   sec(durumlar, uzunluk)           -> the key for one line, or null
//   toplamYeter(durumlar, karakter)  -> false only when every remainder is known and together they fall short
const fs = require('fs'), path = require('path');

function anahtarlar(ayarDir) {
  const ek = (() => { try { return fs.readdirSync(ayarDir).filter(f => /^elevenlabs-[\w.-]+\.txt$/.test(f)).sort(); } catch (e) { return []; } })();
  return ['elevenlabs.txt', ...ek].map(ad => {
    try { const key = fs.readFileSync(path.join(ayarDir, ad), 'utf8').trim(); return key ? { ad, key } : null; } catch (e) { return null; }
  }).filter(Boolean);
}

async function durumOku(k, fetchFn = fetch) {
  const r = await fetchFn('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': k.key } });
  if (r.status === 401) {
    const t = await r.text();
    // a key without the user_read permission still speaks: its remainder is just unknown
    if (/missing_permissions|user_read/.test(t)) return { ...k, kalan: null, kullanilan: null };
    return { ...k, gecersiz: true, kalan: 0, kullanilan: null };
  }
  const s = await r.json();
  return { ...k, kalan: s.character_limit - s.character_count, kullanilan: s.character_count };
}

const sec = (durumlar, uzunluk) => durumlar.find(d => !d.gecersiz && !d.bitti && (d.kalan == null || d.kalan >= uzunluk)) || null;
const toplamYeter = (durumlar, karakter) => {
  const g = durumlar.filter(d => !d.gecersiz);
  return g.some(d => d.kalan == null) || g.reduce((a, d) => a + d.kalan, 0) >= karakter;
};
// the account ran out mid-step (another job spent it, or the estimate was low) or has an unpaid invoice: try the next key
const kotaBitti = (status, metin) => (status === 401 || status === 402) && /quota_exceeded|character.?limit|credits|payment_issue|payment_required|failed or incomplete payment/i.test(metin);

module.exports = { anahtarlar, durumOku, sec, toplamYeter, kotaBitti };
