// Offline tests for the topic radar (no network, no language model, no spend).
//   node --test konu/test/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');

const O = require('../ortak');
const ag = require('../kaynaklar/ag');
const eksi = require('../kaynaklar/eksi');
const reddit = require('../kaynaklar/reddit');
const viki = require('../kaynaklar/vikipedi');
const gtr = require('../kaynaklar/gtrends');
const P = require('../puan');
const H = require('../havuz');
const A = require('../otomasyon');
const U = require('../uret');
const LLM = require('../llm');

const ornek = f => fs.readFileSync(path.join(__dirname, 'ornekler', f), 'utf8');
const geciciCtx = (ayar = {}) => {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'konu-test-'));
  const dir = path.join(kok, 'kanal'), kayit = path.join(kok, 'kayit');
  fs.mkdirSync(dir, { recursive: true });
  return { kanal: 'test-kanal-yok', dir, kayit, kok, kimlik: { hesap: '@test', konu: 'Ne olurdu kanalı', renkler: {} }, ayar };
};

test('Ekşi list pages: titles, counts, ads skipped, debe captions', () => {
  const g = eksi.listeAyristir(ornek('eksi-gundem.html'), 'gundem');
  assert.deepStrictEqual(g.map(x => x.baslik), ['gökten dolu yağması', 'uykusuzluğun beyne etkisi', "türkiye'nin en derin mağarası"]);
  assert.deepStrictEqual(g.map(x => x.entry_bugun), [71, 159, 9]);
  assert.strictEqual(g[0].yol, '/gokten-dolu-yagmasi--1111111');
  const d = eksi.listeAyristir(ornek('eksi-debe.html'), 'debe');
  assert.deepStrictEqual(d.map(x => x.baslik), ['ahtapotun üç kalbi', 'uçak penceresinin yuvarlak olması']);
  assert.strictEqual(d[0].yol, '/entry/100000001');
});

test('Reddit Atom feed: title, outside source link, self-post text, rank engagement', () => {
  const r = reddit.rssAyristir(ornek('reddit.xml'), 50);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].baslik, 'TIL: octopuses have three hearts & blue blood');
  assert.strictEqual(r[0].dis_kaynak, 'https://en.wikipedia.org/wiki/Octopus');
  assert.strictEqual(r[0].alt, 'r/todayilearned');
  assert.match(r[1].ozet, /ice float/);
  assert.ok(r[0].etkilesim > r[1].etkilesim);
});

test('Wikipedia most read: skips the main page, rising beats evergreen, featured article included', () => {
  const v = viki.ayristir(JSON.parse(ornek('vikipedi.json')), 'tr', Date.now());
  assert.deepStrictEqual(v.map(x => x.baslik), ['Kara delik', 'Bilim', 'Ahtapot']);
  assert.ok(v[0].metrikler.yukselis > 10);
  assert.ok(v[0].etkilesim > v[1].etkilesim);
});

test('Google Trends RSS: traffic numbers and news headlines', () => {
  const g = gtr.ayristir(ornek('gtrends.xml'), 'TR');
  assert.deepStrictEqual(g.map(x => x.metrikler.arama), [2000, 200]);
  assert.strictEqual(g[0].url, 'https://haber.example.com/gumus');
  assert.match(g[0].ozet, /rekor/);
  assert.match(g[1].url, /trends\.google\.com/);
  assert.strictEqual(gtr.trafik('1M+'), 1e6);
});

test('robots.txt: longest rule wins, our own group overrides *', () => {
  const txt = 'User-agent: *\nAllow: /\nDisallow: /video/*\n\nUser-agent: GPTBot\nDisallow: /\n';
  assert.strictEqual(ag.robotsIzinli(txt, '/basliklar/gundem'), true);
  assert.strictEqual(ag.robotsIzinli(txt, '/video/123'), false);
  assert.strictEqual(ag.robotsIzinli('User-agent: *\nDisallow: /\n', '/r/x/top/.rss'), false);
  assert.strictEqual(ag.robotsIzinli('User-agent: video-mutfagi\nAllow: /\n\nUser-agent: *\nDisallow: /\n', '/x'), true);
});

