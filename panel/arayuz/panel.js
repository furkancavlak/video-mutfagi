// Control panel interface. Data: /api/ozet (queue, health, videos) and /api/instagram (posts + numbers).
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const anahtar = (() => {
  const h = new URLSearchParams(location.hash.slice(1)).get('k');
  try { if (h) sessionStorage.setItem('vm-k', h); return h || sessionStorage.getItem('vm-k'); } catch { return h; }
})();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sayi = n => n == null ? '–' : Number(n).toLocaleString('tr-TR');
const vsrc = p => `/video?p=${encodeURIComponent(p)}&k=${encodeURIComponent(anahtar)}`;
const tarih = (t, o = {}) => new Date(t).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...o });
const yerel = t => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

async function api(yol, govde) {
  const r = await fetch(yol, { method: govde ? 'POST' : 'GET', headers: { 'X-Panel': anahtar, 'Content-Type': 'application/json' }, body: govde ? JSON.stringify(govde) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.hata || 'istek başarısız');
  return j;
}
function bildir(yazi, kotu) { const b = $('#bildirim'); b.textContent = yazi; b.className = 'bildirim on' + (kotu ? ' kotu' : ''); clearTimeout(bildir.t); bildir.t = setTimeout(() => b.className = 'bildirim', 3200); }

let O = null, IG = null, metrik = 'views', ayKaydir = 0;

// a queue job's title: the video folder's title if we know it, else the file name
const videoBul = mp4 => O.videolar.find(v => v.yol === String(mp4 || '').replace(/\\/g, '/'));
const isAd = j => (videoBul(j.mp4) || {}).baslik || (j.aciklama || '').split(/[.?!\n]/)[0] || String(j.mp4).split(/[\\/]/).pop();

// --- header health pills: three words, colour says the rest
function saglikCiz() {
  const s = O.saglik, hap = (ad, durum, ipucu) => `<span class="hap ${durum}" title="${esc(ipucu)}"><i></i>${esc(ad)}</span>`;
  const z = !s.zamanlayici ? ['kotu', 'Otomatik paylaşım kapalı: node kuyruk/kuyruk.js zamanlayici kur'] : s.uyari.some(u => u.tur === 'uyku') ? ['orta', 'Zamanlayıcı 45 dakikadır çalışmadı'] : ['', 'Son çalışma: ' + (s.son_calisma ? tarih(s.son_calisma) : '-')];
  const ig = !s.instagram.bagli ? ['kotu', 'Instagram bağlı değil (instagram/REHBER.md)'] : s.instagram.gun < 10 ? ['orta', `Anahtarın ${s.instagram.gun} günü kaldı: node instagram/paylas.js yenile`] : ['', `Anahtar ${s.instagram.gun} gün geçerli`];
  const hata = s.uyari.filter(u => u.tur === 'gecikme' || u.tur === 'hata');
  $('#saglik').innerHTML = hap('Otomatik', ...z) + hap('Instagram' + (s.instagram.bagli && s.instagram.gun != null ? ` · ${s.instagram.gun}g` : ''), ...ig) + (hata.length ? hap(hata.map(u => u.yazi).join(' · '), 'kotu', 'Sıra sekmesine bak') : '');
}

// --- today: next post + latest results
function siradakiCiz() {
  const el = $('#siradaki'), j = O.kuyruk[0];
  if (!j) {
    el.innerHTML = `<div class="tahta-ust"><span class="kicker">Sıradaki</span></div><h2>Sıra <em>boş</em>.</h2><div class="sayac"></div><div class="dugmeler"><button class="dugme sari" data-git="videolar">Video seç</button></div>`;
    return;
  }
  const kalan = Math.max(0, new Date(j.ne_zaman) - Date.now()), g = Math.floor(kalan / 864e5), s = Math.floor(kalan % 864e5 / 36e5), d = Math.floor(kalan % 36e5 / 6e4);
  const parca = (g ? [[g, 'gün']] : []).concat([[s, 'saat'], [d, 'dk']]);
  el.innerHTML = `<div class="siradaki"><div>
      <div class="tahta-ust"><span class="kicker">Sıradaki</span><span class="sag">${esc(tarih(j.ne_zaman))}</span></div>
      <h2>${esc(isAd(j))}</h2>
      <div class="sayac">${parca.map(([n, a]) => `<div>${n}<small>${a}</small></div>`).join('')}</div>
      <div class="dugmeler">${j.onay_gerekli ? `<button class="dugme sari" data-onayla="${esc(j.id)}">Onayla</button>` : '<span class="el">otomatik gidecek ✓</span>'}
        <button class="dugme cizgi" data-git="sira">Sıra (${O.kuyruk.length})</button></div>
    </div><div class="mini-video oynat">${videoBul(j.mp4) ? `<video src="${vsrc(videoBul(j.mp4).yol)}#t=1" playsinline preload="metadata"></video>` : ''}</div></div>`;
}

function gonderiler() {
  // Instagram's own list if connected, else what the queue posted
  if (IG && IG.bagli && IG.gonderiler.length) return IG.gonderiler;
  return O.paylasilan.filter(p => p.sonuc).map(p => ({ baslik: isAd(p), link: p.link, zaman: p.paylasildi, ...p.sonuc }));
}
function cubuklar(liste, m, enFazla) {
  if (!liste.length) return '<p class="bos">Henüz rakam yok.</p>';
  const tepe = Math.max(...liste.map(g => g[m] || 0), 1), sirali = [...liste].sort((a, b) => (b[m] || 0) - (a[m] || 0));
  const orta = sirali[Math.floor(sirali.length / 2)][m] || 0, ilkId = sirali[0].link;
  return `<div class="cubuklar">${liste.slice(0, enFazla).map(g => {
    const v = g[m] || 0, ilk = g.link === ilkId && liste.length > 1, zayif = liste.length > 2 && v < orta / 2;
    return `<div class="cubuk${ilk ? ' ilk' : ''}${zayif ? ' zayif' : ''}">
      ${ilk ? '<span class="el not">en iyisi!</span>' : ''}
      <div class="ad"><a href="${esc(g.link)}" target="_blank" rel="noopener">${esc(g.baslik || 'Video')}</a><small>${esc(tarih(g.zaman, { hour: undefined, minute: undefined }))}</small></div>
      <div class="ray"><b style="width:${(v / tepe * 100).toFixed(1)}%"></b></div>
      <div class="deger">${sayi(g[m])}</div></div>`;
  }).join('')}</div>`;
}
function sonCiz() {
  const g = gonderiler(), son = [...g].sort((a, b) => String(b.zaman).localeCompare(String(a.zaman))).slice(0, 5);
  const en = son.length ? son.reduce((a, b) => ((b.views || 0) > (a.views || 0) ? b : a)) : null;
  $('#son').innerHTML = `<div class="tahta-ust"><span class="kicker">Son paylaşımlar</span><button class="sag dugme ince cizgi" data-git="sonuclar">Hepsi →</button></div>
    ${en && en.views != null ? `<h2>En iyisi <em>${sayi(en.views)}</em> izlenme.</h2>` : `<h2>${IG === null ? 'Rakamlar geliyor…' : 'Henüz rakam yok.'}</h2>`}
    <div style="margin-top:18px">${cubuklar(son, 'views', 5)}</div>`;
}

// --- queue page
function siraCiz() {
  $('#sira-say').textContent = O.kuyruk.length;
  const satirlar = [...O.kuyruk, ...O.hatali.map(h => ({ ...h, _hatali: true }))];
  if (!satirlar.length) { $('#sira-liste').innerHTML = '<div class="liste-bos">Sıra boş. <button class="dugme ince" data-git="videolar">Video seç</button></div>'; return; }
  $('#sira-liste').innerHTML = satirlar.map(j => {
    const gec = !j._hatali && !j.onay_gerekli && new Date(j.ne_zaman) < Date.now() - 30 * 6e4;
    const etiket = j._hatali ? '<span class="etiket hata">hatalı</span>' : j.onay_gerekli ? '<span class="etiket onay">onay bekliyor</span>' : gec ? '<span class="etiket gec">gecikti</span>' : '<span class="etiket hazir">hazır</span>';
    const v = videoBul(j.mp4);
    return `<div class="satir">
      <div class="zaman">${j.ne_zaman ? esc(tarih(j.ne_zaman, { weekday: undefined })) : '–'}<small>${j.ne_zaman ? esc(new Date(j.ne_zaman).toLocaleDateString('tr-TR', { weekday: 'long' })) : ''}</small></div>
      <div class="kucuk oynat">${v ? `<video src="${vsrc(v.yol)}#t=1" playsinline preload="metadata"></video>` : ''}</div>
      <div class="ad">${etiket}${esc(isAd(j))}<small title="${esc(j.hata || j.aciklama)}">${esc(j.hata || j.aciklama)}</small></div>
      <div class="islem">${j._hatali ? '' : `
        ${j.onay_gerekli ? `<button class="dugme ince sari" data-onayla="${esc(j.id)}">Onayla</button>` : ''}
        <input type="datetime-local" value="${j.ne_zaman ? yerel(j.ne_zaman) : ''}" data-zaman="${esc(j.id)}" aria-label="Zaman">
        <button class="dugme ince tehlike" data-iptal="${esc(j.id)}" title="Sıradan çıkar">✕</button>`}</div></div>`;
  }).join('');
}

// --- calendar: month grid, posted (green) and planned (yellow)
function takvimCiz() {
  const bas = new Date(); bas.setDate(1); bas.setMonth(bas.getMonth() + ayKaydir); bas.setHours(0, 0, 0, 0);
  $('#takvim-ay').textContent = bas.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  const olaylar = [];
  for (const j of O.kuyruk) olaylar.push({ t: j.ne_zaman, ad: isAd(j), sinif: j.onay_gerekli ? 'onay' : 'gelecek' });
  const gorulen = new Set();
  for (const g of gonderiler()) { gorulen.add(g.link); olaylar.push({ t: g.zaman, ad: g.views != null ? sayi(g.views) + ' izlenme' : (g.baslik || 'Video'), tam: g.baslik, sinif: 'gecmis', link: g.link }); }
  for (const p of O.paylasilan) if (!gorulen.has(p.link)) olaylar.push({ t: p.paylasildi, ad: isAd(p), sinif: 'gecmis', link: p.link });
  const ilk = new Date(bas); ilk.setDate(1 - ((bas.getDay() + 6) % 7));
  const gunler = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(g => `<div class="gun-ad">${g}</div>`).join('');
  let h = gunler;
  for (let i = 0; i < 42; i++) {
    const d = new Date(ilk); d.setDate(ilk.getDate() + i);
    const ayni = x => { const e = new Date(x); return e.getFullYear() === d.getFullYear() && e.getMonth() === d.getMonth() && e.getDate() === d.getDate(); };
    const bugun = ayni(Date.now()), o = olaylar.filter(x => x.t && ayni(x.t)).sort((a, b) => String(a.t).localeCompare(String(b.t)));
    h += `<div class="gun${d.getMonth() !== bas.getMonth() ? ' disari' : ''}${bugun ? ' bugun' : ''}"><span class="no">${d.getDate()}</span>${o.map(x => `<${x.link ? `a href="${esc(x.link)}" target="_blank" rel="noopener"` : 'div'} class="olay ${x.sinif}" title="${esc(x.tam || x.ad)}">${esc(new Date(x.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }))} ${esc(x.ad)}</${x.link ? 'a' : 'div'}>`).join('')}</div>`;
    if (i >= 34 && d.getMonth() !== bas.getMonth()) break;
  }
  $('#takvim').innerHTML = h;
}

