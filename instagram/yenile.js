// Automatic refresh of Instagram long-lived tokens (they expire after 60 days). Called from `kuyruk.js calistir`
// (every 5 min) and by `paylas.js yenile`. Never logs or returns a token.
//   otoYenile({ simdi, dir, durumF, getir }) -> [{hesap, sonuc: 'yenilendi'|'erken'|'hata'|'beklemede', neden?}]
//   tokenYenile(dosya, { simdi, getir })     -> {gun} (one refresh, throws a token-free error)
// Gate per account: at most one try per 24 h (stamp in durumF). Refresh only when the token is older than 24 h
// (Instagram's rule) and more than 7 days have passed since `yenilendi` (or `kaydedildi`). A failure keeps the old
// token untouched and is kept in durumF, where the panel health and `kuyruk.js durum` show it.
const fs = require('fs'), path = require('path'), os = require('os');

const AYAR_DIR = path.join(os.homedir(), '.video-mutfagi');
const DURUM_F = path.join(__dirname, '..', 'kuyruk', 'token-yenileme.json');
const GUN = 864e5, DENEME_ARALIGI = GUN, EN_GENC = GUN, YENILEME_ARALIGI = 7 * GUN;
const DOSYA = /^instagram(-[A-Za-z0-9_.-]+)?\.json$/;

const okuJ = (f, v) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return v; } };
// tmp + rename, so a crash never leaves half a token file
const yazJ = (f, j) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp-' + process.pid; fs.writeFileSync(t, JSON.stringify(j, null, 2)); fs.renameSync(t, f); };
const hesapAdi = f => { const m = f.match(DOSYA); return m[1] ? m[1].slice(1) : 'oxygbio'; };
const gizle = (s, token) => token ? String(s).split(token).join('***') : String(s);

// when the token was last issued: yenilendi, else kaydedildi
const dogum = a => Date.parse(a.yenilendi || a.kaydedildi);
function zamaniGeldi(a, simdi) {
  const t = dogum(a);
  if (isNaN(t)) return { gerek: false, neden: 'yenilendi/kaydedildi tarihi yok' };
  const yas = simdi - t;
  if (yas < EN_GENC) return { gerek: false, neden: 'token 24 saatten genç' };
  if (yas <= YENILEME_ARALIGI) return { gerek: false, neden: 'son yenilemeden beri 7 gün geçmedi' };
  return { gerek: true };
}

async function tokenYenile(dosya, { simdi = Date.now(), getir = fetch } = {}) {
  const a = okuJ(dosya, null);
  if (!a || !a.token) throw new Error('kayıtlı token yok');
  let r;
  try {
    const res = await getir(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(a.token)}`, { signal: AbortSignal.timeout(30000) });
    r = await res.json();
  } catch (e) { throw new Error('bağlantı hatası: ' + gizle(e.message, a.token).slice(0, 200)); }
  if (!r || !r.access_token) throw new Error('yenilenemedi: ' + gizle(JSON.stringify((r && r.error) || r), a.token).slice(0, 200));
  yazJ(dosya, { ...a, token: r.access_token, yenilendi: new Date(simdi).toISOString() });
  return { gun: Math.round((+r.expires_in || 0) / 86400) };
}

async function otoYenile({ simdi = Date.now(), dir = AYAR_DIR, durumF = DURUM_F, getir = fetch } = {}) {
  let dosyalar = [];
  try { dosyalar = fs.readdirSync(dir).filter(f => DOSYA.test(f)); } catch (e) { return []; }
  const durum = okuJ(durumF, {}), out = [];
  for (const f of dosyalar) {
    const hesap = hesapAdi(f), d = durum[hesap] || {};
    if (d.son_deneme && simdi - Date.parse(d.son_deneme) < DENEME_ARALIGI) { out.push({ hesap, sonuc: 'beklemede' }); continue; }
    const a = okuJ(path.join(dir, f), null);
    const z = a ? zamaniGeldi(a, simdi) : { gerek: false, neden: 'token dosyası okunamadı' };
    const kayit = { son_deneme: new Date(simdi).toISOString() };
    if (!z.gerek) { durum[hesap] = { ...d, ...kayit, son_sonuc: 'erken', neden: z.neden }; delete durum[hesap].hata; out.push({ hesap, sonuc: 'erken', neden: z.neden }); continue; }
    try {
      const r = await tokenYenile(path.join(dir, f), { simdi, getir });
      durum[hesap] = { ...kayit, son_sonuc: 'yenilendi', yenilendi: kayit.son_deneme, gun: r.gun };
      out.push({ hesap, sonuc: 'yenilendi' });
    } catch (e) {
      durum[hesap] = { ...d, ...kayit, son_sonuc: 'hata', hata: e.message };
      out.push({ hesap, sonuc: 'hata', neden: e.message });
    }
  }
  yazJ(durumF, durum);
  return out;
}

// health warnings for the panel / `kuyruk.js durum`: the last refresh of these accounts failed
function uyarilar(durumF = DURUM_F, hesap) {
  const d = okuJ(durumF, {});
  return Object.entries(d).filter(([h, x]) => x && x.son_sonuc === 'hata' && (!hesap || h === hesap))
    .map(([h, x]) => `Instagram anahtarı yenilenemedi (@${h}): ${x.hata}`);
}

module.exports = { otoYenile, tokenYenile, zamaniGeldi, uyarilar, DURUM_F };