test('pre-filter: blocked words drop, short keywords need whole words', () => {
  assert.strictEqual(P.anahtarEslesme('ayakkabı fiyatları', ['ay']), 0);
  assert.strictEqual(P.anahtarEslesme('Ay neden hep aynı yüzünü gösterir', ['ay']), 1);
  assert.strictEqual(P.anahtarEslesme('volkanların patlaması', ['volkan']), 1);
  const og = [
    { id: 'a', kaynak: 'x', baslik: 'derbi maçı sonucu', etkilesim: 1, zaman: Date.now() },
    { id: 'b', kaynak: 'x', baslik: 'uzayda oksijen', etkilesim: 0.2, zaman: Date.now() },
    { id: 'c', kaynak: 'y', baslik: 'rastgele', etkilesim: 0.1, zaman: Date.now() - 30 * 864e5 },
  ];
  const { kalan, elenen } = P.onEleme(og, { anahtar_kelimeler: ['uzay', 'oksijen'], yasak_kelimeler: ['derbi'] });
  assert.deepStrictEqual(elenen.map(o => o.id), ['a']);
  assert.deepStrictEqual(kalan.map(o => o.id), ['b', 'c']);
  // quota: source y still gets a seat although it scores lowest
  assert.deepStrictEqual(P.kotaIleSec([...kalan, { id: 'd', kaynak: 'x', on_puan: 0.5 }].sort((a, b) => b.on_puan - a.on_puan), 2, 1).map(o => o.id).sort(), ['b', 'c']);
});

test('idea pool: series episodes stay separate, true duplicates merge sources', () => {
  const seri = O.kelimeler('Evrendeki bütün oksijen yok olursa X\'te ne olur?');
  const h = { fikirler: [] };
  const f = (baslik, url) => ({ baslik, kaynaklar: [{ kaynak: 'k', baslik, url }], durum: 'yeni', puan: 7, olusturma: 't' + baslik });
  H.fikirEkle(h, [f("Evrendeki bütün oksijen yok olursa Everest'in zirvesinde ne olur?", 'u1')], { seri });
  let r = H.fikirEkle(h, [f('Evrendeki bütün oksijen yok olursa denizde ne olur?', 'u2')], { seri });
  assert.deepStrictEqual(r, { eklenen: 1, birlesen: 0 });
  r = H.fikirEkle(h, [f('Evrendeki bütün oksijen yok olursa Everest zirvesinde ne olur?', 'u3')], { seri });
  assert.deepStrictEqual(r, { eklenen: 0, birlesen: 1 });
  assert.strictEqual(h.fikirler[0].kaynaklar.length, 2);
  assert.strictEqual(H.fikirBul(h, h.fikirler[1].id.slice(0, 6)) !== null, true);
});

test('automation: full auto needs both the file flag and the command flag', () => {
  const ctx = geciciCtx({ otomasyon: { seviye: 'tam', tam_otomatik: true } });
  assert.strictEqual(A.politika(ctx, { tamBayrak: false }).etkin, 'uret');
  assert.strictEqual(A.politika(ctx, { tamBayrak: true }).etkin, 'tam');
  assert.strictEqual(A.politika(ctx, { tamBayrak: true }).onayGerekli, false);
  ctx.ayar.otomasyon.tam_otomatik = false;
  assert.strictEqual(A.politika(ctx, { tamBayrak: true }).etkin, 'uret');
  assert.throws(() => A.politika(geciciCtx({ otomasyon: { seviye: 'hepsi' } })), /geçersiz/);
});

test('budget: automation never spends with zero caps; caps add up per day', () => {
  const ctx = geciciCtx({ otomasyon: { butce: { gunluk_kredi: 0, aylik_kredi: 0 } } });
  assert.strictEqual(A.harcamaIzni(ctx, 'kredi', 5, { otomatik: true }).izin, false);
  assert.strictEqual(A.harcamaIzni(ctx, 'kredi', 5, { otomatik: false }).izin, true);
  ctx.ayar.otomasyon.butce = { gunluk_kredi: 50, aylik_kredi: 100 };
  O.harcamaYaz(ctx, 'kredi', 40, 'v1');
  assert.strictEqual(A.harcamaIzni(ctx, 'kredi', 9, { otomatik: true }).izin, true);
  assert.match(A.harcamaIzni(ctx, 'kredi', 11, { otomatik: true }).neden, /Günlük/);
});

test('automation picks ideas above the thresholds, chosen ones first', () => {
  const ctx = geciciCtx({ otomasyon: { esik: { puan: 8, etkilesim_min: 0.3, kaynak_metrik: { 'eksi.entry_bugun': 50 } } } });
  const fk = (id, puan, etk, durum, entry) => ({ id, puan, durum, puan_detay: { etkilesim: etk }, kaynaklar: [{ kaynak: 'eksi', metrikler: { entry_bugun: entry } }] });
  const h = { fikirler: [fk('a', 9, 0.5, 'yeni', 80), fk('b', 9, 0.5, 'yeni', 10), fk('c', 7, 0.9, 'yeni', 99), fk('d', 5, 0, 'secildi', 0), fk('e', 9.5, 0.9, 'reddedildi', 99)] };
  assert.deepStrictEqual(A.uygunFikirler(ctx, h).map(f => f.id), ['d', 'a']);
});

