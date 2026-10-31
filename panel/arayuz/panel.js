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
    ${s.uyari.filter(u => !/^Otomatik paylaşım kapalı|^Instagram bağlı değil/.test(u)).length ? `<div class="uyarilar">${s.uyari.filter(u => !/^Otomatik paylaşım kapalı|^Instagram bağlı değil/.test(u)).map(u => `<span class="uyari">${esc(u)}</span>`).join('')}</div>` : ''}
    <div><button class="dugme ince" data-sira="${m}">Sıra (${K.kuyruk.length})</button></div></div>`;
}
function bekleyenler() {
  const L = [];
  for (const m of ['yerel', 'sunucu']) {
    const K = kuyrukOf(m); if (!K) continue;
    for (const j of K.kuyruk.filter(j => j.onay_gerekli)) L.push({ onayMi: true, ikon: '⏸', renk: 'sari', baslik: isAd(j), alt: `${makineAd(m)} · ${tarih(j.ne_zaman)} paylaşılacak, onayın bekleniyor`, islem: `${m === 'sunucu' && j.mp4 ? `<button class="dugme ince" data-sizle="${esc(j.mp4)}">İzle</button>` : uretimBul(j.mp4) && uretimBul(j.mp4).mp4[0] ? `<button class="dugme ince" data-izle="${esc(uretimBul(j.mp4).mp4[0].yol)}">İzle</button>` : ''}<button class="dugme ince sari" data-onayla="${esc(j.id)}" data-makine="${m}">Onayla</button>` });
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
  if (sec.options.length !== O.kanallar.length) sec.innerHTML = O.kanallar.map(k => `<option value="${esc(k.ad)}">${esc(k.ad)}${k.hesap && hesapAd(k.hesap) !== k.ad ? ' · ' + esc(k.hesap) : ''}</option>`).join('');
  sec.value = kanal;
}
function fikirlerCiz() {
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

// ---------------- Plain status words: every queue job and every episode maps to one of these
const DURUM = {
  paylasildi: { ad: 'Paylaşıldı', ikon: 'tik' }, sirada: { ad: 'Sırada', ikon: 'saat' }, onay: { ad: 'Onay bekliyor', ikon: 'dur' },
  sorun: { ad: 'Sorun var', ikon: 'uyari' }, hazirlaniyor: { ad: 'Hazırlanıyor', ikon: 'donen' }, bekliyor: { ad: 'Sırası gelmedi', ikon: 'bos' }, kesildi: { ad: 'Kesildi', ikon: 'makas' },
  metin: { ad: 'Metin onayı bekliyor', ikon: 'kalem' },
};
const IKON = {
  tik: '<path d="M20 6 9 17l-5-5"/>', saat: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', dur: '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
  uyari: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>', donen: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/>',
  bos: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>', makas: '<circle cx="6" cy="6" r="3"/><path d="M8.1 8.1 12 12"/><path d="M20 4 8.1 15.9"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  oynat: '<path d="M7 4v16l13-8z"/>', dis: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  ileri: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', arti: '<path d="M12 5v14M5 12h14"/>', carpi: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', goz: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/>',
  kalem: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  yukari: '<path d="m6 15 6-6 6 6"/>', asagi: '<path d="m6 9 6 6 6-6"/>', tekrar: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>',
};
const ikon = (ad, boy = 16) => `<svg class="ik" width="${boy}" height="${boy}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKON[ad] || ''}</svg>`;
const durumCip = (d, uzun) => `<span class="durum d-${d}">${d === 'onay' ? '<i class="nabiz-nokta"></i>' : ikon(DURUM[d].ikon, 14)}${uzun === false ? '' : esc(DURUM[d].ad)}</span>`;
// an episode's state in the plain words
function bolumDurum(b, d) {
  const a = d && AS[bolumKlasor(d, b)];
  if (a && !a.kuyruk && d.durum === 'aktif' && (b.durum === 'metin' || b.durum === 'uretimde')) return 'hazirlaniyor';   // the run writes the series file at its end; the folder shows it earlier
  if (b.durum === 'yayinda' || b.durum === 'olculdu') return 'paylasildi';
  if (b.durum === 'sirada' || (b.durum === 'onay-bekliyor' && b.kuyruk_onay_gerekli === false)) return 'sirada';
  if (b.durum === 'onay-bekliyor') return 'onay';
  if (b.durum === 'kontrol_et') return 'sorun';
  if (b.durum === 'uretimde') return 'hazirlaniyor';
  if (b.durum === 'atlandi') return 'kesildi';
  return 'bekliyor';
}
// ---------------- Stage bar for a video still being made: metin → ses → sahneler → video → onay
// idea adapted from ersinkoc/YoutubeStudio, with permission
let AS = {};                                       // GET /api/asamalar: videolar/<ad> → stage marks from uretim.json
const ASAMA_AD = [['metin', 'Metin'], ['ses', 'Ses'], ['sahneler', 'Sahneler'], ['video', 'Video'], ['onay', 'Onay']];
const ASAMA_SOZ = { tamam: 'bitti', simdi: 'yapılıyor', kapi: 'onayını bekliyor', hata: 'takıldı', bos: 'sırası gelmedi' };
const bolumKlasor = (d, b) => klasor(b.video) || (kanal ? `videolar/${kanal}-${d.id}-b${b.n}` : null);   // same name dizi/calistir.js uses
// stuck: the series run reported a production error after the last mark, or nothing moved for 90 minutes
function asamaTakildi(a, e) {
  if (a.bekleyen) return false;
  const son = Date.parse(a.son), sk = DZ && DZ.son_kosu, ep = e && e.ep;
  if (ep && sk && Date.parse(sk.zaman) >= son && (sk.notlar || []).some(n => String(n).startsWith(`${ep.d.id} bölüm ${ep.b.n}: üretim hatası`))) return true;
  return Number.isFinite(son) && Date.now() - son > 90 * 6e4;
}
function asamaListe(f, e) {
  const a = AS[f]; if (!a) return null;
  const onay = e && (e.durum === 'paylasildi' || e.durum === 'sirada') || (a.kuyruk && e && e.is && !e.is.onay_gerekli) ? 'tamam' : a.kuyruk ? 'kapi' : 'bos';
  let simdi = false;
  return ASAMA_AD.map(([k, ad]) => {
    if (k === 'onay') return { ad, d: onay };
    if (a.bitti[k]) return { ad, d: 'tamam' };
    if (simdi) return { ad, d: 'bos' };
    simdi = true;
    return { ad, d: a.bekleyen ? 'kapi' : asamaTakildi(a, e) ? 'hata' : 'simdi' };
  });
}
const asamaCubuk = (L, etiketli) => `<span class="asama${etiketli ? ' etiketli' : ''}" role="img" aria-label="${L.filter(x => x.d === 'tamam').length}/${L.length} aşama bitti">${L.map(x => `<span class="as as-${x.d}" title="${esc(x.ad)}: ${ASAMA_SOZ[x.d]}"><i></i>${etiketli ? `<b>${esc(x.ad)}</b><small>${ASAMA_SOZ[x.d]}</small>` : ''}</span>`).join('')}</span>`;
const DIZI_DURUM = { aktif: 'Sürüyor', bitti: 'Bitti', kesildi: 'Kesildi' };

