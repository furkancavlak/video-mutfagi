// Offline tests for story sources (Ekşi entries, Reddit full posts, candidate filter). Fake getir, no network.
//   node --test "dizi/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const eksi = require('../../konu/kaynaklar/eksi'), reddit = require('../../konu/kaynaklar/reddit');
const { adaylar } = require('../kaynak');
const { kaydet } = require('../dizi');

const O = path.join(__dirname, 'ornekler');
const entryHtml = fs.readFileSync(path.join(O, 'eksi-entry.html'), 'utf8');
const postJson = fs.readFileSync(path.join(O, 'reddit-post.json'), 'utf8');
const debeHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'konu', 'test', 'ornekler', 'eksi-debe.html'), 'utf8');
const SIMDI = new Date('2026-10-30T12:00:00Z');
const kelimeler = n => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');
const rss = (...linkler) => `<feed>${linkler.map(l => `<entry><title>t</title><link href="${l}"/><category term="tifu"/><content type="html">x</content></entry>`).join('')}</feed>`;
const postDe = (id, metin, skor = 100) => JSON.stringify([{ data: { children: [{ data: { id, title: 'T ' + id, selftext: metin, score: skor, num_comments: 5, subreddit: 'tifu' } }] } }]);
const ayar = (ek = {}) => ({ kanal: 'k', ayar: { dizi: { kaynak: { subredditler: ['tifu'], aralik_ms: 0, ...ek } } } });
const kokYap = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dizi-kaynak-'));

test('entryAyristir reads id, fav, author, title and text with line breaks', () => {
  const e = eksi.entryAyristir(entryHtml);
  assert.strictEqual(e.id, '71877842');
  assert.strictEqual(e.fav, 5425);
  assert.strictEqual(e.yazar, 'ornekyazar');
  assert.strictEqual(e.baslik, "örnek başlık 'test'");
  assert.ok(e.metin.startsWith('yaşandı bitti'));
  assert.strictEqual(e.metin, "yaşandı bitti diye başlayan örnek bir entry.\n\nikinci satır 'tırnaklı' & (bkz: x).\nüçüncü satır.");
});

test('debeEntryIdleri lists entry ids from the debe page', () => {
  assert.deepStrictEqual(eksi.debeEntryIdleri(debeHtml), ['100000001', '100000002']);
});

test('entryGetir sends a browser UA and parses; postGetir uses <url>.json', async () => {
  let gorulen;
  const e = await eksi.entryGetir('71877842', { getir: async (u, o) => { gorulen = { u, o }; return entryHtml; } });
  assert.strictEqual(gorulen.u, 'https://eksisozluk.com/entry/71877842');
  assert.match(gorulen.o.headers['User-Agent'], /Chrome/);
  assert.strictEqual(e.fav, 5425);
  let url2;
  const p = await reddit.postGetir('https://www.reddit.com/r/tifu/comments/abc123/x/?utm=1', { getir: async u => { url2 = u; return postJson; } });
  assert.match(url2, /\/r\/tifu\/comments\/abc123\/x\.json/);
  assert.deepStrictEqual(p, { id: 'abc123', baslik: 'TIFU by testing a parser', metin: 'first line of a synthetic post.\n\nsecond paragraph &amp; more.', skor: 4321, yorum: 210, subreddit: 'tifu' });
});

test('adaylar: Ekşi 403 becomes a note, Reddit items survive', async () => {
  const getir = async url => {
    if (/eksisozluk\.com/.test(url)) throw new Error('HTTP 403');
    if (/\.rss/.test(url)) return rss('https://www.reddit.com/r/tifu/comments/p1/a/');
    return postDe('p1', kelimeler(450), 900);
  };
  const r = await adaylar(ayar(), { simdi: SIMDI, getir, kok: kokYap() });
  assert.deepStrictEqual(r.ogeler.map(h => h.id), ['reddit-p1']);
  assert.strictEqual(r.ogeler[0].tur, 'reddit');
  assert.strictEqual(r.ogeler[0].dil, 'en');
  assert.strictEqual(r.ogeler[0].puan, 900);
  assert.ok(r.notlar.some(n => /ekşi.*403/i.test(n)), r.notlar.join(' | '));
});

test('adaylar: 420-word rule, Ekşi fav exception, debe + eksi_basliklar ids', async () => {
  const degis = (id, fav) => entryHtml.replace('data-id="71877842"', `data-id="${id}"`).replace('data-favorite-count="5425"', `data-favorite-count="${fav}"`);
  const getir = async url => {
    if (/\/debe/.test(url)) return debeHtml;
    if (url.endsWith('/entry/100000001')) return degis('100000001', 350);   // short but fav >= 300
    if (url.endsWith('/entry/100000002')) return degis('100000002', 10);    // short, low fav: dropped
    if (url.endsWith('/entry/555')) return degis('555', 5).replace(/yaşandı bitti diye[\s\S]*?üçüncü satır\./, kelimeler(430));   // long
    if (/\.rss/.test(url)) return rss('https://www.reddit.com/r/tifu/comments/p2/a/');
    return postDe('p2', kelimeler(100));                                      // short reddit: dropped
  };
  const r = await adaylar(ayar({ eksi_basliklar: ['555'] }), { simdi: SIMDI, getir, kok: kokYap() });
  assert.deepStrictEqual(r.ogeler.map(h => h.id).sort(), ['eksi-100000001', 'eksi-555']);
  const h = r.ogeler.find(x => x.id === 'eksi-100000001');
  assert.strictEqual(h.tur, 'eksi'); assert.strictEqual(h.dil, 'tr'); assert.strictEqual(h.puan, 350);
  assert.strictEqual(h.url, 'https://eksisozluk.com/entry/100000001');
});

test('adaylar: ids already used by a series are dropped', async () => {
  const kok = kokYap();
  kaydet(kok, 'k', { diziler: [{ id: 'reddit-p1', kanal: 'k', durum: 'aktif', bolumler: [] }, { id: 'x', kaynak: { id: 'reddit-p3' }, bolumler: [] }] });
  const getir = async url => {
    if (/eksisozluk\.com/.test(url)) throw new Error('HTTP 403');
    if (/\.rss/.test(url)) return rss('https://www.reddit.com/r/tifu/comments/p1/a/', 'https://www.reddit.com/r/tifu/comments/p2/a/', 'https://www.reddit.com/r/tifu/comments/p3/a/');
    return postDe(url.match(/comments\/(\w+)\//)[1], kelimeler(500));
  };
  const r = await adaylar(ayar(), { simdi: SIMDI, getir, kok });
  assert.deepStrictEqual(r.ogeler.map(h => h.id), ['reddit-p2']);
});
