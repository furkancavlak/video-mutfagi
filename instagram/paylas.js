#!/usr/bin/env node
// Instagram Reels publisher — official Instagram API (Instagram Login). No dependencies, Node 18+.
//
//   node instagram/paylas.js kaydet <token-dosyasi>     save + verify a token (file is read, never printed)
//   node instagram/paylas.js kontrol                    show which account is connected
//   node instagram/paylas.js yenile                     refresh the long-lived token (60 days)
//   (kaydet|kontrol|yenile|gonder accept --hesap <ad>: token in instagram-<ad>.json; default oxygbio = instagram.json)
//   node instagram/paylas.js gonder <video.mp4> [--aciklama "..."] [--kuru] [--hazirla]
//     --kuru     only checks the tunnel; nothing is sent to Instagram
//     --hazirla  Instagram downloads and processes the video, but it is NOT published
//     --adres    the file is already at a public https address (server); skips the tunnel
//
// Instagram fetches Reels from a public URL, so `gonder` serves the file from this computer
// through a temporary Cloudflare quick tunnel (no account needed) only while Instagram downloads it.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');

const API = 'https://graph.instagram.com/' + (process.env.IG_API_VERSION || 'v23.0');
const AYAR_DIR = path.join(os.homedir(), '.video-mutfagi');
// one token file per account: oxygbio (default) keeps the original name, others get instagram-<hesap>.json
const ayarYolu = hesap => { const h = String(hesap || '').replace(/^@/, '').trim().toLowerCase(); return path.join(AYAR_DIR, !h || h === 'oxygbio' ? 'instagram.json' : `instagram-${h}.json`); };
const KAYIT = path.join(__dirname, '..', 'kayit', 'paylasimlar.jsonl');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = msg => { console.error('HATA: ' + msg); process.exit(1); };
const readAyar = hesap => { try { return JSON.parse(fs.readFileSync(ayarYolu(hesap), 'utf8')) } catch (e) { return null } };
const writeAyar = (a, hesap) => { fs.mkdirSync(AYAR_DIR, { recursive: true }); fs.writeFileSync(ayarYolu(hesap), JSON.stringify(a, null, 2)); };

async function graph(method, p, params = {}) {
  const url = new URL(API + p);
  const opts = { method };
  if (method === 'GET') for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  else opts.body = new URLSearchParams(params);
  // GETs (status polls) survive dropped connections, e.g. while a slow upload line is busy serving the video.
  // POSTs are never retried: a retried publish could post twice.
  let r;
  for (let i = 0; ; i++) {
    try { r = await fetch(url, { ...opts, signal: AbortSignal.timeout(60000) }); break; }
    catch (e) {
      if (method !== 'GET' || i >= 8) throw new Error(`${method} ${p}: bağlantı koptu (${(e.cause && e.cause.code) || e.name})`);
      await sleep(5000 * Math.min(i + 1, 4));
    }
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${method} ${p}: ${j.error ? j.error.message + ' (kod ' + j.error.code + ')' : r.status}`);
  return j;
}

async function me(token) {
  return graph('GET', '/me', { fields: 'user_id,username,account_type,media_count', access_token: token });
}

// --- local file server with Range support (Instagram's fetcher may request byte ranges)
function serve(file) {
  const size = fs.statSync(file).size;
  const name = '/' + encodeURIComponent(path.basename(file).replace(/[^a-zA-Z0-9._-]/g, '_'));
  const hits = [];
  const srv = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.headers.range || 'full'}`);
    if (req.url.split('?')[0] !== name) { res.writeHead(404); return res.end(); }
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    let start = 0, end = size - 1, code = 200;
    if (m) { start = m[1] ? +m[1] : size - +m[2]; end = m[1] && m[2] ? +m[2] : size - 1; code = 206; }
    res.writeHead(code, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
      ...(code === 206 ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    if (req.method === 'HEAD') return res.end();
    const t0 = Date.now(), i = hits.length - 1;
    res.on('close', () => { hits[i] += ` → ${res.writableFinished ? 'tamam' : 'YARIDA KESİLDİ'} ${((res.socket && res.socket.bytesWritten) / 1048576 || 0).toFixed(1)} MB ${((Date.now() - t0) / 1000).toFixed(0)} sn`; });
    fs.createReadStream(file, { start, end }).pipe(res);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, port: srv.address().port, name, hits })));
}

