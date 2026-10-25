#!/usr/bin/env node
// Local control panel: the jobs that need no AI, in the browser. Queue, calendar, video preview, results.
//
//   node panel/panel.js [--port 4747] [--acma] [--kok <repo>]
//
// Listens on 127.0.0.1 only. Every API call carries a random key made at start (it is in the printed link),
// so other sites open in the same browser cannot drive the panel. Queue changes go through kuyruk/kuyruk.js
// itself, so the panel and the command line always behave the same. Instagram is only read (no posting here).
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const KOK = arg('--kok') ? path.resolve(arg('--kok')) : path.join(__dirname, '..');     // --kok: show another copy of the repo
const KUYRUK = path.join(KOK, 'kuyruk'), KUYRUK_JS = path.join(KUYRUK, 'kuyruk.js');
const ARAYUZ = path.join(__dirname, 'arayuz');
const ONBELLEK = path.join(KOK, 'kayit', 'panel-instagram.json');
const PORT = +(arg('--port') || 4747);
const ANAHTAR = crypto.randomBytes(18).toString('base64url');

const okuJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const isler = alt => {
  const d = path.join(KUYRUK, alt);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => ({ id: f.replace(/\.json$/, ''), ...okuJ(path.join(d, f)) }));
};
const kuyrukCalistir = args => {
  const r = spawnSync(process.execPath, [KUYRUK_JS, ...args], { cwd: KOK, encoding: 'utf8', timeout: 120e3 });
  const cikti = ((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status !== 0) throw new Error(cikti.replace(/^HATA:\s*/m, '').slice(0, 400) || 'kuyruk komutu başarısız');
  return cikti;
};

// --- what the panel shows
function videolar() {
  const v = path.join(KOK, 'videolar'), out = [];
  for (const ad of fs.existsSync(v) ? fs.readdirSync(v) : []) {
    const cikti = path.join(v, ad, 'cikti');
    if (ad.startsWith('_') || !fs.existsSync(cikti)) continue;
    const bilgi = okuJ(path.join(v, ad, 'video.json')) || {};
    for (const f of fs.readdirSync(cikti).filter(f => f.endsWith('.mp4'))) {
      const st = fs.statSync(path.join(cikti, f));
      out.push({ ad, dosya: f, yol: path.posix.join('videolar', ad, 'cikti', f), baslik: bilgi.baslik || ad, aciklama: bilgi.aciklama_instagram || bilgi.baslik || '', mb: +(st.size / 1048576).toFixed(1), zaman: st.mtime.toISOString() });
    }
  }
  return out.sort((a, b) => b.zaman.localeCompare(a.zaman));
}

function saglik() {
  const d = okuJ(path.join(KUYRUK, 'durum.json')), uyari = [];
  const zaman = spawnSync(process.execPath, [KUYRUK_JS, 'zamanlayici', 'durum'], { cwd: KOK, encoding: 'utf8' });
  const zamanlayici = /kurulu\./i.test(zaman.stdout || '') && !/DEĞİL/.test(zaman.stdout || '');
  const ig = okuJ(path.join(os.homedir(), '.video-mutfagi', 'instagram.json'));
  const igGun = ig ? Math.max(0, Math.round(60 - (Date.now() - new Date(ig.yenilendi || ig.kaydedildi)) / 864e5)) : null;
  const bekleyen = isler('bekleyen');
  if (!zamanlayici) uyari.push({ tur: 'zamanlayici', yazi: 'Zamanlayıcı kapalı' });
  else if (!d || Date.now() - new Date(d.son_calisma) > 45 * 60e3) uyari.push({ tur: 'uyku', yazi: '45 dk’dır çalışmadı' });
  if (!ig) uyari.push({ tur: 'instagram', yazi: 'Instagram bağlı değil' });
  else if (igGun < 10) uyari.push({ tur: 'instagram', yazi: `Instagram anahtarı ${igGun} gün` });
  const gec = bekleyen.filter(j => !j.onay_gerekli && j.ne_zaman && new Date(j.ne_zaman) < Date.now() - 30 * 60e3);
  if (gec.length) uyari.push({ tur: 'gecikme', yazi: `${gec.length} video gecikti` });
  const hatali = isler('hatali');
  if (hatali.length) uyari.push({ tur: 'hata', yazi: `${hatali.length} video hatalı` });
  return { zamanlayici, son_calisma: d && d.son_calisma, son_sonuc: d && d.son_sonuc, makine: d ? d.makine : os.hostname(), instagram: { bagli: !!ig, gun: igGun, hesap: ig && ig.username }, uyari };
}

function ozet() {
  const bekleyen = isler('bekleyen').sort((a, b) => String(a.ne_zaman).localeCompare(String(b.ne_zaman)));
  const paylasilan = isler('paylasilan').sort((a, b) => String(b.paylasildi).localeCompare(String(a.paylasildi)));
  const ayar = Object.assign(okuJ(path.join(KUYRUK, 'ayar-ornek.json')) || {}, okuJ(path.join(KOK, 'ayarlar', 'kuyruk.json')) || {});
  const temiz = j => ({ id: j.id, mp4: j.mp4, aciklama: j.aciklama, ne_zaman: j.ne_zaman, onay_gerekli: !!j.onay_gerekli, kaynak: j.kaynak, hata: j.son_hata || null, paylasildi: j.paylasildi, link: j.link, sonuc: j.sonuc || null });
  return { saglik: saglik(), kuyruk: bekleyen.map(temiz), paylasilan: paylasilan.map(temiz), hatali: isler('hatali').map(temiz), videolar: videolar(), saatler: ayar.paylasim_saatleri || [], gunluk: ayar.gunluk_en_fazla };
}

// Instagram: the account's own posts with their numbers (read only, cached 15 min; one call per post)
let igSurer = null;
async function instagram(yenile) {
  const eski = okuJ(ONBELLEK);
  if (!yenile && eski && Date.now() - new Date(eski.zaman) < 15 * 60e3) return eski;
  if (igSurer) return igSurer;
  igSurer = (async () => {
    const P = require(path.join(KOK, 'instagram', 'paylas.js')), a = P.readAyar();
    if (!a) return { zaman: new Date().toISOString(), bagli: false, gonderiler: [] };
    const hesap = await P.me(a.token).catch(() => null);
    const m = await P.graph('GET', '/me/media', { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url', limit: 30, access_token: a.token });
    const gonderiler = [];
    for (const g of m.data || []) {
      if (g.media_type !== 'VIDEO') continue;
      const s = await P.sonuc(g.id).catch(() => null);
      gonderiler.push({ id: g.id, baslik: (g.caption || '').split('\n')[0].slice(0, 90), link: g.permalink, zaman: g.timestamp, kapak: g.thumbnail_url, ...(s || {}) });
    }
    const j = { zaman: new Date().toISOString(), bagli: true, hesap: hesap && hesap.username, gonderiler };
    fs.mkdirSync(path.dirname(ONBELLEK), { recursive: true });
    fs.writeFileSync(ONBELLEK, JSON.stringify(j, null, 1));
    return j;
  })().finally(() => { igSurer = null; });
  return igSurer;
}

// --- http
const TUR = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const gonder = (res, kod, govde, tur = 'application/json; charset=utf-8') => { res.writeHead(kod, { 'Content-Type': tur, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(typeof govde === 'string' || Buffer.isBuffer(govde) ? govde : JSON.stringify(govde)); };
const govdeOku = req => new Promise((ok, red) => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) red(new Error('çok büyük')); }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { red(new Error('bozuk istek')); } }); });
const kimlikGecerli = id => typeof id === 'string' && /^[\w.-]+$/.test(id) && fs.existsSync(path.join(KUYRUK, 'bekleyen', id + '.json'));