// channel badge: short letters in tight spots, the account name where there is room
const kanalKisa = k => String(k || '').split(/[_\s.-]+/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toLocaleUpperCase('tr') || '?';
const kanalRozet = (uzun) => kanal ? `<span class="kanal-rozet" title="${esc(kanalHesap() || kanal)}">${esc(uzun ? '@' + hesapAd(kanalHesap() || kanal) : kanalKisa(kanal))}</span>` : '';
// a still only when this computer has one: the stage marks know each folder; unknown folders are tried only in local mode
const kapakVar = v => !!v && (AS[v] ? AS[v].kapak !== false : takvimKaynak() !== 'sunucu');
const kapakUrl = v => `/api/kapak?v=${encodeURIComponent(v)}&k=${encodeURIComponent(anahtar)}`;
const klasor = p => { const m = String(p || '').replace(/\\/g, '/').match(/^videolar\/[^/]+/); return m ? m[0] : null; };
const saat = t => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const gunBas = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };
const haftaBas = t => { const d = gunBas(t); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const ayniGun = (a, b) => +gunBas(a) === +gunBas(b);

// ---------------- Calendar events: one source of truth. With a server configured the calendar shows the SERVER
// (queue + series); this computer's records only when the server cannot be reached (with a notice).
function bolumler() { return dzGecerli() ? DZ.diziler.flatMap(d => (d.bolumler || []).map(b => ({ d, b }))) : []; }
function igGonderiler() { return IG && IG.bagli ? IG.gonderiler : []; }
// which machine the calendar reads: 'sunucu', 'yerel', or null while the server answer is still coming
const takvimKaynak = () => !O || !O.sunucu ? 'yerel' : SV === null ? null : SV.hata ? 'yerel' : 'sunucu';
// the series data counts only when it comes from the same machine as the calendar
const dzGecerli = () => !!(DZ && !DZ.hata && DZ._makine === (takvimKaynak() === 'sunucu' && dzSunucuVar() ? 'sunucu' : 'yerel'));
function olaylar() {
  const E = [], B = bolumler(), G = igGonderiler(), src = takvimKaynak(), gorulen = new Set();
  // the same video can reach us as a queue job, an Instagram post and a series episode: keyed once
  const anahtarlar = o => [o.ep && `e:${o.ep.d.id}:${o.ep.b.n}`, o.ep && o.ep.b.media_id && `m:${o.ep.b.media_id}`, o.ig && `m:${o.ig.id}`,
    o.is && klasor(o.is.mp4) && `v:${klasor(o.is.mp4)}`, o.ep && klasor(o.ep.b.video) && `v:${klasor(o.ep.b.video)}`,
    guvenli((o.ig && o.ig.link) || (o.is && o.is.link) || (o.ep && o.ep.b.link)) && `l:${(o.ig && o.ig.link) || (o.is && o.is.link) || o.ep.b.link}`].filter(Boolean);
  const ekle = o => {
    const A = anahtarlar(o); if (A.some(a => gorulen.has(a))) return;
    A.forEach(a => gorulen.add(a));
    const ep = o.ep, yerelMi = o.makine !== 'sunucu';
    const views = o.ig && o.ig.views != null ? o.ig.views : o.is && o.is.sonuc && o.is.sonuc.views != null ? o.is.sonuc.views : ep ? bolumIzlenme(ep.b) : null;
    const kl = (ep && (AS[bolumKlasor(ep.d, ep.b)] ? bolumKlasor(ep.d, ep.b) : klasor(ep.b.video))) || (o.is && klasor(o.is.mp4)) || null;
    const isMp4 = o.is && klasor(o.is.mp4) ? String(o.is.mp4).replace(/\\/g, '/') : null;
    const e = { ...o, views, mp4: yerelMi ? (ep && ep.b.mp4) || isMp4 : isMp4 || (ep && ep.b.mp4) || null, kapak: kl,
      baslik: o.baslik || (ep ? (ep.d.baslik_kisa || ep.d.baslik) : o.is ? isAd(o.is) : o.ig ? o.ig.baslik : 'Video'),
      bolum: ep ? `Bölüm ${ep.b.n}/${(ep.d.bolumler || []).length}` : '', kisaBolum: ep ? `${ep.b.n}/${(ep.d.bolumler || []).length}` : '', konu: (ep && ep.d.konu) || null,
      aciklama: (o.is && o.is.aciklama) || (o.ig && o.ig.aciklama) || '', link: guvenli((o.ig && o.ig.link) || (o.is && o.is.link) || (ep && ep.b.link)) };
    e.asama = yerelMi && kl && e.durum !== 'paylasildi' ? asamaListe(kl, e) : null;   // stage marks are this computer's files
    E.push(e);
  };
  const K = src ? kuyrukOf(src) : null;
  if (K && !K.hesapYok) {
    const epBul = j => B.find(x => x.b.kuyruk_id === j.id) || B.find(x => klasor(x.b.video) && klasor(x.b.video) === klasor(j.mp4)) || null;
    for (const j of K.kuyruk) {
      const gec = !j.onay_gerekli && j.ne_zaman && new Date(j.ne_zaman) < Date.now() - 30 * 6e4;
      ekle({ tur: 'bekleyen', makine: src, is: j, ep: epBul(j), t: j.ne_zaman ? new Date(j.ne_zaman) : null, durum: j.onay_gerekli ? 'onay' : gec ? 'sorun' : 'sirada', not: gec ? 'Saati geçti ama paylaşılmadı. Sunucu ya da zamanlayıcı kapalı olabilir.' : '' });
    }
    for (const j of K.hatali) ekle({ tur: 'hatali', makine: src, is: j, ep: epBul(j), t: j.ne_zaman ? new Date(j.ne_zaman) : null, durum: 'sorun', not: j.kontrol_et ? 'Paylaşıldı mı belli değil: Instagram hesabına bak.' : 'Paylaşılamadı' + (j.hata ? ': ' + j.hata : '.') });
    for (const j of K.paylasilan) {
      const g = G.find(x => j.link && x.link === j.link) || null;
      ekle({ tur: 'paylasilan', makine: src, is: j, ig: g, ep: B.find(x => j.link && x.b.link === j.link) || epBul(j), t: j.paylasildi ? new Date(j.paylasildi) : null, durum: 'paylasildi' });
    }
  }
  for (const g of G) ekle({ tur: 'ig', makine: src || 'yerel', ig: g, ep: B.find(x => (x.b.media_id && x.b.media_id === g.id) || (g.link && x.b.link === g.link)) || null, t: new Date(g.zaman), durum: 'paylasildi' });
  for (const ep of B) {                           // what the series knows but the queue and Instagram do not show
    const d = bolumDurum(ep.b, ep.d);
    if (['paylasildi', 'sorun'].includes(d) && ep.b.paylasildi) ekle({ tur: 'bolum', makine: dzM(), ep, t: new Date(ep.b.paylasildi), durum: d, not: d === 'sorun' ? 'Paylaşıldı mı belli değil: Instagram hesabına bak.' : '' });
    else if (d === 'hazirlaniyor' && ep.d.durum === 'aktif') ekle({ tur: 'bolum', makine: dzM(), ep, t: null, durum: d, not: 'Video hazırlanıyor. Bitince onayına gelir.' });
  }
  // only videos tied to a series episode or a queue job: loose production folders (tests) never show
  return E.sort((a, b) => (a.t ? +a.t : Infinity) - (b.t ? +b.t : Infinity));
}
// stories waiting for their text: not scheduled, so they live in the approval bar, never in a day
const metinBekleyenler = () => dzGecerli() ? DZ.diziler.filter(d => d.durum === 'aktif' && d.metin_onay === 'bekliyor') : [];
let OL = [];                                       // the last drawn events; rows point into it by index
const olayGunu = e => e.t ? gunBas(e.t) : gunBas(Date.now());   // no time yet (being made): shown on today
// story themes (konu) get a fixed dot colour; unknown ones a stable one from the same set
const KONU_RENK = { 'aşk': '#F472B6', 'ayrılık': '#60A5FA', 'ihanet': '#F87171', 'aile': '#34D399', 'iş': '#FBBF24', 'okul': '#A78BFA', 'askerlik': '#A3E635', 'komşu': '#2DD4BF', 'arkadaşlık': '#FB923C', 'korku': '#94A3B8' };
const KONU_YEDEK = ['#F472B6', '#60A5FA', '#34D399', '#FBBF24', '#A78BFA', '#2DD4BF', '#FB923C', '#F87171'];
const konuRenk = k => { const a = String(k || '').toLocaleLowerCase('tr'); if (KONU_RENK[a]) return KONU_RENK[a]; let h = 0; for (const c of a) h = (h * 31 + c.charCodeAt(0)) >>> 0; return KONU_YEDEK[h % KONU_YEDEK.length]; };
const konuAd = k => String(k || '').replace(/^./, c => c.toLocaleUpperCase('tr'));
const DURUM_SATIR = { paylasildi: 'Paylaşıldı', sirada: 'Sırada', onay: 'Onay bekliyor', sorun: 'Sorun var', hazirlaniyor: 'Hazırlanıyor', metin: 'Metin onayı bekliyor' };
const kucukKapak = e => `<span class="sat-kapak"${e.konu ? ` style="--k:${konuRenk(e.konu)}"` : ''}>${kapakVar(e.kapak) ? `<img src="${kapakUrl(e.kapak)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${ikon(e.mp4 || e.link ? 'oynat' : DURUM[e.durum].ikon, 12)}</span>`;
// one video = one compact row: small still, time, one-line title, status dot + word
function satir(e, genis) {
  const i = OL.indexOf(e), zaman = e.t ? saat(e.t) : e.durum === 'hazirlaniyor' ? 'bugün' : 'saat yok', ht = e.ep ? hikayeToplam(e.ep.d) : null;
  const ipucu = [e.baslik, e.bolum, DURUM_SATIR[e.durum], e.views != null ? sayi(e.views) + ' izlenme' : '', e.ep ? 'Hikâye: ' + (ht != null ? sayi(ht) + ' izlenme' : '—') : ''].filter(Boolean).join(' · ');
  return `<button class="sat d-${e.durum}${genis ? ' genis' : ''}" data-olay="${i}" title="${esc(ipucu)}">${kucukKapak(e)}
    <span class="sat-ic"><span class="sat-ust"><b>${esc(zaman)}</b>${e.views != null ? `<span class="sat-izl">${ikon('goz', 11)}${esc(sayi(e.views))}</span>` : ''}</span>
      <span class="sat-ad">${e.konu ? `<i class="nokta-k" style="--k:${konuRenk(e.konu)}"></i>` : ''}${esc(e.baslik)}${e.kisaBolum ? ` <small>${esc(e.kisaBolum)}</small>` : ''}</span>
      <span class="sat-durum">${e.durum === 'onay' ? '<i class="nabiz-nokta"></i>' : '<i class="nokta-d"></i>'}${esc(DURUM_SATIR[e.durum])}</span>
      ${e.durum === 'hazirlaniyor' && e.asama ? asamaCubuk(e.asama) : ''}
      ${genis && e.ep ? `<span class="sat-hikaye">Hikâye: ${ht != null ? esc(sayi(ht)) + ' izlenme' : '—'}</span>` : ''}</span></button>`;
}

// ---------------- Calendar: a week grid (Mon-Sun columns), 4 weeks from Monday of last week; ‹ › move one week.
// Every day cell has the same height: at most 3 rows, then "+N daha" opens the whole day.
const HAFTA = 4, GUN_EN_FAZLA = 3, GUN_ADI = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
let durumFiltre = 'hepsi', konuFiltre = null;
function aralik() { const bas = haftaBas(Date.now()); bas.setDate(bas.getDate() - 7 + 7 * ayKaydir); const son = new Date(bas); son.setDate(bas.getDate() + 7 * HAFTA - 1); return [bas, son]; }
const goster = e => (durumFiltre === 'hepsi' || e.durum === durumFiltre) && (!konuFiltre || e.konu === konuFiltre);
function takvimCiz() {
  OL = olaylar();
  const src = takvimKaynak();
  $('#kaynak-not').innerHTML = !O.sunucu ? '' : src === null ? `<span class="kn">${ikon('donen', 13)}Sunucudan bilgi geliyor…</span>`
    : src === 'yerel' ? `<span class="kn kotu">${ikon('uyari', 13)}Sunucuya ulaşılamadı: bu bilgisayardaki kayıtlar gösteriliyor.</span>` : `<span class="kn">${ikon('tik', 13)}Bilgiler sunucudan</span>`;
  const [bas, son] = aralik(), ici = OL.filter(e => { const d = olayGunu(e); return d >= bas && d <= son; });
  const ay = d => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }).toLocaleUpperCase('tr');
  $('#tk-aralik').textContent = `${ay(bas)} – ${ay(son)}`;
  const say = d => ici.filter(e => e.durum === d).length;
  $('#tk-sayilar').innerHTML = [[ici.length, 'video'], [say('paylasildi'), 'paylaşıldı'], [say('sirada'), 'sırada'], [say('onay'), 'onay bekliyor'], ...(say('sorun') ? [[say('sorun'), 'sorun var']] : []), ...(say('hazirlaniyor') ? [[say('hazirlaniyor'), 'hazırlanıyor']] : [])]
    .map(([n, a]) => `<span><b>${n}</b>${a}</span>`).join('');
  const segler = [['hepsi', 'Tümü', ici.length], ['paylasildi', 'Paylaşıldı', say('paylasildi')], ['sirada', 'Sırada', say('sirada')], ['onay', 'Onay bekliyor', say('onay')], ...(say('sorun') ? [['sorun', 'Sorun var', say('sorun')]] : [])];
  if (!segler.some(s => s[0] === durumFiltre)) durumFiltre = 'hepsi';
  $('#durum-filtre').innerHTML = segler.map(([k, a, n]) => `<button data-durum-f="${k}" class="${k === durumFiltre ? 'on' : ''}">${a}<small>${n}</small></button>`).join('');
  // theme chips: only when the channel's stories carry a konu (oxygbio has none)
  const konular = [...new Set((dzGecerli() ? DZ.diziler : []).map(d => d.konu).filter(Boolean))];
  if (konuFiltre && !konular.includes(konuFiltre)) konuFiltre = null;
  $('#konu-filtre').innerHTML = konular.length ? `<button data-konu-f="" class="${!konuFiltre ? 'on' : ''}">Tümü</button>` + konular.map(k => `<button data-konu-f="${esc(k)}" class="${k === konuFiltre ? 'on' : ''}"><i class="nokta-k" style="--k:${konuRenk(k)}"></i>${esc(konuAd(k))}</button>`).join('') : '';
  const bugun = gunBas(Date.now()), buHafta = +haftaBas(bugun);
  let h = GUN_ADI.map(g => `<div class="gun-ad">${g}</div>`).join('');
  for (let d = new Date(bas); d <= son; d.setDate(d.getDate() + 1)) {
    const o = ici.filter(e => ayniGun(olayGunu(e), d)), g = o.filter(goster), bu = ayniGun(d, bugun), gecmis = d < bugun;
    const fazla = g.length - GUN_EN_FAZLA;
    h += `<div class="gun-h${bu ? ' bugun' : ''}${gecmis ? ' gecmis' : ''}${+haftaBas(d) === buHafta ? ' bu-hafta' : ''}${o.length ? '' : ' bos'}" data-gun="${+d}" title="Günün ayrıntısı">
      <div class="gh-ust"><b>${d.getDate()}</b> ${esc(d.toLocaleDateString('tr-TR', { month: 'short' }))} <span class="gh-gun">${esc(d.toLocaleDateString('tr-TR', { weekday: 'short' }))}</span>${bu ? '<em>Bugün</em>' : ''}${!gecmis ? `<button class="gh-arti" data-planla="${+d}" title="Bu güne video planla" aria-label="Bu güne video planla">${ikon('arti', 14)}</button>` : ''}</div>
      ${g.slice(0, fazla > 0 ? GUN_EN_FAZLA - 1 : GUN_EN_FAZLA).map(e => satir(e)).join('')}
      ${fazla > 0 ? `<button class="gh-daha" data-gun="${+d}">+${fazla + 1} daha</button>` : ''}
      ${!g.length ? `<div class="gh-yok">${o.length ? '—' : gecmis ? 'Video yok' : ''}</div>` : ''}</div>`;
  }
  $('#takvim').innerHTML = h;
  onayBarCiz();
  acikPencereyiTazele();
}
// "+N daha": the whole day in one list
// ---------------- Day detail: a side panel (full screen on a phone) with one large card per video, ‹ › to the next day
const igBekle = () => IG === null;
const dzBekle = () => !!kanal && !dzGecerli() && !(DZ && DZ.hata && DZ._makine === dzM());
const yukleniyor = yazi => `<div class="yuk">${ikon('donen', 14)}${esc(yazi)}</div>`;
// numbers of a posted video: the real ones, a loading line while Instagram answers, "—" only when there is none
function rakamBlok(e, ig) {
  if (e.durum !== 'paylasildi') return '';
  if (!ig && igBekle()) return `<div class="m-rakam yuk-rakam">${['izlenme', 'beğeni', 'yorum', 'kayıt', 'paylaşım'].map(a => `<div><b class="iskelet"></b><span>${a}</span></div>`).join('')}</div>${yukleniyor('Rakamlar Instagram’dan geliyor…')}`;
  return `<div class="m-rakam">${[['views', 'izlenme'], ['likes', 'beğeni'], ['comments', 'yorum'], ['saved', 'kayıt'], ['shares', 'paylaşım']].map(([k, a]) => `<div><b>${ig && ig[k] != null ? esc(sayi(ig[k])) : '—'}</b><span>${a}</span></div>`).join('')}</div>${!ig ? `<div class="ince-yazi">${IG && !IG.bagli ? 'Instagram’dan alınamadı.' : 'Rakamlar henüz gelmedi.'}</div>` : ''}`;
}
// an open day view / video window is redrawn when its data arrives (never while a video plays)
const olayAnahtar = e => e.ep ? `e:${e.ep.d.id}:${e.ep.b.n}` : e.ig ? `m:${e.ig.id}` : e.is ? `j:${e.is.id}` : null;
const olayImza = e => [olayAnahtar(e), e.tur, e.baslik, e.views, e.ig ? 1 : 0, e.durum, (e.aciklama || '').length, e.ep ? hikayeToplam(e.ep.d) : ''].join('|');
const gunImza = gun => OL.filter(e => ayniGun(olayGunu(e), gunBas(+gun)) && goster(e)).map(olayImza).join('#') + `|${igBekle()}|${dzBekle()}`;
function acikPencereyiTazele() {
  const p = $('#pencere'); if (!p.open || $$('#pencere video').some(v => !v.paused)) return;
  if (p.classList.contains('gun-panel') && gunAc.acik != null && gunImza(gunAc.acik) !== gunAc.imza) {
    const l = $('#pencere-ic .gp-liste'), sc = l ? l.scrollTop : 0; gunAc(gunAc.acik); const l2 = $('#pencere-ic .gp-liste'); if (l2) l2.scrollTop = sc;
  } else if (p.classList.contains('olay-pencere') && olayAc.anahtar) {
    const e = OL.find(x => olayAnahtar(x) === olayAc.anahtar);
    if (e && olayImza(e) + igBekle() + dzBekle() !== olayAc.imza) olayAc(e);
  }
}
function gunKart(e) {
  const i = OL.indexOf(e), ep = e.ep, iz = ep ? ep.b.izin || {} : {}, bek = e.tur === 'bekleyen', m = e.makine;
  const ig = e.ig || (e.is && e.is.sonuc) || (ep && ep.b.metrik) || null, ht = ep ? hikayeToplam(ep.d) : null;
  const video = e.mp4 ? `<video src="${m === 'sunucu' ? sunucuDosya(e.mp4) : dosya(e.mp4)}" ${kapakVar(e.kapak) ? `poster="${kapakUrl(e.kapak)}"` : ''} controls playsinline preload="none"></video>`
    : `<div class="gp-yok">${kapakVar(e.kapak) ? `<img src="${kapakUrl(e.kapak)}" alt="">` : ''}<span>${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${ikon('oynat', 16)}Instagram’da izle</a>` : e.durum === 'hazirlaniyor' ? 'Video hazırlanıyor…' : 'Video bu bilgisayarda yok.'}</span></div>`;
  const karar = ep && ep.b.karar && ep.b.karar !== 'bekle' ? `<b>${ep.b.karar === 'kes' ? 'Kes' : 'Devam'}${ep.b.elle ? ' (sen)' : ''}</b>${ep.b.karar_neden ? ': ' + esc(ep.b.karar_neden) : ''}` : ep && ep.b.karar_neden ? esc(ep.b.karar_neden) : '';
  const rakam = rakamBlok(e, ig);
  const d = [];
  if (bek && e.is.onay_gerekli) d.push(`<button class="dugme sari" data-g-onayla="${i}">${ikon('tik', 16)}Onayla</button>`);
  if (bek) d.push(`<button class="dugme" data-g-saat="${i}">${ikon('saat', 16)}Saati değiştir</button>`);
  if (iz.devam) d.push(`<button class="dugme" data-g-karar="devam" data-gi="${i}">${ikon('ileri', 16)}Devam ettir</button>`);
  if (iz.kes) d.push(`<button class="dugme tehlike" data-g-karar="kes" data-gi="${i}">${ikon('makas', 16)}Kes</button>`);
  if (iz.tekrar) d.push(`<button class="dugme" data-g-tekrar="${i}">${ikon('tekrar', 16)}Tekrar dene</button>`);
  if (bek) d.push(`<button class="dugme tehlike" data-g-iptal="${i}">${ikon('carpi', 16)}İptal</button>`);
  if (e.link) d.push(`<a class="dugme" href="${esc(e.link)}" target="_blank" rel="noopener">${ikon('dis', 16)}Instagram’da aç</a>`);
  return `<article class="gp-kart d-${e.durum}">
    <div class="gp-video">${video}</div>
    <div class="gp-bilgi">
      <div class="gp-satir1"><b>${e.t ? esc(saat(e.t)) : e.durum === 'hazirlaniyor' ? 'Bugün' : 'Saati yok'}</b>${kanalRozet(true)}${m === 'sunucu' ? `<span class="kanal-rozet acik">${esc(makineAd('sunucu'))}</span>` : ''}</div>
      <h3>${esc(e.baslik)}</h3>${!ep && dzBekle() ? yukleniyor('Hikâye bilgisi sunucudan geliyor…') : ''}
      <div class="gp-cipler">${e.konu ? `<span class="konu-cip">${esc(e.konu)}</span>` : ''}${e.bolum ? `<span class="gp-bolum">${esc(e.bolum)}</span>` : ''}${durumCip(e.durum)}${e.views != null ? `<span class="gp-izl">${ikon('goz', 14)}${esc(sayi(e.views))}</span>` : ''}</div>
      ${e.asama ? `<div class="m-asama">${asamaCubuk(e.asama, true)}</div>` : ''}
      ${e.not ? `<div class="m-not d-${e.durum}">${esc(e.not)}</div>` : ''}
      ${rakam}
      ${ep ? `<div class="gp-hikaye">Hikâye toplamı: <b>${ht != null ? esc(sayi(ht)) + ' izlenme' : igBekle() ? 'geliyor…' : '—'}</b>${degisimYaz(ep.d, ep.b)}</div>` : ''}
      ${karar ? `<div class="gp-karar">${karar}</div>` : ''}
      ${e.aciklama ? `<div class="m-altyazi"><span>Açıklama</span>${esc(e.aciklama)}</div>` : ''}
      <form class="m-saat" data-g-form="${i}" hidden><input type="datetime-local" value="${e.t ? yerel(e.t) : yerel(Date.now() + 36e5)}"><button class="dugme sari">Kaydet</button></form>
      ${d.length ? `<div class="gp-dugmeler">${d.join('')}</div>` : ''}
    </div></article>`;
}
function gunAc(gun) {
  gunAc.acik = +gunBas(+gun); gunAc.imza = gunImza(gunAc.acik);
  const d = gunBas(+gun), L = OL.filter(e => ayniGun(olayGunu(e), d) && goster(e)), say = k => L.filter(e => e.durum === k).length;
  const ozet = [`${L.length} video`, ...['paylasildi', 'sirada', 'onay', 'sorun', 'hazirlaniyor'].filter(k => say(k)).map(k => `${say(k)} ${DURUM_SATIR[k].toLocaleLowerCase('tr')}`)].join(' · ');
  const kom = n => { const x = new Date(d); x.setDate(x.getDate() + n); return x; }, onceki = kom(-1), sonraki = kom(1);
  const kisa = x => x.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' });
  pencere(`<div class="gp">
    <div class="gp-ust"><div><h2>${esc(d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }))}${ayniGun(d, Date.now()) ? ' <em class="gp-bugun">Bugün</em>' : ''}</h2><div class="gp-ozet">${esc(ozet)}</div></div><button class="kapat" data-kapat aria-label="Kapat (Esc)">✕</button></div>
    <div class="gp-liste">${L.length ? L.map(gunKart).join('') : takvimKaynak() === null || dzBekle() || igBekle() ? `<div class="liste-bos">${yukleniyor('Bilgiler geliyor…')}</div>` : `<div class="liste-bos">Bu gün video yok.${d >= gunBas(Date.now()) ? `<br><button class="dugme" data-planla="${+d}" style="margin-top:10px">${ikon('arti', 14)}Video planla</button>` : ''}</div>`}</div>
    <div class="gp-alt"><button class="dugme" data-gun="${+onceki}">‹ ${esc(kisa(onceki))}</button><span class="ince-yazi">Esc ile kapat</span><button class="dugme" data-gun="${+sonraki}">${esc(kisa(sonraki))} ›</button></div></div>`, 'gun-panel');
  const q = s => $$('#pencere-ic ' + s), E = x => OL[+x];
  const sonra = async (yol, govde, mesaj) => { await islem(yol, govde, mesaj); if ($('#pencere').open && $('#pencere').classList.contains('gun-panel')) gunAc(gun); };
  q('[data-g-onayla]').forEach(b => b.onclick = () => { const e = E(b.dataset.gOnayla); sonra('kuyruk/onayla', { id: e.is.id, makine: e.makine }, 'Onaylandı ✓'); });
  q('[data-g-saat]').forEach(b => b.onclick = () => { const f = $(`#pencere-ic [data-g-form="${b.dataset.gSaat}"]`); f.hidden = false; f.querySelector('input').focus(); });
  q('[data-g-form]').forEach(f => f.onsubmit = ev => { ev.preventDefault(); const e = E(f.dataset.gForm), v = f.querySelector('input').value; if (v) sonra('kuyruk/zaman', { id: e.is.id, makine: e.makine, zaman: ofsetli(v) }, 'Saat değişti'); });
  q('[data-g-iptal]').forEach(b => b.onclick = () => { const e = E(b.dataset.gIptal); if (confirm('Bu video sıradan çıkarılsın mı? Paylaşılmaz.')) sonra('kuyruk/iptal', { id: e.is.id, makine: e.makine }, 'Sıradan çıkarıldı'); });
  q('[data-g-karar]').forEach(b => b.onclick = async () => { const e = E(b.dataset.gi); await dzKarar({ did: e.ep.d.id, dn: e.ep.b.n, dkarar: b.dataset.gKarar }); if ($('#pencere').open) gunAc(gun); });
  q('[data-g-tekrar]').forEach(b => b.onclick = async () => { const e = E(b.dataset.gTekrar); await dzTekrar({ did: e.ep.d.id, dn: e.ep.b.n }); if ($('#pencere').open) gunAc(gun); });
}
// ---------------- "Onayını bekleyenler": everything that waits for Furkan, above the calendar
function onayBarCiz() {
  const M = metinBekleyenler(), V = OL.filter(e => e.durum === 'onay' && e.is && e.is.onay_gerekli);
  if (!M.length && !V.length) { $('#onay-bar').innerHTML = takvimKaynak() === null ? '' : `<div class="ob-bos">${ikon('tik', 14)}Bekleyen onay yok ✓</div>`; return; }
  $('#onay-bar').innerHTML = `<section class="ob kart"><div class="ob-ust"><h2>Onayını bekleyenler</h2><span class="say">${M.length + V.length}</span></div><div class="ob-gruplar">
    ${M.length ? `<div class="ob-grup ob-metin"><h3><i class="nokta-d"></i>Metin onayı <small>${M.length}</small></h3>${M.map(d => `<div class="ob-satir">
      <span class="ob-ikon">${ikon('kalem', 16)}</span><span class="ob-ad"><b>${esc(d.baslik_kisa || d.baslik)}</b><small>${d.konu ? `<i class="nokta-k" style="--k:${konuRenk(d.konu)}"></i>${esc(konuAd(d.konu))} · ` : ''}${esc((d.bolumler || []).length)} bölüm</small></span>
      <button class="dugme mor" data-metin-onay="${esc(d.id)}">Oku ve onayla</button></div>`).join('')}</div>` : ''}
    ${V.length ? `<div class="ob-grup ob-video"><h3><i class="nokta-d"></i>Video onayı <small>${V.length}</small></h3>${V.map(e => `<div class="ob-satir">
      ${kucukKapak(e)}<span class="ob-ad"><b>${esc(e.baslik)}${e.kisaBolum ? ` · ${esc(e.bolum)}` : ''}</b><small>${e.t ? esc(tarih(e.t, { weekday: 'short' })) : 'Saati yok: onaylayınca ilk boş saate konur'}</small></span>
      <button class="dugme" data-olay="${OL.indexOf(e)}">${ikon('oynat', 14)}İzle</button><button class="dugme sari" data-onayla="${esc(e.is.id)}" data-makine="${esc(e.makine)}">Onayla</button></div>`).join('')}</div>` : ''}
  </div></section>`;
}
// "+ Yeni" and "Video planla": a ready video of this channel that is not queued yet → the add-to-queue dialog
function yeniGoster(gun) {
  const hazir = Uk().filter(u => u.mp4.length && !siradaMi(u));
  if (hazir.length === 1) return ekleGoster(hazir[0].ad, gun);
  pencere(pUst(gun ? `${new Date(+gun).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })} için video` : 'Yeni video')
    + (hazir.length ? `<p class="ince-yazi">Sıraya eklemek istediğin hazır videoyu seç.</p><div class="liste">${hazir.map(u => `<button class="satir secim" data-yeni-sec="${esc(u.ad)}"><span class="kucuk-video">${kapakVar('videolar/' + u.ad) ? `<img src="${kapakUrl('videolar/' + u.ad)}" alt="">` : ''}</span><span class="ad"><span class="baslik">${esc(u.baslik)}</span><small>${esc(u.ad)}</small></span><span>${ikon('ileri', 18)}</span></button>`).join('')}</div>`
      : `<div class="liste-bos">Sıraya eklenecek hazır video yok.<br><span class="ince-yazi">${DZ && DZ.diziler && DZ.diziler.length ? 'Hikâye bölümleri hazır olunca kendiliğinden sıraya gelir.' : 'Yeni video için Gelişmiş → Fikirler’den bir fikir seç.'}</span></div>`));
  $$('#pencere-ic [data-yeni-sec]').forEach(b => b.onclick = () => ekleGoster(b.dataset.yeniSec, gun));
}
// the sidebar's channel block
function kanalBlokCiz() {
  const h = kanalHesap();
  $('#kanal-ad').textContent = kanal ? (h ? '@' + hesapAd(h) : kanal) : 'Video Mutfağı';
  $('#kanal-logo').textContent = kanal ? kanalKisa(kanal) : '▶';
  $('#kanal-logo').style.setProperty('--k', kanal ? konuRenk(kanal) : 'var(--board)');
}