function tunnel(port) {
  return new Promise((ok, no) => {
    const p = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { windowsHide: true });
    let buf = '';
    const t = setTimeout(() => { p.kill(); no(new Error('tünel 60 sn içinde açılmadı')) }, 60e3);
    // the real address is a random multi-word subdomain; api.trycloudflare.com only appears in error messages (e.g. 429 rate limit)
    const on = d => {
      buf += d;
      if (/429|Too Many Requests/i.test(buf)) { clearTimeout(t); p.kill(); return no(new Error('Cloudflare şu an yeni geçici adres vermiyor (kısa sürede çok deneme). 10-15 dk sonra tekrar dene.')); }
      const m = /https:\/\/(?!api\.)[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/.exec(buf);
      if (m) { clearTimeout(t); ok({ proc: p, url: m[0] }); }
    };
    p.stdout.on('data', on); p.stderr.on('data', on);
    p.on('error', e => { clearTimeout(t); no(new Error('cloudflared bulunamadı: ' + e.message)) });
  });
}

async function waitReachable(url) {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(url, { method: 'HEAD' }); if (r.ok) return; } catch (e) {}
    await sleep(2000);
  }
  throw new Error('tünel adresi dışarıdan açılmadı: ' + url);
}

// adres: the video already sits at a public https address (e.g. on a server) -> no local server, no tunnel
async function gonder(file, aciklama, kuru, hazirla, adres, hesap) {
  if (!adres && !fs.existsSync(file)) throw new Error('video yok: ' + file);
  const ayar = readAyar(hesap);
  if (!kuru && !ayar) throw new Error('önce token kaydet: node instagram/paylas.js kaydet <dosya>' + (hesap ? ' --hesap ' + hesap : ''));
  const s = adres ? { hits: [], srv: { close() {} } } : await serve(file);
  let tn;
  try {
    let videoUrl = adres;
    if (!adres) {
      console.log('1/5 Video internete geçici olarak açılıyor…');
      tn = await tunnel(s.port);
      videoUrl = tn.url + s.name;
    } else console.log('1/5 Video şu adresten verilecek: ' + adres);
    await waitReachable(videoUrl);
    console.log('    adres hazır');
    if (kuru) {
      const r = await fetch(videoUrl, { headers: { Range: 'bytes=0-1023' } });
      console.log(`KURU KOŞU: dışarıdan erişim ${r.status}, ${(await r.arrayBuffer()).byteLength} bayt. Instagram'a bir şey gönderilmedi.`);
      return { kuru: true };
    }
    console.log('2/5 Instagram\'a bildiriliyor…');
    const c = await graph('POST', `/${ayar.user_id}/media`, { media_type: 'REELS', video_url: videoUrl, caption: aciklama || '', share_to_feed: 'true', access_token: ayar.token });
    console.log('3/5 Instagram videoyu indirip işliyor (1-5 dk)…');
    let st;
    for (let i = 0; i < 90; i++) {
      await sleep(5000);
      st = await graph('GET', `/${c.id}`, { fields: 'status_code,status', access_token: ayar.token });
      if (st.status_code === 'FINISHED') break;
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error('Instagram videoyu kabul etmedi: ' + (st.status || st.status_code) + ` | videoya gelen istekler (${s.hits.length}): ` + (s.hits.slice(0, 8).join(', ') || 'HİÇ — Instagram adrese ulaşamadı'));
    }
    if (st.status_code !== 'FINISHED') throw new Error('Instagram 7,5 dk içinde işlemeyi bitirmedi');
    if (hazirla) { console.log(`HAZIRLANDI, PAYLAŞILMADI: Instagram videoyu kabul etti (konteyner ${c.id}). Yayınlanmadı; 24 saat içinde kendiliğinden silinir.`); return { hazirlandi: c.id }; }
    console.log('4/5 Paylaşılıyor…');
    let pub;
    // if this call fails we cannot know whether Instagram published anyway: callers must NOT retry such an error
    try { pub = await graph('POST', `/${ayar.user_id}/media_publish`, { creation_id: c.id, access_token: ayar.token }); }
    catch (e) { e.yayinBelirsiz = true; e.message += ' — yayınlanmış olabilir, tekrar göndermeden önce hesaba bak'; throw e; }
    const info = await graph('GET', `/${pub.id}`, { fields: 'permalink,timestamp', access_token: ayar.token }).catch(() => ({ permalink: '(link alınamadı, media ' + pub.id + ')' }));
    fs.mkdirSync(path.dirname(KAYIT), { recursive: true });
    fs.appendFileSync(KAYIT, JSON.stringify({ zaman: new Date().toISOString(), dosya: path.basename(file), media_id: pub.id, link: info.permalink, aciklama }) + '\n');
    console.log('5/5 YAYINDA: ' + info.permalink);
    return { media_id: pub.id, link: info.permalink, zaman: info.timestamp };
  } finally {
    if (tn) tn.proc.kill();
    s.srv.close();
  }
}