// "2026-10-27T19:00" from the browser's datetime-local -> the form kuyruk.js expects
const zamanMetni = z => { const m = String(z || '').match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/); if (!m) throw new Error('zaman anlaşılmadı'); return `${m[1]} ${m[2]}`; };

function videoAkit(req, res, rel) {
  const dosya = path.resolve(KOK, rel || '');
  if (!dosya.startsWith(path.join(KOK, 'videolar') + path.sep) || !dosya.endsWith('.mp4') || !fs.existsSync(dosya)) return gonder(res, 404, { hata: 'video yok' });
  const boy = fs.statSync(dosya).size, r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (!r) { res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': boy, 'Accept-Ranges': 'bytes' }); return fs.createReadStream(dosya).pipe(res); }
  const bas = r[1] ? +r[1] : Math.max(0, boy - +r[2]), son = r[1] && r[2] ? Math.min(+r[2], boy - 1) : boy - 1;
  if (bas > son || bas >= boy) { res.writeHead(416, { 'Content-Range': `bytes */${boy}` }); return res.end(); }
  res.writeHead(206, { 'Content-Type': 'video/mp4', 'Content-Length': son - bas + 1, 'Content-Range': `bytes ${bas}-${son}/${boy}`, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(dosya, { start: bas, end: son }).pipe(res);
}

const sunucu = http.createServer(async (req, res) => {
  try {
    // only this machine, only our own host name (blocks DNS-rebinding tricks)
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return gonder(res, 403, { hata: 'yalnız bu bilgisayardan' });
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname.startsWith('/api/') || u.pathname === '/video') {
      const verilen = req.headers['x-panel'] || u.searchParams.get('k');
      if (verilen !== ANAHTAR) return gonder(res, 401, { hata: 'Paneli terminaldeki linkle aç.' });
    }
    if (u.pathname === '/video') return videoAkit(req, res, u.searchParams.get('p'));
    if (req.method === 'GET' && u.pathname === '/api/ozet') return gonder(res, 200, ozet());
    if (req.method === 'GET' && u.pathname === '/api/instagram') return gonder(res, 200, await instagram(u.searchParams.has('yenile')));
    if (req.method === 'POST' && u.pathname.startsWith('/api/kuyruk/')) {
      const b = await govdeOku(req), is = u.pathname.split('/').pop();
      if (is === 'ekle') {
        const mp4 = path.resolve(KOK, b.mp4 || '');
        if (!mp4.startsWith(path.join(KOK, 'videolar') + path.sep) || !fs.existsSync(mp4)) throw new Error('video bulunamadı');
        const a = [mp4, '--aciklama', String(b.aciklama || '')];
        if (b.zaman) a.push('--zaman', zamanMetni(b.zaman));
        if (b.onay_gerekli) a.push('--onay-gerekli');
        return gonder(res, 200, { tamam: true, mesaj: kuyrukCalistir(['ekle', ...a]) });
      }
      if (!kimlikGecerli(b.id)) throw new Error('kuyrukta böyle bir iş yok');
      if (is === 'onayla' || is === 'iptal') return gonder(res, 200, { tamam: true, mesaj: kuyrukCalistir([is, b.id]) });
      if (is === 'zaman') {
        // same validation as kuyruk.js: a local "YYYY-MM-DD HH:MM", never in the past
        const [g, s] = zamanMetni(b.zaman).split(' '), [y, a2, d2] = g.split('-').map(Number), [h, m] = s.split(':').map(Number);
        const t = new Date(y, a2 - 1, d2, h, m);
        if (t < Date.now()) throw new Error('geçmiş bir saat seçilemez');
        const f = path.join(KUYRUK, 'bekleyen', b.id + '.json'), j = okuJ(f);
        fs.writeFileSync(f, JSON.stringify({ ...j, ne_zaman: t.toISOString(), sonraki_deneme: undefined }, null, 2));
        return gonder(res, 200, { tamam: true });
      }
    }
    if (req.method === 'POST' && u.pathname === '/api/sonuclar') return gonder(res, 200, { tamam: true, mesaj: kuyrukCalistir(['sonuclar']) });
    if (u.pathname.startsWith('/api/')) return gonder(res, 404, { hata: 'yok' });
    // the interface files
    const rel = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
    const dosya = path.resolve(ARAYUZ, rel);
    if (!dosya.startsWith(ARAYUZ + path.sep) || !fs.existsSync(dosya) || fs.statSync(dosya).isDirectory()) return gonder(res, 404, 'yok', 'text/plain; charset=utf-8');
    gonder(res, 200, fs.readFileSync(dosya), TUR[path.extname(dosya)] || 'application/octet-stream');
  } catch (e) { gonder(res, 400, { hata: e.message }); }
});

sunucu.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `\nHATA: ${PORT} portu dolu. Başka port: node panel/panel.js --port 4748\n` : e.message); process.exit(1); });
sunucu.listen(PORT, '127.0.0.1', () => {
  const link = `http://127.0.0.1:${PORT}/#k=${ANAHTAR}`;
  console.log(`\nKontrol paneli açık:\n  ${link}\n\nKapatmak için bu pencerede Ctrl+C.`);
  if (!process.argv.includes('--acma')) {
    const ac = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', link]] : process.platform === 'darwin' ? ['open', [link]] : ['xdg-open', [link]];
    spawn(ac[0], ac[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  }
});
