#!/usr/bin/env node
// Local control panel: everything that needs a click, not a conversation.
// Ideas (pick, reject, write the script), production (which step, audit score, continue), the posting queue on
// this computer and on a server, the calendar, results and the lessons drawn from them.
//
//   node panel/panel.js [--port 4747] [--acma] [--kok <repo>]
//   node panel/panel.js --ozet                    print the queue summary as JSON (the panel uses it over SSH)
//   node panel/panel.js --zaman <is-id> "YYYY-MM-DD HH:MM"
//
// Listens on 127.0.0.1 only; every API call carries a random key made at start (it is in the printed link).
// The panel never posts and never spends by itself: queue changes go through kuyruk/kuyruk.js, production through
// konu/radar.js, and the one step that spends (voice) needs an explicit "Onayla ve devam" click.
// Server: ayarlar/panel.json → "sunucu" (copy panel/ayar-ornek.json). Reached with your own `ssh`.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const KOK = arg('--kok') ? path.resolve(arg('--kok')) : path.join(__dirname, '..');     // --kok: show another copy of the repo
const KUYRUK = path.join(KOK, 'kuyruk'), KUYRUK_JS = path.join(KUYRUK, 'kuyruk.js'), RADAR_JS = path.join(KOK, 'konu', 'radar.js');
const ARAYUZ = path.join(__dirname, 'arayuz');
const KAYIT = path.join(KOK, 'kayit'), ISLER = path.join(KAYIT, 'panel-isler');
const ONBELLEK = path.join(KAYIT, 'panel-instagram.json'), DERSLER = path.join(KAYIT, 'dersler.json');
const PORT = +(arg('--port') || 4747);
const ANAHTAR = crypto.randomBytes(18).toString('base64url');

const okuJ = (f, v = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return v; } };
const icinde = (f, d) => path.resolve(f).startsWith(path.resolve(d) + path.sep);
const isler = alt => {
  const d = path.join(KUYRUK, alt);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => ({ id: f.replace(/\.json$/, ''), ...okuJ(path.join(d, f), {}) }));
};
const nodeCalistir = (betik, args, sure = 120e3) => {
  const r = spawnSync(process.execPath, [betik, ...args], { cwd: KOK, encoding: 'utf8', timeout: sure });
  const cikti = ((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status !== 0) throw new Error(cikti.replace(/^[\s\S]*HATA:\s*/m, '').slice(0, 400) || 'komut başarısız');
  return cikti;
};
// "2026-10-27T19:00" from the browser -> the "YYYY-MM-DD HH:MM" kuyruk.js expects
const zamanMetni = z => { const m = String(z || '').match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/); if (!m) throw new Error('zaman anlaşılmadı'); return `${m[1]} ${m[2]}`; };

