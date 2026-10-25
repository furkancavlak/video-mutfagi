#!/usr/bin/env node
// Setup doctor: actually tries every piece the pipeline needs and says, in plain Turkish, how to fix what fails.
//   node kurulum/doktor.js
// Required pieces must all be ✓ before producing a video. Optional ones are only needed for that feature.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');

const KOK = path.join(__dirname, '..'), AYAR = path.join(os.homedir(), '.video-mutfagi');
const WIN = process.platform === 'win32';
const run = (cmd, args, opt = {}) => { const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120000, ...opt }); return { ok: r.status === 0, out: ((r.stdout || '') + (r.stderr || '')).trim(), err: r.error }; };
let eksik = 0;
const satir = (ok, ad, bilgi, cozum, zorunlu = true) => {
  console.log(`${ok ? '✓' : zorunlu ? '✗' : '–'} ${ad.padEnd(26)} ${bilgi || ''}`);
  if (!ok) { if (zorunlu) eksik++; console.log(`    → ${cozum}`); }
};

console.log('\nZORUNLU\n');
const nodeMaj = +process.versions.node.split('.')[0];
satir(nodeMaj >= 18, 'Node.js', 'v' + process.versions.node, 'Node 18 ya da üstünü kur: https://nodejs.org (LTS sürümü).');

const ff = run('ffmpeg', ['-version']), fp = run('ffprobe', ['-version']);
satir(ff.ok && fp.ok, 'ffmpeg + ffprobe', ff.ok ? ff.out.split('\n')[0].slice(0, 60) : '',
  WIN ? 'PowerShell: winget install Gyan.FFmpeg  — sonra terminali kapatıp yeniden aç.' : 'Mac: brew install ffmpeg');

const gsap = fs.existsSync(path.join(KOK, 'node_modules', 'gsap', 'dist', 'gsap.min.js'));
const hfBin = path.join(KOK, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
const hfv = fs.existsSync(hfBin) ? run(process.execPath, [hfBin, '--version']) : { ok: false };
satir(gsap && hfv.ok, 'npm paketleri (gsap, hyperframes)', hfv.ok ? hfv.out.split('\n').pop() : '', 'Repo klasöründe: npm install');

if (hfv.ok) {
  const br = run(process.execPath, [hfBin, 'browser', 'path']);
  satir(br.ok && /chrome/i.test(br.out), 'Render tarayıcısı (Chrome)', br.ok ? 'hazır' : '', 'Repo klasöründe: npx hyperframes browser ensure  (bir kez ~150 MB indirir)');
}

const py = path.join(KOK, '.venv', WIN ? 'Scripts/python.exe' : 'bin/python');
if (!fs.existsSync(py)) satir(false, 'Python ortamı (.venv)', '', 'kurulum/KURULUM.md adım 3: Python 3.12 ile .venv kur ve kurulum/gereksinimler.txt yükle.');
else {
  const t = run(py, ['-c', 'import faster_whisper, av, ctranslate2; print(faster_whisper.__version__, av.__version__)']);
  satir(t.ok, 'Whisper (.venv içinde)', t.ok ? 'faster-whisper ' + t.out : t.out.split('\n').pop(), `${path.relative(KOK, py)} -m pip install -r kurulum/gereksinimler.txt`);
  if (t.ok && !/^1\.2\.1 18\./.test(t.out)) satir(false, 'Whisper sürümleri', t.out, 'Sürümler sabit olmalı (yeni av sürümüyle faster-whisper çöküyor): pip install -r kurulum/gereksinimler.txt', true);
  const hub = path.join(os.homedir(), '.cache', 'huggingface', 'hub');
  const model = fs.existsSync(hub) && fs.readdirSync(hub).some(d => /faster-whisper-large-v3-turbo/.test(d));
  satir(model, 'Whisper modeli', model ? 'indirilmiş' : 'henüz yok', 'İlk `python uretim/kelime.py` çalışmasında kendisi indirir (~1,6 GB). Sorun değil.', false);
}

if (WIN) { const uz = KOK.length; satir(uz <= 110, 'Repo yolu uzunluğu', uz + ' karakter', 'Windows 260 karakterden uzun yolları açamıyor. Repoyu daha kısa bir yere taşı (ör. C:\\Users\\<ad>\\video-mutfagi).', uz > 150); }

console.log('\nİSTEĞE BAĞLI (yalnız o özelliği kullanacaksan)\n');
const el = path.join(AYAR, 'elevenlabs.txt');
satir(fs.existsSync(el), 'ElevenLabs anahtarı', fs.existsSync(el) ? 'kayıtlı (doğruluğu ses.js ilk çalışınca denenir)' : '', `Yapay ses için: anahtarı ${el} dosyasına tek satır kaydet. Kendi sesinle anlatacaksan gerek yok.`, false);

let hfCli = null;
try { const root = require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(); const p = path.join(root, '@higgsfield', 'cli', 'bin', 'higgsfield.js'); if (fs.existsSync(p)) hfCli = p; } catch (e) { }
if (!hfCli) satir(false, 'Higgsfield CLI', '', 'Ücretli görsel katmanı için: npm i -g @higgsfield/cli  — sonra: higgsfield auth login', false);
else { const s = run(process.execPath, [hfCli, 'account', 'status']); satir(s.ok && /credits/.test(s.out), 'Higgsfield hesabı', s.ok ? s.out.split('\n').pop() : '', 'Terminalde: higgsfield auth login (tarayıcı açılır).', false); }

const cf = run('cloudflared', ['--version']);
satir(cf.ok, 'cloudflared (Instagram için)', cf.ok ? cf.out.split('\n')[0] : '', WIN ? 'PowerShell: winget install Cloudflare.cloudflared' : 'Mac: brew install cloudflared', false);
const ig = path.join(AYAR, 'instagram.json');
satir(fs.existsSync(ig), 'Instagram bağlantısı', fs.existsSync(ig) ? 'kayıtlı (node instagram/paylas.js kontrol)' : '', 'instagram/REHBER.md adımlarını izle.', false);

// topic radar (konu/): optional checks live in konu/doktor.js
try { require('../konu/doktor')(satir); } catch (e) { console.log('– Konu radarı kontrolü çalışmadı: ' + e.message); }

console.log(eksik ? `\n${eksik} zorunlu parça eksik. Yukarıdaki → satırlarını sırayla yap, sonra doktoru tekrar çalıştır.\n` : '\nZorunlu her şey hazır. Sıradaki: örnek videoyu üret (kurulum/KURULUM.md adım 5).\n');
process.exit(eksik ? 1 : 0);
