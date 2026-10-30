// Offline tests for producing an episode through konu/uret.js (stub model, temp roots, nothing paid, no keys read).
//   node --test "dizi/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const O = require('../../konu/ortak');
const U = require('../../konu/uret');
const { uretBolum, satirlaraBol, aciklamaYaz } = require('../uret-bolum');
const { calistir } = require('../calistir');
const { yukle, kaydet } = require('../dizi');

const tmp = ad => fs.mkdtempSync(path.join(os.tmpdir(), ad));
const sessiz = () => { };
const P = ['[sarcastic] Bir sabah kapı çaldı ve kapıda kimse yoktu. Sonra yine çaldı.', 'Bir süre bekledim, pencereden baktım.', 'Sonra kendime bir plan yaptım.', 'Bir gün komşu sordu: sen kimi bekliyorsun?', 'Cevap veremedim.', 'Ve kapı bir daha çalmadı.'];
const dizi = (ek = {}) => ({
  id: 'eksi-42', kanal: 'k', baslik: 'Uzun başlık', baslik_kisa: 'Deneme hikâye', durum: 'aktif', anlatici: { ses: 'SES1', ad: 'Burak' },
  bolumler: [1, 2, 3].map(n => ({ n, metin: P.slice(0, n + 1).join('\n\n'), durum: 'metin' })), ...ek,
});
// a channel run context in a temp folder; no otomasyon.butce, so automation may not spend anything
function kanalCtx(kimlik = {}) {
  const dir = tmp('dizi-ub-kanal-');
  return { kanal: 'k', dir, kimlik: { hesap: 'deneme_kanal', anlaticilar: [{ ad: 'Ali', elevenlabs_voice: 'V1' }], ...kimlik }, ayar: { otomasyon: { katman: 'formul' }, llm: {} }, kayit: path.join(dir, 'kayit') };
}
// voice files already on disk: ses.js has nothing to generate and never reads a key
function sesHazir(dir, adet, rol) {
  fs.mkdirSync(path.join(dir, 'ses'), { recursive: true });
  for (let i = 1; i <= adet; i++) fs.writeFileSync(path.join(dir, 'ses', `${String(i).padStart(2, '0')}-${rol}.mp3`), 'x');
}
const kuyrukDosyalari = kok => { try { return fs.readdirSync(path.join(kok, 'kuyruk', 'bekleyen')); } catch (e) { return []; } };

test('satirlaraBol: 2-4 lines at paragraph breaks', () => {
  assert.strictEqual(satirlaraBol(P.slice(0, 3).join('\n\n')).length, 3);
  const dort = satirlaraBol(P.join('\n\n'));
  assert.strictEqual(dort.length, 4);
  assert.strictEqual(dort.join(' ').replace(/\s+/g, ' '), P.join(' '), 'nothing lost or reordered when merging');
  const iki = satirlaraBol('Tek paragraf. İkinci cümle burada. Üçüncü cümle de var.');
  assert.strictEqual(iki.length, 2);
  assert.strictEqual(iki.join(' '), 'Tek paragraf. İkinci cümle burada. Üçüncü cümle de var.');
});

test('aciklamaYaz: first sentence (no audio tags), episode line, tags', () => {
  assert.strictEqual(aciklamaYaz(P.join('\n\n'), 2), 'Bir sabah kapı çaldı ve kapıda kimse yoktu. 👀\nBölüm 2 · Devamı yarın.\n#hikaye #yaşanmışhikaye #anı #komik');
  assert.match(aciklamaYaz('Son. Bitti.', 3), /^Son\. 👀\nBölüm 3 · Final\.\n/);
  // an ellipsis is a pause inside the sentence
  assert.match(aciklamaYaz('Bir sabah... kapı yine çaldı. Sonra sustu.', 1), /^Bir sabah\.\.\. kapı yine çaldı\. 👀\n/);
});

