#!/usr/bin/env node
// Scheduler for the series runner: installs / removes / shows the hourly (:20) job for one channel.
//   node dizi/zamanlayici.js kur [kanal] | kaldir [kanal] | durum [kanal]
// Linux/Mac: one crontab line per channel. Windows: one Task Scheduler task per channel.
// Each channel is found by its own marker (`dizi/calistir.js` + channel name), so installing or removing one channel never
// touches another channel's line or the queue line (kuyruk/kuyruk.js). The marker does not depend on how the paths are
// quoted (kuyruk.js once matched on a quoted path and so replaced nothing, commit 94d86d1).
// Without a channel: the only channel that has a "dizi" block in kanal/<kanal>/konu.json.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');

const KOK0 = path.join(__dirname, '..');
const ON = 'TZ=Europe/Istanbul nice -n 19';
const kacis = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KANAL_RE = /^[A-Za-z0-9_-]{1,60}$/;

// channels = folders under kanal/ with a konu.json (the template folder is skipped)
function kanallar(kok) {
  const d = path.join(kok, 'kanal');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(k => k !== 'sablon' && KANAL_RE.test(k) && fs.statSync(path.join(d, k)).isDirectory() && fs.existsSync(path.join(d, k, 'konu.json')));
}
function kanalSec(kok, kanal) {
  const hepsi = kanallar(kok);
  if (kanal) {
    if (!KANAL_RE.test(kanal) || !hepsi.includes(kanal)) throw new Error(`kanal yok: ${kanal}. Var olanlar: ${hepsi.join(', ') || '(hiç)'}`);
    return kanal;
  }
  const dizililer = hepsi.filter(k => { try { return !!JSON.parse(fs.readFileSync(path.join(kok, 'kanal', k, 'konu.json'), 'utf8')).dizi; } catch { return false; } });
  if (dizililer.length !== 1) throw new Error(`kanal adı ver (node dizi/zamanlayici.js kur <kanal>). ${dizililer.length ? 'Dizi ayarı olanlar: ' + dizililer.join(', ') : 'Dizi ayarı olan kanal yok'}`);
  return dizililer[0];
}
// a path that goes inside double quotes in a shell line must not be able to break out of them
const guvenliYol = (p, ad) => { if (/["$`\\\r\n]/.test(p) && process.platform !== 'win32') throw new Error(`${ad} yolunda kabuğu bozabilecek karakter var: ${p}`); return p; };

// the line that belongs to this channel (any quoting of the paths) / to the queue
const diziIsareti = kanal => new RegExp(`dizi/calistir\\.js"?\\s+${kacis(kanal)}(\\s|$)`);
const herDiziSatiri = /dizi\/calistir\.js/;
const kuyrukSatiriMi = l => l.includes('kuyruk/kuyruk.js');
const gorevAdi = kanal => `Video Mutfagi Dizi ${kanal}`;

function kronSatiri(kok, node, kanal) {
  guvenliYol(kok, 'repo'); guvenliYol(node, 'node');
  const betik = path.join(kok, 'dizi', 'calistir.js').split(path.sep).join('/'), log = path.join(kok, 'kayit', `dizi-${kanal}.log`).split(path.sep).join('/');
  return `20 * * * * cd "${kok}" && ${ON} "${node}" "${betik}" ${kanal} >> "${log}" 2>&1`;
}

// deps are injectable (tests run without a real crontab): { kok, node, win, spawn }
function olustur(o = {}) {
  const kok = o.kok || KOK0, node = o.node || process.execPath, win = o.win ?? process.platform === 'win32', spawn = o.spawn || ((c, a, x) => spawnSync(c, a, { encoding: 'utf8', ...x }));
  // only "no crontab for <user>" means empty; any other failure aborts (writing back a partial read would wipe the user's crontab)
  const kronOku = () => {
    const r = spawn('crontab', ['-l']);
    if (r.status === 0) return String(r.stdout || '');
    if (/no crontab/i.test(String(r.stderr || ''))) return '';
    throw new Error('crontab okunamadı: ' + String(r.stderr || r.error || 'bilinmeyen hata').trim().slice(0, 200));
  };
  const kronYaz = satirlar => {
    const r = spawn('crontab', ['-'], { input: satirlar.join('\n').replace(/\n+$/, '') + '\n' });
    if (r.status !== 0) throw new Error('crontab yazılamadı: ' + (r.stderr || '').trim());
  };
  const satirlar = () => kronOku().split('\n');

  function kur(kanalAd) {
    const kanal = kanalSec(kok, kanalAd);
    fs.mkdirSync(path.join(kok, 'kayit'), { recursive: true });
    if (win) {
      const betik = path.join(kok, 'dizi', 'calistir.js'), log = path.join(kok, 'kayit', `dizi-${kanal}.log`), t = s => s.replace(/'/g, "''");
      const ps = `$a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c ""${t(node)}"" ""${t(betik)}"" ${kanal} >> ""${t(log)}"" 2>&1' -WorkingDirectory '${t(kok)}';
$n = Get-Date; $b = $n.Date.AddHours($n.Hour).AddMinutes(20); if ($b -le $n) { $b = $b.AddHours(1) };
$t = New-ScheduledTaskTrigger -Once -At $b -RepetitionInterval (New-TimeSpan -Hours 1);
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew;
Register-ScheduledTask -TaskName '${gorevAdi(kanal)}' -Action $a -Trigger $t -Settings $s -Description 'video-mutfagi: dizi uretimi' -Force | Out-Null`;
      const r = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps]);
      if (r.status !== 0) throw new Error('zamanlayıcı kurulamadı: ' + String(r.stderr || r.stdout || '').trim().slice(0, 400));
      return { kanal, mesaj: `Zamanlayıcı kuruldu (${gorevAdi(kanal)}): her saat 20. dakikada bir "${kanal}" dizisi çalışır. Kayıt: kayit/dizi-${kanal}.log` };
    }
    const isaret = diziIsareti(kanal), kalan = satirlar().filter(l => !isaret.test(l));
    while (kalan.length && !kalan[kalan.length - 1].trim()) kalan.pop();   // trailing blanks only; inner ones stay
    kronYaz(kalan.concat(kronSatiri(kok, node, kanal)));
    return { kanal, mesaj: `Zamanlayıcı kuruldu: her saat 20. dakikada bir "${kanal}" dizisi çalışır. Kayıt: kayit/dizi-${kanal}.log` };
  }

  function kaldir(kanalAd) {
    const kanal = kanalSec(kok, kanalAd);
    if (win) spawn('schtasks', ['/Delete', '/TN', gorevAdi(kanal), '/F']);
    else { const isaret = diziIsareti(kanal); kronYaz(satirlar().filter(l => !isaret.test(l))); }
    return { kanal, mesaj: `"${kanal}" zamanlayıcısı kaldırıldı. Üretilmiş videolar ve kuyruk duruyor; kuyruk zamanlayıcısına dokunulmadı.` };
  }

  function durum(kanalAd) {
    const kanal = kanalAd ? kanalSec(kok, kanalAd) : null;
    if (win) {
      const adlar = kanal ? [kanal] : kanallar(kok);
      const var_ = adlar.filter(k => spawn('schtasks', ['/Query', '/TN', gorevAdi(k)]).status === 0);
      return { dizi: var_.map(k => gorevAdi(k)), kuyruk: spawn('schtasks', ['/Query', '/TN', 'Video Mutfagi Kuyruk']).status === 0 };
    }
    const l = satirlar(), isaret = kanal ? diziIsareti(kanal) : herDiziSatiri;
    return { dizi: l.filter(x => isaret.test(x)), kuyruk: l.some(kuyrukSatiriMi) };
  }
  return { kur, kaldir, durum };
}

function cli(argv = process.argv.slice(2), ortam = {}) {
  const [alt, kanal] = argv, z = olustur(ortam);
  try {
    if (alt === 'kur') console.log(z.kur(kanal).mesaj);
    else if (alt === 'kaldir') console.log(z.kaldir(kanal).mesaj);
    else if (alt === 'durum') {
      const d = z.durum(kanal);
      console.log(d.dizi.length ? 'Dizi zamanlayıcısı:\n' + d.dizi.map(x => '  ' + x).join('\n') : 'Dizi zamanlayıcısı KURULU DEĞİL' + (kanal ? ` (${kanal})` : '') + ': diziler kendiliğinden üretilmez. Kur: node dizi/zamanlayici.js kur <kanal>');
      console.log(d.kuyruk ? 'Kuyruk zamanlayıcısı: kurulu' : 'Kuyruk zamanlayıcısı KURULU DEĞİL: hazır videolar kendiliğinden paylaşılmaz. Kur: node kuyruk/kuyruk.js zamanlayici kur');
    } else console.log('Kullanım: node dizi/zamanlayici.js kur [kanal] | kaldir [kanal] | durum [kanal]');
  } catch (e) { console.error('\nHATA: ' + e.message + '\n'); process.exit(1); }
}

module.exports = { olustur, kronSatiri, diziIsareti, kanallar, kanalSec, ON };
if (require.main === module) cli();
