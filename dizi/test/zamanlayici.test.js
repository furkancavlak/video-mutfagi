// Series scheduler: crontab line, per-channel dedup, no collateral damage to the queue line (fake crontab, no real one is touched).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { olustur, kronSatiri, havuzKronSatiri, istatistikKronSatiri, istatistikIsareti, diziIsareti, havuzIsareti } = require('../zamanlayici.js');
const { kronSatiri: kuyrukSatiri } = require('../../kuyruk/kuyruk.js');

const KOK = fs.mkdtempSync(path.join(os.tmpdir(), 'zaman-'));
for (const k of ['kanal_a', 'kanal_ab', 'kanal_b']) { fs.mkdirSync(path.join(KOK, 'kanal', k), { recursive: true }); fs.writeFileSync(path.join(KOK, 'kanal', k, 'konu.json'), k === 'kanal_a' ? '{"dizi":{}}' : '{}'); }
fs.mkdirSync(path.join(KOK, 'kanal', 'sablon'), { recursive: true }); fs.writeFileSync(path.join(KOK, 'kanal', 'sablon', 'konu.json'), '{"dizi":{}}');
test.after(() => fs.rmSync(KOK, { recursive: true, force: true }));   // only this test's own temp root

const NODE = '/home/u/.local/node/bin/node', REPO = '/home/u/video-mutfagi';
// fake crontab: `crontab -l` / `crontab -` over an in-memory string
function sahte(baslangic = '', bozuk = false) {
  const d = { tab: baslangic, cagri: [] };
  d.spawn = (c, a, x = {}) => {
    d.cagri.push([c, ...a]);
    if (c !== 'crontab') return { status: 0, stdout: '', stderr: '' };
    if (a[0] === '-l') return d.tab === null ? { status: 1, stdout: '', stderr: d.hata || 'no crontab for u' } : { status: 0, stdout: d.tab, stderr: '' };
    if (bozuk) return { status: 1, stdout: '', stderr: 'hata' };
    d.tab = x.input; return { status: 0, stdout: '', stderr: '' };
  };
  return d;
}
const yap = d => olustur({ kok: KOK, node: NODE, win: false, spawn: d.spawn });
const KUYRUK = kuyrukSatiri(REPO, NODE, REPO + '/kuyruk/kuyruk.js', REPO + '/kayit/kuyruk.log');

test('cron line: hourly at :20, Istanbul time, nice, quoted paths, per-channel log', () => {
  const l = kronSatiri('/r/video mutfagi', NODE, 'kanal_a');
  assert.equal(l, `20 * * * * cd "/r/video mutfagi" && TZ=Europe/Istanbul nice -n 19 "${NODE}" "/r/video mutfagi/dizi/calistir.js" kanal_a >> "/r/video mutfagi/kayit/dizi-kanal_a.log" 2>&1`);
});

test('kur: adds the line; reinstall replaces it (quoted path) instead of duplicating', () => {
  const d = sahte(KUYRUK + '\n'), z = yap(d);
  z.kur('kanal_a'); z.kur('kanal_a'); z.kur('kanal_a');
  const l = d.tab.split('\n').filter(Boolean);
  assert.equal(l.length, 4);
  assert.equal(l.filter(x => istatistikIsareti.test(x)).length, 1, 'one hourly statistics line');
  assert.equal(l.filter(x => diziIsareti('kanal_a').test(x)).length, 1);
  assert.equal(l.filter(x => havuzIsareti('kanal_a').test(x)).length, 1, 'one weekly pool line');
  assert.ok(l.includes(KUYRUK), 'queue line untouched');
  assert.ok(d.tab.endsWith('\n'));
});