// ---------- the posting queue on this machine
function saglik() {
  const d = okuJ(path.join(KUYRUK, 'durum.json')), uyari = [];
  const z = spawnSync(process.execPath, [KUYRUK_JS, 'zamanlayici', 'durum'], { cwd: KOK, encoding: 'utf8' }).stdout || '';
  const zamanlayici = /kurulu\./i.test(z) && !/DEĞİL/.test(z);
  const ig = okuJ(path.join(os.homedir(), '.video-mutfagi', 'instagram.json'));
  const igGun = ig ? Math.max(0, Math.round(60 - (Date.now() - new Date(ig.yenilendi || ig.kaydedildi)) / 864e5)) : null;
  if (!zamanlayici) uyari.push('Otomatik paylaşım kapalı');
  else if (!d || Date.now() - new Date(d.son_calisma) > 45 * 60e3) uyari.push('Zamanlayıcı 45 dk’dır çalışmadı');
  if (!ig) uyari.push('Instagram bağlı değil');
  else if (igGun < 10) uyari.push(`Instagram anahtarı ${igGun} gün`);
  const gec = isler('bekleyen').filter(j => !j.onay_gerekli && j.ne_zaman && new Date(j.ne_zaman) < Date.now() - 30 * 60e3);
  if (gec.length) uyari.push(`${gec.length} video gecikti`);
  if (isler('hatali').length) uyari.push(`${isler('hatali').length} video hatalı`);
  return { zamanlayici, son_calisma: d && d.son_calisma, son_sonuc: d && d.son_sonuc, makine: d ? d.makine : os.hostname(), instagram: { bagli: !!ig, gun: igGun }, uyari };
}
function kuyrukOzet() {
  const temiz = j => ({ id: j.id, mp4: j.mp4, aciklama: j.aciklama, ne_zaman: j.ne_zaman, onay_gerekli: !!j.onay_gerekli, kaynak: j.kaynak, hata: j.son_hata || null, kontrol_et: !!j.kontrol_et, paylasildi: j.paylasildi, link: j.link, sonuc: j.sonuc || null });
  const ayar = Object.assign(okuJ(path.join(KUYRUK, 'ayar-ornek.json'), {}), okuJ(path.join(KOK, 'ayarlar', 'kuyruk.json'), {}));
  return {
    saglik: saglik(),
    kuyruk: isler('bekleyen').sort((a, b) => String(a.ne_zaman).localeCompare(String(b.ne_zaman))).map(temiz),
    paylasilan: isler('paylasilan').sort((a, b) => String(b.paylasildi).localeCompare(String(a.paylasildi))).map(temiz),
    hatali: isler('hatali').map(temiz), saatler: ayar.paylasim_saatleri || [], gunluk: ayar.gunluk_en_fazla,
  };
}
function zamanDegistir(id, zaman) {
  const f = path.join(KUYRUK, 'bekleyen', String(id) + '.json');
  if (!/^[\w.-]+$/.test(String(id)) || !fs.existsSync(f)) throw new Error('kuyrukta böyle bir iş yok');
  const [g, s] = zamanMetni(zaman).split(' '), [y, a, d] = g.split('-').map(Number), [h, m] = s.split(':').map(Number);
  const t = new Date(y, a - 1, d, h, m);
  if (t < Date.now()) throw new Error('geçmiş bir saat seçilemez');
  const { sonraki_deneme, ...j } = okuJ(f);
  fs.writeFileSync(f, JSON.stringify({ ...j, ne_zaman: t.toISOString() }, null, 2));
}

// ---------- the server, through the user's own ssh (keys/agent are ssh's business, the panel stores no password)
const sunucuAyar = () => (okuJ(path.join(KOK, 'ayarlar', 'panel.json'), {}) || {}).sunucu || null;
const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
function sunucuda(komut, sure = 60e3) {
  const S = sunucuAyar(); if (!S) throw new Error('Sunucu tanımlı değil (ayarlar/panel.json).');
  const ic = `cd ${q(S.kok)} && ${S.node ? q(S.node) : 'node'} ${komut}`;
  const r = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', S.ssh, `${S.on_ek ? S.on_ek + ' ' : ''}bash -lc ${q(ic)}`], { encoding: 'utf8', timeout: sure });
  if (r.error) throw new Error('ssh çalışmadı: ' + r.error.message);
  if (r.status !== 0) throw new Error(((r.stderr || '') + (r.stdout || '')).trim().replace(/^[\s\S]*HATA:\s*/m, '').slice(0, 300) || 'sunucu komutu başarısız');
  return r.stdout;
}
function sunucuyaEkle({ mp4, aciklama, zaman, onay_gerekli }) {
  const S = sunucuAyar(); if (!S) throw new Error('Sunucu tanımlı değil.');
  const yerel = path.resolve(KOK, mp4 || '');
  if (!icinde(yerel, path.join(KOK, 'videolar')) || !fs.existsSync(yerel)) throw new Error('video bulunamadı');
  const ad = path.basename(yerel).replace(/[^\w.-]/g, '-'), gecici = `/tmp/vm-${crypto.randomBytes(6).toString('hex')}.mp4`;
  const up = spawnSync('scp', ['-q', '-o', 'BatchMode=yes', yerel, `${S.ssh}:${gecici}`], { encoding: 'utf8', timeout: 600e3 });
  if (up.status !== 0) throw new Error('video sunucuya gönderilemedi: ' + (up.stderr || '').trim().slice(0, 200));
  const b64 = Buffer.from(String(aciklama || ''), 'utf8').toString('base64');
  const hedef = `videolar/_gelen/${ad}`;
  const ic = `cd ${q(S.kok)} && mkdir -p videolar/_gelen && cp ${gecici} ${q(hedef)} && ${S.node ? q(S.node) : 'node'} kuyruk/kuyruk.js ekle ${q(hedef)} --aciklama "$(echo ${b64} | base64 -d)"${zaman ? ' --zaman ' + q(zamanMetni(zaman)) : ''}${onay_gerekli ? ' --onay-gerekli' : ''}`;
  const r = spawnSync('ssh', ['-o', 'BatchMode=yes', S.ssh, `chmod 644 ${gecici}; ${S.on_ek ? S.on_ek + ' ' : ''}bash -lc ${q(ic)}; s=$?; rm -f ${gecici}; exit $s`], { encoding: 'utf8', timeout: 120e3 });
  if (r.status !== 0) throw new Error(((r.stderr || '') + (r.stdout || '')).trim().slice(0, 300));
  return r.stdout.trim();
}