test('word cues Whisper did not hear fall back to the line start; bad recipes are caught', () => {
  const Z = { satirlar: [{ bas: 0.25, son: 4 }, { bas: 5, son: 9 }], kelimeler: [{ w: 'Lan,', a: 0.3 }, { w: 'akrilik', a: 6 }], sting: [4.1, 10], chime: [], toplam: 12 };
  assert.strictEqual(U.ifadeCoz('kelime:akrilik@1-0.2', Z), 5.8);
  assert.strictEqual(U.ifadeCoz('satir-sonu:0+0.1', Z), 4.1);
  const rec = { kurgu: [{ kadar: 'satir-sonu:0', gorsel: 'a' }, { kadar: 'son', klip: 'k', baslat: 'kelime:yerkabuğu@1' }], etiketler: [{ bas: 'kelime:yok@1', bit: 'satir-sonu:1' }] };
  const notlar = U.ipuclariniOnar(rec, Z);
  assert.strictEqual(notlar.length, 2);
  assert.strictEqual(rec.kurgu[1].baslat, 'satir:1');
  assert.strictEqual(rec.etiketler[0].bas, 'satir:1');
  assert.throws(() => U.ipuclariniOnar({ kurgu: [{ kadar: 'satir-sonu:1' }, { kadar: 'satir-sonu:0' }] }, Z), /öncekinden önce/);
  assert.deepStrictEqual(U.ucretliKontrol({ gorseller: [{ ad: 'a' }], klipler: [{ ad: 'k', gorsel: 'a' }], kurgu: [{ kadar: 'son', klip: 'k' }] }), []);
  assert.ok(U.ucretliKontrol({ gorseller: [{ ad: 'a', referans: ['z'] }], kurgu: [{ kadar: 'satir:1', gorsel: 'b' }] }).length >= 3);
});

test('posting queue job file follows the contract', () => {
  const ctx = geciciCtx();
  const f = U.kuyrugaYaz({ video: 'videolar/x-v02-deneme', mp4: 'videolar/x-v02-deneme/cikti/x-v02-deneme-ucretli.mp4', aciklama: 'açıklama', onayGerekli: true }, ctx.kok);
  assert.match(path.basename(f), /^\d{8}-\d{4}-x-v02-deneme\.json$/);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { video: 'videolar/x-v02-deneme', mp4: 'videolar/x-v02-deneme/cikti/x-v02-deneme-ucretli.mp4', aciklama: 'açıklama', ne_zaman: null, kaynak: 'konu-radari', onay_gerekli: true });
});

test('scoring end to end with a fake model: blocked-site topics stay raw, ideas get weighted scores', async () => {
  const ctx = geciciCtx({ on_eleme: { anahtar_kelimeler: ['ahtapot'], llm_e_en_fazla: 10, kaynak_basina_en_az: 2 }, puan: {} });
  const og = [
    { id: 'reddit:1', kaynak: 'reddit', alt: 'r/til', baslik: 'TIL ahtapot üç kalp', ozet: '', url: 'u1', etkilesim: 0.8, zaman: Date.now(), llm_izni: true, metrikler: { sira: 1 } },
    { id: 'eksi:1', kaynak: 'eksi', alt: 'gundem', baslik: 'ahtapot', ozet: '', url: 'u2', etkilesim: 0.5, zaman: Date.now(), llm_izni: false, metrikler: { entry_bugun: 30 } },
  ];
  let gonderilen;
  const sahte = async istem => { gonderilen = istem; return { metin: JSON.stringify({ puanlar: [{ id: 'reddit:1', uyum: 9, merak: 9, dogrulanabilirlik: 8 }], fikirler: [{ baslik: 'Ahtapotun üç kalbi nasıl çalışır?', oncul: 'o', kanca: 'k', tirmanis: [{ olay: 'x', dogrulanacak_bilgi: 'y' }], kapanis: 'z', neden_uyar: 'n', kaynak_idler: ['reddit:1'], uyum: 9, merak: 9, dogrulanabilirlik: 8 }] }) }; };
  const r = await P.puanla(ctx, { ogeler: og, yaz: () => { }, calistir: sahte });
  assert.strictEqual(r.eklenen, 1);
  assert.ok(!gonderilen.includes('"eksi:1"'), 'blocked-site topic must not reach the model');
  const h = H.havuzOku(ctx);
  assert.strictEqual(h.ham_konular.length, 1);
  assert.ok(h.fikirler[0].puan > 8 && h.fikirler[0].puan <= 10);
  assert.ok(fs.existsSync(path.join(ctx.dir, 'fikirler.html')));
  // second run: nothing new to score, the model is not called
  const r2 = await P.puanla(ctx, { ogeler: og, yaz: () => { }, calistir: async () => { throw new Error('should not be called'); } });
  assert.strictEqual(r2.eklenen, 0);
});

test('JSON is pulled out of a chatty model reply', () => {
  assert.deepStrictEqual(LLM.jsonCikar('Tamam {not json} işte:\n```json\n{"a": {"b": 1}}\n```'), { a: { b: 1 } });
  assert.throws(() => LLM.jsonCikar('hiç json yok'), /JSON/);
});
