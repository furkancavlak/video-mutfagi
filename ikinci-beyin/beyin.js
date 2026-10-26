#!/usr/bin/env node
// Second brain: a plain Markdown folder (opens in Obsidian) that the agent reads at every session start, so it
// remembers the channel, the decisions, the user's corrections and how each video did. No dependencies.
//
//   node ikinci-beyin/beyin.js kur [--yol <klasor>] [--kanal <ad>]   create the vault from sablon/ (never overwrites)
//   node ikinci-beyin/beyin.js ozet [--n 5] [--kanca]                 short context for the session start
//   node ikinci-beyin/beyin.js video-kaydet videolar/<video> [--izlenme 1200 --begeni 80 ...] [--tuttu "..."] [--tutmadi "..."]
//   node ikinci-beyin/beyin.js kural "..." --neden "..."              append a correction (also: karar, stil)
//   node ikinci-beyin/beyin.js kanca kur | kaldir | durum             Claude Code session-start hook (this machine only)
//   node ikinci-beyin/beyin.js yer                                    where the vault is
//
// Settings: ayarlar/ikinci-beyin.json ({ "yol": ... }). Every command also takes --yol <klasor> to point elsewhere.
// Default vault: ikinci-beyin/kasa/ (gitignored: it holds the user's own notes and numbers).
const fs = require('fs'), path = require('path');

const KOK = path.join(__dirname, '..');
const SABLON = path.join(__dirname, 'sablon');
const AYAR_F = path.join(KOK, 'ayarlar', 'ikinci-beyin.json');
const VARSAYILAN = 'ikinci-beyin/kasa';
const OZET_SINIR = 8000;          // characters; the session-start context must stay small
const OLCUM = [                   // Instagram insight name -> Turkish label used in the notes
  ['views', 'izlenme'], ['reach', 'erisim'], ['likes', 'begeni'], ['comments', 'yorum'], ['shares', 'paylasim'], ['saved', 'kaydetme'],
];
const ETIKET = { izlenme: 'İzlenme', erisim: 'Erişim', begeni: 'Beğeni', yorum: 'Yorum', paylasim: 'Paylaşım', kaydetme: 'Kaydetme' };

const fail = m => { console.error('\nHATA: ' + m + '\n'); process.exit(1); };
const okuJ = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const yazJ = (f, j) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n'); };
const oku = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/^﻿/, '') : '';
const arg = n => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : null; };
const bugun = () => new Date().toLocaleDateString('sv-SE');            // YYYY-MM-DD, local time
const sayi = v => (v === null || v === undefined || v === '') ? '-' : Number(v).toLocaleString('tr-TR');
const ileri = p => p.split(path.sep).join('/');
const relKok = p => ileri(path.relative(KOK, path.resolve(p)));

// --- where the vault lives
function kasaYolu(zorunlu = true) {
  const elle = arg('--yol');
  if (elle) return path.resolve(KOK, elle);
  if (fs.existsSync(AYAR_F)) {
    try { const a = okuJ(AYAR_F); if (a.yol) return path.resolve(KOK, a.yol); } catch (e) { fail('ayarlar/ikinci-beyin.json okunamadı: ' + e.message); }
  }
  if (zorunlu) fail('ikinci beyin kurulu değil. Kurmak için: node ikinci-beyin/beyin.js kur');
  return null;
}
const kuruluMu = k => k && fs.existsSync(path.join(k, 'BASLA-BURADAN.md'));

// --- Markdown helpers
const yorumsuz = s => s.replace(/<!--[\s\S]*?-->/g, '');
function onBilgi(s) {                                   // frontmatter -> { alanlar, govde }
  const m = s.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { alanlar: {}, govde: s };
  const alanlar = {};
  for (const l of m[1].split(/\r?\n/)) { const k = l.match(/^([\w-]+):\s*(.*)$/); if (k) alanlar[k[1]] = k[2].replace(/^"(.*)"$/, '$1'); }
  return { alanlar, govde: s.slice(m[0].length) };
}
const tirnak = v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const maddeler = s => yorumsuz(s).split(/\r?\n/).filter(l => /^- \*\*/.test(l.trim())).map(l => l.trim());
function bolum(govde, baslik) {                         // bullet lines under "## <baslik>", empty bullets dropped
  const m = govde.match(new RegExp('^## ' + baslik + '\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))', 'm'));
  if (!m) return [];
  return yorumsuz(m[1]).split(/\r?\n/).map(l => l.trim()).filter(l => /^- \S/.test(l)).map(l => l.slice(2));
}

