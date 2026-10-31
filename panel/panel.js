#!/usr/bin/env node
// Local control panel: everything that needs a click, not a conversation.
// Ideas (pick, reject, write the script), production (which step, audit score, continue), the posting queue on
// this computer and on a server, the calendar, results and the lessons drawn from them.
//
//   node panel/panel.js [--port 4747] [--acma] [--kok <repo>]
//   node panel/panel.js --ozet                    print the queue summary as JSON (the panel uses it over SSH)
//   node panel/panel.js --zaman <is-id> "YYYY-MM-DD HH:MM"
//   node panel/panel.js --diziler <kanal> | --dizi-karar <json> | --dizi-tekrar <json> | --dizi-ayar <json> | --dizi-havuz <kanal> | --dizi-havuz-ele <json> | --dizi-metin <json>
//                                                 the Diziler page on a server: print JSON; on error "HATA: ..." and exit 1 (3 = lock busy, HTTP 409)
//
// Listens on 127.0.0.1 only; every API call carries a random key made at start (it is in the printed link).
// The panel never posts and never spends by itself: queue changes go through kuyruk/kuyruk.js, production through
// konu/radar.js and panel/uret-adim.js. Each paid step (voice, then each Higgsfield step) stops first, shows its price
// and runs only after its own approval click, up to that price.
// Server: ayarlar/panel.json → "sunucu" (copy panel/ayar-ornek.json). Reached with your own `ssh`; a server video is
// viewed through GET /api/sunucu-video?yol=videolar/... (scp into kayit/sunucu-onizleme/, at most 5 files).
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const KOK = arg('--kok') ? path.resolve(arg('--kok')) : path.join(__dirname, '..');     // --kok: show another copy of the repo
const KUYRUK = path.join(KOK, 'kuyruk'), KUYRUK_JS = path.join(KUYRUK, 'kuyruk.js'), RADAR_JS = path.join(KOK, 'konu', 'radar.js');
const ARAYUZ = path.join(__dirname, 'arayuz');
const KAYIT = path.join(KOK, 'kayit'), ISLER = path.join(KAYIT, 'panel-isler');
const ONBELLEK = path.join(KAYIT, 'panel-instagram.json'), DERSLER = path.join(KAYIT, 'dersler.json');
const PORT = +(arg('--port') || 4747);
const ANAHTAR = crypto.randomBytes(18).toString('base64url');

