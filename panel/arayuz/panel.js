// Control panel interface. Everything comes from the local panel server (panel/panel.js).
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const anahtar = (() => {
  const h = new URLSearchParams(location.hash.slice(1)).get('k');
  try { if (h) sessionStorage.setItem('vm-k', h); return h || sessionStorage.getItem('vm-k'); } catch { return h; }
})();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sayi = n => n == null ? '–' : Number(n).toLocaleString('tr-TR');
const dosya = p => `/dosya?p=${encodeURIComponent(p)}&k=${encodeURIComponent(anahtar)}`;
// a video on the server (panel.js copies it over with scp into a small local cache first)
const sunucuDosya = p => `/api/sunucu-video?yol=${encodeURIComponent(p)}&k=${encodeURIComponent(anahtar)}`;
const tarih = (t, o = {}) => new Date(t).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...o });
const gunTarih = t => new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const yerel = t => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const guvenli = u => /^https?:\/\//i.test(String(u || '')) ? u : null;          // only web links, never javascript: etc.
// datetime-local "2026-12-01T19:00" -> "2026-12-01T19:00+03:00": the offset travels, so a server in UTC posts at 19:00 here too
const ofsetli = v => { const d = new Date(v); if (!v || isNaN(d)) return v; const o = -d.getTimezoneOffset(), a = Math.abs(o), p = n => String(n).padStart(2, '0'); return `${String(v).slice(0, 16)}${o < 0 ? '-' : '+'}${p(Math.floor(a / 60))}:${p(a % 60)}`; };
// how the language model is paid for on this computer (panel.js → yzYolu)
const yzNot = k => { const y = O && O.yz ? O.yz[k || kanal || kanalAd0()] : null; return y === 'api' ? 'Anthropic API ile, kullandıkça ücretli' : y === 'claude-cli' ? 'ücretsiz, Claude aboneliğiyle' : 'yapay zekâ bağlı değil'; };
const kalan = t => { const ms = new Date(t) - Date.now(); if (ms < 0) return 'geçti'; const g = Math.floor(ms / 864e5), s = Math.floor(ms % 864e5 / 36e5), d = Math.floor(ms % 36e5 / 6e4); return g ? `${g} gün ${s} sa` : s ? `${s} sa ${d} dk` : `${d} dk`; };

