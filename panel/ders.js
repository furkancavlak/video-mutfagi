#!/usr/bin/env node
// Lessons from results: puts each posted video's numbers next to how it was made (hook, length, tier, hour)
// and asks the language model for 1-3 short, checkable lessons. Writes kayit/dersler.json (newest first).
// Instagram numbers are read-only; the model runs on the user's Claude subscription, or on the pay-as-you-go API when
// konu/llm.js picks that route (no Claude Code CLI, ANTHROPIC_API_KEY set).
//
//   node panel/ders.js [--kanal <ad>] [--kok <repo>]     model settings come from kanal/<ad>/konu.json → llm
const fs = require('fs'), path = require('path');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const KOK = arg('--kok') ? path.resolve(arg('--kok')) : path.join(__dirname, '..');
const LLM = require(path.join(KOK, 'konu', 'llm.js'));
const okuJ = (f, v = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return v; } };
const kanallar = () => fs.readdirSync(path.join(KOK, 'kanal')).filter(k => fs.existsSync(path.join(KOK, 'kanal', k, 'konu.json')));

(async () => {
  const kanal = arg('--kanal') || kanallar()[0];
  if (!kanal || !kanallar().includes(kanal)) throw new Error(`kanal/${kanal}/konu.json yok.`);
  const ig = okuJ(path.join(KOK, 'kayit', 'panel-instagram.json'));
  if (!ig || !ig.gonderiler || !ig.gonderiler.length) throw new Error('Önce Sonuçlar sayfasında rakamları çek (↻).');
  // match each post to its video folder by caption, so we know how it was made
  const klasorler = fs.readdirSync(path.join(KOK, 'videolar')).filter(a => !a.startsWith('_'));
  const bilgi = klasorler.map(ad => ({ ad, v: okuJ(path.join(KOK, 'videolar', ad, 'video.json'), {}), z: okuJ(path.join(KOK, 'videolar', ad, 'ses', 'zaman.json'), {}) }));
  const ilk = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40).toLocaleLowerCase('tr');
  const satirlar = ig.gonderiler.map(g => {
    const b = bilgi.find(x => x.v.aciklama_instagram && ilk(x.v.aciklama_instagram) === ilk(g.aciklama));
    const saat = new Date(g.zaman).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
    return {
      baslik: g.baslik, tarih: g.zaman, saat, izlenme: g.views, erisim: g.reach, begeni: g.likes, yorum: g.comments, paylasim: g.shares, kayit: g.saved,
      kanca: b && b.v.satirlar ? String(b.v.satirlar[0].metin).replace(/\[[^\]]*\]\s*/g, '') : null,
      sure_sn: b && b.z.toplam ? Math.round(b.z.toplam) : null,
      gorsel: b ? (b.v.sablon ? 'şablon animasyon' : fs.existsSync(path.join(KOK, 'videolar', b.ad, 'ucretli.json')) && /ucretli/.test(g.aciklama || '') ? 'ücretli' : 'kodla animasyon') : null,
    };
  });
  const istem = fs.readFileSync(path.join(__dirname, 'istem-ders.md'), 'utf8').replace('{{veri}}', JSON.stringify(satirlar, null, 1));
  console.log(`${satirlar.length} video inceleniyor…`);
  const j = await LLM.sor(istem, { is: 'ders', efor: 'medium', ayar: (okuJ(path.join(KOK, 'kanal', kanal, 'konu.json'), {}) || {}).llm || {} });
  const kayit = { zaman: new Date().toISOString(), kanal, video: satirlar.length, dersler: (j.dersler || []).slice(0, 3) };
  const f = path.join(KOK, 'kayit', 'dersler.json');
  fs.writeFileSync(f, JSON.stringify([kayit, ...(okuJ(f, []) || [])].slice(0, 30), null, 1));
  for (const d of kayit.dersler) console.log(`• ${d.kural}  (${d.guven})\n  ${d.kanit}`);
})().catch(e => { console.error('HATA: ' + e.message); process.exit(1); });
