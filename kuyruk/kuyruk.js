#!/usr/bin/env node
// Posting queue. Instagram's API has no "publish at" option, so we keep the videos ourselves and a scheduler
// (Windows Task Scheduler, cron, or a server) runs `calistir` every 5 minutes; whatever is due gets posted.
//
//   node kuyruk/kuyruk.js ekle <video.mp4> --aciklama "..." [--zaman "2026-10-27 19:00"] [--onay-gerekli] [--hesap <ad>]
//   node kuyruk/kuyruk.js liste                   what is waiting, when it goes, what needs approval
//   node kuyruk/kuyruk.js onayla <id> | iptal <id>
//   node kuyruk/kuyruk.js calistir [--kuru|--hazirla]  scheduler entry: posts at most one due video, then exits
//                       --kuru: tunnel check only · --hazirla: Instagram ingests the video, nothing is published
//   node kuyruk/kuyruk.js sonuclar                pulls views/reach/likes of posted videos (free, read-only)
//   node kuyruk/kuyruk.js durum                   is the automation alive? last run, overdue videos, warnings
//   node kuyruk/kuyruk.js zamanlayici kur|kaldir|durum
//
// Jobs are JSON files: kuyruk/bekleyen/ -> paylasilan/ | hatali/ | iptal/. Settings: ayarlar/kuyruk.json
// (copy of kuyruk/ayar-ornek.json). Other tools (the topic radar) add jobs by dropping a file into bekleyen/.
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const KOK = path.join(__dirname, '..');
const D = { bekleyen: path.join(__dirname, 'bekleyen'), paylasilan: path.join(__dirname, 'paylasilan'), hatali: path.join(__dirname, 'hatali'), iptal: path.join(__dirname, 'iptal') };
const DURUM = path.join(__dirname, 'durum.json'), KILIT = path.join(__dirname, '.kilit');
const AYAR_F = path.join(KOK, 'ayarlar', 'kuyruk.json'), ORNEK_F = path.join(__dirname, 'ayar-ornek.json');
const LOG = path.join(KOK, 'kayit', 'kuyruk.log');
const GOREV = 'Video Mutfagi Kuyruk';
const WIN = process.platform === 'win32';

const fail = m => { console.error('\nHATA: ' + m + '\n'); process.exit(1); };
const okuJ = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const yazJ = (f, j) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(j, null, 2)); };
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const log = m => { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); console.log(m); };
Object.values(D).forEach(d => fs.mkdirSync(d, { recursive: true }));

function ayar() {
  const a = okuJ(ORNEK_F);
  if (fs.existsSync(AYAR_F)) Object.assign(a, okuJ(AYAR_F));
  return a;
}
const isler = (d = D.bekleyen) => fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => ({ id: f.replace(/\.json$/, ''), f: path.join(d, f), ...okuJ(path.join(d, f)) }));
const bul = id => { const f = path.join(D.bekleyen, id.replace(/\.json$/, '') + '.json'); if (!fs.existsSync(f)) fail('kuyrukta böyle bir iş yok: ' + id + '  (node kuyruk/kuyruk.js liste)'); return f; };
const tarih = t => new Date(t).toLocaleString('tr-TR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const gun = t => new Date(t).toLocaleDateString('sv-SE');   // YYYY-MM-DD in local time

// "2026-10-27 19:00" (local) or ISO -> ISO
function zamanCoz(s) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : new Date(s);
  if (isNaN(d)) fail('anlaşılmayan zaman: ' + s + '  (örnek: "2026-10-27 19:00")');
  return d.toISOString();
}

// per-account settings: a.hesaplar[hesap] overrides the global hours/limit; default account is oxygbio
const HESAP0 = 'oxygbio';
const hesapAd = h => String(h || '').replace(/^@/, '').trim().toLowerCase() || HESAP0;
function hesapAyar(a, hesap) {
  const o = (a.hesaplar || {})[hesapAd(hesap)] || {};
  return { paylasim_saatleri: o.paylasim_saatleri || a.paylasim_saatleri, gunluk_en_fazla: o.gunluk_en_fazla ?? a.gunluk_en_fazla };
}
// how many of this account's jobs (posted or planned; `t` = paylasildi or ne_zaman) fall on local day `g` (YYYY-MM-DD)
const gunlukSayi = (isl, g, hesap) => isl.filter(j => hesapAd(j.hesap) === hesapAd(hesap) && gun(j.paylasildi || j.ne_zaman) === g).length;