test('kur / kaldir for one channel leave another channel and the queue line alone; prefix names do not collide', () => {
  const d = sahte(KUYRUK + '\n# my own comment\n'), z = yap(d);
  z.kur('kanal_a'); z.kur('kanal_ab'); z.kur('kanal_b');
  assert.equal(d.tab.split('\n').filter(l => /dizi\/calistir/.test(l)).length, 3);
  z.kur('kanal_a');   // must not eat kanal_ab
  assert.equal(d.tab.split('\n').filter(l => /dizi\/calistir/.test(l)).length, 3);
  z.kaldir('kanal_a');
  const kalan = d.tab.split('\n').filter(Boolean);
  assert.equal(kalan.filter(l => diziIsareti('kanal_a').test(l)).length, 0);
  assert.equal(kalan.filter(l => diziIsareti('kanal_ab').test(l)).length, 1);
  assert.equal(kalan.filter(l => diziIsareti('kanal_b').test(l)).length, 1);
  assert.ok(kalan.includes(KUYRUK) && kalan.includes('# my own comment'));
});

test('dedup matches an unquoted-path line written by hand', () => {
  const d = sahte(`20 * * * * cd ${REPO} && ${NODE} ${REPO}/dizi/calistir.js kanal_a >> /tmp/x.log 2>&1\n`);
  yap(d).kur('kanal_a');
  assert.equal(d.tab.split('\n').filter(l => /dizi\/calistir/.test(l)).length, 1);
  assert.ok(d.tab.includes('nice -n 19'));
});

test('durum: shows dizi lines and whether the queue line exists', () => {
  const d = sahte(KUYRUK + '\n'), z = yap(d);
  assert.deepEqual(z.durum('kanal_a'), { dizi: [], kuyruk: true, istatistik: false });
  z.kur('kanal_a');
  const s = z.durum();
  assert.equal(s.dizi.length, 2); assert.ok(s.dizi.every(x => x.includes('kanal_a'))); assert.equal(s.kuyruk, true);
  assert.equal(yap(sahte('')).durum().kuyruk, false);
  assert.equal(yap(sahte(null)).durum().dizi.length, 0);   // no crontab at all
});

test('kanal is validated against kanal/ folders; no channel works only when exactly one has a dizi block', () => {
  const d = sahte(''), z = yap(d);
  assert.throws(() => z.kur('yok_kanal'), /kanal yok/);
  assert.throws(() => z.kur('../etc'), /kanal yok/);
  assert.throws(() => z.kur('sablon'), /kanal yok/);
  assert.throws(() => z.kur('kanal_a; rm -rf /'), /kanal yok/);
  assert.equal(d.tab, '');   // nothing written
  z.kur(); assert.ok(d.tab.includes('dizi/calistir.js') && d.tab.includes(' kanal_a '));
});

test('a crontab -l failure other than "no crontab" aborts and writes nothing; blank lines are kept', () => {
  const d = sahte(null); d.hata = 'crontab: cannot open /var/spool: permission denied';
  assert.throws(() => yap(d).kur('kanal_a'), /crontab okunamadı/);
  assert.ok(!d.cagri.some(c => c[1] === '-'));
  const e = sahte('# a\n\n# b\n'); yap(e).kur('kanal_a');
  assert.ok(e.tab.startsWith('# a\n\n# b\n20 * * * *'));
});

test('a failing crontab write is an error, not silent success', () => {
  assert.throws(() => yap(sahte('', true)).kur('kanal_a'), /crontab yazılamadı/);
});

test('Windows: one hourly task per channel at :20, created through the injected spawn', () => {
  const d = sahte(''), z = olustur({ kok: KOK, node: 'C:\n\node.exe', win: true, spawn: d.spawn });
  z.kur('kanal_a');
  const ps = d.cagri.find(c => c[0] === 'powershell.exe')[4];
  assert.ok(ps.includes("-TaskName 'Video Mutfagi Dizi kanal_a'") && ps.includes('AddMinutes(20)') && ps.includes('-RepetitionInterval (New-TimeSpan -Hours 1)') && ps.includes('dizi'));
  z.kaldir('kanal_a');
  assert.deepEqual(d.cagri.slice(-2), [['schtasks', '/Delete', '/TN', 'Video Mutfagi Dizi kanal_a', '/F'], ['schtasks', '/Delete', '/TN', 'Video Mutfagi Havuz kanal_a', '/F']]);
  const ps2 = d.cagri.filter(c => c[0] === 'powershell.exe')[1][4];
  assert.ok(ps2.includes("-TaskName 'Video Mutfagi Havuz kanal_a'") && ps2.includes('-Weekly -DaysOfWeek Monday -At 04:00') && ps2.includes('doldur kanal_a'));
  assert.ok(!d.cagri.some(c => c[0] === 'crontab'));
});