const okuJ = (f, v = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return v; } };
const icinde = (f, d) => path.resolve(f).startsWith(path.resolve(d) + path.sep);
const isler = alt => {
  const d = path.join(KUYRUK, alt);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => ({ id: f.replace(/\.json$/, ''), ...okuJ(path.join(d, f), {}) }));
};
const nodeCalistir = (betik, args, sure = 120e3) => {
  const r = spawnSync(process.execPath, [betik, ...args], { cwd: KOK, encoding: 'utf8', timeout: sure });
  const cikti = ((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status !== 0) throw new Error(cikti.replace(/^[\s\S]*HATA:\s*/m, '').slice(0, 400) || 'komut başarısız');
  return cikti;
};
// "2026-10-27T19:00+03:00" from the browser -> the same, always with the UTC offset, so a server in another time zone
// (often UTC) posts at the moment the user picked. Without an offset this computer's own is used.
const iki = n => String(n).padStart(2, '0');
const zamanMetni = z => {
  const m = String(z || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) throw new Error('zaman anlaşılmadı');
  let o = m[6];
  if (!o) { const dk = -new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTimezoneOffset(); o = `${dk < 0 ? '-' : '+'}${iki(Math.floor(Math.abs(dk) / 60))}:${iki(Math.abs(dk) % 60)}`; }
  else if (o !== 'Z' && !o.includes(':')) o = o.slice(0, 3) + ':' + o.slice(3);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}${o}`;
};

// ---------- accounts: a job without `hesap` belongs to oxygbio; kimlik.hesap may be '@handle'
const HESAP0 = 'oxygbio';
const hesapTemiz = h => String(h || '').trim().replace(/^@/, '').trim().toLowerCase() || null;   // same rule as dizi/calistir.js hesapAd
const isHesap = j => hesapTemiz(j.hesap) || HESAP0;
// account of a channel; only for a name in kanal/ (never builds a path from raw input); null = the channel has none
const kanalHesap = k => { if (!kanallar().includes(k)) throw new Error('kanal yok'); return kanalHesapOku(k); };
const kanalHesapOku = k => hesapTemiz((okuJ(path.join(KOK, 'kanal', k, 'kimlik.json'), {}) || {}).hesap);
const hesapGuvenli = h => { if (h && !/^[\w.-]+$/.test(h)) throw new Error('hesap adı geçersiz'); return h; };
const igPaylas = () => { try { return require(path.join(KOK, 'instagram', 'paylas.js')); } catch { return null; } };

// ---------- the posting queue on this machine
function saglik(hesap, hesapYok) {
  const kendi = j => !hesap || isHesap(j) === hesap;
  const d = okuJ(path.join(KUYRUK, 'durum.json')), uyari = [];
  const z = spawnSync(process.execPath, [KUYRUK_JS, 'zamanlayici', 'durum'], { cwd: KOK, encoding: 'utf8' }).stdout || '';
  const zamanlayici = /kurulu\./i.test(z) && !/DEĞİL/.test(z);
  const PZ = igPaylas(), ig = hesapYok ? null : PZ ? PZ.readAyar(hesap === HESAP0 ? undefined : hesap) : (hesap && hesap !== HESAP0 ? null : okuJ(path.join(os.homedir(), '.video-mutfagi', 'instagram.json')));
  const igGun = ig ? Math.max(0, Math.round(60 - (Date.now() - new Date(ig.yenilendi || ig.kaydedildi)) / 864e5)) : null;
  if (!zamanlayici) uyari.push('Otomatik paylaşım kapalı');
  else if (!d || Date.now() - new Date(d.son_calisma) > 45 * 60e3) uyari.push('Zamanlayıcı 45 dk’dır çalışmadı');
  if (hesapYok) uyari.push('Bu kanalın Instagram hesabı tanımlı değil');
  else if (!ig) uyari.push('Instagram bağlı değil');
  else if (igGun < 10) uyari.push(`Instagram anahtarı ${igGun} gün`);
  const gec = isler('bekleyen').filter(kendi).filter(j => !j.onay_gerekli && j.ne_zaman && new Date(j.ne_zaman) < Date.now() - 30 * 60e3);
  if (gec.length) uyari.push(`${gec.length} video gecikti`);
  const hat = isler('hatali').filter(kendi).length;
  if (hat) uyari.push(`${hat} video hatalı`);
  if (!hesapYok) try { uyari.push(...require(path.join(KOK, 'instagram', 'yenile.js')).uyarilar(undefined, hesap || undefined)); } catch (e) { }   // failed automatic token refresh
  return { zamanlayici, son_calisma: d && d.son_calisma, son_sonuc: d && d.son_sonuc, makine: d ? d.makine : os.hostname(), instagram: { bagli: !!ig, gun: igGun }, uyari };
}
// kanal: channel name; only that channel's account is shown (no kanal = every account)
function kuyrukOzet(kanal) {
  const hesap = kanal ? hesapGuvenli(kanalHesap(kanal)) : null, hesapYok = !!kanal && !hesap, kendi = j => hesapYok ? false : !hesap || isHesap(j) === hesap;
  const temiz = j => ({ id: j.id, hesap: isHesap(j), mp4: j.mp4, aciklama: j.aciklama, ne_zaman: j.ne_zaman, onay_gerekli: !!j.onay_gerekli, kaynak: j.kaynak, hata: j.son_hata || null, kontrol_et: !!j.kontrol_et, paylasildi: j.paylasildi, link: j.link, sonuc: j.sonuc || null });
  const ayar = Object.assign(okuJ(path.join(KUYRUK, 'ayar-ornek.json'), {}), okuJ(path.join(KOK, 'ayarlar', 'kuyruk.json'), {}));
  // the same resolution the queue uses (hesaplar.<hesap> > the series channel's dizi block > global)
  const hs = hesap ? require('../kuyruk/hesap-ayar.js').hesapAyar(ayar, hesap, KOK) : {};
  return {
    hesap, hesapYok, saglik: saglik(hesap, hesapYok),
    kuyruk: isler('bekleyen').filter(kendi).sort((a, b) => String(a.ne_zaman).localeCompare(String(b.ne_zaman))).map(temiz),
    paylasilan: isler('paylasilan').filter(kendi).sort((a, b) => String(b.paylasildi).localeCompare(String(a.paylasildi))).map(temiz),
    hatali: isler('hatali').filter(kendi).map(temiz), saatler: hs.paylasim_saatleri || ayar.paylasim_saatleri || [], gunluk: hs.gunluk_en_fazla ?? ayar.gunluk_en_fazla,
  };
}
function zamanDegistir(id, zaman) {
  const f = path.join(KUYRUK, 'bekleyen', String(id) + '.json');
  if (!/^[\w.-]+$/.test(String(id)) || !fs.existsSync(f)) throw new Error('kuyrukta böyle bir iş yok');
  const t = new Date(zamanMetni(zaman));
  if (t < Date.now()) throw new Error('geçmiş bir saat seçilemez');
  const { sonraki_deneme, ...j } = okuJ(f);
  fs.writeFileSync(f, JSON.stringify({ ...j, ne_zaman: t.toISOString() }, null, 2));
}

// ---------- the server, through the user's own ssh (keys/agent are ssh's business, the panel stores no password)
const sunucuAyar = () => (okuJ(path.join(KOK, 'ayarlar', 'panel.json'), {}) || {}).sunucu || null;
const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
function sunucuda(komut, sure = 60e3) {
  const S = sunucuAyar(); if (!S) throw new Error('Sunucu tanımlı değil (ayarlar/panel.json).');
  const ic = `cd ${q(S.kok)} && ${S.node ? q(S.node) : 'node'} ${komut}`;
  const r = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', S.ssh, `${S.on_ek ? S.on_ek + ' ' : ''}bash -lc ${q(ic)}`], { encoding: 'utf8', timeout: sure });
  if (r.error) throw new Error('ssh çalışmadı: ' + r.error.message);
  if (r.status !== 0) throw Object.assign(new Error(((r.stderr || '') + (r.stdout || '')).trim().replace(/^[\s\S]*HATA:\s*/m, '').slice(0, 300) || 'sunucu komutu başarısız'), r.status === 3 ? { kod: 409 } : {});   // exit 3 = the series lock is busy
  return r.stdout;
}
// account for a queue add: a named channel must have one (never falls back to oxygbio); without a channel the old `hesap` field is used
function ekleHesap(b) {
  const x = hesapGuvenli(b.kanal ? kanalHesap(String(b.kanal)) : hesapTemiz(b.hesap));
  if (b.kanal && !x) throw new Error('Bu kanalın Instagram hesabı tanımlı değil');
  return x && x !== HESAP0 ? x : null;
}
function sunucuyaEkle({ mp4, aciklama, zaman, onay_gerekli, hesap, kanal }) {
  const hesapEk = ekleHesap({ hesap, kanal });
  const S = sunucuAyar(); if (!S) throw new Error('Sunucu tanımlı değil.');
  const yerel = path.resolve(KOK, mp4 || '');
  if (!icinde(yerel, path.join(KOK, 'videolar')) || !fs.existsSync(yerel)) throw new Error('video bulunamadı');
  const ad = path.basename(yerel).replace(/[^\w.-]/g, '-'), gecici = `/tmp/vm-${crypto.randomBytes(6).toString('hex')}.mp4`;
  const up = spawnSync('scp', ['-q', '-o', 'BatchMode=yes', yerel, `${S.ssh}:${gecici}`], { encoding: 'utf8', timeout: 600e3 });
  if (up.status !== 0) throw new Error('video sunucuya gönderilemedi: ' + (up.stderr || '').trim().slice(0, 200));
  const b64 = Buffer.from(String(aciklama || ''), 'utf8').toString('base64');
  const hedef = `videolar/_gelen/${ad}`;
  const ic = `cd ${q(S.kok)} && mkdir -p videolar/_gelen && cp ${gecici} ${q(hedef)} && ${S.node ? q(S.node) : 'node'} kuyruk/kuyruk.js ekle ${q(hedef)} --aciklama "$(echo ${b64} | base64 -d)"${zaman ? ' --zaman ' + q(zamanMetni(zaman)) : ''}${onay_gerekli ? ' --onay-gerekli' : ''}${hesapEk ? ' --hesap ' + q(hesapEk) : ''}`;
  const r = spawnSync('ssh', ['-o', 'BatchMode=yes', S.ssh, `chmod 644 ${gecici}; ${S.on_ek ? S.on_ek + ' ' : ''}bash -lc ${q(ic)}; s=$?; rm -f ${gecici}; exit $s`], { encoding: 'utf8', timeout: 120e3 });
  if (r.status !== 0) throw new Error(((r.stderr || '') + (r.stdout || '')).trim().slice(0, 300));
  return r.stdout.trim();
}

// ---------- ideas and production
const kanallar = () => fs.readdirSync(path.join(KOK, 'kanal')).filter(k => fs.existsSync(path.join(KOK, 'kanal', k, 'konu.json')));
const kanalBilgi = () => kanallar().map(ad => { const h = (okuJ(path.join(KOK, 'kanal', ad, 'kimlik.json'), {}) || {}).hesap; return { ad, hesap: h || null }; });
function fikirler() {
  return kanallar().flatMap(k => ((okuJ(path.join(KOK, 'kanal', k, 'fikirler.json'), {}) || {}).fikirler || []).map(f => ({
    kanal: k, id: f.id, baslik: f.baslik, oncul: f.oncul, kanca: f.kanca, neden: f.neden_uyar, puan: f.puan, durum: f.durum, video: f.video || null,
    kaynak: [...new Set((f.kaynaklar || []).map(x => x.kaynak))].join(', '), link: ((f.kaynaklar || []).find(x => x.url) || {}).url || null,
    zaman: f.guncelleme || f.olusturma, son_not: (f.notlar || []).slice(-1)[0] || null,
  })));
}
const ADIMLAR = [['metin', 'Metin'], ['ses', 'Ses'], ['kurgu', 'Kurgu'], ['denetim', 'Kontrol'], ['kuyruk', 'Sıra']];
function uretimler() {
  const v = path.join(KOK, 'videolar'), fk = fikirler(), out = [];
  for (const ad of fs.existsSync(v) ? fs.readdirSync(v) : []) {
    const dir = path.join(v, ad); if (ad.startsWith('_') || !fs.statSync(dir).isDirectory()) continue;
    const U = okuJ(path.join(dir, 'uretim.json'), {}), A = U.adimlar || {}, video = okuJ(path.join(dir, 'video.json'), {});
    const cikti = path.join(dir, 'cikti'), mp4ler = fs.existsSync(cikti) ? fs.readdirSync(cikti).filter(f => f.endsWith('.mp4')) : [];
    const sayfalar = fs.existsSync(path.join(cikti, 'denetim')) ? fs.readdirSync(path.join(cikti, 'denetim')).filter(f => /^sayfa-\d+\.jpg$/.test(f)).map(f => `videolar/${ad}/cikti/denetim/${f}`) : [];
    const fikir = fk.find(f => f.video === `videolar/${ad}`) || null;
    // what the next paid step would spend (konu/uret.js writes it when it stops at a gate); voice falls back to the script
    const B = U.bekleyen || null, sesYok = (video.satirlar || []).filter((x, i) => !fs.existsSync(path.join(dir, 'ses', `${iki(i + 1)}-${x.rol}.mp3`)));
    const ses = B && B.adim === 'ses' ? { karakter: B.karakter, satir: B.satir, kredi_tahmin: B.kredi_tahmin } : { karakter: sesYok.reduce((a, x) => a + String(x.metin || '').length, 0), satir: sesYok.length, kredi_tahmin: null };
    const kredi = B && (B.adim === 'gorsel' || B.adim === 'klip') ? { adim: B.adim, kredi: B.kredi, butce: B.butce } : null;
    const durum = {
      metin: A.metin || fs.existsSync(path.join(dir, 'metin.md')) ? 'tamam' : 'bekliyor',
      ses: A.ses ? 'tamam' : A.metin ? 'onay' : 'bekliyor',
      kurgu: A.render || mp4ler.length ? 'tamam' : kredi ? 'onay' : 'bekliyor',
      denetim: A.denetim ? (A.denetim.puan >= 7 ? 'tamam' : 'takildi') : 'bekliyor',
      kuyruk: A.kuyruk ? 'tamam' : 'bekliyor',
    };
    out.push({
      ad, kanal: U.kanal || (video.kanal || '').split('/').slice(-2, -1)[0] || null, fikir: U.fikir || (fikir && fikir.id), katman: U.katman || (video.sablon ? 'sablon' : null), ses, kredi,
      baslik: video.baslik || (fikir && fikir.baslik) || ad, aciklama: video.aciklama_instagram || '', puan: A.denetim ? A.denetim.puan : null, durum,
      metin: fs.existsSync(path.join(dir, 'metin.md')) ? `videolar/${ad}/metin.md` : null,
      rapor: fs.existsSync(path.join(cikti, 'denetim', 'rapor.md')) ? `videolar/${ad}/cikti/denetim/rapor.md` : null, sayfalar,
      mp4: mp4ler.map(f => ({ yol: `videolar/${ad}/cikti/${f}`, mb: +(fs.statSync(path.join(cikti, f)).size / 1048576).toFixed(1), ucretli: /ucretli/.test(f) })),
      zaman: (fs.existsSync(path.join(dir, 'uretim.json')) ? fs.statSync(path.join(dir, 'uretim.json')) : fs.statSync(dir)).mtime.toISOString(),
      not: fikir && fikir.son_not ? fikir.son_not.not : null,
    });
  }
  return out.sort((a, b) => b.zaman.localeCompare(a.zaman));
}
// the audit report's JSON block: score, findings, top 3
function rapor(rel) {
  const f = path.resolve(KOK, rel || '');
  if (!icinde(f, path.join(KOK, 'videolar')) || !f.endsWith('rapor.md') || !fs.existsSync(f)) throw new Error('rapor yok');
  const md = fs.readFileSync(f, 'utf8'), m = md.match(/```json\s*([\s\S]*?)```/);
  let j = null; try { j = m ? JSON.parse(m[1]) : null; } catch {}
  return { puan: j && j.puan, bulgular: (j && j.bulgular) || [], en_iyi_3: (j && j.en_iyi_3) || [] };
}

// ---------- long jobs (collect ideas, write a script, produce, pull numbers, draw lessons): run in the background,
// the panel polls their log. Only these commands can be started, never arbitrary ones.
const calisan = new Map();
// The paid ones approve exactly the price the user saw: voice up to `karakter`, one Higgsfield step up to `kredi`.
function isBaslat(tur, { kanal, id, karakter, adim, kredi } = {}) {
  if ((kanal || tur !== 'sonuclar') && !kanallar().includes(kanal)) throw new Error('kanal yok');
  if ((id || /^uret/.test(tur)) && !/^f-[\w-]+$/.test(id || '')) throw new Error('fikir yok');
  const sayiMi = n => Number.isFinite(+n) && +n >= 0 && String(n).trim() !== '';
  if (tur === 'uret-ses' && !sayiMi(karakter)) throw new Error('ses karakteri belli değil');
  if (tur === 'uret-kredi' && (!['gorsel', 'klip'].includes(adim) || !sayiMi(kredi))) throw new Error('kredi belli değil');
  const URET_ADIM = path.join(__dirname, 'uret-adim.js');
  const T = {
    topla: () => [RADAR_JS, 'topla', kanal], puanla: () => [RADAR_JS, 'puanla', kanal], uret: () => [RADAR_JS, 'uret', kanal, id],
    'uret-ses': () => [URET_ADIM, kanal, id, '--ses', String(+karakter), '--kok', KOK],
    'uret-kredi': () => [URET_ADIM, kanal, id, '--kredi', adim, String(+kredi), '--kok', KOK],
    sonuclar: () => [KUYRUK_JS, 'sonuclar'], ders: () => [path.join(__dirname, 'ders.js'), '--kok', KOK, '--kanal', kanal],
  }[tur];
  if (!T) throw new Error('bilinmeyen iş');
  for (const [, x] of calisan) if ((x.tur === tur || (/^uret/.test(tur) && /^uret/.test(x.tur))) && x.kanal === kanal && x.fid === id && x.durum === 'calisiyor') throw new Error('Bu iş zaten çalışıyor.');
  fs.mkdirSync(ISLER, { recursive: true });
  const isId = `${Date.now().toString(36)}-${tur}`, log = path.join(ISLER, isId + '.log');
  const out = fs.openSync(log, 'a');
  const c = spawn(process.execPath, T(), { cwd: KOK, stdio: ['ignore', out, out], windowsHide: true });
  const kayit = { id: isId, tur, kanal, fid: id, durum: 'calisiyor', bas: new Date().toISOString(), pid: c.pid };
  calisan.set(isId, kayit);
  c.on('exit', kod => { kayit.durum = kod === 0 ? 'bitti' : 'hata'; kayit.son = new Date().toISOString(); fs.closeSync(out); });
  return kayit;
}
function isListesi() {
  return [...calisan.values()].sort((a, b) => b.bas.localeCompare(a.bas)).slice(0, 12).map(x => {
    const log = path.join(ISLER, x.id + '.log');
    const metin = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).filter(l => l.trim() && !/hf-progress|Render:trace|█|░/.test(l)) : [];
    return { ...x, satirlar: metin.slice(-14) };
  });
}

// ---------- Instagram: the account's own posts with their numbers (read only, cached 15 min)
const igSurer = new Map();
// hesap: Instagram account (default oxygbio, whose cache keeps its old file name); P: paylas.js, injectable for tests
async function instagram(yenile, hesap, P) {
  hesap = hesapGuvenli(hesapTemiz(hesap));
  const kendi = hesap && hesap !== HESAP0 ? hesap : null, onbellek = kendi ? path.join(KAYIT, `panel-instagram-${kendi}.json`) : ONBELLEK;
  const eski = okuJ(onbellek);
  if (!yenile && eski && Date.now() - new Date(eski.zaman) < 15 * 60e3) return eski;
  if (igSurer.has(onbellek)) return igSurer.get(onbellek);
  const is = (async () => {
    P = P || igPaylas(); const a = P && P.readAyar(kendi || undefined);
    if (!a) return { zaman: new Date().toISOString(), bagli: false, gonderiler: [] };
    const me = await P.me(a.token).catch(() => null);
    const m = await P.graph('GET', '/me/media', { fields: 'id,caption,media_type,permalink,timestamp', limit: 30, access_token: a.token });
    const gonderiler = [];
    for (const g of m.data || []) {
      if (g.media_type !== 'VIDEO') continue;
      const s = await P.sonuc(g.id, kendi || undefined).catch(() => null);
      gonderiler.push({ id: g.id, baslik: (g.caption || '').split('\n')[0].slice(0, 90), aciklama: g.caption || '', link: g.permalink, zaman: g.timestamp, ...(s || {}) });
    }
    const j = { zaman: new Date().toISOString(), bagli: true, hesap: me && me.username, gonderiler };
    fs.mkdirSync(KAYIT, { recursive: true });
    fs.writeFileSync(onbellek, JSON.stringify(j, null, 1));
    return j;
  })().finally(() => { igSurer.delete(onbellek); });
  igSurer.set(onbellek, is);
  return is;
}

// follower count for the calendar's numbers (read only, cached 15 min in memory); null when the API does not give it
const takipciOnbellek = new Map();
async function takipci(hesap, P) {
  hesap = hesapGuvenli(hesapTemiz(hesap));
  const kendi = hesap && hesap !== HESAP0 ? hesap : null, ad = kendi || HESAP0, e = takipciOnbellek.get(ad);
  if (e && Date.now() - e.t < 15 * 60e3) return e.j;
  P = P || igPaylas(); const a = P && P.readAyar(kendi || undefined);
  if (!a) return { bagli: false, takipci: null };
  const m = await P.graph('GET', '/me', { fields: 'followers_count', access_token: a.token }).catch(() => null);
  const j = { bagli: true, takipci: m && Number.isFinite(Number(m.followers_count)) ? Number(m.followers_count) : null, zaman: new Date().toISOString() };
  takipciOnbellek.set(ad, { t: Date.now(), j });
  return j;
}

// a calendar tile's still: the first saved frame of a video folder (videolar/<ad> only), else its end card
function kapakYolu(v) {
  const d = path.resolve(KOK, String(v || '')), c = path.join(d, 'cikti');
  if (path.dirname(d) !== path.join(KOK, 'videolar') || !fs.existsSync(c) || !fs.statSync(c).isDirectory()) return null;
  for (const k of fs.readdirSync(c).filter(x => /^kareler-/.test(x)).sort()) {
    const f = fs.statSync(path.join(c, k)).isDirectory() && fs.readdirSync(path.join(c, k)).filter(x => /^frame-[\w.-]*\.png$/.test(x)).sort()[0];
    if (f) return path.join(c, k, f);
  }
  return fs.existsSync(path.join(c, 'son-kare.png')) ? path.join(c, 'son-kare.png') : null;
}

// production stage marks of every video folder (uretim.json) for the calendar's stage bar; read only.
// son = the newest of the marks and the folder's own files, so a long step still counts as alive
const ASAMA = { metin: A => A.metin, ses: A => A.mix, sahneler: A => A.sahne || A.ucretli_tarif || A.sablon_tarif, video: A => A.render };
function asamalar(kanal) {
  if (kanal && !kanallar().includes(kanal)) throw new Error('kanal yok');
  const v = path.join(KOK, 'videolar'), out = {};
  for (const ad of fs.existsSync(v) ? fs.readdirSync(v) : []) {
    const dir = path.join(v, ad), U = okuJ(path.join(dir, 'uretim.json'));
    if (!U || typeof U !== 'object' || !U.adimlar || typeof U.adimlar !== 'object' || (kanal && U.kanal !== kanal)) continue;
    const A = U.adimlar, t = Object.values(A).map(x => x && Date.parse(x.zaman)).filter(Number.isFinite);
    for (const f of fs.readdirSync(dir)) { try { t.push(fs.statSync(path.join(dir, f)).mtimeMs); } catch {} }
    out[`videolar/${ad}`] = { kanal: U.kanal || null, bitti: Object.fromEntries(Object.entries(ASAMA).map(([k, f]) => [k, !!(f(A) || A.render)])),
      kuyruk: !!A.kuyruk, kapak: !!kapakYolu(`videolar/${ad}`), bekleyen: U.bekleyen && U.bekleyen.adim ? String(U.bekleyen.adim) : null, son: t.length ? new Date(Math.max(...t)).toISOString() : null };
  }
  return out;
}

// how a channel reaches the language model: 'claude-cli' (the user's Claude subscription) or 'api' (pay as you go)
const yzYolu = k => { try { return require(path.join(KOK, 'konu', 'llm.js')).yolSec((okuJ(path.join(KOK, 'kanal', k, 'konu.json'), {}) || {}).llm || {}); } catch { return null; } };

// ---------- series ("Diziler"): kayit/dizi/<kanal>/diziler.json + konu.json → dizi. The channel is checked against kanal/ first.
const DIZI_KEYS = ['esik_oran', 'bekle_saat', 'gunluk_hedef', 'onay_donemi', 'onay_gunluk', 'saatler', 'ilk_dizi_sayisi', 'yorum_min', 'yorum_kelimeleri'];
const sayiAralik = (v, ad, a, b, tam) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < a || v > b || (tam && !Number.isInteger(v))) throw new Error(`${ad} ${a} ile ${b} arasında ${tam ? 'bir tam sayı ' : 'bir sayı '}olmalı`); return v; };
function diziAyarTemiz(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('ayarlar anlaşılmadı');
  const o = {};
  for (const [k, v] of Object.entries(a)) {
    if (!DIZI_KEYS.includes(k)) throw new Error(`bilinmeyen ayar: ${k}`);
    if (k === 'esik_oran') o[k] = sayiAralik(v, 'Eşik oranı', 0.1, 1);
    else if (k === 'bekle_saat') o[k] = sayiAralik(v, 'Bekleme süresi (saat)', 6, 72);
    else if (k === 'gunluk_hedef') o[k] = sayiAralik(v, 'Günlük bölüm sayısı', 1, 5, true);
    else if (k === 'onay_gunluk') o[k] = sayiAralik(v, 'Onay döneminde günlük bölüm sayısı', 1, 5, true);
    else if (k === 'ilk_dizi_sayisi') o[k] = sayiAralik(v, 'Kesilmeyecek ilk hikâye sayısı', 0, 50, true);
    else if (k === 'yorum_min') o[k] = sayiAralik(v, 'Gereken yorum sayısı', 1, 50, true);
    else if (k === 'onay_donemi') { if (typeof v !== 'boolean') throw new Error('Onay dönemi açık ya da kapalı olmalı'); o[k] = v; }
    else if (k === 'saatler') {
      if (!Array.isArray(v) || !v.length || v.length > 10 || !v.every(x => /^([01]\d|2[0-3]):[0-5]\d$/.test(x))) throw new Error('Saatler SS:DD biçiminde (24 saat), en az bir tane olmalı');
      o[k] = [...new Set(v)].sort();
    } else if (k === 'yorum_kelimeleri') {
      if (!Array.isArray(v) || v.length > 30 || !v.every(x => typeof x === 'string' && x.trim() && x.length <= 60)) throw new Error('Yorum kelimeleri boş olmayan yazılardan oluşmalı');
      o[k] = v.map(x => x.trim());
    }
  }
  return o;
}
// the episode's playable mp4 (under videolar/ only): the folder's cikti/*.mp4 (free version first) or the queue job's file
function bolumMp4(video, isMp4) {
  const dene = rel => { const f = path.resolve(KOK, rel || ''); return icinde(f, path.join(KOK, 'videolar')) ? f : null; };
  const goreli = f => path.relative(KOK, f).split(path.sep).join('/');
  const v = dene(video);
  if (v && v.endsWith('.mp4') && fs.existsSync(v)) return goreli(v);
  const c = v && path.join(v, 'cikti');
  if (c && fs.existsSync(c)) { const m = fs.readdirSync(c).filter(f => f.endsWith('.mp4')).sort((a, b) => /ucretli/.test(a) - /ucretli/.test(b)); if (m.length) return goreli(path.join(c, m[0])); }
  const j = dene(isMp4); return j && fs.existsSync(j) ? goreli(j) : null;
}
// story-level text approval: onayla (with optional edited texts {n: text}, recap rule re-checked) or reddet (series cut,
// story recorded in reddedilen.json). Under the series lock, like the other manual decisions.
function diziMetinGovde(b) {
  if (!['onayla', 'reddet'].includes(b.karar)) throw new Error('karar onayla ya da reddet olmalı');
  const g = { kanal: kanalAdi(b.kanal), id: diziId(b.id), karar: b.karar };
  if (b.metinler != null) {
    if (typeof b.metinler !== 'object' || Array.isArray(b.metinler)) throw new Error('metinler {bölüm: metin} olmalı');
    g.metinler = {};
    for (const [k, v] of Object.entries(b.metinler)) { if (!/^[1-5]$/.test(k)) throw new Error(`bölüm numarası 1 ile ${MAX_BOLUM} arasında olmalı`); if (typeof v !== 'string' || v.length > 4000) throw new Error(`bölüm ${k} metni geçersiz`); g.metinler[k] = v; }
  }
  return g;
}
function diziMetin(b) {
  const g = diziMetinGovde(b);
  if (!kanallar().includes(g.kanal)) throw new Error('kanal yok');
  return kilitli(g.kanal, D => {
    const veri = D.yukle(KOK, g.kanal), d = (veri.diziler || []).find(x => x.id === g.id);
    if (!d) throw new Error('böyle bir dizi yok');
    D.metinKarar(d, g.karar, g.metinler);
    if (g.karar === 'reddet') {
      const O = require('../konu/ortak'), f = path.join(KOK, 'kayit', 'dizi', g.kanal, 'reddedilen.json'), red = O.okuJson(f, { reddedilen: [] });
      if (!Array.isArray(red.reddedilen)) red.reddedilen = [];
      if (!red.reddedilen.some(x => x.id === d.id)) red.reddedilen.push({ kaynak: (d.kaynak && d.kaynak.tur) || null, id: d.id, neden: 'metin reddedildi', zaman: new Date().toISOString() });
      O.yazJson(f, red);
      // a pooled story is marked too, so the pool never offers it again
      try { const H = require('../dizi/havuz.js'), h = H.yukle(KOK, g.kanal), x = h.hikayeler.find(y => y.id === d.id); if (x) { x.durum = 'elendi'; x.neden = 'metin reddedildi'; H.kaydet(KOK, g.kanal, h); } } catch (e) { }
    }
    D.kaydet(KOK, g.kanal, veri);
    return { ok: true, metin_onay: d.metin_onay };
  });
}
// weekly story pool (dizi/havuz.js): stock per theme + the next stories; "Ele" strikes one before it is used (lock taken there)
function havuzCevap(kanal) {
  if (!kanallar().includes(kanal)) throw new Error('kanal yok');
  return require('../dizi/havuz.js').ozet({ kanal, ayar: okuJ(path.join(KOK, 'kanal', kanal, 'konu.json'), {}) || {} }, KOK);
}
const havuzEleGovde = b => { if (typeof b.id !== 'string' || !/^eksi-\d{1,12}$/.test(b.id)) throw new Error('hikâye id geçersiz'); return { kanal: kanalAdi(b.kanal), id: b.id, neden: String(b.neden || '').replace(/\s+/g, ' ').trim().slice(0, 200) }; };
function havuzEle(b) {
  const g = havuzEleGovde(b);
  if (!kanallar().includes(g.kanal)) throw new Error('kanal yok');
  return require('../dizi/havuz.js').ele(KOK, g.kanal, g.id, g.neden || 'elle elendi');
}
function dizilerCevap(kanal) {
  if (!kanallar().includes(kanal)) throw new Error('kanal yok');
  const konuDizi = (okuJ(path.join(KOK, 'kanal', kanal, 'konu.json'), {}) || {}).dizi, ayar = konuDizi && typeof konuDizi === 'object' && !Array.isArray(konuDizi) ? konuDizi : {};
  const D = DiziDepo();
  const bek = isler('bekleyen');
  // a series waiting for its text approval carries the episode texts (the panel edits them before approving)
  // a series from before the tone label shows the kit's assignment (dizi.ton_atamalari) or komik until the run writes it
  const diziler = (D.yukle(KOK, kanal).diziler || []).map(d => ({ ...d, ton: d.ton || (ayar.ton_atamalari || {})[d.id] || 'komik', metin_onay: D.metinOnay(d), bolumler: (d.bolumler || []).map(({ metin, ...b }) => {
    const j = b.video ? bek.find(x => x.video === b.video) : null;
    return { ...b, ...(D.metinOnay(d) === 'bekliyor' ? { metin } : {}), kelime: String(metin || '').split(/\s+/).filter(Boolean).length, mp4: bolumMp4(b.video, j && j.mp4), kuyruk_id: j ? j.id : null, kuyruk_onay_gerekli: j ? !!j.onay_gerekli : null,
      izin: { devam: !D.kararHata(d, b.n, 'devam'), kes: !D.kararHata(d, b.n, 'kes'), tekrar: !D.tekrarHata(d, b.n) } };   // the same checks the POST routes use
  }) }));
  const red = (okuJ(path.join(KOK, 'kayit', 'dizi', kanal, 'reddedilen.json'), {}) || {}).reddedilen;
  return { ayar, ayar_var: !!konuDizi, diziler, son_kosu: okuJ(path.join(KOK, 'kayit', 'dizi', kanal, 'son-kosu.json'), null), reddedilen_toplam: Array.isArray(red) ? red.length : 0 };
}
// route -> server hop goes through this object so tests can stub the ssh / scp call
const kanca = { sunucuda: (...a) => sunucuda(...a), scp: (args, sure) => spawnSync('scp', args, { encoding: 'utf8', timeout: sure }) };
const kanalAdi = k => { if (typeof k !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(k)) throw new Error('kanal yok'); return k; };
// a series has 2-5 episodes (dizi/bol.js MAX_SAYI); an n past this series' own count is refused by dizi.js ("bölüm n yok")
const MAX_BOLUM = 5;
const bolumNo = n => { if (!Number.isInteger(n) || n < 1 || n > MAX_BOLUM) throw new Error(`bölüm numarası 1 ile ${MAX_BOLUM} arasında olmalı`); return n; };
const diziId = i => { if (typeof i !== 'string' || !/^[\w.-]{1,80}$/.test(i)) throw new Error('böyle bir dizi yok'); return i; };
// only validated fields are rebuilt into the payload, so nothing but known-safe values reaches the shell (and q() quotes it anyway)
function diziKararGovde(b) {
  if (!['devam', 'kes'].includes(b.karar)) throw new Error('karar devam ya da kes olmalı');
  return { kanal: kanalAdi(b.kanal), id: diziId(b.id), n: bolumNo(b.n), karar: b.karar, neden: String(b.neden || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
}
const diziTekrarGovde = b => ({ kanal: kanalAdi(b.kanal), id: diziId(b.id), n: bolumNo(b.n) });
const diziAyarGovde = b => ({ kanal: kanalAdi(b.kanal), ayar: diziAyarTemiz(b.ayar) });
const sunucuJson = (bayrak, deger) => JSON.parse(kanca.sunucuda(`panel/panel.js ${bayrak} ${q(typeof deger === 'string' ? deger : JSON.stringify(deger))}`, 20e3));
const DiziDepo = () => require('../dizi/dizi.js');
// manual decisions run under the scheduler's lock, so a running calistir cannot overwrite them
function kilitli(kanal, fn) {
  const D = DiziDepo(), k = D.kilitAl(KOK, kanal);
  if (k.mesaj) throw Object.assign(new Error('Zamanlayıcı şu an çalışıyor, birkaç dakika sonra tekrar dene'), { kod: 409 });
  try { return fn(D); } finally { k.birak(); }
}
function diziBul(D, b) {
  if (!kanallar().includes(b.kanal)) throw new Error('kanal yok');
  bolumNo(b.n);
  const veri = D.yukle(KOK, b.kanal), d = (veri.diziler || []).find(x => x.id === b.id);
  if (!d) throw new Error('böyle bir dizi yok');
  return { veri, d };
}
function diziKarar(b) {
  if (!kanallar().includes(b.kanal)) throw new Error('kanal yok');
  bolumNo(b.n);
  if (!['devam', 'kes'].includes(b.karar)) throw new Error('karar devam ya da kes olmalı');
  return kilitli(b.kanal, D => {
    const { veri, d } = diziBul(D, b);
    D.kararUygula(d, b.n, b.karar, String(b.neden || '').replace(/\s+/g, ' ').trim().slice(0, 200) || (b.karar === 'kes' ? 'elle kesildi' : 'elle devam ettirildi'));
    D.kaydet(KOK, b.kanal, veri);
    return { ok: true };
  });
}
function diziTekrar(b) {
  if (!kanallar().includes(b.kanal)) throw new Error('kanal yok');
  return kilitli(b.kanal, D => { const { veri, d } = diziBul(D, b); D.tekrarDene(d, b.n); D.kaydet(KOK, b.kanal, veri); return { ok: true }; });
}
// only the given keys change; the rest of konu.json is kept (read, merge, write to a temp file, rename)
function diziAyarYaz(b) {
  if (!kanallar().includes(b.kanal)) throw new Error('kanal yok');
  const yeni = diziAyarTemiz(b.ayar), f = path.join(KOK, 'kanal', b.kanal, 'konu.json'), O = require('../konu/ortak');
  const konu = O.okuJson(f);
  konu.dizi = { ...(konu.dizi || {}), ...yeni };
  O.yazJson(f, konu);
  return { ok: true, ayar: konu.dizi };
}

// ---------- http
const TUR = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/plain; charset=utf-8' };
const gonder = (res, kod, govde, tur = 'application/json; charset=utf-8') => { res.writeHead(kod, { 'Content-Type': tur, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(typeof govde === 'string' || Buffer.isBuffer(govde) ? govde : JSON.stringify(govde)); };
const govdeOku = req => new Promise((ok, red) => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) red(new Error('çok büyük')); }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { red(new Error('bozuk istek')); } }); });

function dosyaVer(req, res, rel) {
  const f = path.resolve(KOK, rel || ''), uz = path.extname(f);
  if (!icinde(f, path.join(KOK, 'videolar')) || !['.mp4', '.jpg', '.png', '.md'].includes(uz) || !fs.existsSync(f)) return gonder(res, 404, { hata: 'dosya yok' });
  if (uz !== '.mp4') return gonder(res, 200, fs.readFileSync(f), TUR[uz]);
  mp4Akit(req, res, f);
}
// an mp4 with Range support (the browser's video element seeks with byte ranges)
function mp4Akit(req, res, f) {
  const boy = fs.statSync(f).size, r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (!r) { res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': boy, 'Accept-Ranges': 'bytes' }); return fs.createReadStream(f).pipe(res); }
  const bas = r[1] ? +r[1] : Math.max(0, boy - +r[2]), son = r[1] && r[2] ? Math.min(+r[2], boy - 1) : boy - 1;
  if (bas > son || bas >= boy) { res.writeHead(416, { 'Content-Range': `bytes */${boy}` }); return res.end(); }
  res.writeHead(206, { 'Content-Type': 'video/mp4', 'Content-Length': son - bas + 1, 'Content-Range': `bytes ${bas}-${son}/${boy}`, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(f, { start: bas, end: son }).pipe(res);
}

// ---------- server videos, viewable before approval: copied with scp (the same ssh settings as sunucuda) into
// kayit/sunucu-onizleme/, at most 5 files; only this cache's own files (<hash>-<name>.mp4) are ever deleted, oldest first
const ONIZLEME = path.join(KAYIT, 'sunucu-onizleme'), ONIZLEME_EN_FAZLA = 5, ONIZLEME_AD = /^[0-9a-f]{12}-[\w.-]+\.mp4$/;
function sunucuVideoYolu(yol) {
  const y = String(yol || '');
  if (!/^videolar\/[\w./-]+\.mp4$/.test(y) || y.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('video yolu geçersiz');
  return y;
}
const onizlemeAd = y => crypto.createHash('sha1').update(y).digest('hex').slice(0, 12) + '-' + path.basename(y);
function onizlemeTemizle(tut) {
  const f = fs.readdirSync(ONIZLEME).filter(x => ONIZLEME_AD.test(x)).map(x => ({ x, t: fs.statSync(path.join(ONIZLEME, x)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const { x } of f.slice(ONIZLEME_EN_FAZLA)) if (path.join(ONIZLEME, x) !== tut) fs.rmSync(path.join(ONIZLEME, x), { force: true });
}
function sunucuVideo(yol) {
  const y = sunucuVideoYolu(yol), S = sunucuAyar();
  if (!S) throw new Error('Sunucu tanımlı değil (ayarlar/panel.json).');
  fs.mkdirSync(ONIZLEME, { recursive: true });
  const f = path.join(ONIZLEME, onizlemeAd(y));
  if (fs.existsSync(f)) { const t = new Date(); fs.utimesSync(f, t, t); return f; }   // a fresh look counts as recent
  const gecici = f + '.part';
  let r;
  try { r = kanca.scp(['-q', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', `${S.ssh}:${String(S.kok).replace(/\/+$/, '')}/${y}`, gecici], 600e3); }
  catch (e) { r = { status: 1, stderr: e.message }; }
  if (!r || r.status !== 0 || !fs.existsSync(gecici)) { fs.rmSync(gecici, { force: true }); throw new Error('video sunucudan alınamadı: ' + String((r && (r.stderr || r.error)) || '').trim().slice(0, 200)); }
  fs.renameSync(gecici, f);
  onizlemeTemizle(f);
  return f;
}

// an unknown channel (a stale browser choice) still gets the full unfiltered summary, flagged, so the UI can reset itself
function ozetCevap(kanal) {
  const S = sunucuAyar(), yok = !!kanal && !kanallar().includes(kanal);
  return { yerel: kuyrukOzet(yok ? undefined : kanal), kanalYok: yok, sunucu: S ? { ad: S.ad || 'Sunucu' } : null, kanallar: kanalBilgi(), yz: Object.fromEntries(kanallar().map(k => [k, yzYolu(k)])) };
}

async function api(req, u) {
  const yol = u.pathname.slice(5), GET = req.method === 'GET', b = GET ? {} : await govdeOku(req);
  const sunucu = (b.makine || u.searchParams.get('makine')) === 'sunucu';
  if (GET && yol === 'ozet') return ozetCevap(u.searchParams.get('kanal') || undefined);
  if (GET && yol === 'sunucu') { const k = u.searchParams.get('kanal'); if (k && !kanallar().includes(k)) throw new Error('kanal yok'); return JSON.parse(sunucuda('panel/panel.js --ozet' + (k ? ' --kanal ' + q(k) : ''))); }
  if (GET && yol === 'fikirler') return fikirler();
  if (GET && yol === 'uretim') return uretimler();
  if (GET && yol === 'rapor') return rapor(u.searchParams.get('p'));
  if (GET && yol === 'isler') return isListesi();
  if (GET && yol === 'instagram') return instagram(u.searchParams.has('yenile'), u.searchParams.get('hesap'));
  if (GET && yol === 'dersler') return okuJ(DERSLER, []);
  if (GET && yol === 'takipci') return takipci(u.searchParams.get('hesap'));
  if (GET && yol === 'asamalar') return asamalar(u.searchParams.get('kanal') || undefined);
  if (GET && yol === 'diziler') return sunucu ? sunucuJson('--diziler', kanalAdi(u.searchParams.get('kanal'))) : dizilerCevap(u.searchParams.get('kanal'));
  if (!GET && yol === 'dizi/karar') return sunucu ? sunucuJson('--dizi-karar', diziKararGovde(b)) : diziKarar(b);
  if (!GET && yol === 'dizi/tekrar') return sunucu ? sunucuJson('--dizi-tekrar', diziTekrarGovde(b)) : diziTekrar(b);
  if (!GET && yol === 'dizi/ayar') return sunucu ? sunucuJson('--dizi-ayar', diziAyarGovde(b)) : diziAyarYaz(b);
  if (!GET && yol === 'dizi/metin') return sunucu ? sunucuJson('--dizi-metin', diziMetinGovde(b)) : diziMetin(b);
  if (GET && yol === 'dizi/havuz') return sunucu ? sunucuJson('--dizi-havuz', kanalAdi(u.searchParams.get('kanal'))) : havuzCevap(u.searchParams.get('kanal'));
  if (!GET && yol === 'dizi/havuz/ele') return sunucu ? sunucuJson('--dizi-havuz-ele', havuzEleGovde(b)) : havuzEle(b);
  if (!GET && yol === 'is') return isBaslat(b.tur, b);
  // ideas
  if (!GET && yol === 'fikir') {
    if (!kanallar().includes(b.kanal)) throw new Error('kanal yok');
    if (b.is === 'ekle') return { mesaj: nodeCalistir(RADAR_JS, ['ekle', b.kanal, '--baslik', String(b.baslik || '').slice(0, 200), ...(b.oncul ? ['--oncul', String(b.oncul).slice(0, 600)] : [])]) };
    if ((b.is === 'sec' || b.is === 'reddet') && /^f-[\w-]+$/.test(b.id)) return { mesaj: nodeCalistir(RADAR_JS, [b.is, b.kanal, b.id]) };
    throw new Error('bilinmeyen işlem');
  }
  // queue, on this machine or on the server
  if (!GET && yol.startsWith('kuyruk/')) {
    const is = yol.split('/')[1];
    if (is === 'ekle') {
      const hesapEk = ekleHesap(b);
      if (sunucu) return { mesaj: sunucuyaEkle(b) };
      const mp4 = path.resolve(KOK, b.mp4 || '');
      if (!icinde(mp4, path.join(KOK, 'videolar')) || !fs.existsSync(mp4)) throw new Error('video bulunamadı');
      return { mesaj: nodeCalistir(KUYRUK_JS, ['ekle', mp4, '--aciklama', String(b.aciklama || ''), ...(b.zaman ? ['--zaman', zamanMetni(b.zaman)] : []), ...(b.onay_gerekli ? ['--onay-gerekli'] : []), ...(hesapEk ? ['--hesap', hesapEk] : [])]) };
    }
    if (!/^[\w.-]+$/.test(String(b.id || ''))) throw new Error('kuyrukta böyle bir iş yok');
    if (is === 'onayla' || is === 'iptal') return { mesaj: sunucu ? sunucuda(`kuyruk/kuyruk.js ${is} ${q(b.id)}`) : nodeCalistir(KUYRUK_JS, [is, b.id]) };
    if (is === 'zaman') { if (sunucu) sunucuda(`panel/panel.js --zaman ${q(b.id)} ${q(zamanMetni(b.zaman))}`); else zamanDegistir(b.id, b.zaman); return { tamam: true }; }
  }
  // lessons: into the second brain as a decision when it is installed (the agent reads it at every session start),
  // otherwise into the channel's lesson file
  if (!GET && yol === 'ders-kaydet') {
    if (!kanallar().includes(b.kanal)) throw new Error('kanal yok');
    const kural = String(b.kural || '').replace(/\s+/g, ' ').trim().slice(0, 200), guven = String(b.guven || '?').slice(0, 10);
    if (!kural) throw new Error('ders boş');
    const BEYIN = path.join(KOK, 'ikinci-beyin', 'beyin.js');
    if (fs.existsSync(path.join(KOK, 'ayarlar', 'ikinci-beyin.json')) && fs.existsSync(BEYIN)) {
      const neden = `${b.kanal} Instagram rakamlarından yapay zekânın çıkardığı ders (güven: ${guven}): ${String(b.kanit || '').slice(0, 300)}`;
      return { tamam: true, mesaj: nodeCalistir(BEYIN, ['karar', (guven === 'yuksek' ? '' : 'tahmin: ') + kural, '--neden', neden]) };
    }
    const f = path.join(KOK, 'kanal', b.kanal, 'dersler.md');
    if (!fs.existsSync(f)) fs.writeFileSync(f, '# Sonuçlardan çıkan dersler\n\nPanel (Sonuçlar → Kaydet) buraya yazar. Metin yazan yapay zekâ bu dosyayı kendiliğinden okumaz: ajana "kanal/<kanal>/dersler.md\'yi oku" de ya da ikinci beyni kur (ikinci-beyin/BENIOKU.md), panel dersleri oraya yazar.\n');
    fs.appendFileSync(f, `\n- **${kural}** (${new Date().toLocaleDateString('tr-TR')}, güven: ${guven})\n  ${String(b.kanit || '').slice(0, 300)}\n`);
    return { tamam: true, dosya: path.relative(KOK, f) };
  }
  throw Object.assign(new Error('yok'), { kod: 404 });
}

const sunucuYap = () => http.createServer(async (req, res) => {
  try {
    // only this machine, only our own host name (blocks DNS-rebinding tricks)
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return gonder(res, 403, { hata: 'yalnız bu bilgisayardan' });
    const u = new URL(req.url, 'http://127.0.0.1');
    const korumali = u.pathname.startsWith('/api/') || u.pathname === '/dosya';
    if (korumali && (req.headers['x-panel'] || u.searchParams.get('k')) !== ANAHTAR) return gonder(res, 401, { hata: 'Paneli terminaldeki linkle aç.' });
    if (u.pathname === '/dosya') return dosyaVer(req, res, u.searchParams.get('p'));
    if (u.pathname === '/api/sunucu-video' && req.method === 'GET') return mp4Akit(req, res, sunucuVideo(u.searchParams.get('yol')));
    if (u.pathname === '/api/kapak' && req.method === 'GET') { const f = kapakYolu(u.searchParams.get('v')); return f ? gonder(res, 200, fs.readFileSync(f), 'image/png') : gonder(res, 404, { hata: 'kapak yok' }); }
    if (u.pathname.startsWith('/api/')) return gonder(res, 200, await api(req, u));
    const rel = u.pathname === '/' ? 'index.html' : u.pathname.slice(1), f = path.resolve(ARAYUZ, rel);
    if (!icinde(f, ARAYUZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return gonder(res, 404, 'yok', 'text/plain; charset=utf-8');
    gonder(res, 200, fs.readFileSync(f), TUR[path.extname(f)] || 'application/octet-stream');
  } catch (e) { gonder(res, e.kod || 400, { hata: e.message }); }
});

module.exports = { kanca, kuyrukOzet, instagram, takipci, asamalar, kanalBilgi, ekleHesap, ozetCevap, sunucuYap, onizlemeAd, ANAHTAR };
if (require.main !== module) return;

  // ozellik: lets the home panel know this copy has the --dizi* flags
if (process.argv.includes('--ozet')) {
  try { process.stdout.write(JSON.stringify({ ...kuyrukOzet(arg('--kanal') || undefined), ozellik: ['diziler'] })); process.exit(0); }
  catch (e) { console.error('HATA: ' + e.message); process.exit(1); }
}
if (process.argv.includes('--zaman')) { const i = process.argv.indexOf('--zaman'); zamanDegistir(process.argv[i + 1], process.argv[i + 2]); console.log('Saat değişti.'); process.exit(0); }

// Diziler on a server: the panel on the home PC calls these over ssh (same functions as the local routes)
const jsonArg = s => { let j; try { j = JSON.parse(s); } catch { throw new Error('bozuk istek'); } if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('bozuk istek'); return j; };
for (const [bayrak, fn] of [['--diziler', k => dizilerCevap(kanalAdi(k))], ['--dizi-karar', s => diziKarar(jsonArg(s))], ['--dizi-tekrar', s => diziTekrar(jsonArg(s))], ['--dizi-ayar', s => diziAyarYaz(jsonArg(s))], ['--dizi-havuz', k => havuzCevap(kanalAdi(k))], ['--dizi-metin', s => diziMetin(jsonArg(s))], ['--dizi-havuz-ele', s => havuzEle(jsonArg(s))]]) {
  if (!process.argv.includes(bayrak)) continue;
  let cikti;
  try { cikti = JSON.stringify(fn(arg(bayrak))); } catch (e) { console.error('HATA: ' + e.message); process.exit(e.kod === 409 ? 3 : 1); }
  process.stdout.write(cikti, () => process.exit(0));
  return;
}

const sunucu = sunucuYap();
sunucu.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `\nHATA: ${PORT} portu dolu. Başka port: node panel/panel.js --port 4748\n` : e.message); process.exit(1); });
sunucu.listen(PORT, '127.0.0.1', () => {
  const link = `http://127.0.0.1:${PORT}/#k=${ANAHTAR}`;
  console.log(`\nKontrol paneli açık:\n  ${link}\n\nKapatmak için bu pencerede Ctrl+C.`);
  if (!process.argv.includes('--acma')) {
    const ac = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', link]] : process.platform === 'darwin' ? ['open', [link]] : ['xdg-open', [link]];
    spawn(ac[0], ac[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  }
});