// ---------------------------------------------------------------- kur
function kanalBilgisi(ad) {
  if (!ad) return {};
  const f = path.join(KOK, 'kanal', ad, 'kimlik.json');
  if (!fs.existsSync(f)) fail('kanal kimliği yok: kanal/' + ad + '/kimlik.json');
  const k = okuJ(f), kisa = s => String(s || '').replace(/\s+/g, ' ').trim();
  return { hesap: kisa(k.hesap), konu: kisa(k.konu), ton: kisa(k.ton) };
}

function kopyala(kaynak, hedef, degisken, sonuc) {
  fs.mkdirSync(hedef, { recursive: true });
  for (const ad of fs.readdirSync(kaynak)) {
    const k = path.join(kaynak, ad), h = path.join(hedef, ad);
    if (fs.statSync(k).isDirectory()) { kopyala(k, h, degisken, sonuc); continue; }
    if (fs.existsSync(h)) { sonuc.kalan.push(h); continue; }     // never overwrite the user's notes
    fs.writeFileSync(h, oku(k).replace(/\{\{(\w+)\}\}/g, (_, n) => degisken[n] ?? ''));
    sonuc.yeni.push(h);
  }
}

function kur() {
  const onceki = kasaYolu(false);
  const kasa = arg('--yol') ? path.resolve(KOK, arg('--yol')) : (onceki || path.join(KOK, VARSAYILAN));
  const kanal = arg('--kanal');
  const sonuc = { yeni: [], kalan: [] };
  kopyala(SABLON, kasa, { tarih: bugun(), ...kanalBilgisi(kanal) }, sonuc);
  const icerde = !path.relative(KOK, kasa).startsWith('..') && !path.isAbsolute(path.relative(KOK, kasa));
  const ayar = fs.existsSync(AYAR_F) ? okuJ(AYAR_F) : {};
  yazJ(AYAR_F, { ...ayar, yol: icerde ? relKok(kasa) : ileri(kasa), ...(kanal ? { kanal } : {}), kuruldu: ayar.kuruldu || bugun() });
  console.log(`İkinci beyin hazır: ${kasa}`);
  console.log(`  yeni dosya: ${sonuc.yeni.length}${sonuc.kalan.length ? `  ·  zaten vardı, dokunulmadı: ${sonuc.kalan.length}` : ''}`);
  if (icerde) {
    let gizli = false;   // a custom folder inside the repo is not covered by .gitignore unless the user added it
    try { require('child_process').execFileSync('git', ['check-ignore', '-q', path.join(kasa, 'kanal.md')], { cwd: KOK, stdio: 'ignore' }); gizli = true; } catch (e) { }
    console.log(gizli ? '  Klasör repoda ama git\'e girmez (.gitignore). Notların yalnız bu bilgisayarda durur.'
      : '  UYARI: bu klasör repoda ve git\'e girebilir. Notların herkese açık olmasın: klasörü .gitignore\'a ekle ya da repo dışında bir yer seç.');
  }
  console.log('  Obsidian ile açmak için: Obsidian → "Open folder as vault" → bu klasörü seç.');
  console.log('  Sıradaki: kanal.md dosyasındaki hedefi kullanıcıyla doldur, sonra: node ikinci-beyin/beyin.js ozet');
}