// next free posting slot: the account's hours, at most its daily limit per day, never in the past.
// dolu: ISO strings (oxygbio) or { t, hesap }; only the account's own entries count. simdi is injectable for tests.
function sonrakiSlot(a, dolu, hesap, simdi = Date.now()) {
  const h = hesapAyar(a, hesap), kendi = dolu.map(x => typeof x === 'string' ? { t: x } : x).filter(x => hesapAd(x.hesap) === hesapAd(hesap)).map(x => x.t);
  const sayac = {}; for (const t of kendi) sayac[gun(t)] = (sayac[gun(t)] || 0) + 1;
  for (let g = 0; g < 60; g++) {
    for (const s of h.paylasim_saatleri) {
      const [hh, m] = s.split(':').map(Number), d = new Date(simdi); d.setDate(d.getDate() + g); d.setHours(hh, m, 0, 0);
      if (d.getTime() <= simdi + 5 * 60e3) continue;
      if ((sayac[gun(d)] || 0) >= h.gunluk_en_fazla) continue;
      if (kendi.some(t => Math.abs(new Date(t) - d) < 30 * 60e3)) continue;
      return d.toISOString();
    }
  }
  fail('60 gün içinde boş paylaşım saati bulunamadı (' + hesapAd(hesap) + '). ayarlar/kuyruk.json → paylasim_saatleri / gunluk_en_fazla (hesaplar.<ad> altında da olabilir)');
}
// jobs dropped without a time (e.g. by the topic radar) get the next free slot the first time the queue sees them
function saatAta(a) {
  const hepsi = isler(), paylasilan = isler(D.paylasilan).filter(j => j.paylasildi).map(j => ({ t: j.paylasildi, hesap: j.hesap }));
  const dolu = [...paylasilan, ...hepsi.filter(j => j.ne_zaman).map(j => ({ t: j.ne_zaman, hesap: j.hesap }))];
  for (const j of hepsi.filter(j => !j.ne_zaman)) {
    const t = sonrakiSlot(a, dolu, j.hesap); dolu.push({ t, hesap: j.hesap });
    const { id, f, ...veri } = j; yazJ(f, { ...veri, ne_zaman: t });
  }
}

function ekle() {
  const mp4 = process.argv[3]; if (!mp4 || !fs.existsSync(mp4)) fail('video dosyası yok: ' + mp4);
  const a = ayar(), aciklama = arg('--aciklama') || '';
  if (!aciklama) console.log('Uyarı: açıklama boş.');
  const ad = path.basename(mp4, '.mp4').replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 40);
  const now = new Date(), damga = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const f = path.join(D.bekleyen, `${damga}-${ad}.json`);
  yazJ(f, { video: null, mp4: path.relative(KOK, path.resolve(mp4)), aciklama, ne_zaman: arg('--zaman') ? zamanCoz(arg('--zaman')) : null, ...(arg('--hesap') ? { hesap: arg('--hesap') } : {}), kaynak: 'elle', onay_gerekli: process.argv.includes('--onay-gerekli') });
  saatAta(a);
  const j = okuJ(f);
  console.log(`Kuyruğa eklendi: ${path.basename(f, '.json')}\nPaylaşım zamanı: ${tarih(j.ne_zaman)}${j.onay_gerekli ? '  (önce onay: node kuyruk/kuyruk.js onayla ' + path.basename(f, '.json') + ')' : ''}`);
  zamanlayiciUyar();
}

function liste() {
  saatAta(ayar());
  const b = isler().sort((x, y) => new Date(x.ne_zaman) - new Date(y.ne_zaman));
  if (!b.length) console.log('Kuyruk boş.');
  for (const j of b) {
    const gec = new Date(j.ne_zaman) < Date.now();
    console.log(`${tarih(j.ne_zaman).padEnd(22)} ${j.onay_gerekli ? '⏸ ONAY BEKLİYOR' : gec ? '⚠ GECİKTİ    ' : '✓ hazır       '}  ${j.id}${j.hata_sayisi ? `  (${j.hata_sayisi}. deneme hatalı: ${j.son_hata})` : ''}`);
  }
  const p = isler(D.paylasilan).sort((x, y) => new Date(y.paylasildi) - new Date(x.paylasildi)).slice(0, 5);
  if (p.length) { console.log('\nSon paylaşılanlar:'); p.forEach(j => console.log(`  ${tarih(j.paylasildi)}  ${j.link}${j.sonuc ? `  ${j.sonuc.views ?? '?'} izlenme` : ''}`)); }
  const h = isler(D.hatali); if (h.length) console.log(`\n${h.length} iş hatalı klasöründe (kuyruk/hatali/). Sebebi dosyada yazıyor.`);
}

