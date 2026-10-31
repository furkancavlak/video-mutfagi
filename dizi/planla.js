// Slot planner (pure): which series/episode would go into each configured slot of the next 48 h, from the rating
// (dizi/reyting.js), the queue and the series records. SHADOW MODE: dizi/calistir.js only writes the plan to
// kayit/dizi/<kanal>/plan.json for the panel; production (kararVer, uret-bolum.js slots) does not read it.
//   planla({ diziler, reyting, isler, ayar, simdi, gecmis }) -> plan
//   planYap(same)                                           -> { plan, gecmis }   (gecmis: plan-gecmis.json, the bench state)
// plan = { zaman, golge: true, gecici, slotlar: [{saat, atanan: {dizi, bolum} | null, kilitli, neden, kuyrukta}], kararlar: [{tur, dizi, neden}] }
// Rules, in priority order:
//   1. a slot holding a queued job less than 3 h away is locked; later queued jobs are tentative (kuyrukta) and may move
//   2. continuity: a running series gets a slot before its gap passes 30 h, as early as feasible (>= 10 h between episodes)
//   3. trend: the trending series takes tomorrow's first free slot (>= 10 h after its last post), unless that breaks rule 2
//   4. the other slots by posterior mean (mu; diagnostics break ties); a benched series only when canlanan or alone
//   5. running series <= slots per day; a new approved stock story starts only then, at most one a day while gecici
//   6. bench: P(effect < 0) >= 0.9 in two plan runs >= 6 h apart with new observations between (gecici: only isaret)
//   7. a series whose last episode is posted leaves the planner
const D = require('./dizi');

const SAAT = 3600e3, UFUK = 48 * SAAT, KILIT = 3 * SAAT, MIN_ARA = 10 * SAAT, MAX_ARA = 30 * SAAT, YEDEK_ARA = 6 * SAAT, YEDEK_P = 0.9;
const SAAT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const iso = t => new Date(t).toISOString();
const gunAnahtar = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };   // local day, like dizi.sonrakiSlotSaati
// standard normal CDF (same approximation as dizi/reyting.js)
const Phi = x => require('./reyting').Phi(x);

// configured slot times in (simdi, simdi + 48 h]
function slotSaatleri(ayar, simdi) {
  const ss = (ayar.saatler || []).filter(s => SAAT_RE.test(String(s)));
  if (!ss.length) return [];
  const out = []; let t = simdi + 1;
  for (let k = 0; k < 50; k++) { const s = D.sonrakiSlotSaati(t, ss); if (s < t || s > simdi + UFUK) break; out.push(s); t = s + 60e3; }
  return out;
}
// the series episode a queued job is (its video folder or a record pointing to it)
function isBolum(j, diziler) {
  for (const d of diziler) for (const b of d.bolumler || []) if ((j.video && b.video === j.video) || (j.id && b.kuyruk_id === j.id)) return { dizi: d.id, bolum: b.n };
  const m = /-b(\d+)$/.exec(String(j.video || ''));
  if (m) for (const d of diziler) if (String(j.video).endsWith(`-${d.id}-b${m[1]}`)) return { dizi: d.id, bolum: +m[1] };
  return null;
}

// the bench state after this run's rating (pure): streak of P(effect < 0) >= 0.9 and the benched series
//   gecmis = { diziler: {<id>: {zayif?: {zaman, son_gozlem, p}, yedek?: zaman}} }
function gecmisGuncelle(gecmis, reyting, diziler, simdi) {
  const g = { diziler: {}, ...(gecmis && typeof gecmis === 'object' ? JSON.parse(JSON.stringify(gecmis)) : {}) };
  if (!g.diziler || typeof g.diziler !== 'object') g.diziler = {};
  const kararlar = [];
  for (const d of diziler || []) {
    const r = reyting && reyting.diziler && reyting.diziler[d.id]; if (!r || !r.n_bolum) continue;
    const e = g.diziler[d.id] = g.diziler[d.id] || {};
    const p = r.sd > 0 ? Phi(-r.mu / r.sd) : 0, veri = veriImzasi(reyting, d.id);
    if (p < YEDEK_P) { delete e.zayif; continue; }
    if (!e.zayif) { e.zayif = { zaman: iso(simdi), veri, p: +p.toFixed(3) }; continue; }
    const sure = simdi - Date.parse(e.zayif.zaman), yeni = veri !== e.zayif.veri;
    if (sure >= YEDEK_ARA && yeni && !e.yedek) kararlar.push({ dizi: d.id, p: +p.toFixed(3), saat: +(sure / SAAT).toFixed(1) });
  }
  return { gecmis: g, yedekAdaylari: kararlar };
}
// what the series' rating was computed from: each episode's age at its newest observation (moves only with new data)
const veriImzasi = (reyting, id) => Object.entries((reyting && reyting.bolumler) || {}).filter(([, b]) => b.dizi === id).map(([m, b]) => `${m}:${b.yas_h}`).sort().join('|');