test('episode 2 through the real uret: video.json from the ready script, budget wait, no queue file', async () => {
  const kok = tmp('dizi-ub-kok-'), ctx = kanalCtx(), d = dizi();
  const vdir = path.join(kok, 'videolar', 'k-eksi-42-b2');
  sesHazir(vdir, 4, 'anlatici');
  const r = await uretBolum(ctx, d, 2, { onayGerekli: true, kok, yaz: sessiz, calistir: async () => { throw new Error('model must not be called'); } });
  assert.strictEqual(r.durum, 'butce-bekliyor');
  assert.match(r.neden, /harcama izni yok/);
  assert.strictEqual(path.resolve(r.dir), path.resolve(vdir));
  const v = JSON.parse(fs.readFileSync(path.join(vdir, 'video.json'), 'utf8'));
  assert.strictEqual(v.bolum, 2);
  assert.strictEqual(v.toplam_bolum, 3);
  assert.strictEqual(v.etiket, 'DENEME HİKÂYE · BÖLÜM 2');
  assert.ok(v.etiket.endsWith('· BÖLÜM 2'));
  assert.deepStrictEqual(v.anlaticilar, { anlatici: 'SES1' });
  assert.strictEqual(v.kanal, '../../kanal/k/kimlik.json');
  assert.strictEqual(v.satirlar.length, 3);
  assert.ok(v.satirlar.every(s => s.rol === 'anlatici'));
  assert.strictEqual(v.satirlar.map(s => s.metin).join('\n\n'), d.bolumler[1].metin);
  assert.match(v.aciklama_instagram, /^Bir sabah .* 👀\nBölüm 2 · Devamı yarın\./);
  const u = JSON.parse(fs.readFileSync(path.join(vdir, 'uretim.json'), 'utf8'));
  assert.ok(u.adimlar.metin && !u.adimlar.ses, 'script stage done from the ready text, voice not paid');
  // Review Focus 5: a budget stop leaves the episode due again and puts nothing in the queue
  const b = d.bolumler[1];
  assert.strictEqual(b.durum, 'uretimde');
  assert.strictEqual(b.video, undefined);
  assert.deepStrictEqual(kuyrukDosyalari(kok), []);
  assert.ok(!fs.existsSync(path.join(ctx.dir, 'fikirler.json')), 'the idea pool is not touched');
  // a rerun continues in the same folder and keeps the written script
  const r2 = await uretBolum(ctx, d, 2, { kok, yaz: sessiz });
  assert.strictEqual(r2.durum, 'butce-bekliyor');
  assert.deepStrictEqual(fs.readdirSync(path.join(kok, 'videolar')), ['k-eksi-42-b2']);
});

test('episode states: finished jobs wait for approval or the slot, Bolum.video equals the queue job video', async () => {
  const kok = tmp('dizi-ub-durum-'), ctx = kanalCtx();
  const sahte = (durum, ek = {}) => { const f = async (cx, id, o) => { f.o = o; const dir = path.join(kok, 'videolar', `${cx.kanal}-${o.hazir.ad}`); return { durum, dir, ...ek }; }; return f; };
  let d = dizi(), u = sahte('uretildi', { mp4: 'x.mp4' });
  let r = await uretBolum(ctx, d, 1, { onayGerekli: true, kok, uret: u, yaz: sessiz });
  assert.strictEqual(d.bolumler[0].durum, 'onay-bekliyor');
  assert.strictEqual(d.bolumler[0].video, 'videolar/k-eksi-42-b1');
  assert.strictEqual(r.durum, 'onay-bekliyor');
  assert.strictEqual(u.o.otomatik, true);
  assert.strictEqual(u.o.onayGerekli, true);
  assert.strictEqual(u.o.kok, kok);
  assert.strictEqual(u.o.hazir.ad, 'eksi-42-b1');
  assert.deepStrictEqual(u.o.hazir.video_ek, { bolum: 1, toplam_bolum: 3, etiket: 'DENEME HİKÂYE · BÖLÜM 1' });
  d = dizi(); await uretBolum(ctx, d, 3, { onayGerekli: false, kok, uret: (u = sahte('uretildi')), yaz: sessiz });
  assert.strictEqual(d.bolumler[2].durum, 'sirada');
  assert.match(u.o.hazir.aciklama_instagram, /Bölüm 3 · Final\./);
  d = dizi(); await uretBolum(ctx, d, 1, { kok, uret: sahte('onay-bekliyor'), yaz: sessiz });
  assert.strictEqual(d.bolumler[0].durum, 'onay-bekliyor');
  d = dizi(); r = await uretBolum(ctx, d, 1, { kok, uret: sahte('insan-bekliyor', { neden: 'sahne çalışmadı' }), yaz: sessiz });
  assert.strictEqual(d.bolumler[0].durum, 'kontrol_et');
  assert.match(d.bolumler[0].karar_neden, /sahne çalışmadı/);
  assert.strictEqual(r.durum, 'kontrol_et');
});