test('kuyruk.js cron line gets TZ + nice and is still found by its dedup marker', () => {
  assert.ok(KUYRUK.startsWith('*/5 * * * * cd "') && KUYRUK.includes('TZ=Europe/Istanbul nice -n 19 "'));
  const eski = `*/5 * * * * cd "${REPO}" && "${NODE}" "${REPO}/kuyruk/kuyruk.js" calistir >> "${REPO}/kayit/kuyruk.log" 2>&1`;
  for (const l of [eski, KUYRUK]) assert.ok(l.includes('kuyruk/kuyruk.js'));   // the marker kuyruk.js dedups on
  assert.ok(!/dizi\/calistir/.test(KUYRUK));
});

// weekly story pool (Furkan 31.10): Monday 04:00 Istanbul, written in the machine's cron time
test('havuz line: Monday 04:00 Istanbul in local cron time, TZ + nice, own log', () => {
  const l = havuzKronSatiri('/r/vm', NODE, 'kanal_a', 180);
  assert.equal(l, `0 4 * * 1 cd "/r/vm" && TZ=Europe/Istanbul nice -n 19 "${NODE}" "/r/vm/dizi/havuz.js" doldur kanal_a >> "/r/vm/kayit/havuz-kanal_a.log" 2>&1`);
  assert.ok(havuzKronSatiri('/r/vm', NODE, 'kanal_a', 0).startsWith('0 1 * * 1 '), 'UTC server: 01:00 UTC');
  assert.ok(havuzKronSatiri('/r/vm', NODE, 'kanal_a', -300).startsWith('0 20 * * 0 '), 'UTC-5: Sunday 20:00');
  assert.ok(havuzKronSatiri('/r/vm', NODE, 'kanal_a', 330).startsWith('30 6 * * 1 '), 'UTC+5:30');
});

test('havuz line: reinstall and kaldir dedup per channel, other channel and the queue line untouched', () => {
  const d = sahte(KUYRUK + '\n'), z = olustur({ kok: KOK, node: NODE, win: false, spawn: d.spawn, yerelDk: 0 });
  z.kur('kanal_a'); z.kur('kanal_a'); z.kur('kanal_ab');
  const say = re => d.tab.split('\n').filter(l => re.test(l)).length;
  assert.equal(say(havuzIsareti('kanal_a')), 1); assert.equal(say(havuzIsareti('kanal_ab')), 1);
  assert.ok(d.tab.includes('0 1 * * 1 cd'));
  z.kaldir('kanal_a');
  assert.equal(say(havuzIsareti('kanal_a')), 0); assert.equal(say(diziIsareti('kanal_a')), 0);
  assert.equal(say(havuzIsareti('kanal_ab')), 1); assert.ok(d.tab.includes(KUYRUK));
});

// one Instagram read per hour (Furkan 31.10): one shared :05 snapshot line, whatever channels are installed
test('istatistik line: :05 hourly, TZ + nice, one line for all channels, kaldir of a channel leaves it', () => {
  assert.equal(istatistikKronSatiri('/r/vm', NODE), `5 * * * * cd "/r/vm" && TZ=Europe/Istanbul nice -n 19 "${NODE}" "/r/vm/instagram/istatistik.js" anlik >> "/r/vm/kayit/istatistik.log" 2>&1`);
  const d = sahte(KUYRUK + '\n'), z = yap(d);
  z.kur('kanal_a'); z.kur('kanal_ab'); z.kur('kanal_a');
  assert.equal(d.tab.split('\n').filter(l => istatistikIsareti.test(l)).length, 1);
  assert.equal(z.durum().istatistik, true);
  z.kaldir('kanal_a');
  assert.equal(d.tab.split('\n').filter(l => istatistikIsareti.test(l)).length, 1, 'shared line stays');
  assert.ok(d.tab.includes(KUYRUK));
});