function tasi(f, hedef, ekVeri) { const j = okuJ(f); yazJ(path.join(hedef, path.basename(f)), { ...j, ...ekVeri }); fs.unlinkSync(f); }

// --- posting one video
// Instagram downloads the video from a public address within ~40 s. "klasor" mode (a server with a web folder)
// copies it there under a random name; "tunel" mode serves it from this computer and shrinks big files first,
// because home upload lines are often too slow (see dersler/HATALAR.md).
function kucult(mp4, mb) {
  const out = path.join(os.tmpdir(), `vm-ig-${process.pid}.mp4`), dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString();
  const vb = Math.max(350, Math.floor((mb * 8 * 1024 * 1024 / dur - 96000) / 1000));
  const x = ['-vf', 'scale=720:1280:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-b:v', vb + 'k', '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p', '-g', '60'];
  const pl = path.join(os.tmpdir(), `vm-2pass-${process.pid}`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp4, ...x, '-pass', '1', '-passlogfile', pl, '-an', '-f', 'mp4', WIN ? 'NUL' : '/dev/null']);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp4, ...x, '-maxrate', vb * 2 + 'k', '-bufsize', vb * 4 + 'k', '-pass', '2', '-passlogfile', pl, '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-movflags', '+faststart', out]);
  for (const f of fs.readdirSync(os.tmpdir())) if (f.startsWith(`vm-2pass-${process.pid}`)) fs.rmSync(path.join(os.tmpdir(), f), { force: true });
  return out;
}

async function paylas(j, a, kuru, hazirla) {
  const P = require('../instagram/paylas.js');
  const mp4 = path.resolve(KOK, j.mp4);
  if (!fs.existsSync(mp4)) throw new Error('video dosyası yok: ' + j.mp4);
  const y = a.yayin || {};
  if (y.yol === 'klasor') {
    if (!y.klasor || !y.adres) throw new Error('ayarlar/kuyruk.json → yayin.klasor ve yayin.adres gerekli');
    const ad = 'vm-' + crypto.randomBytes(8).toString('hex') + '.mp4', hedef = path.join(y.klasor, ad);
    fs.copyFileSync(mp4, hedef);
    try { return await P.gonder(mp4, j.aciklama, kuru, hazirla, y.adres.replace(/\/?$/, '/') + ad, j.hesap); }
    finally { fs.rmSync(hedef, { force: true }); }
  }
  const mb = fs.statSync(mp4).size / 1048576, sinir = y.tunel_en_fazla_mb ?? 6;
  let dosya = mp4;
  if (mb > sinir) { log(`video ${mb.toFixed(1)} MB, ev internetinde Instagram yetişemeyebilir: ${sinir} MB'a küçültülüyor`); dosya = kucult(mp4, sinir); }
  try { return await P.gonder(dosya, j.aciklama, kuru, hazirla, null, j.hesap); }
  finally { if (dosya !== mp4) fs.rmSync(dosya, { force: true }); }
}