// --- videos
function videolarCiz() {
  $('#video-say').textContent = O.videolar.length;
  const sirada = new Set(O.kuyruk.map(j => String(j.mp4).replace(/\\/g, '/')));
  $('#video-izgara').innerHTML = O.videolar.length ? O.videolar.map((v, i) => `<div class="vkart">
      <div class="oynat"><video src="${vsrc(v.yol)}#t=1" playsinline preload="metadata"></video></div>
      <div class="ic"><div class="ad">${esc(v.baslik)}</div><div class="ust-bilgi">${esc(v.dosya.includes('ucretli') ? 'ücretli' : 'ücretsiz')} · ${v.mb} MB · ${esc(tarih(v.zaman, { hour: undefined, minute: undefined }))}</div>
      ${sirada.has(v.yol) ? '<button class="dugme" disabled>Sırada ✓</button>' : `<button class="dugme sari" data-ekle="${i}">Sıraya ekle</button>`}</div></div>`).join('') : '<div class="liste-bos">Henüz video yok.</div>';
}

function sonuclarCiz() {
  $$('#metrik button').forEach(b => b.classList.toggle('on', b.dataset.m === metrik));
  const g = gonderiler(), ad = $(`#metrik [data-m="${metrik}"]`).textContent.toLocaleLowerCase('tr');
  const toplam = g.reduce((a, b) => a + (b[metrik] || 0), 0);
  $('#sonuclar').innerHTML = `<div class="tahta-ust"><span class="kicker">${g.length} video${IG && IG.hesap ? ' · @' + esc(IG.hesap) : ''}</span><span class="sag">${IG && IG.zaman ? 'güncellendi ' + esc(tarih(IG.zaman, { weekday: undefined })) : ''}</span></div>
    ${g.length ? `<h2>Toplam <em>${sayi(toplam)}</em> ${esc(ad)}.</h2>` : '<h2>Henüz rakam yok.</h2>'}
    <div style="margin-top:22px">${cubuklar([...g].sort((a, b) => String(b.zaman).localeCompare(String(a.zaman))), metrik, 30)}</div>`;
}

