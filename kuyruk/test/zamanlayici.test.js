// kuyruk.js cron install against a fake crontab: an old line (no TZ/nice prefix) is replaced, other lines survive.
const test = require('node:test'), assert = require('node:assert');
const { zamanlayici } = require('../kuyruk.js');

const ESKI = '*/5 * * * * cd "/home/hizmet/video-mutfagi" && "/home/hizmet/.local/node/bin/node" "/home/hizmet/video-mutfagi/kuyruk/kuyruk.js" calistir >> "/home/hizmet/video-mutfagi/kayit/kuyruk.log" 2>&1';
const DIZI = '20 * * * * cd "/home/hizmet/video-mutfagi" && TZ=Europe/Istanbul nice -n 19 "/n/node" "/home/hizmet/video-mutfagi/dizi/calistir.js" kanal_a >> "/x.log" 2>&1';
function sahte(tab) {
  const d = { tab, ...{} };
  d.spawn = (c, a, x = {}) => { if (a[0] === '-l') return { status: 0, stdout: d.tab, stderr: '' }; d.tab = x.input; return { status: 0, stdout: '', stderr: '' }; };
  return d;
}
const sus = fn => { const o = console.log; console.log = () => {}; try { fn(); } finally { console.log = o; } };

test('kur replaces the old queue line (quoted paths, no prefix) with the TZ+nice one, keeps the rest', () => {
  const d = sahte(`# note\n${ESKI}\n${DIZI}\n`);
  sus(() => zamanlayici('kur', { spawn: d.spawn, win: false, node: '/home/hizmet/.local/node/bin/node' }));
  sus(() => zamanlayici('kur', { spawn: d.spawn, win: false, node: '/home/hizmet/.local/node/bin/node' }));   // twice: still one line
  const l = d.tab.split('\n').filter(Boolean), k = l.filter(x => x.includes('kuyruk/kuyruk.js'));
  assert.equal(k.length, 1);
  assert.ok(k[0].startsWith('*/5 * * * * cd "') && k[0].includes('TZ=Europe/Istanbul nice -n 19 "/home/hizmet/.local/node/bin/node"'));
  assert.ok(l.includes('# note') && l.includes(DIZI));
});

test('kaldir removes only the queue line', () => {
  const d = sahte(`${ESKI}\n${DIZI}\n`);
  sus(() => zamanlayici('kaldir', { spawn: d.spawn, win: false }));
  assert.deepEqual(d.tab.split('\n').filter(Boolean), [DIZI]);
});