// Reel results. Instagram fills these in over the first days; reading them is free and changes nothing.
async function sonuc(mediaId, hesap) {
  const ayar = readAyar(hesap); if (!ayar) throw new Error('kayıtlı token yok');
  const metrik = 'views,reach,likes,comments,shares,saved,total_interactions';
  const j = await graph('GET', `/${mediaId}/insights`, { metric: metrik, access_token: ayar.token });
  const out = {};
  for (const m of j.data || []) out[m.name] = (m.values && m.values[0] ? m.values[0].value : m.total_value && m.total_value.value) ?? null;
  return out;
}

module.exports = { gonder, sonuc, graph, readAyar, me, ayarYolu };
if (require.main !== module) return;

(async () => {
  const argv = process.argv.slice(2), hi = argv.indexOf('--hesap');
  const hesap = hi >= 0 ? argv[hi + 1] : null;
  if (hi >= 0) { if (!hesap || hesap.startsWith('--')) fail('--hesap için bir ad ver'); argv.splice(hi, 2); }
  const [cmd, a1, ...rest] = argv;
  if (cmd === 'kaydet') {
    if (!a1 || !fs.existsSync(a1)) fail('token dosyası yok');
    const token = fs.readFileSync(a1, 'utf8').trim();
    const m = await me(token);
    writeAyar({ token, user_id: m.user_id, username: m.username, kaydedildi: new Date().toISOString() }, hesap);
    console.log(`Bağlandı: @${m.username} (${m.account_type}, ${m.media_count} gönderi). Token ${ayarYolu(hesap)} içinde.`);
  } else if (cmd === 'kontrol') {
    const a = readAyar(hesap); if (!a) fail('kayıtlı token yok');
    const m = await me(a.token);
    console.log(`Bağlı hesap: @${m.username} (${m.account_type}, ${m.media_count} gönderi)`);
  } else if (cmd === 'yenile') {
    const a = readAyar(hesap); if (!a) fail('kayıtlı token yok');
    const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(a.token)}`).then(r => r.json());
    if (!r.access_token) fail('yenilenemedi: ' + JSON.stringify(r.error || r));
    writeAyar(Object.assign(a, { token: r.access_token, yenilendi: new Date().toISOString() }), hesap);
    console.log(`Token yenilendi, ${Math.round(r.expires_in / 86400)} gün geçerli.`);
  } else if (cmd === 'gonder') {
    const i = rest.indexOf('--aciklama');
    const j = rest.indexOf('--adres');
    await gonder(a1, i >= 0 ? rest[i + 1] : '', rest.includes('--kuru'), rest.includes('--hazirla'), j >= 0 ? rest[j + 1] : null, hesap);
  } else {
    console.log('Kullanım: kaydet <token-dosyasi> | kontrol | yenile | gonder <video.mp4> [--aciklama "..."] [--kuru] [--hazirla] [--adres https://...]  (hepsine: --hesap <ad>)');
  }
})().catch(e => fail(e.message));