async function calistir() {
  const kuru = process.argv.includes('--kuru'), hazirla = process.argv.includes('--hazirla'), a = ayar(), durum = fs.existsSync(DURUM) ? okuJ(DURUM) : {};
  // one run at a time; a stale lock (crashed run) is ignored after 30 min
  if (fs.existsSync(KILIT) && Date.now() - fs.statSync(KILIT).mtimeMs < 30 * 60e3) { console.log('Başka bir çalışma sürüyor, çıkılıyor.'); return; }
  fs.writeFileSync(KILIT, String(process.pid));
  const yaz = ek => yazJ(DURUM, { ...durum, son_calisma: new Date().toISOString(), makine: os.hostname(), ...ek });
  try {
    saatAta(a);
    const posted = isler(D.paylasilan).filter(j => j.paylasildi), bugunG = gun(Date.now());
    const sirada = isler().filter(j => !j.onay_gerekli && new Date(j.ne_zaman) <= Date.now() && !(j.sonraki_deneme && new Date(j.sonraki_deneme) > Date.now()))
      .sort((x, y) => new Date(x.ne_zaman) - new Date(y.ne_zaman));
    if (!sirada.length) { yaz({ son_sonuc: 'sırada video yok' }); console.log('Zamanı gelen video yok.'); return; }
    // first due job whose account still has room today (a full account must not block the other)
    const j = sirada.find(x => gunlukSayi(posted, bugunG, x.hesap) < hesapAyar(a, x.hesap).gunluk_en_fazla);
    if (!j) { const x = sirada[0], n = gunlukSayi(posted, bugunG, x.hesap); yaz({ son_sonuc: `bugünkü sınır doldu (${n})` }); log(`Bugün ${n} video paylaşıldı (${hesapAd(x.hesap)}), sınır ${hesapAyar(a, x.hesap).gunluk_en_fazla}. Sıradaki yarın.`); return; }
    const gecikme = (Date.now() - new Date(j.ne_zaman)) / 3600e3;
    if (gecikme > (a.gecikme_uyari_saat ?? 2)) log(`UYARI: ${j.id} ${gecikme.toFixed(1)} saat gecikti (bilgisayar kapalı ya da uykudaydı). Şimdi paylaşılıyor.`);
    log(`${kuru ? 'KURU (Instagram\'a gitmez): ' : hazirla ? 'HAZIRLA (Instagram işler, YAYINLANMAZ): ' : 'GERÇEK PAYLAŞIM: '}${j.id}`);
    try {
      const r = await paylas(j, a, kuru, hazirla);
      if (kuru || hazirla) { yaz({ son_sonuc: kuru ? 'kuru koşu tamam' : 'hazırla tamam: Instagram kabul etti, yayınlanmadı' }); return; }
      tasi(j.f, D.paylasilan, { paylasildi: new Date().toISOString(), media_id: r.media_id, link: r.link });
      yaz({ son_sonuc: 'paylaşıldı: ' + r.link, son_paylasim: new Date().toISOString() });
      log('YAYINDA: ' + r.link);
    } catch (e) {
      const n = (j.hata_sayisi || 0) + 1, { id, f, ...veri } = j;
      // a failed publish call may still have posted: never retry it, a retry could post the same video twice
      if (e.yayinBelirsiz) { tasi(f, D.hatali, { hata_sayisi: n, son_hata: e.message, kontrol_et: true }); log(`HATA (yayın adımı belirsiz, TEKRAR DENENMEDİ, hesaba bak): ${id}: ${e.message}`); }
      else if (n >= (a.en_fazla_deneme ?? 3)) { tasi(f, D.hatali, { hata_sayisi: n, son_hata: e.message }); log(`HATA (vazgeçildi, kuyruk/hatali/): ${id}: ${e.message}`); }
      else { yazJ(f, { ...veri, hata_sayisi: n, son_hata: e.message, sonraki_deneme: new Date(Date.now() + n * 30 * 60e3).toISOString() }); log(`HATA (${n}. deneme, ${n * 30} dk sonra tekrar): ${id}: ${e.message}`); }
      yaz({ son_sonuc: 'hata: ' + e.message });
    }
  } finally { fs.rmSync(KILIT, { force: true }); }
}

