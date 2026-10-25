#!/usr/bin/env node
// Secret guard. Stops a commit if a staged change looks like a key or token. Installed as a git pre-commit hook:
//   node kurulum/gizli-tara.js kur       (once per clone; writes .git/hooks/pre-commit)
//   node kurulum/gizli-tara.js           (scan staged changes now; exit 1 if anything is found)
//   node kurulum/gizli-tara.js --hepsi   (scan every tracked file and the whole history)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const KALIP = [
  ['Claude / Anthropic anahtarı', /sk-ant-[A-Za-z0-9_-]{16,}/],
  ['Claude giriş token\'ı', /CLAUDE_CODE_OAUTH_TOKEN\s*=\s*\S{16,}/],
  ['ElevenLabs anahtarı', /\bsk_[a-f0-9]{32,}\b/],
  ['Instagram / Meta token\'ı', /\b(IGAA|EAA)[A-Za-z0-9]{40,}/],
  ['OpenAI anahtarı', /\bsk-(proj-)?[A-Za-z0-9]{32,}/],
  ['GitHub token\'ı', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['özel SSH/PEM anahtarı', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
const KOK = git('rev-parse', '--show-toplevel').trim();

function tara(metin, nerede) {
  const bulunan = [];
  metin.split('\n').forEach((satir, i) => { for (const [ad, re] of KALIP) if (re.test(satir)) bulunan.push(`${nerede}${i >= 0 ? '' : ''}: ${ad}`); });
  return bulunan;
}

const k = process.argv[2];
if (k === 'kur') {
  const f = path.join(KOK, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(f, '#!/bin/sh\nnode "$(git rev-parse --show-toplevel)/kurulum/gizli-tara.js" || exit 1\n');
  fs.chmodSync(f, 0o755);
  console.log('Gizli bilgi kilidi kuruldu: her commit öncesi değişiklikler taranır.');
  process.exit(0);
}
let bulunan = [];
if (process.argv.includes('--hepsi')) {
  for (const f of git('ls-files').split('\n').filter(Boolean)) {
    try { bulunan.push(...tara(fs.readFileSync(path.join(KOK, f), 'utf8'), f)); } catch (e) { }
  }
  const tarih = git('log', '-p', '--all', '--no-color', '--unified=0');
  bulunan.push(...tara(tarih.split('\n').filter(l => l.startsWith('+')).join('\n'), 'geçmiş'));
} else {
  const fark = git('diff', '--cached', '--no-color', '--unified=0');
  let dosya = '';
  for (const l of fark.split('\n')) {
    if (l.startsWith('+++ b/')) dosya = l.slice(6);
    else if (l.startsWith('+') && !l.startsWith('+++')) bulunan.push(...tara(l.slice(1), dosya));
  }
}
bulunan = [...new Set(bulunan)];
if (bulunan.length) {
  console.error('\nDUR: gizli bilgi gibi görünen şeyler var, commit yapılmadı:\n' + bulunan.map(b => '  • ' + b).join('\n') +
    '\nAnahtarlar ~/.video-mutfagi/ içinde durur, repoya girmez. Dosyadan çıkar, sonra tekrar commit et.\n');
  process.exit(1);
}
if (process.argv.includes('--hepsi')) console.log('Temiz: dosyalarda ve geçmişte gizli bilgi bulunmadı.');