// ---------- ideas and production
const kanallar = () => fs.readdirSync(path.join(KOK, 'kanal')).filter(k => fs.existsSync(path.join(KOK, 'kanal', k, 'konu.json')));
function fikirler() {
  return kanallar().flatMap(k => ((okuJ(path.join(KOK, 'kanal', k, 'fikirler.json'), {}) || {}).fikirler || []).map(f => ({
    kanal: k, id: f.id, baslik: f.baslik, oncul: f.oncul, kanca: f.kanca, neden: f.neden_uyar, puan: f.puan, durum: f.durum, video: f.video || null,
    kaynak: [...new Set((f.kaynaklar || []).map(x => x.kaynak))].join(', '), link: ((f.kaynaklar || []).find(x => x.url) || {}).url || null,
    zaman: f.guncelleme || f.olusturma, son_not: (f.notlar || []).slice(-1)[0] || null,
  })));
}
const ADIMLAR = [['metin', 'Metin'], ['ses', 'Ses'], ['kurgu', 'Kurgu'], ['denetim', 'Kontrol'], ['kuyruk', 'Sıra']];
function uretimler() {
  const v = path.join(KOK, 'videolar'), fk = fikirler(), out = [];
  for (const ad of fs.existsSync(v) ? fs.readdirSync(v) : []) {
    const dir = path.join(v, ad); if (ad.startsWith('_') || !fs.statSync(dir).isDirectory()) continue;
    const U = okuJ(path.join(dir, 'uretim.json'), {}), A = U.adimlar || {}, video = okuJ(path.join(dir, 'video.json'), {});
    const cikti = path.join(dir, 'cikti'), mp4ler = fs.existsSync(cikti) ? fs.readdirSync(cikti).filter(f => f.endsWith('.mp4')) : [];
    const sayfalar = fs.existsSync(path.join(cikti, 'denetim')) ? fs.readdirSync(path.join(cikti, 'denetim')).filter(f => /^sayfa-\d+\.jpg$/.test(f)).map(f => `videolar/${ad}/cikti/denetim/${f}`) : [];
    const fikir = fk.find(f => f.video === `videolar/${ad}`) || null;
    const durum = {
      metin: A.metin || fs.existsSync(path.join(dir, 'metin.md')) ? 'tamam' : 'bekliyor',
      ses: A.ses ? 'tamam' : A.metin ? 'onay' : 'bekliyor',
      kurgu: A.render || mp4ler.length ? 'tamam' : 'bekliyor',
      denetim: A.denetim ? (A.denetim.puan >= 7 ? 'tamam' : 'takildi') : 'bekliyor',
      kuyruk: A.kuyruk ? 'tamam' : 'bekliyor',
    };
    out.push({
      ad, kanal: U.kanal || (video.kanal || '').split('/').slice(-2, -1)[0] || null, fikir: U.fikir || (fikir && fikir.id), katman: U.katman || (video.sablon ? 'sablon' : null),
      baslik: video.baslik || (fikir && fikir.baslik) || ad, aciklama: video.aciklama_instagram || '', puan: A.denetim ? A.denetim.puan : null, durum,
      metin: fs.existsSync(path.join(dir, 'metin.md')) ? `videolar/${ad}/metin.md` : null,
      rapor: fs.existsSync(path.join(cikti, 'denetim', 'rapor.md')) ? `videolar/${ad}/cikti/denetim/rapor.md` : null, sayfalar,
      mp4: mp4ler.map(f => ({ yol: `videolar/${ad}/cikti/${f}`, mb: +(fs.statSync(path.join(cikti, f)).size / 1048576).toFixed(1), ucretli: /ucretli/.test(f) })),
      zaman: (fs.existsSync(path.join(dir, 'uretim.json')) ? fs.statSync(path.join(dir, 'uretim.json')) : fs.statSync(dir)).mtime.toISOString(),
      not: fikir && fikir.son_not ? fikir.son_not.not : null,
    });
  }
  return out.sort((a, b) => b.zaman.localeCompare(a.zaman));
}
// the audit report's JSON block: score, findings, top 3
function rapor(rel) {
  const f = path.resolve(KOK, rel || '');
  if (!icinde(f, path.join(KOK, 'videolar')) || !f.endsWith('rapor.md') || !fs.existsSync(f)) throw new Error('rapor yok');
  const md = fs.readFileSync(f, 'utf8'), m = md.match(/```json\s*([\s\S]*?)```/);
  let j = null; try { j = m ? JSON.parse(m[1]) : null; } catch {}
  return { puan: j && j.puan, bulgular: (j && j.bulgular) || [], en_iyi_3: (j && j.en_iyi_3) || [] };
}