async function api(yol, govde) {
  const r = await fetch('/api/' + yol, { method: govde ? 'POST' : 'GET', headers: { 'X-Panel': anahtar, 'Content-Type': 'application/json' }, body: govde ? JSON.stringify(govde) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.hata || 'istek başarısız');
  return j;
}
function bildir(yazi, kotu) { const b = $('#bildirim'); b.textContent = yazi; b.className = 'bildirim on' + (kotu ? ' kotu' : ''); clearTimeout(bildir.t); bildir.t = setTimeout(() => b.className = 'bildirim', 3500); }

// state
let O = null, SV = null, F = [], U = [], IG = null, D = [], J = [];
let makine = 'yerel', metrik = 'views', ayKaydir = 0, fikirFiltre = 'acik';
// the selected channel is kept in localStorage; every page and every request follows it
let kanal = (() => { try { const k = localStorage.getItem('vm-kanal'); return /^[\w.-]+$/.test(k || '') ? k : null; } catch { return null; } })();
const kanalAd0 = () => O && O.kanallar[0] ? O.kanallar[0].ad : null;
const kanalHesap = ad => { const k = O && O.kanallar.find(x => x.ad === (ad || kanal)); return k ? k.hesap : null; };
const hesapAd = h => String(h || '').replace(/^@/, '').toLowerCase() || 'oxygbio';
const kq = () => kanal ? '?kanal=' + encodeURIComponent(kanal) : '';
const Uk = () => U.filter(u => !kanal || u.kanal === kanal), Dk = () => D.filter(d => !d.kanal || d.kanal === kanal);
const makineAd = m => m === 'sunucu' ? (O.sunucu ? O.sunucu.ad : 'Sunucu') : 'Bu bilgisayar';
const kuyrukOf = m => m === 'sunucu' ? (SV && !SV.hata ? SV : null) : O.yerel;
const uretimBul = mp4 => U.find(u => u.mp4.some(x => x.yol === String(mp4 || '').replace(/\\/g, '/')) || String(mp4 || '').includes(u.ad));
const isAd = j => (uretimBul(j.mp4) || {}).baslik || (j.aciklama || '').split(/[.?!\n]/)[0] || String(j.mp4).split(/[\\/]/).pop();

// ---------------- Today: the two machines, then everything that waits for the user
function makineKart(m) {
  const K = kuyrukOf(m);
  if (!K) return `<div class="kart makine"><div class="makine-ust"><span class="nokta ${m === 'sunucu' && SV && SV.hata ? 'kotu' : 'gri'}"></span><b>${esc(makineAd(m))}</b></div><div class="ince-yazi">${esc(SV && SV.hata ? SV.hata : 'bağlanıyor…')}</div></div>`;
  const s = K.saglik, iyi = s.zamanlayici && !s.uyari.length, n = K.kuyruk[0];
  return `<div class="kart makine"><div class="makine-ust"><span class="nokta ${iyi ? '' : s.zamanlayici ? 'orta' : 'kotu'}"></span><b>${esc(makineAd(m))}</b>
      <span class="ince-yazi">${s.zamanlayici ? 'otomatik açık' : 'otomatik kapalı'}${s.son_calisma ? ' · son bakış ' + esc(new Date(s.son_calisma).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })) : ''}</span></div>
    ${n ? `<div class="siradaki"><span class="saat">${esc(tarih(n.ne_zaman, { weekday: undefined, day: undefined, month: undefined }))}</span><span class="ince-yazi">${esc(gunTarih(n.ne_zaman))} · ${esc(kalan(n.ne_zaman))} sonra</span></div>
      <div class="satir-ad"><span class="etiket ${n.onay_gerekli ? 'sari' : 'yesil'}">${n.onay_gerekli ? 'onay bekliyor' : 'gidecek'}</span>${esc(isAd(n))}</div>` : '<div class="ince-yazi">Sırada video yok.</div>'}
    ${s.uyari.length ? `<div class="uyarilar">${s.uyari.map(u => `<span class="uyari">${esc(u)}</span>`).join('')}</div>` : ''}
    <div><button class="dugme ince" data-sira="${m}">Sıra (${K.kuyruk.length})</button></div></div>`;
}
function bekleyenler() {
  const L = [];
  for (const m of ['yerel', 'sunucu']) {
    const K = kuyrukOf(m); if (!K) continue;
    for (const j of K.kuyruk.filter(j => j.onay_gerekli)) L.push({ ikon: '⏸', renk: 'sari', baslik: isAd(j), alt: `${makineAd(m)} · ${tarih(j.ne_zaman)} paylaşılacak, onayın bekleniyor`, islem: `${m === 'sunucu' && j.mp4 ? `<button class="dugme ince" data-sizle="${esc(j.mp4)}">İzle</button>` : uretimBul(j.mp4) && uretimBul(j.mp4).mp4[0] ? `<button class="dugme ince" data-izle="${esc(uretimBul(j.mp4).mp4[0].yol)}">İzle</button>` : ''}<button class="dugme ince sari" data-onayla="${esc(j.id)}" data-makine="${m}">Onayla</button>` });
    for (const j of K.hatali) L.push({ ikon: '!', renk: 'kirmizi', baslik: isAd(j), alt: `${makineAd(m)} · ${j.kontrol_et ? 'paylaşıldı mı belli değil: Instagram hesabına bak' : 'paylaşılamadı: ' + (j.hata || '')}`, islem: '' });
  }
  for (const u of Uk()) {
    if (u.kredi && u.fikir) L.push({ ikon: '💳', renk: 'sari', baslik: u.baslik, alt: `Ses hazır. ${KREDI_AD[u.kredi.adim]} Higgsfield kredisi bekliyor: ${sayi(u.kredi.kredi)} kredi.`, islem: `<button class="dugme ince sari" data-kredi-onay="${esc(u.ad)}">Fiyatı gör, onayla</button>` });
    else if (u.durum.ses === 'onay') L.push({ ikon: '✎', renk: 'sari', baslik: u.baslik, alt: `Metin hazır ve doğrulandı. Oku; beğenirsen ses yapılsın (${sayi(u.ses.karakter)} ElevenLabs karakteri).`, islem: `<button class="dugme ince" data-metin="${esc(u.metin)}">Metni oku</button>${u.fikir ? `<button class="dugme ince sari" data-uret-onay="${esc(u.ad)}">Onayla ve devam</button>` : ''}` });
    else if (u.durum.denetim === 'takildi') L.push({ ikon: u.puan, renk: 'kirmizi', baslik: u.baslik, alt: `Kalite kontrolü ${u.puan}/10 verdi, eşik 7. Rapora bak.`, islem: `<button class="dugme ince" data-rapor="${esc(u.ad)}">Rapor</button>${u.mp4[0] ? `<button class="dugme ince" data-izle="${esc(u.mp4[0].yol)}">İzle</button><button class="dugme ince" data-ekle="${esc(u.ad)}">Yine de sıraya ekle</button>` : ''}` });
    else if (u.mp4.length && !siradaMi(u)) L.push({ ikon: '▶', renk: 'yesil', baslik: u.baslik, alt: 'Video hazır, sırada değil.', islem: `<button class="dugme ince" data-izle="${esc(u.mp4[0].yol)}">İzle</button><button class="dugme ince sari" data-ekle="${esc(u.ad)}">Sıraya ekle</button>` });
  }
  for (const f of F.filter(f => f.kanal === kanal && f.durum === 'secildi' && !f.video)) L.push({ ikon: '★', renk: '', baslik: f.baslik, alt: `Seçilmiş fikir. Metni yazılsın mı? (${yzNot(f.kanal)}; ses ve görüntü için ayrıca sorulur)`, islem: `<button class="dugme ince sari" data-yaz="${esc(f.id)}" data-kanal="${esc(f.kanal)}">Metnini yaz</button>` });
  return L;
}
const siradaMi = u => ['yerel', 'sunucu'].some(m => { const K = kuyrukOf(m); return K && [...K.kuyruk, ...K.paylasilan].some(j => String(j.mp4 || '').includes(u.ad)); }) || (IG && IG.gonderiler.some(g => u.aciklama && g.aciklama && g.aciklama.slice(0, 40) === u.aciklama.slice(0, 40)));
function bugunCiz() {
  $('#makineler').innerHTML = makineKart('yerel') + (O.sunucu ? makineKart('sunucu') : '');
  const L = bekleyenler();
  $('#bekleyenler').innerHTML = L.length ? L.map(x => `<div class="satir"><span class="ikon ${x.renk}">${esc(x.ikon)}</span><div class="ad"><span class="baslik">${esc(x.baslik)}</span><small>${esc(x.alt)}</small></div><div class="islem">${x.islem}</div></div>`).join('') : '<div class="liste-bos">Her şey yolunda. Senden bekleyen bir şey yok.</div>';
}

// ---------------- Ideas
function kanalSecCiz() {
  const sec = $('#kanal-sec');
  if (sec.options.length !== O.kanallar.length) sec.innerHTML = O.kanallar.map(k => `<option value="${esc(k.ad)}">${esc(k.ad)}${k.hesap ? ' · ' + esc(k.hesap) : ''}</option>`).join('');
  sec.value = kanal;
}
function fikirlerCiz() {
  kanalSecCiz();
  $$('#fikir-filtre button').forEach(b => b.classList.toggle('on', b.dataset.f === fikirFiltre));
  const sira = { secildi: 0, 'insan-bekliyor': 1, uretiliyor: 2, yeni: 3, uretildi: 4, reddedildi: 5 };
  const liste = F.filter(f => f.kanal === kanal && (fikirFiltre === 'hepsi' || !['reddedildi', 'uretildi'].includes(f.durum))).sort((a, b) => (sira[a.durum] - sira[b.durum]) || ((b.puan || 0) - (a.puan || 0)));
  const ETK = { yeni: ['', 'yeni'], secildi: ['yesil', 'seçildi'], uretiliyor: ['sari', 'üretimde'], 'insan-bekliyor': ['sari', 'sana bakıyor'], uretildi: ['yesil', 'üretildi'], reddedildi: ['kirmizi', 'reddedildi'] };
  $('#fikir-liste').innerHTML = liste.length ? liste.map(f => {
    const [r, y] = ETK[f.durum] || ['', f.durum], d = `data-id="${esc(f.id)}" data-kanal="${esc(f.kanal)}"`, yz = `title="Yapay zekâ: ${esc(yzNot(f.kanal))}"`;
    const islem = f.durum === 'yeni' ? `<button class="dugme ince sari" data-fikir="sec" ${d}>Seç</button><button class="dugme ince" data-fikir="reddet" ${d}>Reddet</button>`
      : f.durum === 'secildi' && !f.video ? `<button class="dugme ince sari" data-yaz="${esc(f.id)}" data-kanal="${esc(f.kanal)}" ${yz}>Metnini yaz</button><button class="dugme ince" data-fikir="reddet" ${d}>Reddet</button>`
      : f.video ? `<button class="dugme ince" data-s="uretim">Üretimde gör</button>`
      : f.durum === 'reddedildi' ? `<button class="dugme ince" data-fikir="sec" ${d}>Geri al</button>` : '';
    return `<div class="satir"><span class="puan">${f.puan != null ? Number(f.puan).toFixed(1) : '–'}</span>
      <div class="ad"><span class="baslik"><span class="etiket ${r}">${esc(y)}</span>${esc(f.baslik)}</span><small title="${esc(f.oncul || f.neden)}">${esc(f.kanca || f.oncul || f.neden || '')}${f.kaynak ? ' · ' + esc(f.kaynak) : ''}</small></div>
      <div class="islem">${guvenli(f.link) ? `<a class="dugme ince" href="${esc(guvenli(f.link))}" target="_blank" rel="noopener">Kaynak</a>` : ''}${islem}</div></div>`;
  }).join('') : '<div class="liste-bos">Havuz boş. “Yeni konu topla”, sonra “Puanla”; ya da kendi fikrini ekle.</div>';
}

// ---------------- Production
const ADIM = [['metin', 'Metin'], ['ses', 'Ses'], ['kurgu', 'Video'], ['denetim', 'Kontrol']];
function uretimCiz() {
  const UL = Uk();
  $('#uretim-say').textContent = UL.length;
  $('#uretim-liste').innerHTML = UL.length ? UL.map(u => {
    const v = u.mp4[0], calisiyor = J.some(x => x.durum === 'calisiyor' && x.fid && x.fid === u.fikir);
    const adimlar = ADIM.map(([k, a]) => `<span class="adim ${u.durum[k]}">${a}${k === 'denetim' && u.puan != null ? ' ' + u.puan + '/10' : u.durum[k] === 'tamam' ? ' ✓' : u.durum[k] === 'onay' ? ' · onay' : ''}</span>`).join('');
    const devam = u.fikir && u.durum.denetim !== 'tamam' && !(u.durum.kurgu === 'tamam' && u.durum.denetim === 'takildi');
    return `<div class="satir"><div class="kucuk-video">${v ? `<video src="${dosya(v.yol)}#t=1" preload="metadata" muted playsinline></video>` : ''}</div>
      <div class="ad"><span class="baslik">${esc(u.baslik)}</span><small>${esc(u.ad)}${u.katman ? ' · ' + esc(u.katman) : ''}${calisiyor ? ' · çalışıyor…' : ''}</small><div class="adimlar">${adimlar}</div></div>
      <div class="islem">
        ${u.metin ? `<button class="dugme ince" data-metin="${esc(u.metin)}">Metin</button>` : ''}
        ${u.rapor ? `<button class="dugme ince" data-rapor="${esc(u.ad)}">Rapor</button>` : ''}
        ${v ? `<button class="dugme ince" data-izle="${esc(v.yol)}">İzle</button><button class="dugme ince" data-ekle="${esc(u.ad)}">Sıraya ekle</button>` : ''}
        ${u.kredi && u.fikir ? `<button class="dugme ince sari" data-kredi-onay="${esc(u.ad)}" ${calisiyor ? 'disabled' : ''}>Krediyi onayla</button>` : u.durum.ses === 'onay' && u.fikir ? `<button class="dugme ince sari" data-uret-onay="${esc(u.ad)}" ${calisiyor ? 'disabled' : ''}>Onayla ve devam</button>` : devam && u.durum.ses === 'tamam' ? `<button class="dugme ince" data-uret="${esc(u.ad)}" ${calisiyor ? 'disabled' : ''}>Devam et</button>` : ''}
      </div></div>`;
  }).join('') : '<div class="liste-bos">Henüz üretim yok. Fikirler’den bir fikre “Metnini yaz” de.</div>';
}

// ---------------- Queue (this computer or the server)
function siraCiz() {
  $('#makine-sec').innerHTML = ['yerel', ...(O.sunucu ? ['sunucu'] : [])].map(m => `<button data-makine-sec="${m}" class="${m === makine ? 'on' : ''}">${esc(makineAd(m))}</button>`).join('');
  $('#makine-sec').hidden = !O.sunucu;
  const K = kuyrukOf(makine);
  if (K && K.hesapYok) { $('#sira-saglik').innerHTML = ''; $('#sira-liste').innerHTML = '<div class="liste-bos">Bu kanalın Instagram hesabı tanımlı değil (kanal/&lt;ad&gt;/kimlik.json → hesap).</div>'; return; }
  if (!K) { $('#sira-saglik').innerHTML = ''; $('#sira-liste').innerHTML = `<div class="liste-bos">${esc(SV && SV.hata ? SV.hata : 'Sunucuya bağlanıyor…')}</div>`; return; }
  const s = K.saglik;
  $('#sira-saglik').innerHTML = `<span><i class="nokta ${s.zamanlayici ? '' : 'kotu'}"></i>${s.zamanlayici ? 'Otomatik paylaşım açık' : 'Otomatik paylaşım kapalı'}</span>
    <span><i class="nokta ${s.instagram.bagli ? (s.instagram.gun < 10 ? 'orta' : '') : 'kotu'}"></i>${s.instagram.bagli ? `Instagram bağlı · ${s.instagram.gun} gün` : 'Instagram bağlı değil'}</span>
    ${K.saatler.length ? `<span class="ince-yazi">Saatler ${esc(K.saatler.join(', '))} · günde en fazla ${esc(K.gunluk)}</span>` : ''}`;
  const satirlar = [...K.kuyruk, ...K.hatali.map(h => ({ ...h, _hatali: true }))];
  $('#sira-liste').innerHTML = satirlar.length ? satirlar.map(j => {
    const gec = !j._hatali && !j.onay_gerekli && new Date(j.ne_zaman) < Date.now() - 30 * 6e4;
    const et = j._hatali ? ['kirmizi', 'hatalı'] : j.onay_gerekli ? ['sari', 'onay bekliyor'] : gec ? ['kirmizi', 'gecikti'] : ['yesil', 'hazır'];
    const d = `data-makine="${makine}"`, u = uretimBul(j.mp4);
    return `<div class="satir"><div class="zaman-kutu">${j.ne_zaman ? esc(tarih(j.ne_zaman, { weekday: undefined })) : '–'}<small>${j.ne_zaman ? esc(kalan(j.ne_zaman)) + (kalan(j.ne_zaman) === 'geçti' ? '' : ' sonra') : ''}</small></div>
      <div class="ad"><span class="baslik"><span class="etiket ${et[0]}">${et[1]}</span>${esc(isAd(j))}</span><small title="${esc(j.hata || j.aciklama)}">${esc(j.hata || j.aciklama)}</small></div>
      <div class="islem">${j._hatali ? '' : `${makine === 'yerel' && u && u.mp4[0] ? `<button class="dugme ince" data-izle="${esc(u.mp4[0].yol)}">İzle</button>` : makine === 'sunucu' && j.mp4 ? `<button class="dugme ince" data-sizle="${esc(j.mp4)}">İzle</button>` : ''}
        ${j.onay_gerekli ? `<button class="dugme ince sari" data-onayla="${esc(j.id)}" ${d}>Onayla</button>` : ''}
        <input type="datetime-local" value="${j.ne_zaman ? yerel(j.ne_zaman) : ''}" data-zaman="${esc(j.id)}" ${d} aria-label="Zaman">
        <button class="dugme ince tehlike" data-iptal="${esc(j.id)}" ${d} title="Sıradan çıkar">✕</button>`}</div></div>`;
  }).join('') : '<div class="liste-bos">Sıra boş.</div>';
}

// ---------------- Calendar
function gonderiler() {
  if (IG && IG.bagli && IG.gonderiler.length) return IG.gonderiler;
  return [O.yerel, SV && !SV.hata ? SV : null].filter(Boolean).flatMap(K => K.paylasilan.filter(p => p.sonuc).map(p => ({ baslik: isAd(p), link: p.link, zaman: p.paylasildi, ...p.sonuc })));
}
function takvimCiz() {
  const bas = new Date(); bas.setDate(1); bas.setMonth(bas.getMonth() + ayKaydir); bas.setHours(0, 0, 0, 0);
  $('#takvim-ay').textContent = bas.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  const olay = [];
  for (const m of ['yerel', 'sunucu']) { const K = kuyrukOf(m); if (K) for (const j of K.kuyruk) olay.push({ t: j.ne_zaman, ad: isAd(j), tam: `${makineAd(m)}: ${isAd(j)}`, sinif: (j.onay_gerekli ? 'onay' : 'gelecek') + (m === 'sunucu' ? ' sunucu' : '') }); }
  for (const g of gonderiler()) olay.push({ t: g.zaman, ad: g.views != null ? sayi(g.views) + ' izlenme' : g.baslik, tam: g.baslik, sinif: 'gecmis', link: g.link });
  const ilk = new Date(bas); ilk.setDate(1 - ((bas.getDay() + 6) % 7));
  let h = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(g => `<div class="gun-ad">${g}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = new Date(ilk); d.setDate(ilk.getDate() + i);
    if (i % 7 === 0 && i >= 28 && d.getMonth() !== bas.getMonth()) break;
    const ayni = x => { const e = new Date(x); return e.toDateString() === d.toDateString(); };
    const o = olay.filter(x => x.t && ayni(x.t)).sort((a, b) => String(a.t).localeCompare(String(b.t)));
    h += `<div class="gun${d.getMonth() !== bas.getMonth() ? ' disari' : ''}${ayni(Date.now()) ? ' bugun' : ''}"><span class="no">${d.getDate()}</span>${o.map(x => `<${guvenli(x.link) ? `a href="${esc(guvenli(x.link))}" target="_blank" rel="noopener"` : 'div'} class="olay ${x.sinif}" title="${esc(x.tam)}">${esc(new Date(x.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }))} ${esc(x.ad)}</${guvenli(x.link) ? 'a' : 'div'}>`).join('')}</div>`;
  }
  $('#takvim').innerHTML = h;
}

// ---------------- Results + lessons (the chalkboard card)
function dersCiz() {
  const son = Dk()[0], dersCalisiyor = J.some(x => x.tur === 'ders' && x.durum === 'calisiyor');
  const guven = g => `<span class="guven" title="güven: ${esc(g)}">${[0, 1, 2].map(i => `<i class="${i < ({ dusuk: 1, orta: 2, yuksek: 3 }[g] || 0) ? 'on' : ''}"></i>`).join('')}</span>`;
  const ust = `<div class="tahta-ust"><span class="kicker">Ne öğrendik${son ? ' · ' + son.video + ' video' : ''}</span><span class="sag">${son ? esc(gunTarih(son.zaman)) : ''}<button class="dugme ince" data-is="ders" title="Yapay zekâ: ${esc(yzNot())}" ${dersCalisiyor ? 'disabled' : ''}>${dersCalisiyor ? 'çıkarılıyor…' : son ? 'Yeniden çıkar' : 'Dersleri çıkar'}</button></span></div>`;
  if (!son || !son.dersler.length) { $('#ders').innerHTML = ust + `<h2>${gonderiler().length ? 'Henüz ders çıkarılmadı.' : 'Önce rakamlar gelsin.'}</h2>`; return; }
  const [a, ...digerleri] = son.dersler;
  $('#ders').innerHTML = ust + `<h2>${esc(a.kural)}${guven(a.guven)}</h2><div class="kanit">${esc(a.kanit)}</div>${a.dene ? `<span class="dene">dene → ${esc(a.dene)}</span>` : ''}
    <div style="margin-top:12px"><button class="dugme ince sari" data-ders-kaydet="0">Kaydet</button></div>
    ${digerleri.length ? `<div class="diger">${digerleri.map((d, i) => `<div>${esc(d.kural)}${guven(d.guven)} <button class="dugme ince" data-ders-kaydet="${i + 1}">Kaydet</button></div>`).join('')}</div>` : ''}`;
}
function sonuclarCiz() {
  $$('#metrik button').forEach(b => b.classList.toggle('on', b.dataset.m === metrik));
  const g = [...gonderiler()].sort((a, b) => String(b.zaman).localeCompare(String(a.zaman)));
  const tepe = Math.max(1, ...g.map(x => x[metrik] || 0)), ad = $(`#metrik [data-m="${metrik}"]`).textContent.toLocaleLowerCase('tr');
  $('#sonuclar').innerHTML = g.length ? `<div class="ince-yazi" style="margin-bottom:12px">${g.length} video · toplam ${sayi(g.reduce((a, b) => a + (b[metrik] || 0), 0))} ${esc(ad)}${IG && IG.zaman ? ' · güncellendi ' + esc(tarih(IG.zaman, { weekday: undefined })) : ''}</div>
    <div class="cubuklar">${g.map(x => `<div class="cubuk"><div class="ad"><a href="${esc(guvenli(x.link) || '#')}" target="_blank" rel="noopener">${esc(x.baslik || 'Video')}</a><small>${esc(gunTarih(x.zaman))}</small></div><div class="ray"><b style="width:${((x[metrik] || 0) / tepe * 100).toFixed(1)}%"></b></div><div class="deger">${sayi(x[metrik])}</div></div>`).join('')}</div>`
    : `<div class="liste-bos">${IG === null ? 'Instagram’dan rakamlar geliyor…' : IG.hesapYok ? 'Bu kanalın Instagram hesabı tanımlı değil.' : 'Henüz paylaşılmış video yok.'}</div>`;
  dersCiz();
}

// ---------------- Series (Diziler): one card per story, 3 episode chips, continuation settings
const DZ_ET = { metin: ['', 'metin'], uretimde: ['sari', 'üretimde'], 'onay-bekliyor': ['sari', 'onay bekliyor'], sirada: ['yesil', 'sırada'], yayinda: ['yesil', 'yayında'], olculdu: ['yesil', 'ölçüldü'], atlandi: ['kirmizi', 'kesildi'], kontrol_et: ['kirmizi', 'kontrol et'] };
let DZ = null, dzKirli = false;
// the server toggle needs a server panel that knows the dizi flags (an old panel.js would just fail or hang): --ozet reports ozellik: ['diziler']
const dzSunucuVar = () => !!(SV && !SV.hata && Array.isArray(SV.ozellik) && SV.ozellik.includes('diziler'));
const dzM = () => makine === 'sunucu' && dzSunucuVar() ? 'sunucu' : 'yerel';   // machine Diziler actually talks to
// every machine switch (Sıra or Diziler) goes through here: Diziler is reset with it; unsaved settings need a yes first
function makineDegis(m) {
  if (m !== makine && dzKirli && !confirm('Devam ayarlarında kaydedilmemiş değişiklik var. Atılsın mı?')) return false;
  if (m !== makine) { makine = m; DZ = null; dzKirli = false; dizilerCiz(); dizilerYukle(); }
  return true;
}
function dzEtiket(b) {
  if (b.durum === 'onay-bekliyor' && b.kuyruk_onay_gerekli === false) return ['yesil', 'sırada'];   // approved in the queue, waiting for its slot
  return DZ_ET[b.durum] || ['', b.durum];
}
function dzBolum(d, b) {
  const [r, y] = dzEtiket(b), onayBekler = b.durum === 'onay-bekliyor' && b.kuyruk_id && b.kuyruk_onay_gerekli === true;
  const karar = b.karar && b.karar !== 'bekle' ? `${b.karar === 'kes' ? 'kes' : 'devam'}${b.elle ? ' (elle)' : ''}` : null;
  const iz = b.izin || {}, dk = `data-did="${esc(d.id)}" data-dn="${esc(b.n)}"`;
  return `<div class="dz-bolum"><div class="dz-bolum-ust"><b>Bölüm ${esc(b.n)}</b><span class="etiket ${r}">${esc(y)}</span>${b.bekleme === 'butce' ? '<span class="etiket sari">bütçe bekliyor</span>' : ''}</div>
    <div class="ince-yazi">${b.metrik && b.metrik.views != null ? sayi(b.metrik.views) + ' izlenme' : b.paylasildi ? 'sayılar henüz yok' : (b.kelime ? sayi(b.kelime) + ' kelime' : '')}${b.paylasildi ? ' · ' + esc(tarih(b.paylasildi, { weekday: undefined })) : ''}</div>
    ${karar || b.karar_neden ? `<div class="dz-karar ${b.karar === 'kes' ? 'kes' : ''}">${karar ? `<b>${esc(karar)}</b> ` : ''}${esc(b.karar_neden || '')}</div>` : ''}
    <div class="dz-islem">${onayBekler ? `<button class="dugme ince sari" data-onayla="${esc(b.kuyruk_id)}" data-makine="${dzM()}">Onayla</button>` : ''}
      ${iz.devam ? `<button class="dugme ince" data-dkarar="devam" ${dk}>Devam ettir</button>` : ''}${iz.kes ? `<button class="dugme ince tehlike" data-dkarar="kes" ${dk}>Kes</button>` : ''}${iz.tekrar ? `<button class="dugme ince" data-dtekrar="1" ${dk}>Tekrar dene</button>` : ''}
      ${b.mp4 ? `<button class="dugme ince" ${dzM() === 'sunucu' ? 'data-sizle' : 'data-izle'}="${esc(b.mp4)}">Videoyu aç</button>` : ''}
      ${guvenli(b.link) ? `<a class="dugme ince" href="${esc(guvenli(b.link))}" target="_blank" rel="noopener">Reels</a>` : ''}</div></div>`;
}
const DZ_DURUM = { aktif: ['yesil', 'sürüyor'], bitti: ['', 'tamamlandı'], kesildi: ['kirmizi', 'kesildi'] };
function dizilerCiz() {
  const dzSv = !!O.sunucu && dzSunucuVar();
  $('#dz-makine').innerHTML = ['yerel', ...(dzSv ? ['sunucu'] : [])].map(m => `<button data-dz-makine="${m}" class="${m === dzM() ? 'on' : ''}">${esc(makineAd(m))}</button>`).join('');
  $('#dz-makine').hidden = !dzSv;
  if (!DZ) { $('#dz-liste').innerHTML = '<div class="liste-bos">Diziler yükleniyor…</div>'; return; }
  $('#dz-say').textContent = DZ.diziler.length;
  const s = DZ.son_kosu;
  $('#dz-son').innerHTML = `<div class="dz-son-ust"><b>Son çalışma</b><span class="ince-yazi">${s ? esc(tarih(s.zaman, { weekday: undefined })) : (DZ.hata ? esc(DZ.hata) : 'henüz çalışma kaydı yok')}</span></div>`
    + (s ? ((s.notlar || []).length ? `<ul class="dz-notlar">${s.notlar.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '<div class="ince-yazi">Not yok, her şey yolunda.</div>') + ((s.kararlar || []).length ? `<div class="ince-yazi">Kararlar: ${s.kararlar.map(k => esc(`${k.id} bölüm ${k.n} → ${k.karar}`)).join(', ')}</div>` : '')
      + (s.reddedilen || DZ.reddedilen_toplam ? `<div class="ince-yazi">Uygun bulunmayan hikâye: bu çalışmada ${esc(s.reddedilen || 0)} · toplam ${esc(DZ.reddedilen_toplam || 0)} (bir daha denenmez)</div>` : '') : '');
  $('#dz-liste').innerHTML = DZ.diziler.length ? DZ.diziler.map(d => {
    const [r, y] = DZ_DURUM[d.durum] || ['', d.durum], url = guvenli(d.kaynak && d.kaynak.url);
    return `<div class="kart dz-kart"><div class="dz-ust"><div class="ad"><span class="baslik"><span class="etiket ${r}">${esc(y)}</span>${esc(d.baslik_kisa || d.baslik)}</span><small>${esc(d.baslik || '')}</small></div>
      <div class="dz-meta">${d.anlatici ? `<span class="ince-yazi">Ses: ${esc(d.anlatici.ad || d.anlatici.ses)}</span>` : ''}${url ? `<a class="dugme ince" href="${esc(url)}" target="_blank" rel="noopener">Kaynak</a>` : ''}</div></div>
      <div class="dz-bolumler">${(d.bolumler || []).map(b => dzBolum(d, b)).join('')}</div></div>`;
  }).join('') : '<div class="liste-bos">Henüz dizi yok. Zamanlayıcı çalışınca ilk hikâyeler burada görünür.</div>';
  if (!dzKirli) dzAyarCiz();
}
// plain questions; percent in the form, a ratio in konu.json
function dzAyarCiz() {
  const var_ = !!(DZ && DZ.ayar_var);   // a channel without a dizi block has nothing to edit: no form, nothing to send
  $('#dz-ayar').hidden = !var_; $('#dz-ayar-baslik').hidden = !var_;
  if (!var_) { $('#dz-ayar').innerHTML = ''; dzKirli = false; return; }
  const a = (DZ && DZ.ayar) || {}, v = x => x == null || typeof x === 'object' ? '' : esc(x), lst = x => Array.isArray(x) ? x.join(', ') : '';
  $('#dz-ayar').innerHTML = `<label>Günde kaç bölüm paylaşılsın?<input type="number" name="gunluk_hedef" min="1" max="5" step="1" value="${v(a.gunluk_hedef)}"></label>
    <label class="kutu dz-onay"><input type="checkbox" name="onay_donemi" ${a.onay_donemi ? 'checked' : ''}> Her bölümü önce ben onaylayayım (onay dönemi)</label>
    <label>Onay döneminde günde kaç bölüm hazırlansın?<input type="number" name="onay_gunluk" min="1" max="5" step="1" value="${v(a.onay_gunluk)}"></label>
    <label>Hangi saatlerde paylaşılsın? (virgülle: 12:00, 17:00)<input type="text" name="saatler" value="${esc(lst(a.saatler))}"></label>
    <label>Bir hikâyenin devamı için kaç saat bekleyelim?<input type="number" name="bekle_saat" min="6" max="72" step="1" value="${v(a.bekle_saat)}"></label>
    <label>Devam için izlenme, öncekilerin ortalamasının en az yüzde kaçı olsun?<input type="number" name="esik_oran" min="10" max="100" step="1" value="${typeof a.esik_oran === 'number' ? Math.round(a.esik_oran * 1000) / 10 : ''}"></label>
    <label>İlk kaç hikâye hiç kesilmesin?<input type="number" name="ilk_dizi_sayisi" min="0" max="50" step="1" value="${v(a.ilk_dizi_sayisi)}"></label>
    <label>Yorumlarda hangi sözler “devamı gelsin” demek? (virgülle)<input type="text" name="yorum_kelimeleri" value="${esc(lst(a.yorum_kelimeleri))}"></label>
    <label>Kaç kişi isterse hikâye kesilmesin?<input type="number" name="yorum_min" min="1" max="50" step="1" value="${v(a.yorum_min)}"></label>
    <div class="dz-kaydet"><span class="dz-hata" id="dz-hata" role="alert"></span><button class="dugme sari" type="submit">Kaydet</button></div>`;
  dzKirli = false;
}
function dzAyarOku() {
  const f = $('#dz-ayar'), g = n => f.elements[n], sayiOku = n => g(n).value.trim() === '' ? undefined : Number(g(n).value.replace(',', '.'));
  const liste = n => g(n).value.split(',').map(x => x.trim()).filter(Boolean);
  const yuzde = sayiOku('esik_oran');
  const o = { gunluk_hedef: sayiOku('gunluk_hedef'), onay_donemi: g('onay_donemi').checked, onay_gunluk: sayiOku('onay_gunluk'), saatler: liste('saatler'), bekle_saat: sayiOku('bekle_saat'),
    esik_oran: yuzde == null ? undefined : Math.round(yuzde * 10) / 1000, ilk_dizi_sayisi: sayiOku('ilk_dizi_sayisi'), yorum_kelimeleri: liste('yorum_kelimeleri'), yorum_min: sayiOku('yorum_min') };
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}
async function dizilerYukle() {
  const at = kanal, mk = dzM(); if (!at) return;
  const ayni = () => at === kanal && mk === dzM();   // channel or machine switched while waiting: drop the answer
  try { const r = await api('diziler?kanal=' + encodeURIComponent(at) + (mk === 'sunucu' ? '&makine=sunucu' : '')); if (ayni()) DZ = r; } catch (e) { if (ayni()) DZ = { ayar: {}, diziler: [], son_kosu: null, hata: e.message }; }
  dizilerCiz();
}
async function dzKaydet(e) {
  e.preventDefault();
  const h = $('#dz-hata'); h.textContent = '';
  try { await api('dizi/ayar', { kanal, makine: dzM(), ayar: dzAyarOku() }); dzKirli = false; bildir('Ayarlar kaydedildi ✓'); await dizilerYukle(); }
  catch (err) { h.textContent = err.message; bildir(err.message, true); }
}
async function dzTekrar(d) {
  try { await api('dizi/tekrar', { kanal, makine: dzM(), id: d.did, n: +d.dn }); bildir('Bölüm yeniden denenecek'); await dizilerYukle(); }
  catch (err) { bildir(err.message, true); }
}
async function dzKarar(d) {
  const kes = d.dkarar === 'kes', dz = DZ && DZ.diziler.find(x => x.id === d.did), son = dz && +d.dn >= dz.bolumler.length;   // Kes on the last episode just closes the series
  if (kes && !confirm(son ? 'Bu hikâye tamamlandı olarak kapatılsın mı? Son bölüm artık ölçülmez.' : 'Bu hikâyenin devamı kesilsin mi? Sonraki bölümler üretilmez.')) return;
  try { await api('dizi/karar', { kanal, makine: dzM(), id: d.did, n: +d.dn, karar: d.dkarar, neden: kes ? 'Furkan kesti' : 'Furkan devam ettirdi' }); bildir(kes ? (son ? 'Hikâye tamamlandı' : 'Kesildi') : 'Devam edecek'); await dizilerYukle(); }
  catch (err) { bildir(err.message, true); }
}

// ---------------- Background jobs drawer
const IS_AD = { topla: 'Konu toplama', puanla: 'Puanlama', uret: 'Üretim', 'uret-ses': 'Üretim (ses onaylı)', 'uret-kredi': 'Üretim (kredi onaylı)', sonuclar: 'Rakam çekme', ders: 'Ders çıkarma' };
function islerCiz() {
  const calisan = J.filter(x => x.durum === 'calisiyor').length;
  $('#isler-say').textContent = calisan || J.length; $('#isler-dugme').classList.toggle('aktif', !!calisan);
  $('#is-liste').innerHTML = J.length ? J.map(x => `<div class="is"><div class="is-ust"><span class="nokta ${x.durum === 'calisiyor' ? 'orta' : x.durum === 'hata' ? 'kotu' : ''}"></span>${esc(IS_AD[x.tur] || x.tur)}${x.kanal ? ' · ' + esc(x.kanal) : ''}<span class="ince-yazi" style="margin-left:auto">${esc(new Date(x.bas).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }))}</span></div><pre>${esc(x.satirlar.join('\n'))}</pre></div>`).join('') : '<div class="liste-bos">Çalışan iş yok.</div>';
}
let izle = null;
async function islerYukle() {
  const once = new Set(J.filter(x => x.durum === 'calisiyor').map(x => x.id));
  J = await api('isler').catch(() => J);
  islerCiz();
  const biten = J.filter(x => once.has(x.id) && x.durum !== 'calisiyor');
  for (const x of biten) { bildir(`${IS_AD[x.tur] || x.tur} ${x.durum === 'bitti' ? 'bitti' : 'durdu: ' + (x.satirlar.slice(-1)[0] || '')}`, x.durum !== 'bitti'); }
  if (biten.length) yukle();
  clearTimeout(izle); if (J.some(x => x.durum === 'calisiyor')) izle = setTimeout(islerYukle, 2500);
}
async function isBaslat(tur, ek = {}) {
  try { await api('is', { tur, ...ek }); bildir(`${IS_AD[tur]} başladı`); await islerYukle(); }
  catch (e) { bildir(e.message, true); }
}

// ---------------- Dialogs
const pencere = html => { $('#pencere-ic').innerHTML = html; $('#pencere').showModal(); };
const pUst = b => `<div class="p-ust"><h2>${esc(b)}</h2><button class="kapat" data-kapat aria-label="Kapat">✕</button></div>`;
async function metinGoster(p) { const t = await fetch(dosya(p)).then(r => r.text()); pencere(pUst('Metin') + `<div class="metin-oku">${esc(t)}</div>`); }
async function raporGoster(ad) {
  const u = U.find(x => x.ad === ad), r = await api('rapor?p=' + encodeURIComponent(u.rapor));
  const ag = { yuksek: 'kirmizi', orta: 'sari', dusuk: '' };
  pencere(pUst(`Kalite kontrolü: ${r.puan ?? '?'}/10`) + `${r.en_iyi_3.length ? `<div><b>En çok fark yaratacak 3 şey</b><ol style="margin:6px 0 0 18px">${r.en_iyi_3.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
    <div>${r.bulgular.map(b => `<div class="bulgu"><b>${esc(b.an)}</b><div><span class="etiket ${ag[b.agirlik] || ''}">${esc(b.agirlik)}</span>${esc(b.sorun)}<div class="ince-yazi">→ ${esc(b.duzeltme)}</div></div></div>`).join('')}</div>
    ${u.sayfalar.length ? `<div class="sayfalar">${u.sayfalar.map(s => `<a href="${dosya(s)}" target="_blank"><img src="${dosya(s)}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}`);
}
function videoGoster(p, sunucu) { pencere(pUst('Video') + (sunucu ? '<div class="ince-yazi">Video sunucudan alınıyor, büyükse biraz sürer…</div>' : '') + `<video id="p-video" src="${sunucu ? sunucuDosya(p) : dosya(p)}" controls autoplay playsinline style="max-height:70vh"></video>`); }
function sonrakiSaat(K) {
  const saatler = (K && K.saatler.length ? K.saatler : ['19:00']), dolu = (K ? K.kuyruk : []).map(j => +new Date(j.ne_zaman));
  for (let g = 0; g < 30; g++) for (const s of saatler) { const [h, m] = s.split(':').map(Number), d = new Date(); d.setDate(d.getDate() + g); d.setHours(h, m, 0, 0); if (+d > Date.now() + 10 * 6e4 && !dolu.some(t => Math.abs(t - d) < 30 * 6e4)) return d; }
  return new Date(Date.now() + 36e5);
}
function ekleGoster(ad) {
  const u = U.find(x => x.ad === ad), v = u.mp4.find(x => !x.ucretli) || u.mp4[0], hedef = O.sunucu ? 'sunucu' : 'yerel';
  pencere(pUst('Sıraya ekle') + `<video id="p-video" src="${dosya(v.yol)}#t=1" controls playsinline preload="metadata"></video>
    ${u.mp4.length > 1 ? `<label>Hangi video<select id="e-video" class="sec">${u.mp4.map(x => `<option value="${esc(x.yol)}">${x.ucretli ? 'ücretli' : 'ücretsiz'} · ${x.mb} MB</option>`).join('')}</select></label>` : `<input type="hidden" id="e-video" value="${esc(v.yol)}">`}
    <label>Açıklama<textarea id="e-aciklama">${esc(u.aciklama)}</textarea></label>
    <div class="p-satir">${O.sunucu ? `<label>Nerede<select id="e-makine" class="sec"><option value="sunucu">${esc(makineAd('sunucu'))} (7/24)</option><option value="yerel">Bu bilgisayar</option></select></label>` : ''}
      <label>Zaman<input type="datetime-local" id="e-zaman" value="${yerel(sonrakiSaat(kuyrukOf(hedef)))}"></label>
      <label class="kutu"><input type="checkbox" id="e-onay"> Önce ben onaylayayım</label></div>
    <div class="p-alt"><button class="dugme" data-kapat>Vazgeç</button><button class="dugme sari" id="e-ekle">Sıraya ekle</button></div>`);
  $('#e-ekle').onclick = async () => {
    if (!kanalHesap(u.kanal)) return bildir('Bu kanalın Instagram hesabı tanımlı değil: sıraya eklenemez', true);   // never falls back to oxygbio
    const m = $('#e-makine') ? $('#e-makine').value : 'yerel', b = $('#e-ekle'); b.disabled = true; b.textContent = m === 'sunucu' ? 'Sunucuya gönderiliyor…' : 'Ekleniyor…';
    try { await api('kuyruk/ekle', { makine: m, mp4: $('#e-video').value, aciklama: $('#e-aciklama').value, kanal: u.kanal, zaman: ofsetli($('#e-zaman').value), onay_gerekli: $('#e-onay').checked }); $('#pencere').close(); bildir('Sıraya eklendi ✓'); makine = m; await yukle(); sekme('sira'); }
    catch (e) { bildir(e.message, true); b.disabled = false; b.textContent = 'Sıraya ekle'; }
  };
}
const KREDI_AD = { gorsel: 'Resimler:', klip: 'Klipler:' };
// what comes after the voice, per tier, so the dialog never promises something the run will not keep
const sonraNe = u => u.katman === 'ucretli'
  ? `Sonra kelime zamanları gelir. Ardından resim ve klipler Higgsfield kredisi harcar${u.ses.kredi_tahmin ? ` (tahmin ~${sayi(u.ses.kredi_tahmin)} kredi)` : ''}: <b>bu onay onları kapsamaz</b>. O adıma gelince iş durur, panel kesin fiyatı gösterip ayrıca sorar.`
  : u.katman === 'sablon' ? 'Sonra kelime zamanları, hazır şablonla video ve kalite kontrolü kendiliğinden gelir. Bu katman Higgsfield kredisi harcamaz.'
  : 'Sonra kelime zamanları ve ses karışımı gelir. Bu katmanda görüntüyü sahne kodu çizer, Higgsfield kredisi harcanmaz.';
function uretOnayGoster(ad) {
  const u = U.find(x => x.ad === ad);
  pencere(pUst('Onayla ve devam') + `<p>Şimdi <b>ses</b> üretilecek: ${sayi(u.ses.satir)} satır, <b>${sayi(u.ses.karakter)} ElevenLabs karakteri</b>. Metin bundan uzunsa iş durur ve yeniden sorar.</p><p>${sonraNe(u)}</p>
    <p class="ince-yazi">${esc(u.baslik)}</p><div class="p-alt"><button class="dugme" data-kapat>Vazgeç</button>${u.metin ? `<button class="dugme" data-metin="${esc(u.metin)}">Önce metni oku</button>` : ''}<button class="dugme sari" id="o-evet">Onayla: ${sayi(u.ses.karakter)} karakter</button></div>`);
  $('#o-evet').onclick = () => { $('#pencere').close(); isBaslat('uret-ses', { kanal: u.kanal, id: u.fikir, karakter: u.ses.karakter }); };
}
function krediOnayGoster(ad) {
  const u = U.find(x => x.ad === ad), k = u.kredi;
  pencere(pUst('Higgsfield kredisi') + `<p>${KREDI_AD[k.adim]} bu adım <b>${sayi(k.kredi)} Higgsfield kredisi</b> harcar${k.butce ? ` (bu videonun bütçesi ${sayi(k.butce)} kredi)` : ''}. Fiyat Higgsfield'dan alındı. Onay yalnız bu adımı, en fazla bu fiyata kapsar.${k.adim === 'gorsel' ? ' Klipler için ayrıca sorulur.' : ''}</p>
    <p class="ince-yazi">${esc(u.baslik)}</p><div class="p-alt"><button class="dugme" data-kapat>Vazgeç</button><button class="dugme sari" id="k-evet">Onayla: ${sayi(k.kredi)} kredi</button></div>`);
  $('#k-evet').onclick = () => { $('#pencere').close(); isBaslat('uret-kredi', { kanal: u.kanal, id: u.fikir, adim: k.adim, kredi: k.kredi }); };
}

// ---------------- Loading
let yukleNo = 0;
async function yukle() {
  const no = ++yukleNo;                           // a slower, older load must not overwrite a newer channel's data
  try {
    [O, F, U, D, J] = await Promise.all([api('ozet' + kq()), api('fikirler'), api('uretim'), api('dersler'), api('isler')]);
    if (O.kanalYok || !O.kanallar.some(k => k.ad === kanal)) {            // first start or a saved channel that is gone: default, forget it, load once more
      if (O.kanalYok) { try { localStorage.removeItem('vm-kanal'); } catch {} }
      kanal = kanalAd0(); if (kanal) O = await api('ozet' + kq());
    }
    if (no !== yukleNo) return;
  } catch (e) { if (no !== yukleNo) return; $('main').innerHTML = `<div class="liste-bos" style="margin-top:40px">${esc(e.message)}</div>`; return; }
  hepsi();
  dizilerYukle();
  if (O.sunucu) api('sunucu' + kq()).then(s => { if (no === yukleNo) SV = s; }).catch(e => { if (no === yukleNo) SV = { hata: 'Sunucuya ulaşılamadı: ' + e.message }; }).finally(() => { if (no === yukleNo) { hepsi(); if (makine === 'sunucu') dizilerYukle(); } });
  if (IG === null) igYukle();
  if (J.some(x => x.durum === 'calisiyor')) islerYukle();
}
async function igYukle(yenile) {
  const at = kanal, h = kanalHesap();
  if (!h) { IG = { bagli: false, gonderiler: [], hesapYok: true }; if (O) hepsi(); return; }
  let r;
  try { r = await api('instagram?hesap=' + encodeURIComponent(hesapAd(h)) + (yenile ? '&yenile=1' : '')); } catch (e) { r = { bagli: false, gonderiler: [] }; if (yenile) bildir(e.message, true); }
  if (at !== kanal) return;                       // the channel changed while the numbers were coming
  IG = r; if (O) hepsi();
}
function hepsi() { dizilerCiz(); bugunCiz(); fikirlerCiz(); uretimCiz(); siraCiz(); takvimCiz(); sonuclarCiz(); islerCiz(); }
function sekme(ad) { $$('#sekmeler button').forEach(b => b.classList.toggle('on', b.dataset.s === ad)); $$('.sayfa').forEach(s => s.classList.toggle('on', s.id === 's-' + ad)); try { sessionStorage.setItem('vm-s', ad); } catch {} }
async function islem(yol, govde, mesaj) { try { await api(yol, govde); bildir(mesaj); await yukle(); } catch (e) { bildir(e.message, true); } }

document.addEventListener('click', e => {
  const b = e.target.closest('button,[data-kapat]'); if (!b) return;
  const d = b.dataset;
  if (d.kapat !== undefined) $('#pencere').close();
  else if (d.s) sekme(d.s);
  else if (d.sira) { if (makineDegis(d.sira)) { siraCiz(); sekme('sira'); } }
  else if (d.dzMakine) { if (makineDegis(d.dzMakine)) siraCiz(); }
  else if (d.makineSec) { if (makineDegis(d.makineSec)) siraCiz(); }
  else if (d.onayla) islem('kuyruk/onayla', { id: d.onayla, makine: d.makine }, 'Onaylandı ✓');
  else if (d.iptal) { if (confirm('Bu video sıradan çıkarılsın mı?')) islem('kuyruk/iptal', { id: d.iptal, makine: d.makine }, 'Sıradan çıkarıldı'); }
  else if (d.fikir) islem('fikir', { is: d.fikir, kanal: d.kanal, id: d.id }, d.fikir === 'sec' ? 'Seçildi' : 'Reddedildi');
  else if (d.yaz) isBaslat('uret', { kanal: d.kanal, id: d.yaz });
  else if (d.uret) { const u = U.find(x => x.ad === d.uret); isBaslat('uret', { kanal: u.kanal, id: u.fikir }); }
  else if (d.uretOnay) uretOnayGoster(d.uretOnay);
  else if (d.krediOnay) krediOnayGoster(d.krediOnay);
  else if (d.metin) metinGoster(d.metin).catch(err => bildir(err.message, true));
  else if (d.rapor) raporGoster(d.rapor).catch(err => bildir(err.message, true));
  else if (d.dkarar) dzKarar(d);
  else if (d.dtekrar) dzTekrar(d);
  else if (d.izle) videoGoster(d.izle);
  else if (d.sizle) videoGoster(d.sizle, true);
  else if (d.ekle) ekleGoster(d.ekle);
  else if (d.is) isBaslat(d.is, { kanal: ['topla', 'puanla', 'ders'].includes(d.is) ? kanal || kanalAd0() : undefined });
  else if (d.dersKaydet !== undefined) { const x = Dk()[0].dersler[+d.dersKaydet]; islem('ders-kaydet', { kanal: Dk()[0].kanal || kanal || O.kanallar[0], ...x }, 'Ders kaydedildi ✓'); }
  else if (d.m) { metrik = d.m; sonuclarCiz(); }
  else if (d.h) { ayKaydir += +d.h; takvimCiz(); }
  else if (d.f) { fikirFiltre = d.f; fikirlerCiz(); }
  else if (b.id === 'yenile') { b.disabled = true; igYukle(true).finally(() => { b.disabled = false; bildir('Rakamlar güncellendi'); }); }
  else if (b.id === 'fikir-ekle-dugme') { $('#fikir-ekle').hidden = !$('#fikir-ekle').hidden; $('#fe-baslik').focus(); }
  else if (b.id === 'isler-dugme') { $('#cekmece').hidden = false; islerYukle(); }
  else if (b.id === 'cekmece-kapat') $('#cekmece').hidden = true;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.zaman && t.value) islem('kuyruk/zaman', { id: t.dataset.zaman, makine: t.dataset.makine, zaman: ofsetli(t.value) }, 'Saat değişti');
  if (t.id === 'kanal-sec') { DZ = null; dzKirli = false; kanal = t.value; try { localStorage.setItem('vm-kanal', kanal); } catch {} IG = null; SV = null; yukle(); }
});
$('#fikir-ekle').addEventListener('submit', e => { e.preventDefault(); islem('fikir', { is: 'ekle', kanal, baslik: $('#fe-baslik').value, oncul: $('#fe-oncul').value }, 'Fikir eklendi').then(() => { $('#fikir-ekle').reset(); $('#fikir-ekle').hidden = true; }); });
$('#dz-ayar').addEventListener('submit', dzKaydet);
$('#dz-ayar').addEventListener('input', () => { dzKirli = true; });
$('#pencere').addEventListener('close', () => { const v = $('#pencere video'); if (v) v.pause(); });

try { const s = new URLSearchParams(location.hash.slice(1)).get('s') || sessionStorage.getItem('vm-s'); if (s) sekme(s); } catch {}
if (!anahtar) $('main').innerHTML = '<div class="liste-bos" style="margin-top:40px">Paneli terminaldeki linkle aç: <b>node panel/panel.js</b></div>';
else { yukle(); setInterval(() => { if (!document.hidden && !$('#pencere').open) yukle(); }, 60e3); }