async function sonuclar() {
  const P = require('../instagram/paylas.js');
  const p = isler(D.paylasilan).filter(j => j.media_id).sort((x, y) => new Date(y.paylasildi) - new Date(x.paylasildi));
  if (!p.length) return console.log('Henüz kuyruktan paylaşılmış video yok.');
  console.log('Paylaşım'.padEnd(22) + 'İzlenme  Erişim  Beğeni  Yorum  Paylaşım  Kayıt');
  for (const j of p.slice(0, 30)) {
    try {
      const s = await P.sonuc(j.media_id, j.hesap), { id, f, ...veri } = j;
      yazJ(f, { ...veri, sonuc: s, sonuc_zamani: new Date().toISOString() });
      fs.appendFileSync(path.join(KOK, 'kayit', 'sonuclar.jsonl'), JSON.stringify({ zaman: new Date().toISOString(), id, link: j.link, ...s }) + '\n');
      console.log(tarih(j.paylasildi).padEnd(22) + [s.views, s.reach, s.likes, s.comments, s.shares, s.saved].map(v => String(v ?? '-').padStart(7)).join(' ') + '  ' + j.link);
    } catch (e) { console.log(tarih(j.paylasildi).padEnd(22) + 'okunamadı: ' + e.message); }
  }
  // second brain (optional): copy the fresh numbers into each video's note; does nothing when it is not set up
  try {
    const n = require('../ikinci-beyin/beyin.js').kuyruktanKaydet(p.slice(0, 30));
    if (n) console.log(`\nİkinci beyin: ${n} videonun notu güncellendi. "Ne tuttu, ne tutmadı" bölümlerini kullanıcıyla yaz.`);
  } catch (e) { console.log('İkinci beyin güncellenemedi: ' + e.message); }
}

// --- scheduler: every 15 min. every 5 min. Windows: Task Scheduler (runs a missed run as soon as the PC is on); Linux/Mac: cron.
// the cron line (also used by tests); the dedup below matches on 'kuyruk/kuyruk.js' only, so old lines without the TZ/nice prefix are still replaced
const kronSatiri = (kok, node, betik, log) => `*/5 * * * * cd "${kok}" && TZ=Europe/Istanbul nice -n 19 "${node}" "${betik}" calistir >> "${log}" 2>&1`;
function zamanlayiciVarMi() {
  if (WIN) return spawnSync('schtasks', ['/Query', '/TN', GOREV], { encoding: 'utf8' }).status === 0;
  const r = spawnSync('crontab', ['-l'], { encoding: 'utf8' }); return r.status === 0 && r.stdout.includes('kuyruk/kuyruk.js');
}
function zamanlayici(alt) {
  const node = process.execPath, betik = path.join(__dirname, 'kuyruk.js');
  if (alt === 'kur') {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    if (WIN) {
      const ps = `$a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c ""${node}"" ""${betik}"" calistir >> ""${LOG}"" 2>&1' -WorkingDirectory '${KOK}';
$t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5);
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew;
Register-ScheduledTask -TaskName '${GOREV}' -Action $a -Trigger $t -Settings $s -Description 'video-mutfagi: zamani gelen videoyu Instagram''a paylasir' -Force | Out-Null`;
      const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
      if (r.status !== 0) fail('zamanlayıcı kurulamadı: ' + (r.stderr || r.stdout).trim().slice(0, 400));
    } else {
      const satir = kronSatiri(KOK, node, betik, LOG);
      const eski = spawnSync('crontab', ['-l'], { encoding: 'utf8' }).stdout || '';
      const r = spawnSync('crontab', ['-'], { input: eski.split('\n').filter(l => l && !l.includes('kuyruk/kuyruk.js')).concat(satir).join('\n') + '\n', encoding: 'utf8' });
      if (r.status !== 0) fail('crontab yazılamadı: ' + r.stderr);
    }
    console.log(`Zamanlayıcı kuruldu: her 5 dakikada bir "calistir" çalışır. Kayıt: ${path.relative(KOK, LOG)}`);
    if (!/sunucu/i.test(ayar().makine_turu || '')) console.log('Ev bilgisayarı: paylaşım saatinde bilgisayar AÇIK ve UYANIK olmalı. Kapalıysa video açılınca, gecikmeli paylaşılır. Her gün `node kuyruk/kuyruk.js durum` ile bak.');
  } else if (alt === 'kaldir') {
    if (WIN) spawnSync('schtasks', ['/Delete', '/TN', GOREV, '/F']);
    else { const eski = spawnSync('crontab', ['-l'], { encoding: 'utf8' }).stdout || ''; spawnSync('crontab', ['-'], { input: eski.split('\n').filter(l => l && !l.includes('kuyruk/kuyruk.js')).join('\n') + '\n' }); }
    console.log('Zamanlayıcı kaldırıldı. Kuyruktaki videolar duruyor, artık kendiliğinden paylaşılmayacak.');
  } else console.log(zamanlayiciVarMi() ? 'Zamanlayıcı kurulu.' : 'Zamanlayıcı KURULU DEĞİL: kuyruk kendiliğinden paylaşmaz. Kur: node kuyruk/kuyruk.js zamanlayici kur');
}
function zamanlayiciUyar() { if (!zamanlayiciVarMi()) console.log('Not: zamanlayıcı kurulu değil, kuyruk kendiliğinden paylaşmaz (node kuyruk/kuyruk.js zamanlayici kur).'); }