// ---------- long jobs (collect ideas, write a script, produce, pull numbers, draw lessons): run in the background,
// the panel polls their log. Only these commands can be started, never arbitrary ones.
const calisan = new Map();
function isBaslat(tur, { kanal, id } = {}) {
  if (kanal && !kanallar().includes(kanal)) throw new Error('kanal yok');
  if (id && !/^f-[\w-]+$/.test(id)) throw new Error('fikir yok');
  const T = {
    topla: () => [RADAR_JS, 'topla', kanal], puanla: () => [RADAR_JS, 'puanla', kanal],
    uret: () => [RADAR_JS, 'uret', kanal, id], 'uret-onay': () => [RADAR_JS, 'uret', kanal, id, '--onay'],
    sonuclar: () => [KUYRUK_JS, 'sonuclar'], ders: () => [path.join(__dirname, 'ders.js'), '--kok', KOK],
  }[tur];
  if (!T) throw new Error('bilinmeyen iş');
  for (const [, x] of calisan) if (x.tur === tur && x.kanal === kanal && x.fid === id && x.durum === 'calisiyor') throw new Error('Bu iş zaten çalışıyor.');
  fs.mkdirSync(ISLER, { recursive: true });
  const isId = `${Date.now().toString(36)}-${tur}`, log = path.join(ISLER, isId + '.log');
  const out = fs.openSync(log, 'a');
  const c = spawn(process.execPath, T(), { cwd: KOK, stdio: ['ignore', out, out], windowsHide: true });
  const kayit = { id: isId, tur, kanal, fid: id, durum: 'calisiyor', bas: new Date().toISOString(), pid: c.pid };
  calisan.set(isId, kayit);
  c.on('exit', kod => { kayit.durum = kod === 0 ? 'bitti' : 'hata'; kayit.son = new Date().toISOString(); fs.closeSync(out); });
  return kayit;
}
function isListesi() {
  return [...calisan.values()].sort((a, b) => b.bas.localeCompare(a.bas)).slice(0, 12).map(x => {
    const log = path.join(ISLER, x.id + '.log');
    const metin = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).filter(l => l.trim() && !/hf-progress|Render:trace|█|░/.test(l)) : [];
    return { ...x, satirlar: metin.slice(-14) };
  });
}

