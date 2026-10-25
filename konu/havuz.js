// Idea pool per channel: kanal/<kanal>/fikirler.json (+ fikirler.md and fikirler.html to skim).
// Status flow: yeni → secildi → uretiliyor → uretildi   (or reddedildi; insan-bekliyor when automation stops for a human)
const fs = require('fs'), path = require('path');
const O = require('./ortak');

const DURUMLAR = ['yeni', 'secildi', 'uretiliyor', 'insan-bekliyor', 'uretildi', 'reddedildi'];
const havuzF = ctx => path.join(ctx.dir, 'fikirler.json');
const havuzOku = ctx => O.okuJson(havuzF(ctx), { kanal: ctx.kanal, guncelleme: null, fikirler: [], ham_konular: [] });
function havuzYaz(ctx, h) { h.guncelleme = O.simdi().toISOString(); O.yazJson(havuzF(ctx), h); raporYaz(ctx, h); }

// Same idea twice: similar title (word overlap) or a shared source link. Rejected ideas stay rejected.
// Words of the channel's running series ("Evrendeki bütün oksijen yok olursa … ne olur?") are ignored, otherwise
// every episode of the series looks like the same idea.
function esiniBul(h, fikir, seri = []) {
  const ayir = new Set(seri);
  const benz = (a, b) => O.benzerlik(O.kelimeler(a).filter(w => !ayir.has(w)).join(' '), O.kelimeler(b).filter(w => !ayir.has(w)).join(' '));
  const linkler = new Set((fikir.kaynaklar || []).map(k => k.url));
  return h.fikirler.find(f => benz(f.baslik, fikir.baslik) >= 0.5 || (f.kaynaklar || []).some(k => linkler.has(k.url)) && benz(f.baslik, fikir.baslik) >= 0.3);
}

// Adds or merges; returns {eklenen, birlesen}
function fikirEkle(h, yeniler, { seri = [] } = {}) {
  let eklenen = 0, birlesen = 0;
  for (const f of yeniler) {
    const es = esiniBul(h, f, seri);
    if (es) {
      const var_ = new Set(es.kaynaklar.map(k => k.url));
      for (const k of f.kaynaklar) if (!var_.has(k.url)) es.kaynaklar.push(k);
      if (es.durum === 'yeni' && f.puan > es.puan) Object.assign(es, { puan: f.puan, puan_detay: f.puan_detay });
      es.guncelleme = O.simdi().toISOString(); es.gorulme = (es.gorulme || 1) + 1;
      birlesen++;
    } else {
      f.id = 'f-' + O.kisaHash(O.norm(f.baslik) + f.olusturma);
      h.fikirler.push(f); eklenen++;
    }
  }
  return { eklenen, birlesen };
}

function fikirBul(h, id) {
  const tam = h.fikirler.find(x => x.id === id);
  if (tam) return tam;
  const on = h.fikirler.filter(x => id && x.id.startsWith(id));     // a unique prefix is enough
  if (on.length === 1) return on[0];
  O.hata(`"${id}" kimlikli fikir ${on.length ? 'birden çok fikirle eşleşiyor' : 'yok'}. Liste: node konu/radar.js fikirler ${h.kanal}`);
}
function durumYap(h, id, durum, not) {
  if (!DURUMLAR.includes(durum)) O.hata('bilinmeyen durum: ' + durum);
  const f = fikirBul(h, id);
  f.durum = durum; f.guncelleme = O.simdi().toISOString();
  if (not) (f.notlar = f.notlar || []).push({ zaman: f.guncelleme, not });
  return f;
}

const SIRA = { 'insan-bekliyor': 0, secildi: 1, uretiliyor: 2, yeni: 3, uretildi: 4, reddedildi: 5 };
const sirala = fs_ => [...fs_].sort((a, b) => (SIRA[a.durum] - SIRA[b.durum]) || (b.puan - a.puan));