// --- health check: the first thing to look at on a home PC
function durumGoster() {
  const a = ayar(), d = fs.existsSync(DURUM) ? okuJ(DURUM) : null, uyari = [];
  const kurulu = zamanlayiciVarMi();
  console.log(`Zamanlayıcı:      ${kurulu ? 'kurulu' : 'KURULU DEĞİL'}`);
  console.log(`Son çalışma:      ${d ? tarih(d.son_calisma) + ` (${d.makine})` : 'hiç çalışmadı'}${d ? '  → ' + d.son_sonuc : ''}`);
  if (!kurulu) uyari.push('Zamanlayıcı yok: hiçbir şey kendiliğinden paylaşılmaz.');
  if (kurulu && (!d || Date.now() - new Date(d.son_calisma) > 45 * 60e3)) uyari.push('Zamanlayıcı 45 dakikadır çalışmamış: bilgisayar kapalı/uykuda olabilir ya da görev bozulmuş olabilir. Kayıt: kayit/kuyruk.log');
  saatAta(a);
  const b = isler(), gec = b.filter(j => !j.onay_gerekli && new Date(j.ne_zaman) < Date.now() - 30 * 60e3), onay = b.filter(j => j.onay_gerekli);
  console.log(`Kuyrukta:         ${b.length} video (${onay.length} onay bekliyor)`);
  if (gec.length) uyari.push(`${gec.length} video zamanını kaçırdı: ${gec.map(j => j.id).join(', ')}`);
  if (onay.length) uyari.push(`Onay bekleyen: ${onay.map(j => j.id).join(', ')}  →  izle, sonra: node kuyruk/kuyruk.js onayla <id>`);
  const h = isler(D.hatali); if (h.length) uyari.push(`${h.length} video hatalı (kuyruk/hatali/)`);
  const dir = path.join(os.homedir(), '.video-mutfagi'), dosyalar = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^instagram(-[A-Za-z0-9_.]+)?.json$/.test(f)) : [];
  if (!dosyalar.length) uyari.push('Instagram bağlı değil (instagram/REHBER.md).');
  for (const f of dosyalar) {
    const hs = f === 'instagram.json' ? HESAP0 : f.slice(10, -5), t = okuJ(path.join(dir, f)), bas = new Date(t.yenilendi || t.kaydedildi), kalan = 60 - (Date.now() - bas) / 864e5;
    if (kalan < 10) uyari.push(`Instagram anahtarının (@${t.username || hs}) süresi ~${Math.max(0, Math.round(kalan))} gün içinde doluyor: node instagram/paylas.js yenile${hs === HESAP0 ? '' : ' --hesap ' + hs}`);
  }
  console.log(uyari.length ? '\nDİKKAT:\n' + uyari.map(u => '  • ' + u).join('\n') : '\nHer şey yolunda.');
}

module.exports = { sonrakiSlot, gunlukSayi, kronSatiri };
const k = process.argv[2];
if (require.main === module) (async () => {
  if (k === 'ekle') ekle();
  else if (k === 'liste') liste();
  else if (k === 'onayla') { const f = bul(process.argv[3] || ''), j = okuJ(f); yazJ(f, { ...j, onay_gerekli: false, onaylandi: new Date().toISOString() }); console.log(`Onaylandı, ${tarih(j.ne_zaman)} saatinde paylaşılacak.`); }
  else if (k === 'iptal') { tasi(bul(process.argv[3] || ''), D.iptal, { iptal: new Date().toISOString() }); console.log('İptal edildi (kuyruk/iptal/).'); }
  else if (k === 'calistir') await calistir();
  else if (k === 'sonuclar') await sonuclar();
  else if (k === 'durum') durumGoster();
  else if (k === 'zamanlayici') zamanlayici(process.argv[3]);
  else console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 13).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
})().catch(e => { log('HATA: ' + e.message); process.exit(1); });