// ---------- Instagram: the account's own posts with their numbers (read only, cached 15 min)
let igSurer = null;
async function instagram(yenile) {
  const eski = okuJ(ONBELLEK);
  if (!yenile && eski && Date.now() - new Date(eski.zaman) < 15 * 60e3) return eski;
  if (igSurer) return igSurer;
  igSurer = (async () => {
    const P = require(path.join(KOK, 'instagram', 'paylas.js')), a = P.readAyar();
    if (!a) return { zaman: new Date().toISOString(), bagli: false, gonderiler: [] };
    const hesap = await P.me(a.token).catch(() => null);
    const m = await P.graph('GET', '/me/media', { fields: 'id,caption,media_type,permalink,timestamp', limit: 30, access_token: a.token });
    const gonderiler = [];
    for (const g of m.data || []) {
      if (g.media_type !== 'VIDEO') continue;
      const s = await P.sonuc(g.id).catch(() => null);
      gonderiler.push({ id: g.id, baslik: (g.caption || '').split('\n')[0].slice(0, 90), aciklama: g.caption || '', link: g.permalink, zaman: g.timestamp, ...(s || {}) });
    }
    const j = { zaman: new Date().toISOString(), bagli: true, hesap: hesap && hesap.username, gonderiler };
    fs.mkdirSync(KAYIT, { recursive: true });
    fs.writeFileSync(ONBELLEK, JSON.stringify(j, null, 1));
    return j;
  })().finally(() => { igSurer = null; });
  return igSurer;
}

// ---------- http
const TUR = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/plain; charset=utf-8' };
const gonder = (res, kod, govde, tur = 'application/json; charset=utf-8') => { res.writeHead(kod, { 'Content-Type': tur, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(typeof govde === 'string' || Buffer.isBuffer(govde) ? govde : JSON.stringify(govde)); };
const govdeOku = req => new Promise((ok, red) => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) red(new Error('çok büyük')); }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { red(new Error('bozuk istek')); } }); });