function hazirCiz() {
  const sirada = new Set(O.kuyruk.concat(O.paylasilan).map(j => String(j.mp4).replace(/\\/g, '/')));
  const hazir = O.videolar.map((v, i) => ({ v, i })).filter(x => !sirada.has(x.v.yol)).slice(0, 6);
  $('#hazir').innerHTML = hazir.length ? `<div class="hazir-ust"><h3>Hazır videolar</h3><span class="say">${hazir.length}</span></div>
    <div class="serit">${hazir.map(({ v, i }) => `<div class="vkart"><div class="oynat"><video src="${vsrc(v.yol)}#t=1" playsinline preload="metadata"></video></div>
      <div class="ic"><div class="ad">${esc(v.baslik)}</div><button class="dugme sari ince" data-ekle="${i}">Sıraya ekle</button></div></div>`).join('')}</div>` : '';
}
function hepsiniCiz() { saglikCiz(); siradakiCiz(); sonCiz(); hazirCiz(); siraCiz(); takvimCiz(); videolarCiz(); sonuclarCiz(); }

async function yukle() {
  try { O = await api('/api/ozet'); hepsiniCiz(); }
  catch (e) { document.querySelector('main').innerHTML = `<div class="liste-bos" style="margin-top:40px">${esc(e.message)}</div>`; return; }
  if (IG === null) igYukle();
}
async function igYukle(yenile) {
  try { IG = await api('/api/instagram' + (yenile ? '?yenile=1' : '')); }
  catch (e) { IG = { bagli: false, gonderiler: [] }; if (yenile) bildir(e.message, true); }
  if (O) { sonCiz(); takvimCiz(); sonuclarCiz(); }
}