test('scheduler: a produced episode is matched to its posted queue job; budget wait stays due with a note', async () => {
  const kok = tmp('dizi-ub-cal-');
  for (const k of ['bekleyen', 'paylasilan', 'hatali', 'iptal']) fs.mkdirSync(path.join(kok, 'kuyruk', k), { recursive: true });
  const ctx = { ...kanalCtx(), ayar: { dizi: { gunluk_hedef: 0, bekle_saat: 20 }, otomasyon: { katman: 'formul' } } };
  kaydet(kok, 'k', { diziler: [dizi()] });
  // fake pipeline end: the job file is written by the real kuyrugaYaz exactly as uret.js calls it
  const uret = async (cx, id, o) => {
    const dir = path.join(kok, 'videolar', `${cx.kanal}-${o.hazir.ad}`);
    const is = U.kuyrugaYaz({ video: path.relative(kok, dir).split(path.sep).join('/'), mp4: 'm.mp4', aciklama: o.hazir.aciklama_instagram, onayGerekli: o.onayGerekli, hesap: 'deneme_kanal' }, kok);
    return { durum: 'uretildi', dir, mp4: 'm.mp4', is };
  };
  const ub = (cx, d, n, o) => uretBolum(cx, d, n, { ...o, uret, yaz: sessiz });
  await calistir(ctx, { kok, uretBolum: ub, yeniDizi: async () => null, sonucAl: async () => ({}) });
  const [job] = kuyrukDosyalari(kok);
  const j = JSON.parse(fs.readFileSync(path.join(kok, 'kuyruk', 'bekleyen', job), 'utf8'));
  assert.strictEqual(j.hesap, 'deneme_kanal');
  assert.strictEqual(yukle(kok, 'k').diziler[0].bolumler[0].video, j.video);
  fs.renameSync(path.join(kok, 'kuyruk', 'bekleyen', job), path.join(kok, 'kuyruk', 'paylasilan', job));
  fs.writeFileSync(path.join(kok, 'kuyruk', 'paylasilan', job), JSON.stringify({ ...j, paylasildi: new Date().toISOString(), media_id: 'M1' }));
  await calistir(ctx, { kok, uretBolum: ub, yeniDizi: async () => null, sonucAl: async () => ({}) });
  assert.strictEqual(yukle(kok, 'k').diziler[0].bolumler[0].durum, 'yayinda');

  // budget stop through the scheduler: uretimde, no video, the reason in the run notes
  const kok2 = tmp('dizi-ub-cal2-');
  kaydet(kok2, 'k', { diziler: [dizi()] });
  const butce = async (cx, id, o) => ({ durum: 'butce-bekliyor', dir: path.join(kok2, 'videolar', 'k-' + o.hazir.ad), neden: 'günlük sınır 0' });
  const s = await calistir(ctx, { kok: kok2, uretBolum: (cx, d, n, o) => uretBolum(cx, d, n, { ...o, uret: butce, yaz: sessiz }), yeniDizi: async () => null, sonucAl: async () => ({}) });
  const b = yukle(kok2, 'k').diziler[0].bolumler[0];
  assert.strictEqual(b.durum, 'uretimde');
  assert.strictEqual(b.video, undefined);
  assert.ok(s.notlar.some(x => /bütçe bekliyor.*günlük sınır 0/.test(x)), s.notlar.join(' | '));
});

test('default new series: ranks within each source, interleaves, passes kok, keeps only ok splits', async () => {
  const { yeniDiziYap } = require('../calistir');
  const ogeler = [
    { id: 'reddit-a', tur: 'reddit', puan: 9000 }, { id: 'eksi-1', tur: 'eksi', puan: 400 },
    { id: 'reddit-b', tur: 'reddit', puan: 20000 }, { id: 'eksi-2', tur: 'eksi', puan: 900 },
  ];
  let kokGelen = null; const sira = [];
  const kaynak = { adaylar: async (cx, o) => { kokGelen = o.kok; return { ogeler, notlar: [] }; } };
  const bol = { bol: async (cx, h) => { sira.push(h.id); return h.id === 'eksi-2' ? { ok: false, neden: 'kisa' } : { ok: true, dizi: { id: h.id, kanal: 'k', durum: 'aktif', bolumler: [] } }; } };
  const yeni = yeniDiziYap({ kaynak, bol });
  const simdi = new Date('2026-10-30T12:00:00Z');
  const a = await yeni({ kanal: 'k' }, { simdi, diziler: [], kok: '/kok' });
  const b = await yeni({ kanal: 'k' }, { simdi, diziler: [a], kok: '/kok' });
  const c = await yeni({ kanal: 'k' }, { simdi, diziler: [a, b], kok: '/kok' });
  assert.strictEqual(kokGelen, '/kok');
  assert.deepStrictEqual(sira, ['eksi-2', 'reddit-b', 'eksi-1', 'reddit-a']);   // eksi-2 failed the split and was skipped
  assert.deepStrictEqual([a.id, b.id, c.id], ['reddit-b', 'eksi-1', 'reddit-a']);   // 900 fav, then 20000, 400, 9000: turns, not one scale
  assert.strictEqual(a.olusturma, simdi.toISOString());
  assert.strictEqual(await yeni({ kanal: 'k' }, { simdi, diziler: [a, b, c], kok: '/kok' }), null);
});

