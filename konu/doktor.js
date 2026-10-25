// Doctor checks for the optional topic radar, called from kurulum/doktor.js. All checks are optional (–).
const fs = require('fs'), path = require('path'), os = require('os');

module.exports = function konuDoktor(satir) {
  console.log('\nKONU RADARI (isteğe bağlı: konu/BENIOKU.md)\n');
  const KOK = path.join(__dirname, '..'), AYAR = path.join(os.homedir(), '.video-mutfagi');
  const { claudeBul } = require('./llm');
  const claude = claudeBul();
  const api = !!process.env.ANTHROPIC_API_KEY;
  let sdk = false; try { require.resolve('@anthropic-ai/sdk', { paths: [KOK] }); sdk = true; } catch (e) { }
  satir(!!claude || (api && sdk), 'Yapay zekâ bağlantısı', claude ? 'claude (abonelik) bulundu' : api && sdk ? 'ANTHROPIC_API_KEY + SDK' : '',
    api && !sdk ? 'API yolu için repo klasöründe: npm i @anthropic-ai/sdk' : 'Claude Code kur (aboneliğinle çalışır) ya da ANTHROPIC_API_KEY tanımla.', false);

  const kanallar = fs.readdirSync(path.join(KOK, 'kanal')).filter(k => fs.existsSync(path.join(KOK, 'kanal', k, 'konu.json')) && k !== 'sablon');
  if (!kanallar.length) satir(false, 'Konu ayarı (konu.json)', 'hiçbir kanalda yok', 'Konu radarı için: kanal/sablon/konu.json → kanal/<kanal>/konu.json', false);
  for (const k of kanallar) {
    let a, hata = null;
    try { a = JSON.parse(fs.readFileSync(path.join(KOK, 'kanal', k, 'konu.json'), 'utf8')); } catch (e) { hata = e.message; }
    if (hata) { satir(false, `konu.json (${k})`, 'okunamadı', `JSON hatası: ${hata}`, false); continue; }
    const o = a.otomasyon || {}, acik = Object.entries(a.kaynaklar || {}).filter(([, v]) => v.aktif).map(([n]) => n);
    satir(true, `konu.json (${k})`, `otomasyon: ${o.seviye || 'kapali'} · kaynaklar: ${acik.join(', ') || 'yok'}`, '', false);
    if (acik.includes('x')) satir(fs.existsSync(path.join(AYAR, 'x.json')), `X anahtarı (${k})`, '', `X açık ama ${path.join(AYAR, 'x.json')} yok. konu/BENIOKU.md → X.`, false);
    if (acik.includes('reddit') && (a.kaynaklar.reddit.yontem || 'rss') === 'api') satir(fs.existsSync(path.join(AYAR, 'reddit.json')), `Reddit API (${k})`, '', `Reddit API seçili ama ${path.join(AYAR, 'reddit.json')} yok.`, false);
    if ((o.seviye === 'uret' || o.seviye === 'tam')) {
      const b = o.butce || {};
      satir(!!(b.gunluk_kredi && b.aylik_kredi && b.gunluk_karakter && b.aylik_karakter), `Otomasyon bütçesi (${k})`, '', 'Otomatik üretim açık ama bütçe sınırları 0: otomasyon para harcamaz, ses adımında bekler.', false);
    }
  }
};