// --- actions
function sekme(ad) { $$('#sekmeler button').forEach(b => b.classList.toggle('on', b.dataset.s === ad)); $$('.sayfa').forEach(s => s.classList.toggle('on', s.id === 's-' + ad)); try { sessionStorage.setItem('vm-s', ad); } catch {} }
async function islem(yol, govde, mesaj) { try { await api(yol, govde); bildir(mesaj); await yukle(); } catch (e) { bildir(e.message, true); } }

document.addEventListener('click', e => {
  const o = e.target.closest('.oynat');
  if (o) { const v = o.querySelector('video'); if (v) { $$('.oynat video').forEach(x => { if (x !== v && !x.paused) x.pause(); }); v.paused ? v.play() : v.pause(); } return; }
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.s) sekme(b.dataset.s);
  else if (b.dataset.git) sekme(b.dataset.git);
  else if (b.dataset.onayla) islem('/api/kuyruk/onayla', { id: b.dataset.onayla }, 'Onaylandı ✓');
  else if (b.dataset.iptal) { if (confirm('Bu video sıradan çıkarılsın mı?')) islem('/api/kuyruk/iptal', { id: b.dataset.iptal }, 'Sıradan çıkarıldı'); }
  else if (b.dataset.ekle) pencereAc(O.videolar[+b.dataset.ekle]);
  else if (b.dataset.m) { metrik = b.dataset.m; sonuclarCiz(); }
  else if (b.dataset.h) { ayKaydir += +b.dataset.h; takvimCiz(); }
  else if (b.id === 'yenile') { b.disabled = true; igYukle(true).finally(() => { b.disabled = false; bildir('Rakamlar güncellendi'); }); }
});
document.addEventListener('change', e => {
  const z = e.target.dataset && e.target.dataset.zaman;
  if (z && e.target.value) islem('/api/kuyruk/zaman', { id: z, zaman: e.target.value }, 'Saat değişti');
});

