// Shared helpers for the topic radar: paths, channel files, JSON I/O, text normalisation, spend ledger, lock.
// Everything here is dependency-free so the radar runs on a fresh clone with only Node 18+.
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const KOK = path.join(__dirname, '..');
const AYAR_DIR = path.join(os.homedir(), '.video-mutfagi');      // user secrets (never in the repo)
const KAYIT = path.join(KOK, 'kayit', 'konu');                     // run data (git-ignored)

class KonuHatasi extends Error { constructor(m) { super(m); this.name = 'KonuHatasi'; } }
const hata = m => { throw new KonuHatasi(m); };

function okuJson(f, varsayilan) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); }
  catch (e) { if (varsayilan !== undefined && e.code === 'ENOENT') return varsayilan; hata(`${path.relative(KOK, f)} okunamadı: ${e.code === 'ENOENT' ? 'dosya yok' : e.message}`); }
}
// write to a temp file first so a crash never leaves half a JSON file behind
function yazJson(f, veri) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const gecici = f + '.' + process.pid + '.tmp';
  fs.writeFileSync(gecici, JSON.stringify(veri, null, 2) + '\n');
  fs.renameSync(gecici, f);
}
const satirEkle = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, JSON.stringify(o) + '\n'); };
const satirlarOku = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };

// ---- channel files
const kanalDir = kanal => path.join(KOK, 'kanal', kanal);
function kanalYukle(kanal) {
  if (!kanal || !/^[\w.-]+$/.test(kanal)) hata('kanal adını ver. Örnek: node konu/radar.js topla oxygbio');
  const dir = kanalDir(kanal);
  if (!fs.existsSync(path.join(dir, 'kimlik.json'))) hata(`kanal/${kanal}/kimlik.json yok. Önce kanal kimliğini kur (kanal/KIMLIK-REHBERI.md).`);
  const kimlik = okuJson(path.join(dir, 'kimlik.json'));
  const ayarF = path.join(dir, 'konu.json');
  if (!fs.existsSync(ayarF)) hata(`kanal/${kanal}/konu.json yok. Şablonu kopyala: kanal/sablon/konu.json → kanal/${kanal}/konu.json (konu/BENIOKU.md).`);
  const ayar = okuJson(ayarF);
  return { kanal, dir, kimlik, ayar, kayit: path.join(KAYIT, kanal) };
}

// videolar/<kanal>-vNN-<konu>/ folders of a channel, sorted by number
function kanalVideolari(kanal) {
  const dir = path.join(KOK, 'videolar');
  const re = new RegExp(`^${kanal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-v(\\d+)-`);
  return (fs.existsSync(dir) ? fs.readdirSync(dir) : []).map(ad => ({ ad, m: ad.match(re) })).filter(x => x.m)
    .map(x => ({ ad: x.ad, no: +x.m[1], dir: path.join(dir, x.ad) })).sort((a, b) => a.no - b.no);
}

// The channel's running series and the title of its first video: house style for prompts, and the words that
// every episode shares (ignored when comparing ideas or naming folders).
function ornekBaslik(ctx) {
  for (const v of kanalVideolari(ctx.kanal)) { const j = okuJson(path.join(v.dir, 'video.json'), null); if (j && j.baslik) return j.baslik; }
  return ctx.kimlik.konu || '';
}
const seriKelimeleri = ctx => kelimeler(`${ctx.kimlik.konu || ''} ${ornekBaslik(ctx)}`);

// ---- text
// Turkish-aware lower case + strip punctuation; used for de-duplication and keyword matching.
const norm = s => String(s || '').normalize('NFC').toLocaleLowerCase('tr').replace(/[’'`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const DURAK = new Set('ve ile bir bu şu o da de mi mı mu mü ne için gibi en çok daha ki ya the a an of to in on is are and or for with what how why if olursa olur olsa olurdu nasıl neden'.split(' '));
const kelimeler = s => norm(s).split(' ').filter(w => w.length > 2 && !DURAK.has(w));
// word-overlap (Jaccard) on crude stems: the first 5 letters absorb most Turkish suffixes ("zirvesinde" ~ "zirve")
function benzerlik(a, b) {
  const kok = s => new Set(kelimeler(s).map(w => w.slice(0, 5)));
  const A = kok(a), B = kok(b);
  if (!A.size || !B.size) return 0;
  let ortak = 0; for (const w of A) if (B.has(w)) ortak++;
  return ortak / (A.size + B.size - ortak);
}
const ozet = (s, n = 300) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const kisaHash = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 8);
function slug(s, n = 24) {
  const tr = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  const t = String(s).toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, c => tr[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (t.slice(0, n).replace(/-+$/, '') || 'konu');
}

// ---- time (local calendar day/month for budgets; ISO for records)
const simdi = () => new Date();
const gunAnahtar = (d = simdi()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ayAnahtar = (d = simdi()) => gunAnahtar(d).slice(0, 7);
const damga = (d = simdi()) => gunAnahtar(d).replace(/-/g, '') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');

// ---- spend ledger: kayit/konu/<kanal>/harcama.jsonl  {zaman, gun, tur: karakter|kredi|video, miktar, video}
const defterF = ctx => path.join(ctx.kayit, 'harcama.jsonl');
function harcamaYaz(ctx, tur, miktar, video) { satirEkle(defterF(ctx), { zaman: simdi().toISOString(), gun: gunAnahtar(), tur, miktar, video }); }
function harcamaToplam(ctx, tur, d = simdi()) {
  const g = gunAnahtar(d), a = ayAnahtar(d);
  let gun = 0, ay = 0;
  for (const s of satirlarOku(defterF(ctx))) if (s.tur === tur) { if (s.gun === g) gun += s.miktar; if (s.gun && s.gun.startsWith(a)) ay += s.miktar; }
  return { gun, ay };
}

// ---- one run at a time per channel (a scheduler may fire while a long render is still going)
function kilitAl(ctx, ne) {
  const f = path.join(ctx.kayit, 'kilit.json');
  const k = okuJson(f, null);
  if (k && Date.now() - Date.parse(k.zaman) < 6 * 3600e3) {
    let yasiyor = true; try { process.kill(k.pid, 0); } catch (e) { yasiyor = e.code === 'EPERM'; }
    if (yasiyor) hata(`Bu kanalda başka bir radar işi sürüyor (${k.ne}, ${k.zaman}). Bitince tekrar dene.`);
  }
  yazJson(f, { pid: process.pid, ne, zaman: simdi().toISOString() });
  return () => { try { if (okuJson(f, {}).pid === process.pid) fs.unlinkSync(f); } catch (e) { } };
}

module.exports = { KOK, AYAR_DIR, KAYIT, KonuHatasi, hata, okuJson, yazJson, satirEkle, satirlarOku, kanalDir, kanalYukle, kanalVideolari, ornekBaslik, seriKelimeleri, norm, kelimeler, benzerlik, ozet, kisaHash, slug, simdi, gunAnahtar, ayAnahtar, damga, harcamaYaz, harcamaToplam, kilitAl };