test('uret without hazir: idea pool, model-written script with the oxygbio example, voice gate as before', async () => {
  const ctx = kanalCtx(), vdir = tmp('dizi-ub-fikir-');
  const fikir = { id: 'f-1', baslik: 'Deneme fikri', oncul: 'ö', kanca: 'k', tirmanis: [], kapanis: 'son', kaynaklar: [{ kaynak: 'x', baslik: 'kaynak', url: 'https://x' }], durum: 'secildi', puan: 7, puan_detay: {}, video: path.relative(O.KOK, vdir) };
  O.yazJson(path.join(ctx.dir, 'fikirler.json'), { kanal: 'k', fikirler: [fikir], ham_konular: [] });
  const satirlar = [{ rol: 'Ali', metin: 'Bir.' }, { rol: 'Ali', metin: 'İki.' }, { rol: 'Ali', metin: 'Üç.' }];
  const istemler = [];
  const model = async istem => { istemler.push(istem); return { metin: JSON.stringify(istemler.length === 1 ? { baslik: 'B', oncul: 'ö', satirlar, bilgiler: [], aciklama_instagram: 'a' } : { bilgiler: [], eksik: [] }) }; };
  sesHazir(vdir, 3, 'Ali');
  const kok = tmp('dizi-ub-kuyruk-');
  const r = await U.uret(ctx, 'f-1', { onay: false, yaz: sessiz, calistir: model, kok });
  assert.strictEqual(r.durum, 'onay-bekliyor');
  assert.ok(istemler[0].includes(fs.readFileSync(path.join(O.KOK, 'videolar', 'oxygbio-v01-ucak', 'metin.md'), 'utf8').trim().split('\n')[0]), 'default example video is oxygbio-v01-ucak');
  const v = JSON.parse(fs.readFileSync(path.join(vdir, 'video.json'), 'utf8'));
  assert.deepStrictEqual(v.satirlar, satirlar);
  assert.deepStrictEqual(v.anlaticilar, { Ali: 'V1' });
  assert.strictEqual(v.hiz, 1.15);
  assert.ok(!('bolum' in v) && !('etiket' in v));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(vdir, 'uretim.json'), 'utf8')).bekleyen.adim, 'ses');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(ctx.dir, 'fikirler.json'), 'utf8')).fikirler[0].durum, 'uretiliyor');
  assert.deepStrictEqual(kuyrukDosyalari(kok), []);
  // kimlik.ornek_video replaces the hard-coded example
  const ctx2 = kanalCtx({ ornek_video: 'ornek-yok-xyz' }), vdir2 = tmp('dizi-ub-fikir2-');
  O.yazJson(path.join(ctx2.dir, 'fikirler.json'), { kanal: 'k', fikirler: [{ ...fikir, video: path.relative(O.KOK, vdir2) }], ham_konular: [] });
  await assert.rejects(U.uret(ctx2, 'f-1', { yaz: sessiz, calistir: model }), /ornek-yok-xyz/);
});

test('kuyrugaYaz: hesap only when given; the oxygbio job shape is unchanged', () => {
  const kok = tmp('dizi-ub-is-');
  const a = JSON.parse(fs.readFileSync(U.kuyrugaYaz({ video: 'videolar/a', mp4: 'a.mp4', aciklama: 'x', onayGerekli: true }, kok), 'utf8'));
  assert.deepStrictEqual(Object.keys(a), ['video', 'mp4', 'aciklama', 'ne_zaman', 'kaynak', 'onay_gerekli']);
  const b = JSON.parse(fs.readFileSync(U.kuyrugaYaz({ video: 'videolar/b', mp4: 'b.mp4', aciklama: 'x', onayGerekli: true, hesap: 'deneme_kanal', kaynak: 'dizi' }, kok), 'utf8'));
  assert.strictEqual(b.hesap, 'deneme_kanal');
  assert.strictEqual(b.kaynak, 'dizi');
  assert.strictEqual(b.onay_gerekli, true);
});