// ---- readable summaries
function md(ctx, h) {
  const s = [`# ${ctx.kimlik.hesap || ctx.kanal}: video fikirleri`, '', `Son güncelleme: ${h.guncelleme}. Puan 10 üzerinden: kanala uyum, merak, bilginin doğrulanabilirliği, tazelik, kaynaktaki ilgi.`, '',
    'Bir fikri seçmek: `node konu/radar.js sec ' + ctx.kanal + ' <id>` · üretmek: `node konu/radar.js uret ' + ctx.kanal + ' <id>` · reddetmek: `node konu/radar.js reddet ' + ctx.kanal + ' <id>`', ''];
  for (const f of sirala(h.fikirler).filter(f => f.durum !== 'reddedildi')) {
    const d = f.puan_detay || {};
    s.push(`## ${(f.puan ?? 0).toFixed(1)} · ${f.baslik}`, '', `\`${f.id}\` · durum: **${f.durum}**${f.video ? ` · video: \`${f.video}\`` : ''}`, '',
      `Puan: uyum ${d.uyum} · merak ${d.merak} · doğrulanabilirlik ${d.dogrulanabilirlik} · tazelik ${d.tazelik} · ilgi ${d.etkilesim}`, '',
      `**Öncül:** ${f.oncul}`, '', `**Kanca:** ${f.kanca}`, '', '**Tırmanış:**');
    (f.tirmanis || []).forEach((t, i) => s.push(`${i + 1}. ${t.olay} _(doğrulanacak: ${t.dogrulanacak_bilgi})_`));
    s.push('', `**Kapanış:** ${f.kapanis}`, '', `**Neden uyar:** ${f.neden_uyar}`, '', '**Kaynaklar:** ' + f.kaynaklar.map(k => `[${k.kaynak}: ${k.baslik.slice(0, 60)}](${k.url})`).join(' · '), '');
    for (const n of f.notlar || []) s.push(`> ${n.zaman.slice(0, 16)} ${n.not}`, '');
  }
  if ((h.ham_konular || []).length) {
    s.push('## Ham konular (yapay zekâya gönderilmedi)', '', 'Bu kaynak için yapay zekâ kapalı (konu.json → llm_e_gonder: false). Göz at; ilginç olanı elle fikre çevir.', '');
    for (const k of h.ham_konular) s.push(`- [${k.baslik}](${k.url}) · ${k.alt}${k.metrikler.entry_bugun != null ? ` · bugün ${k.metrikler.entry_bugun} entry` : ''} · ön puan ${k.on_puan}`);
    s.push('');
  }
  const red = h.fikirler.filter(f => f.durum === 'reddedildi');
  if (red.length) s.push(`_${red.length} reddedilmiş fikir listede gizli (fikirler.json içinde duruyor)._`, '');
  return s.join('\n');
}

const kac = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function html(ctx, h) {
  const R = ctx.kimlik.renkler || {}, kart = [];
  for (const f of sirala(h.fikirler).filter(f => f.durum !== 'reddedildi')) {
    const d = f.puan_detay || {};
    kart.push(`<article class="k ${f.durum}"><header><b class="p">${(f.puan ?? 0).toFixed(1)}</b><h2>${kac(f.baslik)}</h2></header>
<p class="m"><code>${f.id}</code> · <span class="d">${f.durum}</span> · uyum ${d.uyum} · merak ${d.merak} · doğrulanabilirlik ${d.dogrulanabilirlik} · tazelik ${d.tazelik} · ilgi ${d.etkilesim}</p>
<p><b>Öncül:</b> ${kac(f.oncul)}</p><p><b>Kanca:</b> ${kac(f.kanca)}</p><ol>${(f.tirmanis || []).map(t => `<li>${kac(t.olay)} <i>doğrulanacak: ${kac(t.dogrulanacak_bilgi)}</i></li>`).join('')}</ol>
<p><b>Kapanış:</b> ${kac(f.kapanis)}</p><p><b>Neden uyar:</b> ${kac(f.neden_uyar)}</p>
<p class="s">${f.kaynaklar.map(k => `<a href="${kac(k.url)}">${kac(k.kaynak)}: ${kac(k.baslik.slice(0, 70))}</a>`).join(' · ')}</p></article>`);
  }
  const ham = (h.ham_konular || []).map(k => `<li><a href="${kac(k.url)}">${kac(k.baslik)}</a> <small>${kac(k.alt)}${k.metrikler.entry_bugun != null ? ` · bugün ${k.metrikler.entry_bugun} entry` : ''}</small></li>`).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${kac(ctx.kimlik.hesap || ctx.kanal)} fikirler</title><style>
:root{--z:${R.paper || '#F4EEDF'};--y:${R.ink || '#1F2A30'};--v:${R.coral || '#E8553A'};--m:${R.o2 || '#1FA9BE'}}
body{margin:0;background:var(--z);color:var(--y);font:16px/1.5 system-ui,sans-serif}main{max-width:860px;margin:auto;padding:24px 16px}
h1{margin:0 0 4px}.k{background:#fff;border-radius:14px;padding:16px 18px;margin:14px 0;box-shadow:0 4px 14px rgba(0,0,0,.06)}
.k header{display:flex;gap:12px;align-items:baseline}.k h2{font-size:19px;margin:0}.p{font-size:26px;color:var(--v)}
.m{font-size:13px;opacity:.75}.d{font-weight:700;color:var(--m)}.insan-bekliyor .d{color:var(--v)}.s{font-size:13px}.s a{color:var(--m)}i{opacity:.7;font-size:14px}
ul.h{columns:2;font-size:14px}@media(max-width:600px){ul.h{columns:1}}</style></head><body><main>
<h1>${kac(ctx.kimlik.hesap || ctx.kanal)}: video fikirleri</h1><p class="m">Son güncelleme ${kac(h.guncelleme)}. Puan 10 üzerinden.</p>
${kart.join('\n')}
${ham ? `<h2>Ham konular (yapay zekâya gönderilmedi)</h2><p class="m">Bu kaynak için yapay zekâ kapalı (konu.json → llm_e_gonder: false). İlginç olanı elle fikre çevir.</p><ul class="h">${ham}</ul>` : ''}
</main></body></html>`;
}
function raporYaz(ctx, h) {
  fs.writeFileSync(path.join(ctx.dir, 'fikirler.md'), md(ctx, h));
  fs.writeFileSync(path.join(ctx.dir, 'fikirler.html'), html(ctx, h));
}

module.exports = { DURUMLAR, havuzOku, havuzYaz, fikirEkle, fikirBul, durumYap, sirala, raporYaz, esiniBul };