function planYap({ diziler = [], reyting = null, isler = [], ayar = {}, simdi = Date.now(), gecmis = null } = {}) {
  simdi = +new Date(simdi);
  const RY = reyting || { diziler: {}, bolumler: {}, canlanan: [], gecici: true };
  const gecici = RY.gecici !== false;
  const slotlar = slotSaatleri(ayar, simdi).map(t => ({ t, atanan: null, kilitli: false, neden: null, kuyrukta: null }));
  const gunlukSlot = (ayar.saatler || []).filter(s => SAAT_RE.test(String(s))).length;
  const kararlar = [];
  const { gecmis: G, yedekAdaylari } = gecmisGuncelle(gecmis, RY, diziler, simdi);

  // the series state the plan walks forward
  const S = new Map();
  for (const d of diziler) {
    const B = (d.bolumler || []).slice().sort((a, b) => a.n - b.n);
    if (!B.length || D.metinOnay(d) !== 'onaylandi' || B.some(b => b.durum === 'kontrol_et')) continue;
    if (!['aktif', 'kesildi'].includes(d.durum)) continue;
    const yayinda = B.filter(b => b.paylasildi), siradaki = B.filter(b => !b.paylasildi);
    if (!siradaki.length) continue;                                                 // 7. finished
    const son = yayinda.length ? Math.max(...yayinda.map(b => Date.parse(b.paylasildi))) : null;
    const r = (RY.diziler || {})[d.id] || { mu: 0, sd: 1, R: 50 };
    const t = r.tani || {}, tani = (t.izlenme_orani || 0) - (t.atlama || 0) + (t.paylasim || 0) + (t.kaydetme || 0);
    S.set(d.id, { d, son, kuyruk: siradaki.map(b => b.n), mu: r.mu ?? 0, sd: r.sd ?? 1, R: r.R ?? 50, trend: !!r.trend, tani,
      stok: d.stok === true, yedek: d.durum === 'kesildi' || !!(G.diziler[d.id] && G.diziler[d.id].yedek), kesik: d.durum === 'kesildi',
      canli: (RY.canlanan || []).some(c => c.dizi === d.id), basladi: d.stok !== true, atandi: 0 });
  }

  // 6. bench decisions (before the slots: a benched series does not hold one)
  for (const y of yedekAdaylari) {
    const s = S.get(y.dizi); if (!s || s.stok || s.kesik) continue;
    const neden = `düşük reyting kalıcı: P(etki<0) ${Math.round(y.p * 100)}%, ${y.saat} saattir iki ölçümde`;
    if (gecici) kararlar.push({ tur: 'isaret', dizi: y.dizi, neden: neden + ' (veri az, yedeğe alınmadı)' });
    else { s.yedek = true; s.yeniYedek = true; G.diziler[y.dizi].yedek = iso(simdi); kararlar.push({ tur: 'yedege-al', dizi: y.dizi, neden }); }
  }
  for (const s of S.values()) if (!s.yedek && !s.stok && s.sd > 0 && Phi(-s.mu / s.sd) >= YEDEK_P && !kararlar.some(k => k.dizi === s.d.id))
    kararlar.push({ tur: 'isaret', dizi: s.d.id, neden: `reyting düşük (R ${Math.round(s.R)}), izleniyor` });

  const geri = s => { s.yedek = false; const e = G.diziler[s.d.id]; if (e) { delete e.yedek; delete e.zayif; } };
  const ata = (sl, s, neden) => { sl.atanan = { dizi: s.d.id, bolum: s.kuyruk.shift() }; sl.neden = neden; s.son = sl.t; s.atandi++; if (s.stok) { s.stok = false; s.basladi = true; } };
  const bos = sl => !sl.atanan && !sl.kilitli && !sl.dolu;
  const uygun = (s, t) => s.kuyruk.length && (s.son == null || t - s.son >= MIN_ARA);

  // 1. queued jobs: locked under 3 h, the rest shown as tentative
  for (const j of isler) {
    const t = Date.parse(j.ne_zaman || ''); if (!Number.isFinite(t) || t <= simdi || t > simdi + UFUK) continue;
    const sl = slotlar.find(x => Math.abs(x.t - t) < 30 * 60e3); const e = isBolum(j, diziler);
    if (!sl) continue;
    sl.kuyrukta = { dizi: e ? e.dizi : null, bolum: e ? e.bolum : null, is: j.id || null };
    if (t - simdi < KILIT) {
      sl.kilitli = true; sl.neden = 'kuyrukta, 3 saatten az kaldı';
      const s = e && S.get(e.dizi);
      if (s && s.kuyruk[0] === e.bolum) ata(sl, s, sl.neden); else sl.atanan = e ? { dizi: e.dizi, bolum: e.bolum } : null;
      if (!e) sl.dolu = true;
    } else if (!e) { sl.dolu = true; sl.neden = 'dizi dışı paylaşım (kuyrukta)'; }
  }

  // 2. continuity: every running series inside its 30 h, earliest feasible slot first
  const kosan = () => [...S.values()].filter(s => s.basladi && !s.stok && !s.yedek && s.kuyruk.length);
  // the next episode of each running series whose 30 h limit falls inside the horizon; later episodes go through rule 4,
  // which still forces a series into the last free slot before its limit (zorunlu)
  const sureklilik = () => {
    const kacan = [], tamam = new Set();
    for (let k = 0; k < 200; k++) {
      const acil = kosan().filter(s => s.son != null && !tamam.has(s) && s.son + MAX_ARA <= simdi + UFUK).sort((a, b) => a.son - b.son || a.d.id.localeCompare(b.d.id))[0];
      if (!acil) break;
      const sinir = acil.son + MAX_ARA, sl = slotlar.find(x => bos(x) && uygun(acil, x.t)), ara = sl ? Math.round((sl.t - acil.son) / SAAT) : null;
      if (!sl) { kacan.push(acil.d.id); tamam.add(acil); continue; }
      if (sl.t > sinir) { kacan.push(acil.d.id); ata(sl, acil, `süreklilik: 30 saat sınırı aşılıyor, ilk boş slot (${ara} saat)`); tamam.add(acil); continue; }
      ata(sl, acil, `süreklilik: önceki bölümden ${ara} saat sonra (sınır 30)`); tamam.add(acil);
    }
    return kacan;
  };

  // 3. trend first, tried on a copy: kept only if continuity still holds for everyone
  const durum = () => ({ sl: slotlar.map(x => ({ ...x, atanan: x.atanan && { ...x.atanan } })), S: [...S.values()].map(s => ({ s, son: s.son, kuyruk: s.kuyruk.slice(), atandi: s.atandi, stok: s.stok, basladi: s.basladi })) });
  const geriYukle = k => { k.sl.forEach((x, i) => Object.assign(slotlar[i], x)); for (const o of k.S) Object.assign(o.s, { son: o.son, kuyruk: o.kuyruk, atandi: o.atandi, stok: o.stok, basladi: o.basladi }); };
  const trendS = kosan().filter(s => s.trend).sort((a, b) => b.mu - a.mu)[0];
  let kacan;
  if (trendS) {
    const once = durum(), bazKacan = (() => { const k = durum(); const r = sureklilik(); geriYukle(k); return r.length; })();
    const yarin = gunAnahtar(simdi + 24 * SAAT);
    const sl = slotlar.find(x => gunAnahtar(x.t) === yarin && bos(x) && uygun(trendS, x.t) && (trendS.son == null || x.t - trendS.son <= MAX_ARA));
    if (sl) {
      // its episodes before tomorrow keep the continuity rule
      ata(sl, trendS, `trend: yarının ilk boş slotu (R ${Math.round(trendS.R)}, hızlanıyor)`);
      const r = sureklilik();
      if (r.length > bazKacan) { geriYukle(once); kacan = sureklilik(); kararlar.push({ tur: 'isaret', dizi: trendS.d.id, neden: 'trend öne alınamadı: başka bir dizinin 30 saat sınırını bozuyor' }); }
      else { kacan = r; kararlar.push({ tur: 'trend-one-al', dizi: trendS.d.id, neden: `hızlanıyor ve en iyi olma olasılığı en yüksek: ${new Date(sl.t).toISOString()} slotuna alındı` }); }
    } else kacan = sureklilik();
  } else kacan = sureklilik();
  for (const id of kacan) kararlar.push({ tur: 'isaret', dizi: id, neden: 'süreklilik: 30 saat içinde boş slot yok' });

  // 4./5. the other free slots by posterior mean; new stock stories when capacity allows
  const yeniGun = new Map();
  const stoklar = [...S.values()].filter(s => s.stok && !s.kesik).sort((a, b) => Date.parse(a.d.olusturma || 0) - Date.parse(b.d.olusturma || 0) || a.d.id.localeCompare(b.d.id));
  const sira = (a, b) => b.mu - a.mu || b.tani - a.tani || a.d.id.localeCompare(b.d.id);
  const zorunlu = sl => kosan().filter(s => s.son != null && uygun(s, sl.t) && sl.t <= s.son + MAX_ARA && s.son + MAX_ARA <= simdi + UFUK
    && !slotlar.some(x => x.t > sl.t && bos(x) && x.t - s.son >= MIN_ARA && x.t <= s.son + MAX_ARA)).sort((a, b) => a.son - b.son || a.d.id.localeCompare(b.d.id))[0];
  for (const sl of slotlar) {
    if (!bos(sl)) continue;
    const z = zorunlu(sl);
    if (z) { ata(sl, z, `süreklilik: 30 saat sınırından önceki son boş slot (${Math.round((sl.t - z.son) / SAAT)} saat)`); continue; }
    const kapasite = kosan().length < gunlukSlot, gun = gunAnahtar(sl.t);
    const yeniOlur = kapasite && !(gecici && (yeniGun.get(gun) || 0) >= 1);
    const adaylar = [...kosan().filter(s => uygun(s, sl.t)), ...[...S.values()].filter(s => s.yedek && s.canli && uygun(s, sl.t))];
    const yeni = yeniOlur ? stoklar.find(s => s.stok && s.kuyruk.length) : null;
    if (yeni) adaylar.push(yeni);
    let s = adaylar.sort(sira)[0], neden;
    if (s && s === yeni) { neden = `yeni hikâye denemesi${gecici ? ' (veri az: günde en çok bir)' : ''}`; yeniGun.set(gun, (yeniGun.get(gun) || 0) + 1); kararlar.push({ tur: 'yeni-baslat', dizi: s.d.id, neden: `${new Date(sl.t).toISOString()} slotunda başlardı` }); }
    else if (s && s.yedek) { neden = 'yedekten geri: eski bölümü yeniden canlandı'; kararlar.push({ tur: 'geri-cagir', dizi: s.d.id, neden: 'eski bölümü canlandı' }); geri(s); }
    else if (s) neden = `reyting sırası (R ${Math.round(s.R)})`;
    else {
      // nobody else: a benched series fills the empty slot (not the one benched in this very run)
      s = [...S.values()].filter(x => x.yedek && !x.yeniYedek && uygun(x, sl.t)).sort(sira)[0];
      if (s) { neden = 'yedekten geri: başka aday yok'; kararlar.push({ tur: 'geri-cagir', dizi: s.d.id, neden: 'boş slot, başka aday yok' }); geri(s); }
    }
    if (s) ata(sl, s, neden); else sl.neden = 'aday yok';
  }

  // TODO(aktif mod): when ayar.dizi.planlayici === 'aktif', calistir.js would hand these slots to uret-bolum.js
  // (dizi.saat / kuyruk ne_zaman) and the bench decisions to the series records; not implemented: shadow only.
  const plan = { zaman: iso(simdi), golge: true, gecici,
    slotlar: slotlar.map(x => ({ saat: iso(x.t), atanan: x.atanan, kilitli: x.kilitli, neden: x.neden, kuyrukta: x.kuyrukta })),
    kararlar: kararlar.filter((k, i) => kararlar.findIndex(o => o.tur === k.tur && o.dizi === k.dizi) === i) };
  return { plan, gecmis: G };
}
const planla = a => planYap(a).plan;

module.exports = { planla, planYap, gecmisGuncelle, slotSaatleri, isBolum, MIN_ARA, MAX_ARA };