// add-to-queue dialog: the caption comes from the video, the time defaults to the next posting hour
let secili = null;
function sonrakiSaat() {
  const saatler = O.saatler.length ? O.saatler : ['19:00'], dolu = O.kuyruk.map(j => +new Date(j.ne_zaman));
  for (let g = 0; g < 30; g++) for (const s of saatler) {
    const [h, m] = s.split(':').map(Number), d = new Date(); d.setDate(d.getDate() + g); d.setHours(h, m, 0, 0);
    if (+d > Date.now() + 10 * 6e4 && !dolu.some(t => Math.abs(t - d) < 30 * 6e4)) return d;
  }
  return new Date(Date.now() + 36e5);
}
function pencereAc(v) {
  secili = v;
  $('#p-video').src = vsrc(v.yol);
  $('#p-aciklama').value = v.aciklama;
  $('#p-zaman').value = yerel(sonrakiSaat());
  $('#p-onay').checked = false;
  $('#p-ipucu').textContent = O.saglik.zamanlayici ? '' : 'Otomatik paylaşım kapalı: video sırada bekler ama kendiliğinden gitmez.';
  $('#pencere').showModal();
}
document.addEventListener('play', e => { const o = e.target.closest && e.target.closest('.oynat'); if (o) o.classList.add('calisiyor'); }, true);
document.addEventListener('pause', e => { const o = e.target.closest && e.target.closest('.oynat'); if (o) o.classList.remove('calisiyor'); }, true);
$('#pencere').addEventListener('close', async () => {
  $('#p-video').pause();
  if ($('#pencere').returnValue !== 'ekle' || !secili) return;
  await islem('/api/kuyruk/ekle', { mp4: secili.yol, aciklama: $('#p-aciklama').value, zaman: $('#p-zaman').value, onay_gerekli: $('#p-onay').checked }, 'Sıraya eklendi ✓');
  sekme('sira');
});

try { const s = new URLSearchParams(location.hash.slice(1)).get('s') || sessionStorage.getItem('vm-s'); if (s) sekme(s); } catch {}
if (!anahtar) document.querySelector('main').innerHTML = '<div class="liste-bos" style="margin-top:40px">Paneli terminaldeki linkle aç: <b>node panel/panel.js</b></div>';
else { yukle(); setInterval(yukle, 60e3); }