// ---------------------------------------------------------------- kural / karar / stil
function ekleMadde(tur) {
  const kasa = kasaYolu(), dosya = { kural: 'kurallar.md', karar: 'kararlar.md', stil: 'stil.md' }[tur];
  const metin = (process.argv[3] || '').trim(), neden = (arg('--neden') || '').trim();
  if (!metin || metin.startsWith('--')) fail(`yazılacak ${tur} yok. Örnek: node ikinci-beyin/beyin.js ${tur} "..." --neden "..."`);
  if (!neden) fail(`--neden gerekli. Nedeni olmayan ${tur}, bir sonraki oturumda yanlış yere uygulanır.`);
  const f = path.join(kasa, dosya), tek = s => s.replace(/\s+/g, ' ');
  const satir = `- **${arg('--tarih') || bugun()} · ${tur}:** ${tek(metin)} **neden:** ${tek(neden)}`;
  if (maddeler(oku(f)).some(m => m.includes(tek(metin)))) return console.log(`Bu ${tur} zaten yazılı, tekrar eklenmedi.`);
  const eski = oku(f);
  fs.writeFileSync(f, eski + (eski.endsWith('\n') || !eski ? '' : '\n') + satir + '\n');
  console.log(`${dosya} ← ${satir}`);
}

// ---------------------------------------------------------------- video-kaydet
// Folder of a queue job: konu/uret.js fills "video"; a hand-added job only has the mp4 under videolar/<ad>/.
function isKlasoru(j) {
  const duz = p => String(p).replace(/\\/g, '/');       // jobs may be written on Windows and read on a server
  if (j.video) return duz(j.video).replace(/\/$/, '');
  const m = j.mp4 && duz(j.mp4).match(/^(videolar\/[^/]+)\//);
  return m ? m[1] : null;
}

function kuyrukIsleri(klasor) {
  const out = [];
  for (const d of ['paylasilan', 'bekleyen', 'hatali']) {
    const dir = path.join(KOK, 'kuyruk', d);
    if (!fs.existsSync(dir)) continue;
    for (const ad of fs.readdirSync(dir).filter(a => a.endsWith('.json'))) {
      try { const j = okuJ(path.join(dir, ad)); if (isKlasoru(j) === klasor) out.push({ ...j, id: ad.replace(/\.json$/, ''), yer: d }); } catch (e) { }
    }
  }
  return out;
}

function olcumAl(j) {                                   // queue "sonuc" (English names) -> Turkish keys
  const s = j.sonuc || {}, o = {};
  for (const [en, tr] of OLCUM) if (s[en] !== undefined && s[en] !== null) o[tr] = s[en];
  return o;
}

function videoKaydet(klasorArg, se = {}) {
  const kasa = se.kasa || kasaYolu();
  const yaz = se.sessiz ? () => { } : console.log;
  if (!klasorArg) fail('video klasörü gerekli. Örnek: node ikinci-beyin/beyin.js video-kaydet videolar/oxygbio-v01-ucak');
  const dir = path.resolve(KOK, klasorArg), klasor = relKok(dir), ad = path.basename(dir);
  if (!fs.existsSync(path.join(dir, 'video.json'))) fail('video.json yok: ' + klasor);
  const v = okuJ(path.join(dir, 'video.json'));

  let hesap = '';
  try { if (v.kanal) hesap = okuJ(path.resolve(dir, v.kanal)).hesap || ''; } catch (e) { }
  const metinBaslik = (oku(path.join(dir, 'metin.md')).match(/^#\s+(.+)$/m) || [])[1] || '';
  const baslik = v.baslik || metinBaslik.replace(/\s*\(.*?\)\s*$/, '') || ad;
  const kanca = ((v.satirlar || [])[0] || {}).metin ? v.satirlar[0].metin.replace(/\[[^\]]*\]\s*/g, '').replace(/\s+/g, ' ').trim() : '';
  let sure = null;
  try { sure = okuJ(path.join(dir, 'ses', 'zaman.json')).toplam; } catch (e) { }
  const yol = fs.existsSync(path.join(dir, 'ucretli.json')) ? 'ücretsiz + ücretli tarif var' : 'ücretsiz';

  // posting + numbers: queue first, then manual flags (--izlenme ...) win; earlier manual values are kept
  const f = path.join(kasa, 'videolar', ad + '.md');
  const eski = oku(f), { alanlar: eskiAlan, govde: eskiGovde } = onBilgi(eski);
  const isler = se.isler || kuyrukIsleri(klasor);
  const paylasilan = isler.filter(j => j.yer === 'paylasilan').sort((a, b) => new Date(b.paylasildi) - new Date(a.paylasildi))[0];
  const bekleyen = isler.find(j => j.yer === 'bekleyen'), hatali = isler.find(j => j.yer === 'hatali');
  const olcum = paylasilan ? olcumAl(paylasilan) : {};
  for (const tr of Object.keys(ETIKET)) { const a = arg('--' + tr); if (a !== null && a !== '') olcum[tr] = Number(String(a).replace(/[.,\s]/g, '')); }
  const link = arg('--link') || (paylasilan && paylasilan.link) || eskiAlan.link || '';
  const paylasimTarihi = arg('--paylasildi') || (paylasilan && paylasilan.paylasildi ? new Date(paylasilan.paylasildi).toLocaleDateString('sv-SE') : '') || eskiAlan.paylasildi || '';
  const olcumTarihi = arg('--tarih') || (paylasilan && paylasilan.sonuc_zamani ? new Date(paylasilan.sonuc_zamani).toLocaleDateString('sv-SE') : bugun());
  const durum = paylasilan ? 'paylaşıldı' : link || paylasimTarihi ? 'paylaşıldı (elle)' : bekleyen ? `kuyrukta, paylaşım zamanı ${bekleyen.ne_zaman ? new Date(bekleyen.ne_zaman).toLocaleString('tr-TR') : 'atanmadı'}` : hatali ? 'kuyrukta hata verdi (kuyruk/hatali/)' : 'henüz paylaşılmadı';

  // result history: keep earlier rows, one row per measurement day
  const satirlar = (eskiGovde.match(/<!-- otomatik:bas[\s\S]*?<!-- otomatik:son -->/) || [''])[0].split(/\r?\n/).filter(l => /^\| \d{4}-\d\d-\d\d /.test(l));
  const anahtarlar = Object.keys(ETIKET);
  if (Object.keys(olcum).length) {
    const i = satirlar.findIndex(l => l.startsWith(`| ${olcumTarihi} `));
    const ayni = i >= 0 ? satirlar[i].split('|').map(x => x.trim()).slice(2) : [];   // same day: keep numbers not given now
    const yeni = `| ${olcumTarihi} | ` + anahtarlar.map((k, j) => olcum[k] !== undefined ? sayi(olcum[k]) : (ayni[j] || '-')).join(' | ') + ' |';
    if (i >= 0) satirlar[i] = yeni; else satirlar.push(yeni);
    satirlar.sort();                                    // rows start with YYYY-MM-DD, so text order is date order
  }
  const sonSatir = satirlar[satirlar.length - 1];
  const sonDeger = sonSatir ? Object.fromEntries(anahtarlar.map((k, i) => [k, sonSatir.split('|').map(x => x.trim())[i + 2]])) : {};

  const blok = [
    '<!-- otomatik:bas · bu blok "node ikinci-beyin/beyin.js video-kaydet" ile yeniden yazılır; elle yazdıklarını aşağıdaki bölümlere yaz -->',
    `- **Klasör:** \`${klasor}\``,
    kanca ? `- **Kanca:** "${kanca}"` : null,
    sure ? `- **Süre:** ${Math.round(sure)} sn` : null,
    `- **Görüntü:** ${yol}`,
    `- **Durum:** ${durum}${paylasimTarihi ? ' · ' + paylasimTarihi : ''}${link ? ' · ' + link : ''}`,
    '',
    satirlar.length ? '| Ölçüm günü | ' + anahtarlar.map(k => ETIKET[k]).join(' | ') + ' |\n|---|' + anahtarlar.map(() => '---:').join('|') + '|\n' + satirlar.join('\n')
      : 'Henüz sonuç sayısı yok. Paylaşımdan 1 gün ve 7 gün sonra: node kuyruk/kuyruk.js sonuclar, ardından bu komut.',
    '<!-- otomatik:son -->',
  ].filter(x => x !== null).join('\n');

  const fm = ['---', 'tur: video', `klasor: ${klasor}`, hesap && `kanal: ${tirnak(hesap)}`, `baslik: ${tirnak(baslik)}`, `durum: ${tirnak(durum.split(',')[0])}`,
    paylasimTarihi && `paylasildi: ${paylasimTarihi}`, link && `link: ${link}`,
    ...anahtarlar.filter(k => sonDeger[k] && sonDeger[k] !== '-').map(k => `${k}: ${sonDeger[k].replace(/\./g, '')}`),
    `olusturuldu: ${eskiAlan.olusturuldu || bugun()}`, `guncellendi: ${bugun()}`, '---'].filter(Boolean).join('\n');

  let govde;
  if (/<!-- otomatik:bas[\s\S]*?<!-- otomatik:son -->/.test(eskiGovde)) govde = eskiGovde.replace(/<!-- otomatik:bas[\s\S]*?<!-- otomatik:son -->/, () => blok);
  else govde = `\n# ${baslik}\n\n${blok}\n\n## Ne tuttu\n\n<!-- İzleyici neyi sevdi? Sayıya ya da yoruma dayanarak yaz. Tahminse "tahmin:" diye başlat. -->\n\n## Ne tutmadı\n\n<!-- Nerede kaybettik? Genel bir ders çıkarsa kurallar.md ya da kararlar.md'ye de yaz. -->\n\n## Notlar\n`;
  for (const [bayrak, bas] of [['--tuttu', 'Ne tuttu'], ['--tutmadi', 'Ne tutmadı']]) {
    const not = arg(bayrak);
    if (!not || bolum(govde, bas).includes(not.trim())) continue;
    govde = govde.replace(new RegExp('(^## ' + bas + '\\s*$[\\s\\S]*?)(?=^## |(?![\\s\\S]))', 'm'), (m) => m.replace(/\s*$/, '') + `\n- ${not.trim()}\n\n`);
  }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, fm + '\n' + govde.replace(/^\n*/, '\n'));
  yaz(`${eski ? 'Güncellendi' : 'Yazıldı'}: ${f}`);
  yaz(`  ${baslik} · ${durum}${Object.keys(olcum).length ? ' · ' + anahtarlar.filter(k => olcum[k] !== undefined).map(k => `${ETIKET[k].toLocaleLowerCase('tr')} ${sayi(olcum[k])}`).join(', ') : ''}`);
  if (!bolum(govde, 'Ne tuttu').length && !bolum(govde, 'Ne tutmadı').length && Object.keys(olcum).length)
    yaz('  Sıradaki: kullanıcıyla "ne tuttu, ne tutmadı" bölümlerini yaz (--tuttu "..." --tutmadi "..." ya da dosyayı düzenle).');
  return f;
}

// Called by kuyruk.js after "sonuclar": refresh the notes of posted videos. Silent and harmless when no vault.
function kuyruktanKaydet(isler) {
  const kasa = kasaYolu(false);
  if (!kuruluMu(kasa)) return 0;
  let n = 0;
  for (const klasor of [...new Set(isler.map(isKlasoru).filter(Boolean))]) {
    if (!fs.existsSync(path.join(KOK, klasor, 'video.json'))) continue;
    try { videoKaydet(klasor, { kasa, sessiz: true }); n++; } catch (e) { }
  }
  return n;
}

// ---------------------------------------------------------------- ozet
function videoNotlari(kasa) {
  const dir = path.join(kasa, 'videolar');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(a => a.endsWith('.md') && a !== 'BENIOKU.md').map(a => {
    const { alanlar, govde } = onBilgi(oku(path.join(dir, a)));
    return { ad: a.replace(/\.md$/, ''), ...alanlar, tuttu: bolum(govde, 'Ne tuttu'), tutmadi: bolum(govde, 'Ne tutmadı') };
  }).sort((x, y) => String(y.paylasildi || y.guncellendi || '').localeCompare(String(x.paylasildi || x.guncellendi || '')));
}

function ozet() {
  const kanca = process.argv.includes('--kanca');
  const kasa = kasaYolu(!kanca);
  if (!kuruluMu(kasa)) { if (kanca) return; fail('ikinci beyin klasörü bulunamadı: ' + kasa + '  (node ikinci-beyin/beyin.js kur)'); }
  const n = Math.max(1, Number(arg('--n')) || 5), out = [];
  const bas = (b, l) => { if (l.length) out.push('', `## ${b}`, ...l); };
  const sonN = (l, k) => (l.length > k ? [`(${l.length - k} eski kayıt dosyada)`] : []).concat(l.slice(-k));
  const etkin = f => maddeler(oku(path.join(kasa, f))).filter(m => !m.startsWith('- ~~'));

  const profil = maddeler(onBilgi(oku(path.join(kasa, 'kanal.md'))).govde).filter(m => !/:\*\*\s*$/.test(m));
  bas('Kanal', profil.length ? profil : ['(Profil boş. Kullanıcıyla kanal.md dosyasını doldur: hesap, konu, hedef.)']);
  if (profil.length && !profil.some(m => m.startsWith('- **Hedef:'))) out.push('- (Hedef yazılmamış. Kullanıcıya kanalın hedefini sor, kanal.md\'ye yaz.)');
  bas('Son durum', maddeler(onBilgi(oku(path.join(kasa, 'son-durum.md'))).govde).filter(m => !/:\*\*\s*$/.test(m)));
  bas('Kurallar (kullanıcının düzeltmeleri, hepsine uy)', sonN(etkin('kurallar.md'), 3 * n));
  bas('Kararlar (son)', sonN(etkin('kararlar.md'), n));
  bas('Stil kuralları', sonN(etkin('stil.md'), 2 * n));

  const vid = videoNotlari(kasa), olculu = vid.filter(x => x.izlenme);
  const vs = vid.slice(0, n).map(x => {
    const s = OLCUM.map(o => o[1]).filter(k => x[k] !== undefined).map(k => `${ETIKET[k].toLocaleLowerCase('tr')} ${sayi(x[k])}`).join(', ');
    let l = `- ${x.paylasildi || 'paylaşılmadı'} · ${x.baslik || x.ad}${s ? ' · ' + s : ' · sonuç yok'}`;
    if (x.tuttu.length) l += `\n  tuttu: ${x.tuttu.slice(0, 2).join(' / ')}`;
    if (x.tutmadi.length) l += `\n  tutmadı: ${x.tutmadi.slice(0, 2).join(' / ')}`;
    return l;
  });
  if (olculu.length >= 2) {
    const ort = Math.round(olculu.reduce((t, x) => t + Number(x.izlenme), 0) / olculu.length), en = olculu.reduce((a, b) => Number(b.izlenme) > Number(a.izlenme) ? b : a);
    vs.push(`- Ortalama izlenme ${sayi(ort)} (${olculu.length} video). En iyisi: ${en.baslik || en.ad} (${sayi(en.izlenme)}).`);
  }
  // posted from the queue but never recorded -> remind the agent
  const kayitli = new Set(vid.map(x => x.klasor)), eksik = new Set();
  const pdir = path.join(KOK, 'kuyruk', 'paylasilan');
  if (fs.existsSync(pdir)) for (const a of fs.readdirSync(pdir).filter(a => a.endsWith('.json'))) {
    try { const k = isKlasoru(okuJ(path.join(pdir, a))); if (k && !kayitli.has(k)) eksik.add(k); } catch (e) { }
  }
  if (eksik.size) vs.push(`- Kaydı olmayan paylaşılmış video: ${[...eksik].join(', ')} → node ikinci-beyin/beyin.js video-kaydet <klasör>`);
  bas(`Videolar (son ${Math.min(n, vid.length)} / ${vid.length})`, vs);

  let metin = out.join('\n').trim();
  if (metin.length > OZET_SINIR) metin = metin.slice(0, OZET_SINIR) + '\n… (özet kısaltıldı; ayrıntı klasördeki notlarda)';
  const yer = ileri(path.relative(KOK, kasa).startsWith('..') ? kasa : relKok(kasa));
  if (kanca) {
    console.log(`<ikinci-beyin>\nKanalın ikinci beyninden otomatik özet (ikinci-beyin/BENIOKU.md). Kurallara ve kararlara uy. Ayrıntı gerekirse "${yer}" içindeki ilgili notu aç; hepsini birden okuma. Kullanıcı bir şeyi düzeltirse kurallar.md'ye, karar verirse kararlar.md'ye yaz; oturum sonunda son-durum.md'yi güncelle.\n\n${metin}\n</ikinci-beyin>`);
  } else console.log(`# İkinci beyin özeti (${yer})\n\n${metin}`);
}

// ---------------------------------------------------------------- kanca (Claude Code session-start hook)
const AYAR_CLAUDE = path.join(KOK, '.claude', 'settings.local.json');
const bizimMi = h => (h.hooks || []).some(x => String(x.command || '').includes('ikinci-beyin/beyin.js'));
function claudeAyar() {
  if (!fs.existsSync(AYAR_CLAUDE)) return {};
  try { return okuJ(AYAR_CLAUDE); } catch (e) { fail('.claude/settings.local.json bozuk JSON, dokunmadım. Önce dosyayı düzelt: ' + e.message); }
}
function kancaKomut(alt) {
  const s = claudeAyar(), liste = ((s.hooks || {}).SessionStart || []);
  if (alt === 'kur') {
    if (!kuruluMu(kasaYolu(false))) fail('önce ikinci beyni kur: node ikinci-beyin/beyin.js kur');
    const komut = `node "${ileri(path.join(__dirname, 'beyin.js'))}" ozet --kanca`;
    s.hooks = s.hooks || {};
    s.hooks.SessionStart = [...liste.filter(h => !bizimMi(h)), { matcher: 'startup|resume|clear|compact', hooks: [{ type: 'command', command: komut, timeout: 15 }] }];
    yazJ(AYAR_CLAUDE, s);
    console.log('Kanca kuruldu: .claude/settings.local.json (yalnız bu bilgisayarda, git\'e girmez).');
    console.log('Claude Code bu repoda her yeni oturumda özeti kendisi okur. Yeni oturum açınca çalışır.');
    console.log('Komut: ' + komut);
  } else if (alt === 'kaldir') {
    if (!liste.some(bizimMi)) return console.log('Kanca zaten kurulu değil.');
    s.hooks.SessionStart = liste.filter(h => !bizimMi(h));
    if (!s.hooks.SessionStart.length) delete s.hooks.SessionStart;
    if (!Object.keys(s.hooks).length) delete s.hooks;
    yazJ(AYAR_CLAUDE, s);
    console.log('Kanca kaldırıldı. İkinci beyin klasörüne dokunulmadı.');
  } else if (alt === 'durum') {
    console.log(liste.some(bizimMi) ? 'Kanca kurulu: Claude Code her oturumda özeti kendisi okur.' : 'Kanca kurulu değil. Ajan özeti AGENTS.md talimatıyla kendisi çalıştırır.');
  } else fail('kullanım: node ikinci-beyin/beyin.js kanca kur | kaldir | durum');
}

// ---------------------------------------------------------------- cli
if (require.main === module) {
  const k = process.argv[2];
  if (k === 'kur') kur();
  else if (k === 'ozet') ozet();
  else if (k === 'video-kaydet') videoKaydet(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null);
  else if (k === 'kural' || k === 'karar' || k === 'stil') ekleMadde(k);
  else if (k === 'kanca') kancaKomut(process.argv[3]);
  else if (k === 'yer') { const y = kasaYolu(false); console.log(kuruluMu(y) ? y : 'İkinci beyin kurulu değil (node ikinci-beyin/beyin.js kur).'); }
  else {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(4, 11).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    if (k) process.exit(1);
  }
}

module.exports = { videoKaydet, kuyruktanKaydet, kasaYolu, isKlasoru };