function dosyaVer(req, res, rel) {
  const f = path.resolve(KOK, rel || ''), uz = path.extname(f);
  if (!icinde(f, path.join(KOK, 'videolar')) || !['.mp4', '.jpg', '.png', '.md'].includes(uz) || !fs.existsSync(f)) return gonder(res, 404, { hata: 'dosya yok' });
  if (uz !== '.mp4') return gonder(res, 200, fs.readFileSync(f), TUR[uz]);
  const boy = fs.statSync(f).size, r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (!r) { res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': boy, 'Accept-Ranges': 'bytes' }); return fs.createReadStream(f).pipe(res); }
  const bas = r[1] ? +r[1] : Math.max(0, boy - +r[2]), son = r[1] && r[2] ? Math.min(+r[2], boy - 1) : boy - 1;
  if (bas > son || bas >= boy) { res.writeHead(416, { 'Content-Range': `bytes */${boy}` }); return res.end(); }
  res.writeHead(206, { 'Content-Type': 'video/mp4', 'Content-Length': son - bas + 1, 'Content-Range': `bytes ${bas}-${son}/${boy}`, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(f, { start: bas, end: son }).pipe(res);
}

async function api(req, u) {
  const yol = u.pathname.slice(5), GET = req.method === 'GET', b = GET ? {} : await govdeOku(req);
  const sunucu = (b.makine || u.searchParams.get('makine')) === 'sunucu';
  if (GET && yol === 'ozet') {
    const S = sunucuAyar();
    return { yerel: kuyrukOzet(), sunucu: S ? { ad: S.ad || 'Sunucu' } : null, kanallar: kanallar() };
  }
  if (GET && yol === 'sunucu') return JSON.parse(sunucuda('panel/panel.js --ozet'));
  if (GET && yol === 'fikirler') return fikirler();
  if (GET && yol === 'uretim') return uretimler();
  if (GET && yol === 'rapor') return rapor(u.searchParams.get('p'));
  if (GET && yol === 'isler') return isListesi();
  if (GET && yol === 'instagram') return instagram(u.searchParams.has('yenile'));
  if (GET && yol === 'dersler') return okuJ(DERSLER, []);
  if (!GET && yol === 'is') return isBaslat(b.tur, b);
  // ideas
  if (!GET && yol === 'fikir') {
    if (!kanallar().includes(b.kanal)) throw new Error('kanal yok');
    if (b.is === 'ekle') return { mesaj: nodeCalistir(RADAR_JS, ['ekle', b.kanal, '--baslik', String(b.baslik || '').slice(0, 200), ...(b.oncul ? ['--oncul', String(b.oncul).slice(0, 600)] : [])]) };
    if ((b.is === 'sec' || b.is === 'reddet') && /^f-[\w-]+$/.test(b.id)) return { mesaj: nodeCalistir(RADAR_JS, [b.is, b.kanal, b.id]) };
    throw new Error('bilinmeyen işlem');
  }
  // queue, on this machine or on the server
  if (!GET && yol.startsWith('kuyruk/')) {
    const is = yol.split('/')[1];
    if (is === 'ekle') {
      if (sunucu) return { mesaj: sunucuyaEkle(b) };
      const mp4 = path.resolve(KOK, b.mp4 || '');
      if (!icinde(mp4, path.join(KOK, 'videolar')) || !fs.existsSync(mp4)) throw new Error('video bulunamadı');
      return { mesaj: nodeCalistir(KUYRUK_JS, ['ekle', mp4, '--aciklama', String(b.aciklama || ''), ...(b.zaman ? ['--zaman', zamanMetni(b.zaman)] : []), ...(b.onay_gerekli ? ['--onay-gerekli'] : [])]) };
    }
    if (!/^[\w.-]+$/.test(String(b.id || ''))) throw new Error('kuyrukta böyle bir iş yok');
    if (is === 'onayla' || is === 'iptal') return { mesaj: sunucu ? sunucuda(`kuyruk/kuyruk.js ${is} ${q(b.id)}`) : nodeCalistir(KUYRUK_JS, [is, b.id]) };
    if (is === 'zaman') { if (sunucu) sunucuda(`panel/panel.js --zaman ${q(b.id)} ${q(zamanMetni(b.zaman))}`); else zamanDegistir(b.id, b.zaman); return { tamam: true }; }
  }
  // lessons: save one to the channel's lesson file (the second brain reads it)
  if (!GET && yol === 'ders-kaydet') {
    if (!kanallar().includes(b.kanal)) throw new Error('kanal yok');
    const f = path.join(KOK, 'kanal', b.kanal, 'dersler.md');
    if (!fs.existsSync(f)) fs.writeFileSync(f, '# Sonuçlardan çıkan dersler\n\nPanel (Sonuçlar → Kaydet) buraya yazar. Yapay zekâ metin yazarken bunu okur.\n');
    fs.appendFileSync(f, `\n- **${String(b.kural).slice(0, 200)}** (${new Date().toLocaleDateString('tr-TR')}, güven: ${String(b.guven || '?').slice(0, 10)})\n  ${String(b.kanit || '').slice(0, 300)}\n`);
    return { tamam: true, dosya: path.relative(KOK, f) };
  }
  throw Object.assign(new Error('yok'), { kod: 404 });
}

if (process.argv.includes('--ozet')) { process.stdout.write(JSON.stringify(kuyrukOzet())); process.exit(0); }
if (process.argv.includes('--zaman')) { const i = process.argv.indexOf('--zaman'); zamanDegistir(process.argv[i + 1], process.argv[i + 2]); console.log('Saat değişti.'); process.exit(0); }

const sunucu = http.createServer(async (req, res) => {
  try {
    // only this machine, only our own host name (blocks DNS-rebinding tricks)
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return gonder(res, 403, { hata: 'yalnız bu bilgisayardan' });
    const u = new URL(req.url, 'http://127.0.0.1');
    const korumali = u.pathname.startsWith('/api/') || u.pathname === '/dosya';
    if (korumali && (req.headers['x-panel'] || u.searchParams.get('k')) !== ANAHTAR) return gonder(res, 401, { hata: 'Paneli terminaldeki linkle aç.' });
    if (u.pathname === '/dosya') return dosyaVer(req, res, u.searchParams.get('p'));
    if (u.pathname.startsWith('/api/')) return gonder(res, 200, await api(req, u));
    const rel = u.pathname === '/' ? 'index.html' : u.pathname.slice(1), f = path.resolve(ARAYUZ, rel);
    if (!icinde(f, ARAYUZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return gonder(res, 404, 'yok', 'text/plain; charset=utf-8');
    gonder(res, 200, fs.readFileSync(f), TUR[path.extname(f)] || 'application/octet-stream');
  } catch (e) { gonder(res, e.kod || 400, { hata: e.message }); }
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