// ---------------- Numbers under the calendar (only real data; missing = "—" and a gray hint)
let TK = null;                                     // follower count answer for the selected channel
function paylasimlar() {
  const G = igGonderiler();
  if (G.length) return G.map(g => ({ t: new Date(g.zaman), views: g.views ?? null, baslik: g.baslik, link: g.link }));
  const K = kuyrukOf(takvimKaynak() || 'yerel');   // the same machine as the calendar, never both
  return K ? K.paylasilan.filter(p => p.paylasildi).map(p => ({ t: new Date(p.paylasildi), views: p.sonuc ? p.sonuc.views ?? null : null, baslik: isAd(p), link: p.link })) : [];
}
const sayiKart = (baslik, deger, alt, ipucu) => `<div class="kart sk"><span class="sk-ad">${esc(baslik)}</span><b class="sk-deger${deger === '—' ? ' yok' : ''}">${deger}</b>${alt ? `<span class="sk-alt">${alt}</span>` : ''}${ipucu ? `<span class="sk-ipucu">${esc(ipucu)}</span>` : ''}</div>`;
function istatistikCiz() {
  const el = $('#istatistik'); if (!el) return;
  if (IG && IG.hesapYok) { el.innerHTML = `<div class="sayilar">${['Son 7 gün izlenme', 'Takipçi', 'Bu hafta paylaşılan', 'Video başı ortalama'].map(x => sayiKart(x, '—', '', 'Bu kanalın Instagram hesabı tanımlı değil')).join('')}${enHikaye()}</div>${hikayeSeridi()}`; return; }
  const P = paylasimlar(), simdi = Date.now(), gun = 864e5, gelmedi = IG === null ? 'Instagram’dan geliyor…' : null;
  const ara = (a, b) => P.filter(p => +p.t > simdi - a * gun && +p.t <= simdi - b * gun);
  const top = L => L.reduce((s, p) => s + (p.views || 0), 0), olculen = L => L.filter(p => p.views != null);
  const s7 = ara(7, 0), o7 = ara(14, 7);
  let k1;
  if (!s7.length) k1 = sayiKart('Son 7 gün izlenme', '—', '', gelmedi || 'Son 7 günde paylaşım yok');
  else if (!olculen(s7).length) k1 = sayiKart('Son 7 gün izlenme', '—', '', 'İzlenme sayısı henüz gelmedi');
  else {
    const a = top(s7), b = top(o7), fark = o7.length && b ? Math.round((a - b) / b * 100) : null;
    k1 = sayiKart('Son 7 gün izlenme', sayi(a), fark == null ? '<span class="gri">önceki 7 günde paylaşım yok</span>' : `<span class="${fark >= 0 ? 'artis' : 'dusus'}">${ikon(fark >= 0 ? 'yukari' : 'asagi', 14)}%${Math.abs(fark)}</span> önceki 7 güne göre (${sayi(b)})`, `Son 7 günde paylaşılan ${s7.length} videonun izlenmesi`);
  }
  const k2 = TK && TK.takipci != null ? sayiKart('Takipçi', sayi(TK.takipci), '', 'Instagram hesabının şu anki takipçisi')
    : sayiKart('Takipçi', '—', '', TK === null ? 'Instagram’dan geliyor…' : TK.bagli === false ? 'Instagram bağlı değil' : 'Instagram bu sayıyı vermedi');
  const hb = +haftaBas(simdi), buHafta = P.filter(p => +p.t >= hb && +p.t <= simdi).length;
  const sirada = OL.filter(e => (e.durum === 'sirada' || e.durum === 'onay') && e.t && +e.t >= simdi && +e.t < hb + 7 * gun).length;
  const k3 = sayiKart('Bu hafta paylaşılan', sayi(buHafta), sirada ? `bu hafta <b>${sirada}</b> video daha sırada` : '<span class="gri">bu hafta sırada video yok</span>', 'Pazartesiden bu yana');
  const O_ = olculen(P);
  const k4 = O_.length ? sayiKart('Video başı ortalama', sayi(Math.round(top(O_) / O_.length)), `son ${O_.length} videoda`, 'Toplam izlenme ÷ video sayısı') : sayiKart('Video başı ortalama', '—', '', gelmedi || 'Henüz izlenme sayısı yok');
  el.innerHTML = `<div class="sayilar">${k1}${k2}${k3}${k4}${enHikaye()}</div>${rakamAlt(P)}`;
}
function enHikaye() {
  const L = DZ && !DZ.hata ? DZ.diziler : [], H = L.map(d => ({ d, t: hikayeToplam(d) })).filter(x => x.t != null).sort((a, b) => b.t - a.t)[0];
  if (!H) return sayiKart('En çok izlenen hikâye', '—', '', L.length ? 'Henüz izlenme sayısı olan bölüm yok' : 'Bu kanalda hikâye yok');
  const n = (H.d.bolumler || []).filter(b => bolumIzlenme(b) != null).length;
  return sayiKart('En çok izlenen hikâye', sayi(H.t), `<b class="sk-hikaye">${esc(H.d.baslik_kisa || H.d.baslik)}</b>`, `${n} paylaşılan bölümün izlenme toplamı`);
}
// chart and the story strip side by side on wide screens
const rakamAlt = P => { const s = hikayeSeridi(); rakamAlt.ikili = !!s && innerWidth >= 1700; return `<div class="rakam-alt${rakamAlt.ikili ? ' ikili' : ''}">${grafik(P)}${s}</div>`; };
// the last 14 posts' views as bars (one series: one colour, labels on the highest and the newest)
function grafik(P) {
  const L = P.filter(p => p.views != null).sort((a, b) => a.t - b.t).slice(-14);
  if (!L.length) return `<div class="kart grafik-kart"><div class="gk-ust"><b>Son videoların izlenmesi</b></div><div class="liste-bos ince">—<br><span class="ince-yazi">${IG === null ? 'Rakamlar Instagram’dan geliyor…' : 'Henüz izlenme sayısı olan video yok.'}</span></div></div>`;
  const W = Math.max(300, Math.round(((($('#istatistik').clientWidth || 760) - (rakamAlt.ikili ? 10 : 0)) * (rakamAlt.ikili ? 0.6 : 1)) - 38)), H = 210, ust = 26, alt = 28, sol = 8, adim = (W - sol * 2) / Math.max(L.length, 6), bw = Math.min(46, adim - 8), tepe = Math.max(...L.map(p => p.views), 1);
  const enYuksek = L.reduce((a, p, i) => p.views > L[a].views ? i : a, 0);
  const cubuk = L.map((p, i) => {
    const h = Math.max(2, (p.views / tepe) * (H - ust - alt)), x = sol + i * adim + (adim - bw) / 2, y = H - alt - h, r = Math.min(4, h / 2);
    const etiket = i === enYuksek || i === L.length - 1;
    return `<g class="gk-c" data-gi="${i}"><rect x="${x - 4}" y="${ust - 6}" width="${bw + 8}" height="${H - ust - alt + 6}" fill="transparent"/>
      <path d="M${x},${H - alt} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${H - alt} Z" class="gk-bar${i === L.length - 1 ? ' son' : ''}"/>
      ${etiket ? `<text x="${x + bw / 2}" y="${y - 7}" text-anchor="middle" class="gk-deger">${esc(sayi(p.views))}</text>` : ''}
      <text x="${x + bw / 2}" y="${H - 9}" text-anchor="middle" class="gk-tarih">${esc(p.t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }))}</text></g>`;
  }).join('');
  grafik.L = L;
  return `<div class="kart grafik-kart"><div class="gk-ust"><b>Son ${L.length} videonun izlenmesi</b><span class="ince-yazi">eskiden yeniye · üstüne gel, ayrıntı çıksın</span></div>
    <svg class="gk" viewBox="0 0 ${W} ${H}" role="img" aria-label="Son ${L.length} videonun izlenme sayıları"><line x1="0" x2="${W}" y1="${H - alt}" y2="${H - alt}" class="gk-taban"/>${cubuk}</svg></div>`;
}
// story-series channels: each story as a row of episode dots with their views
function hikayeSeridi() {
  const L = DZ && !DZ.hata ? DZ.diziler.filter(d => d.durum === 'aktif') : [];
  if (!L.length) return '';
  return `<div class="kart hs"><div class="gk-ust"><b>Hikâyeler</b><button class="dugme ince" data-s="hikayeler">Hepsini gör</button></div>
    ${L.map(d => { const top = hikayeToplam(d); return `<div class="hs-satir"><div class="hs-ad"><b>${esc(d.baslik_kisa || d.baslik)}</b>${d.konu ? `<span class="konu-cip">${esc(d.konu)}</span>` : ''}</div>
      <div class="hs-noktalar">${(d.bolumler || []).map(b => { const s = bolumDurum(b, d), v = bolumIzlenme(b); return `<button class="hs-n d-${s}" data-bolum="${esc(d.id)}|${esc(b.n)}" title="Bölüm ${esc(b.n)} · ${esc(DURUM[s].ad)}"><i>${s === 'onay' ? '' : ikon(DURUM[s].ikon, 11)}</i><span>${v != null ? esc(sayi(v)) : 'B' + esc(b.n)}</span>${degisimYaz(d, b)}</button>`; }).join('')}</div>
      <div class="hs-top">${top != null ? esc(sayi(top)) : '—'}<small>hikâye izlenmesi</small></div></div>`; }).join('')}</div>`;
}
// a story's total = the sum of its posted episodes' views (null when none has a number yet)
const hikayeToplam = d => { const v = (d.bolumler || []).map(bolumIzlenme).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
// change against the previous episode, only when both have a number
const bolumDegisim = (d, b) => { const o = (d.bolumler || []).find(x => x.n === b.n - 1), a = o ? bolumIzlenme(o) : null, c = bolumIzlenme(b); return a == null || c == null || !a ? null : Math.round((c - a) / a * 100); };
const degisimYaz = (d, b) => { const p = bolumDegisim(d, b); return p == null ? '' : `<span class="degisim ${p >= 0 ? 'artis' : 'dusus'}" title="Bölüm ${b.n - 1}'e göre">B${esc(b.n)}: %${p >= 0 ? '+' : '-'}${Math.abs(p)}</span>`; };
const bolumIzlenme = b => { const g = igGonderiler().find(x => (b.media_id && x.id === b.media_id) || (b.link && x.link === b.link)); return g && g.views != null ? g.views : b.metrik && b.metrik.views != null ? b.metrik.views : null; };

// ---------------- One modal for a video: player, caption, the few big actions that apply
function olayAc(e) {
  if (e.tur === 'metin') return metinAc(e.dizi);
  const ep = e.ep, iz = ep ? ep.b.izin || {} : {}, bek = e.tur === 'bekleyen', m = e.makine;
  const video = e.mp4 ? `<video id="p-video" src="${m === 'sunucu' ? sunucuDosya(e.mp4) : dosya(e.mp4)}" ${kapakVar(e.kapak) ? `poster="${kapakUrl(e.kapak)}"` : ''} controls playsinline preload="metadata"></video>${m === 'sunucu' ? '<div class="ince-yazi">Video sunucudan alınıyor, büyükse biraz sürer…</div>' : ''}`
    : `<div class="m-yok">${kapakVar(e.kapak) ? `<img src="${kapakUrl(e.kapak)}" alt="">` : ''}<span>${e.link ? 'Video bu bilgisayarda yok.<br>Instagram’da izleyebilirsin.' : e.durum === 'hazirlaniyor' ? 'Video hazırlanıyor…' : 'Video bu bilgisayarda yok.'}</span></div>`;
  const zaman = e.t ? new Date(e.t).toLocaleString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : bek ? 'Saati yok: onaylayınca ilk boş saate konur' : '';
  const ig = e.ig || (e.is && e.is.sonuc) || (ep && ep.b.metrik) || null;
  olayAc.anahtar = olayAnahtar(e); olayAc.imza = olayImza(e) + igBekle() + dzBekle();
  const rakam = rakamBlok(e, ig);
  const dugme = [];
  if (bek && e.is.onay_gerekli) dugme.push(`<button class="dugme buyuk sari" data-m-onayla>${ikon('tik', 18)}Onayla</button>`);
  if (bek) dugme.push(`<button class="dugme buyuk" data-m-saat>${ikon('saat', 18)}Saati değiştir</button>`);
  if (iz.devam) dugme.push(`<button class="dugme buyuk" data-m-karar="devam">${ikon('ileri', 18)}Devam ettir</button>`);
  if (iz.kes) dugme.push(`<button class="dugme buyuk tehlike" data-m-karar="kes">${ikon('makas', 18)}Kes</button>`);
  if (iz.tekrar) dugme.push(`<button class="dugme buyuk" data-m-tekrar>${ikon('tekrar', 18)}Tekrar dene</button>`);
  if (bek) dugme.push(`<button class="dugme buyuk tehlike" data-m-iptal>${ikon('carpi', 18)}İptal</button>`);
  if (e.link) dugme.push(`<a class="dugme buyuk" href="${esc(e.link)}" target="_blank" rel="noopener">${ikon('dis', 18)}Instagram’da aç</a>`);
  pencere(`<div class="modal">
    <div class="m-video">${video}</div>
    <div class="m-bilgi">
      <div class="p-ust"><div class="m-cipler">${durumCip(e.durum)}${kanalRozet(true)}${m === 'sunucu' ? `<span class="kanal-rozet acik">${esc(makineAd('sunucu'))}</span>` : ''}</div><button class="kapat" data-kapat aria-label="Kapat">✕</button></div>
      <h2>${esc(e.baslik)}</h2>${e.bolum ? `<div class="m-bolum">${esc(e.bolum)}</div>` : ''}
      ${zaman ? `<div class="m-zaman">${ikon('saat', 15)}${esc(zaman)}</div>` : ''}
      ${e.asama ? `<div class="m-asama">${asamaCubuk(e.asama, true)}</div>` : ''}
      ${e.not ? `<div class="m-not d-${e.durum}">${esc(e.not)}</div>` : ''}
      ${rakam}
      ${e.aciklama ? `<div class="m-altyazi"><span>Açıklama</span>${esc(e.aciklama)}</div>` : ''}
      <form class="m-saat" id="m-saat" hidden><input type="datetime-local" id="m-saat-deger" value="${e.t ? yerel(e.t) : yerel(Date.now() + 36e5)}"><button class="dugme sari">Kaydet</button></form>
      ${dugme.length ? `<div class="m-dugmeler">${dugme.join('')}</div>` : ''}
    </div></div>`, 'olay-pencere');
  const kapat = () => $('#pencere').close();
  const q = s => $('#pencere-ic ' + s);
  if (q('[data-m-onayla]')) q('[data-m-onayla]').onclick = () => { kapat(); islem('kuyruk/onayla', { id: e.is.id, makine: m }, 'Onaylandı ✓'); };
  if (q('[data-m-saat]')) q('[data-m-saat]').onclick = () => { q('#m-saat').hidden = false; q('#m-saat-deger').focus(); };
  q('#m-saat').onsubmit = ev => { ev.preventDefault(); const v = q('#m-saat-deger').value; if (!v) return; kapat(); islem('kuyruk/zaman', { id: e.is.id, makine: m, zaman: ofsetli(v) }, 'Saat değişti'); };
  if (q('[data-m-iptal]')) q('[data-m-iptal]').onclick = () => { if (confirm('Bu video sıradan çıkarılsın mı? Paylaşılmaz.')) { kapat(); islem('kuyruk/iptal', { id: e.is.id, makine: m }, 'Sıradan çıkarıldı'); } };
  $$('#pencere-ic [data-m-karar]').forEach(b => b.onclick = () => { kapat(); dzKarar({ did: ep.d.id, dn: ep.b.n, dkarar: b.dataset.mKarar }); });
  if (q('[data-m-tekrar]')) q('[data-m-tekrar]').onclick = () => { kapat(); dzTekrar({ did: ep.d.id, dn: ep.b.n }); };
}
// ---------------- Story text approval: read (and edit) every episode text, then approve the whole story or reject it
function metinAc(d) {
  const url = guvenli(d.kaynak && d.kaynak.url), B = d.bolumler || [];
  pencere(`<div class="mt-modal">
    <div class="p-ust"><div class="m-cipler">${durumCip('metin')}${d.konu ? `<span class="konu-cip">${esc(d.konu)}</span>` : ''}${kanalRozet(true)}</div><button class="kapat" data-kapat aria-label="Kapat">✕</button></div>
    <h2>${esc(d.baslik_kisa || d.baslik)}</h2>
    <div class="mt-bilgi">${d.baslik && d.baslik !== d.baslik_kisa ? `<span>Kaynak başlık: ${esc(d.baslik)}</span>` : ''}${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${ikon('dis', 14)}Kaynağı aç</a>` : ''}${d.anlatici ? `<span>Ses: ${esc(d.anlatici.ad || d.anlatici.ses)}</span>` : ''}<span>${esc(B.length)} bölüm</span></div>
    <p class="ince-yazi">Metni oku, istersen düzelt. Onaylayınca bölümler sırayla seslendirilir; her videoyu paylaşmadan önce ayrıca onaylarsın. 2. bölümden itibaren ilk paragraf tek cümlelik "Önceki bölümde…" özetidir (en fazla 15 kelime).</p>
    <form id="mt-form" class="mt-form">${B.map(b => `<label class="mt-bolum"><span>Bölüm ${esc(b.n)}<small data-mt-say="${esc(b.n)}"></small></span><textarea name="b${esc(b.n)}" rows="9" data-ilk="${esc(b.metin || '')}">${esc(b.metin || '')}</textarea></label>`).join('')}
      <span class="dz-hata" id="mt-hata" role="alert"></span>
      <div class="m-dugmeler"><button type="submit" class="dugme buyuk sari">${ikon('tik', 18)}Metni onayla</button><button type="button" class="dugme buyuk tehlike" data-mt-reddet>${ikon('carpi', 18)}Hikâyeyi reddet</button></div>
    </form></div>`);
  const q = s => $('#pencere-ic ' + s), say = t => String(t).replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length;
  const sayYaz = ta => { const n = ta.name.slice(1), el = q(`[data-mt-say="${n}"]`); if (el) el.textContent = ` · ${say(ta.value)} kelime${ta.value !== ta.dataset.ilk ? ' · düzeltildi' : ''}`; };
  $$('#pencere-ic textarea').forEach(ta => { sayYaz(ta); ta.oninput = () => sayYaz(ta); });
  const gonder = async (karar, metinler) => {
    q('#mt-hata').textContent = '';
    try { await api('dizi/metin', { kanal, makine: dzM(), id: d.id, karar, ...(metinler ? { metinler } : {}) }); $('#pencere').close(); bildir(karar === 'onayla' ? 'Metin onaylandı ✓ Bölüm 1 hazırlanacak' : 'Hikâye reddedildi'); await dizilerYukle(); }
    catch (err) { q('#mt-hata').textContent = err.message; bildir(err.message, true); }
  };
  q('#mt-form').onsubmit = ev => {
    ev.preventDefault();
    const degisen = {};
    $$('#pencere-ic textarea').forEach(ta => { if (ta.value !== ta.dataset.ilk) degisen[ta.name.slice(1)] = ta.value; });
    gonder('onayla', Object.keys(degisen).length ? degisen : null);
  };
  q('[data-mt-reddet]').onclick = () => { if (confirm('Bu hikâye reddedilsin mi? Hiçbir bölümü yapılmaz ve bir daha önerilmez.')) gonder('reddet'); };
}
// an episode clicked on the Hikâyeler page or the strip: its calendar event, or one made from the episode alone
function bolumAc(did, n) {
  const B = bolumler(), ep = B.find(x => x.d.id === did && String(x.b.n) === String(n)); if (!ep) return;
  const e = olaylar().find(x => x.ep && x.ep.b === ep.b);
  if (e) return olayAc(e);
  const d = bolumDurum(ep.b, ep.d), kl = AS[bolumKlasor(ep.d, ep.b)] ? bolumKlasor(ep.d, ep.b) : klasor(ep.b.video);
  const e0 = { tur: 'bolum', makine: dzM(), ep, t: ep.b.paylasildi ? new Date(ep.b.paylasildi) : null, durum: d, views: bolumIzlenme(ep.b), mp4: ep.b.mp4 || null, kapak: dzM() === 'yerel' ? kl : null,
    baslik: ep.d.baslik_kisa || ep.d.baslik, bolum: `Bölüm ${ep.b.n}/${ep.d.bolumler.length}`, konu: ep.d.konu || null, aciklama: '', link: guvenli(ep.b.link),
    not: d === 'bekliyor' ? 'Bu bölümün metni hazır. Sırası gelince video yapılır.' : d === 'kesildi' ? 'Hikâye kesildiği için bu bölüm yapılmayacak.' : d === 'hazirlaniyor' ? 'Video hazırlanıyor. Bitince onayına gelir.' : '' };
  e0.asama = e0.kapak && d !== 'paylasildi' ? asamaListe(e0.kapak, e0) : null;
  olayAc(e0);
}

// ---------------- Hikâyeler (series): one card per story, episode dots, the decisions that are allowed
let DZ = null, dzKirli = false;
// the server toggle needs a server panel that knows the dizi flags (an old panel.js would just fail or hang): --ozet reports ozellik: ['diziler']
const dzSunucuVar = () => !!(SV && !SV.hata && Array.isArray(SV.ozellik) && SV.ozellik.includes('diziler'));
const dzM = () => makine === 'sunucu' && dzSunucuVar() ? 'sunucu' : 'yerel';   // machine Diziler actually talks to
// every machine switch (Sıra or Hikâyeler) goes through here: the series data is reset with it; unsaved settings need a yes first
let makineElle = false;                           // the user picked a machine on Sıra / Hikâyeler
function makineDegis(m) {
  makineElle = true;
  if (m !== makine && dzKirli && !confirm('Devam ayarlarında kaydedilmemiş değişiklik var. Atılsın mı?')) return false;
  if (m !== makine) { makine = m; DZ = null; dzKirli = false; dizilerCiz(); dizilerYukle(); }
  return true;
}
function hkBolum(d, b) {
  const s = bolumDurum(b, d), v = bolumIzlenme(b), iz = b.izin || {}, dk = `data-did="${esc(d.id)}" data-dn="${esc(b.n)}"`;
  const onayBekler = b.durum === 'onay-bekliyor' && b.kuyruk_id && b.kuyruk_onay_gerekli === true;
  const karar = b.karar && b.karar !== 'bekle' ? (b.karar === 'kes' ? 'Kes dendi' : 'Devam dendi') + (b.elle ? ' (sen)' : '') : '';
  return `<div class="hk-b d-${s}">
    <button class="hk-nokta" data-bolum="${esc(d.id)}|${esc(b.n)}" title="Videoyu ve ayrıntıyı aç">${s === 'onay' ? '<i class="nabiz-nokta"></i>' : ikon(DURUM[s].ikon, 15)}</button>
    <b>Bölüm ${esc(b.n)}</b><span class="hk-d">${esc(DURUM[s].ad)}</span>
    <span class="hk-v">${v != null ? `${ikon('goz', 13)}${esc(sayi(v))}` : b.bekleme === 'butce' ? 'bütçe bekliyor' : '&nbsp;'}</span>
    ${degisimYaz(d, b)}
    ${karar ? `<span class="hk-karar${b.karar === 'kes' ? ' kes' : ''}" title="${esc(b.karar_neden || '')}">${esc(karar)}</span>` : ''}
    <span class="hk-islem">${onayBekler ? `<button class="dugme ince sari" data-onayla="${esc(b.kuyruk_id)}" data-makine="${dzM()}">Onayla</button>` : ''}${iz.devam ? `<button class="dugme ince" data-dkarar="devam" ${dk}>Devam ettir</button>` : ''}${iz.kes ? `<button class="dugme ince tehlike" data-dkarar="kes" ${dk}>Kes</button>` : ''}${iz.tekrar ? `<button class="dugme ince" data-dtekrar="1" ${dk}>Tekrar dene</button>` : ''}</span></div>`;
}
function dizilerCiz() {
  const dzSv = !!O.sunucu && dzSunucuVar();
  $('#dz-makine').innerHTML = ['yerel', ...(dzSv ? ['sunucu'] : [])].map(m => `<button data-dz-makine="${m}" class="${m === dzM() ? 'on' : ''}">${esc(makineAd(m))}</button>`).join('');
  $('#dz-makine').hidden = !dzSv;
  if (!DZ) { $('#dz-liste').innerHTML = '<div class="liste-bos">Hikâyeler yükleniyor…</div>'; $('#dz-son').hidden = true; dzAyarCiz(); return; }
  $('#dz-say').textContent = DZ.diziler.length;
  const s = DZ.son_kosu, notlar = s ? s.notlar || [] : [];
  $('#dz-son').hidden = !s && !DZ.hata;
  const acik = $('#dz-son').open;
  $('#dz-son').innerHTML = `<summary>${s ? `Son çalışma <b>${esc(saat(s.zaman))}</b>${ayniGun(s.zaman, Date.now()) ? '' : ' · ' + esc(gunTarih(s.zaman))} · ${notlar.length ? notlar.length + ' not' : 'her şey yolunda'}` : esc(DZ.hata || '')}</summary>`
    + (s ? `<div class="dz-son-ic">${notlar.length ? `<ul class="dz-notlar">${notlar.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}${(s.kararlar || []).length ? `<div class="ince-yazi">Kararlar: ${s.kararlar.map(k => esc(`${k.id} bölüm ${k.n} → ${k.karar}`)).join(', ')}</div>` : ''}`
      + (s.reddedilen || DZ.reddedilen_toplam ? `<div class="ince-yazi">Uygun bulunmayan hikâye: bu çalışmada ${esc(s.reddedilen || 0)} · toplam ${esc(DZ.reddedilen_toplam || 0)} (bir daha denenmez)</div>` : '') + '</div>' : '');
  $('#dz-son').open = acik;
  $('#dz-liste').innerHTML = DZ.diziler.length ? DZ.diziler.map(d => {
    const url = guvenli(d.kaynak && d.kaynak.url), top = hikayeToplam(d);
    return `<article class="kart hk hk-${esc(d.durum)}"><div class="hk-ust"><div class="hk-ad">
        <div class="hk-cipler">${d.konu ? `<span class="konu-cip">${esc(d.konu)}</span>` : ''}${d.metin_onay === 'bekliyor' && d.durum === 'aktif' ? `<span class="hk-durum hk-durum-metin">${ikon('kalem', 12)}Metin onayı bekliyor</span>` : `<span class="hk-durum hk-durum-${esc(d.durum)}">${esc(DIZI_DURUM[d.durum] || d.durum)}</span>`}</div>
        <h3>${esc(d.baslik_kisa || d.baslik)}</h3><small>${d.baslik && d.baslik !== d.baslik_kisa ? esc(d.baslik) + ' · ' : ''}${d.anlatici ? 'Ses: ' + esc(d.anlatici.ad || d.anlatici.ses) : ''}</small></div>
      <div class="hk-sag">${d.metin_onay === 'bekliyor' && d.durum === 'aktif' ? `<button class="dugme mor" data-metin-onay="${esc(d.id)}">${ikon('kalem', 15)}Metni oku ve onayla</button>` : `<span class="hk-top">${top != null ? esc(sayi(top)) : '—'}<small>hikâye izlenmesi</small></span>`}${url ? `<a class="dugme ince" href="${esc(url)}" target="_blank" rel="noopener">${ikon('dis', 14)}Kaynak</a>` : ''}</div></div>
      <div class="hk-bolumler" style="--n:${(d.bolumler || []).length}">${(d.bolumler || []).map(b => hkBolum(d, b)).join('')}</div></article>`;
  }).join('') : '<div class="liste-bos">Henüz hikâye yok. Zamanlayıcı çalışınca ilk hikâyeler burada görünür.</div>';
  dzAyarCiz();
}
// plain questions; percent in the form, a ratio in konu.json
function dzAyarCiz() {
  if (dzKirli) return;
  const var_ = !!(DZ && DZ.ayar_var);   // a channel without a dizi block has nothing to edit: no form, nothing to send
  $('#dz-ayar').hidden = !var_; $('#dz-ayar-baslik').hidden = !var_ && !DZ; $('#dz-ayar-yok').hidden = var_ || !DZ;
  if (!var_) { $('#dz-ayar').innerHTML = ''; return; }
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
// queue settings, read only: what the scheduler does on the selected machine
function paylasimAyarCiz() {
  const K = kuyrukOf(dzM()) || O.yerel, s = K && K.saglik;
  if (!K || K.hesapYok) { $('#paylasim-ayar').innerHTML = '<div class="ince-yazi">Bu kanalın Instagram hesabı tanımlı değil.</div>'; return; }
  $('#paylasim-ayar').innerHTML = `<div class="pa-satir"><i class="nokta ${s.zamanlayici ? '' : 'kotu'}"></i><b>${s.zamanlayici ? 'Otomatik paylaşım açık' : 'Otomatik paylaşım kapalı'}</b><span class="ince-yazi">${s.son_calisma ? 'son bakış ' + esc(tarih(s.son_calisma, { weekday: undefined })) : ''}</span></div>
    <div class="pa-satir"><i class="nokta ${s.instagram.bagli ? (s.instagram.gun < 10 ? 'orta' : '') : 'kotu'}"></i><b>${s.instagram.bagli ? 'Instagram bağlı' : 'Instagram bağlı değil'}</b><span class="ince-yazi">${s.instagram.bagli ? `bağlantı ${esc(s.instagram.gun)} gün daha geçerli` : ''}</span></div>
    <div class="pa-satir"><i class="nokta gri"></i><b>Paylaşım saatleri</b><span>${K.saatler.length ? esc(K.saatler.join(' · ')) : '—'}</span></div>
    <div class="pa-satir"><i class="nokta gri"></i><b>Günde en fazla</b><span>${K.gunluk != null ? esc(K.gunluk) + ' video' : '—'}</span></div>
    ${s.uyari.filter(u => !/^Otomatik paylaşım kapalı|^Instagram bağlı değil/.test(u)).length ? `<div class="uyarilar">${s.uyari.filter(u => !/^Otomatik paylaşım kapalı|^Instagram bağlı değil/.test(u)).map(u => `<span class="uyari">${esc(u)}</span>`).join('')}</div>` : ''}
    <div class="ince-yazi">Bu saatler hikâye ayarlarından ya da kuyruk ayar dosyasından gelir. Tek bir videonun saatini takvimde videoya tıklayıp değiştirebilirsin.</div>`;
}
async function dizilerYukle() {
  const at = kanal, mk = dzM(); if (!at) return;
  const ayni = () => at === kanal && mk === dzM();   // channel or machine switched while waiting: drop the answer
  try { const r = await api('diziler?kanal=' + encodeURIComponent(at) + (mk === 'sunucu' ? '&makine=sunucu' : '')); if (ayni()) DZ = { ...r, _makine: mk }; } catch (e) { if (ayni()) DZ = { ayar: {}, diziler: [], son_kosu: null, hata: e.message, _makine: mk }; }
  dizilerCiz(); takvimCiz(); istatistikCiz();
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
  if (kes && !confirm(son ? 'Bu hikâye bitti olarak kapatılsın mı? Son bölüm artık ölçülmez.' : 'Bu hikâyenin devamı kesilsin mi? Sonraki bölümler yapılmaz.')) return;
  try { await api('dizi/karar', { kanal, makine: dzM(), id: d.did, n: +d.dn, karar: d.dkarar, neden: kes ? 'Furkan kesti' : 'Furkan devam ettirdi' }); bildir(kes ? (son ? 'Hikâye bitti' : 'Kesildi') : 'Devam edecek'); await dizilerYukle(); }
  catch (err) { bildir(err.message, true); }
}

// ---------------- Posted videos for the Results page (Instagram first, the queue's own numbers otherwise)
function gonderiler() {
  if (IG && IG.bagli && IG.gonderiler.length) return IG.gonderiler;
  return [O.yerel, SV && !SV.hata ? SV : null].filter(Boolean).flatMap(K => K.paylasilan.filter(p => p.sonuc).map(p => ({ baslik: isAd(p), link: p.link, zaman: p.paylasildi, ...p.sonuc })));
}
// home: one line when something besides approvals waits for the user (approvals are already on the calendar)
function bekleyenSeritCiz() {
  const L = O.sunucu ? [] : bekleyenler().filter(x => !x.onayMi);   // this computer's production steps; the server runs production now
  $('#bekleyen-serit').innerHTML = L.length ? `<button class="serit" data-s="bugun">${ikon('uyari', 16)}<span>Senden bekleyen <b>${L.length}</b> iş var: ${esc(L.slice(0, 2).map(x => x.baslik).join(', '))}${L.length > 2 ? '…' : ''}</span><span class="serit-git">Gör ${ikon('ileri', 14)}</span></button>` : '';
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

// ---------------- Background jobs drawer
const IS_AD = { topla: 'Konu toplama', puanla: 'Puanlama', uret: 'Üretim', 'uret-ses': 'Üretim (ses onaylı)', 'uret-kredi': 'Üretim (kredi onaylı)', sonuclar: 'Rakam çekme', ders: 'Ders çıkarma' };
function islerCiz() {
  const calisan = J.filter(x => x.durum === 'calisiyor').length;
  $('#isler-say').textContent = calisan || J.length; $('#isler-dugme').classList.toggle('aktif', !!calisan); $('#isler-dugme').hidden = !J.length;
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
// sinif: 'gun-panel' makes the dialog a right-side panel; an open dialog is reused (day to day)
const pencere = (html, sinif = '') => { const p = $('#pencere'); p.className = sinif; $('#pencere-ic').innerHTML = html; if (!p.open) p.showModal(); };
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
function gununSaati(gun, K) {           // first posting hour of that day still ahead (else the next free one)
  const saatler = K && K.saatler.length ? K.saatler : ['19:00'];
  for (const s of saatler) { const [h, m] = s.split(':').map(Number), d = new Date(+gun); d.setHours(h, m, 0, 0); if (+d > Date.now() + 10 * 6e4) return d; }
  return sonrakiSaat(K);
}
function ekleGoster(ad, gun) {
  const u = U.find(x => x.ad === ad), v = u.mp4.find(x => !x.ucretli) || u.mp4[0], hedef = O.sunucu ? 'sunucu' : 'yerel';
  pencere(pUst('Sıraya ekle') + `<video id="p-video" src="${dosya(v.yol)}#t=1" controls playsinline preload="metadata"></video>
    ${u.mp4.length > 1 ? `<label>Hangi video<select id="e-video" class="sec">${u.mp4.map(x => `<option value="${esc(x.yol)}">${x.ucretli ? 'ücretli' : 'ücretsiz'} · ${x.mb} MB</option>`).join('')}</select></label>` : `<input type="hidden" id="e-video" value="${esc(v.yol)}">`}
    <label>Açıklama<textarea id="e-aciklama">${esc(u.aciklama)}</textarea></label>
    <div class="p-satir">${O.sunucu ? `<label>Nerede<select id="e-makine" class="sec"><option value="sunucu">${esc(makineAd('sunucu'))} (7/24)</option><option value="yerel">Bu bilgisayar</option></select></label>` : ''}
      <label>Zaman<input type="datetime-local" id="e-zaman" value="${yerel(gun ? gununSaati(gun, kuyrukOf(hedef)) : sonrakiSaat(kuyrukOf(hedef)))}"></label>
      <label class="kutu"><input type="checkbox" id="e-onay"> Önce ben onaylayayım</label></div>
    <div class="p-alt"><button class="dugme" data-kapat>Vazgeç</button><button class="dugme sari" id="e-ekle">Sıraya ekle</button></div>`);
  $('#e-ekle').onclick = async () => {
    if (!kanalHesap(u.kanal)) return bildir('Bu kanalın Instagram hesabı tanımlı değil: sıraya eklenemez', true);   // never falls back to oxygbio
    const m = $('#e-makine') ? $('#e-makine').value : 'yerel', b = $('#e-ekle'); b.disabled = true; b.textContent = m === 'sunucu' ? 'Sunucuya gönderiliyor…' : 'Ekleniyor…';
    try { await api('kuyruk/ekle', { makine: m, mp4: $('#e-video').value, aciklama: $('#e-aciklama').value, kanal: u.kanal, zaman: ofsetli($('#e-zaman').value), onay_gerekli: $('#e-onay').checked }); $('#pencere').close(); bildir('Sıraya eklendi ✓'); makine = m; await yukle(); sekme(gun !== undefined ? 'takvim' : 'sira'); }
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
    const as = await api('asamalar' + kq()).catch(() => null);
    if (no !== yukleNo) return;
    if (as) AS = as;
  } catch (e) { if (no !== yukleNo) return; $('main').innerHTML = `<div class="liste-bos" style="margin-top:40px">${esc(e.message)}</div>`; return; }
  if (O.sunucu && !makineElle) makine = 'sunucu';   // the server is the source of truth
  hepsi();
  dizilerYukle();
  if (O.sunucu) api('sunucu' + kq()).then(s => { if (no === yukleNo) SV = s; }).catch(e => { if (no === yukleNo) SV = { hata: 'Sunucuya ulaşılamadı: ' + e.message }; }).finally(() => { if (no === yukleNo) { hepsi(); if (makine === 'sunucu') dizilerYukle(); } });
  if (IG === null) igYukle();
  if (TK === null) tkYukle();
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
async function tkYukle() {
  const at = kanal, h = kanalHesap();
  if (!h) { TK = { bagli: false, takipci: null }; if (O) istatistikCiz(); return; }
  let r; try { r = await api('takipci?hesap=' + encodeURIComponent(hesapAd(h))); } catch { r = { bagli: true, takipci: null }; }
  if (at !== kanal) return;
  TK = r; if (O) istatistikCiz();
}
function hepsi() { kanalSecCiz(); kanalBlokCiz(); dizilerCiz(); takvimCiz(); istatistikCiz(); bekleyenSeritCiz(); paylasimAyarCiz(); bugunCiz(); fikirlerCiz(); uretimCiz(); siraCiz(); sonuclarCiz(); islerCiz(); }
const ANA = ['takvim', 'hikayeler', 'ayarlar'], GELISMIS = ['bugun', 'fikirler', 'uretim', 'sira', 'sonuclar'];
function sekme(ad) {
  if (ad === 'diziler') ad = 'hikayeler';
  if (![...ANA, ...GELISMIS].includes(ad)) ad = 'takvim';
  $$('#sekmeler button[data-s], #alt-sekmeler button').forEach(b => b.classList.toggle('on', b.dataset.s === ad));
  const ileri = GELISMIS.includes(ad);
  if (ileri) gelismisAc(true);
  $('#gelismis-dugme').classList.toggle('on', ileri);
  $$('.sayfa').forEach(s => s.classList.toggle('on', s.id === 's-' + ad));
  try { sessionStorage.setItem('vm-s', ad); } catch {}
}
// dark by default; the cream theme is a per-viewer choice
function temaYaz() { const acik = document.documentElement.dataset.tema === 'acik'; $('#tema-yazi').textContent = acik ? 'Koyu tema' : 'Açık tema'; }
function temaDegis() {
  const acik = document.documentElement.dataset.tema !== 'acik';
  if (acik) document.documentElement.dataset.tema = 'acik'; else delete document.documentElement.dataset.tema;
  try { localStorage.setItem('vm-tema', acik ? 'acik' : 'koyu'); } catch {}
  temaYaz();
}
function gelismisAc(ac) { $('#alt-sekmeler').hidden = !ac; $('#gelismis-dugme').setAttribute('aria-expanded', String(ac)); }
async function islem(yol, govde, mesaj) { try { await api(yol, govde); bildir(mesaj); await yukle(); } catch (e) { bildir(e.message, true); } }

document.addEventListener('click', e => {
  const b = e.target.closest('button,[data-kapat]');
  if (!b) { const h = !e.target.closest('a') && e.target.closest('.gun-h[data-gun]'); if (h) gunAc(h.dataset.gun); return; }   // a day cell: its detail view
  const d = b.dataset;
  if (d.kapat !== undefined) $('#pencere').close();
  else if (d.olay !== undefined) { const x = OL[+d.olay]; if (x) olayAc(x); }
  else if (d.metinOnay) { const x = DZ && !DZ.hata && DZ.diziler.find(y => y.id === d.metinOnay); if (x) metinAc(x); }
  else if (d.bolum) { const [did, n] = d.bolum.split('|'); bolumAc(did, n); }
  else if (d.durumF) { durumFiltre = d.durumF; takvimCiz(); }
  else if (d.konuF !== undefined) { konuFiltre = d.konuF || null; takvimCiz(); }
  else if (d.planla) yeniGoster(d.planla);
  else if (d.gun) gunAc(d.gun);
  else if (b.id === 'yeni-dugme') yeniGoster();
  else if (b.id === 'tema-dugme') temaDegis();
  else if (b.id === 'gelismis-dugme') gelismisAc($('#alt-sekmeler').hidden);
  else if (d.s) sekme(d.s);
  else if (d.sira) { if (makineDegis(d.sira)) { siraCiz(); sekme('sira'); } }
  else if (d.dzMakine) { if (makineDegis(d.dzMakine)) { siraCiz(); paylasimAyarCiz(); } }
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
  else if (d.h) { ayKaydir = +d.h === 0 ? 0 : ayKaydir + +d.h; takvimCiz(); }
  else if (d.f) { fikirFiltre = d.f; fikirlerCiz(); }
  else if (b.id === 'yenile') { b.disabled = true; igYukle(true).finally(() => { b.disabled = false; bildir('Rakamlar güncellendi'); }); }
  else if (b.id === 'fikir-ekle-dugme') { $('#fikir-ekle').hidden = !$('#fikir-ekle').hidden; $('#fe-baslik').focus(); }
  else if (b.id === 'isler-dugme') { $('#cekmece').hidden = false; islerYukle(); }
  else if (b.id === 'cekmece-kapat') $('#cekmece').hidden = true;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.zaman && t.value) islem('kuyruk/zaman', { id: t.dataset.zaman, makine: t.dataset.makine, zaman: ofsetli(t.value) }, 'Saat değişti');
  if (t.id === 'kanal-sec') { DZ = null; dzKirli = false; kanal = t.value; try { localStorage.setItem('vm-kanal', kanal); } catch {} IG = null; TK = null; SV = null; AS = {}; yukle(); }
});
// the bar chart's hover card
document.addEventListener('mouseover', e => {
  const g = e.target.closest && e.target.closest('.gk-c'), ip = $('#ipucu');
  if (!g) { ip.hidden = true; return; }
  const p = (grafik.L || [])[+g.dataset.gi]; if (!p) return;
  ip.innerHTML = `<b>${esc(sayi(p.views))} izlenme</b><span>${esc(p.t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' }))}</span><span>${esc(p.baslik || '')}</span>`;
  const r = g.getBoundingClientRect(); ip.hidden = false;
  ip.style.left = Math.min(window.innerWidth - ip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - ip.offsetWidth / 2)) + 'px';
  ip.style.top = Math.max(8, r.top - ip.offsetHeight - 8) + 'px';
});
$('#fikir-ekle').addEventListener('submit', e => { e.preventDefault(); islem('fikir', { is: 'ekle', kanal, baslik: $('#fe-baslik').value, oncul: $('#fe-oncul').value }, 'Fikir eklendi').then(() => { $('#fikir-ekle').reset(); $('#fikir-ekle').hidden = true; }); });
$('#dz-ayar').addEventListener('submit', dzKaydet);
$('#dz-ayar').addEventListener('input', () => { dzKirli = true; });
let boyutT; window.addEventListener('resize', () => { clearTimeout(boyutT); boyutT = setTimeout(() => { if (O) istatistikCiz(); }, 200); });
$('#pencere').addEventListener('close', () => { const v = $('#pencere video'); if (v) v.pause(); });

temaYaz();
try { const s = new URLSearchParams(location.hash.slice(1)).get('s') || sessionStorage.getItem('vm-s'); sekme(s || 'takvim'); } catch { sekme('takvim'); }
if (!anahtar) $('main').innerHTML = '<div class="liste-bos" style="margin-top:40px">Paneli terminaldeki linkle aç: <b>node panel/panel.js</b></div>';
else { yukle(); setInterval(() => { if (!document.hidden && !$('#pencere').open) yukle(); }, 60e3); }
