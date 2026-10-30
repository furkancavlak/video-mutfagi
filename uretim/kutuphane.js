// Character library: approved recurring characters of a channel, reused instead of redrawn so a figure looks the same
// in every episode and story (adapted from ersinkoc/YoutubeStudio, with permission: packages/pipeline/src/library.ts).
// Lives in the channel kit (private): kanal/<kanal>/karakterler/karakterler.json + one sandboxed <id>.js per character.
//   karakterler.json: { karakterler: [{ id, ad, kanal, gorunum, dosya?, kullanim?, dizi?, onay, bolumler: [] }] }
//     dosya     <id>.js: module.exports = function ({ C, f, karakter }) { return function (o) { ...; return '<g>…</g>'; }; }
//               (its leading // comment is its manual: options, size, where the face is)
//     kullanim  a figure that already lives elsewhere (the narrator in cizim.js: "karakter.adam({...})"): no file
//     dizi      series id: the character belongs to that story only (a story's recurring person); empty = whole channel
//     onay      only approved characters are offered; bolumler lists the episode folders that used it
//   liste(kimlikDir, diziId)              -> the approved characters for this video
//   yukle(kimlikDir, diziId, { C, f, karakter })  -> { <id>: drawFn } handed to sahneler.js as `kutuphane`
//   istemMetni(kimlikDir, diziId)         -> the scene writer's section (identity + manual of each)
//   kullanimEkle(kimlikDir, ids, bolum)   -> notes the episode on each character used
const fs = require('fs'), path = require('path');

const ID = /^[a-z0-9_]{1,40}$/;
const dosyaYolu = kimlikDir => path.join(kimlikDir, 'karakterler', 'karakterler.json');
function oku(kimlikDir) {
  try { const j = JSON.parse(fs.readFileSync(dosyaYolu(kimlikDir), 'utf8').replace(/^﻿/, '')); return Array.isArray(j.karakterler) ? j : { karakterler: [] }; }
  catch (e) { return { karakterler: [] }; }
}
const liste = (kimlikDir, diziId) => kimlikDir ? oku(kimlikDir).karakterler.filter(k => k && ID.test(k.id || '') && k.onay === true && (!k.dizi || k.dizi === diziId)) : [];
const basYorum = f => { const out = []; for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (!l.startsWith('//')) break; out.push(l.replace(/^\/\/ ?/, '')); } return out.join('\n'); };

function yukle(kimlikDir, diziId, { C, f, karakter } = {}) {
  const { guvenliYukle } = require('./cekirdek');
  const out = {};
  for (const k of liste(kimlikDir, diziId)) {
    if (!k.dosya) continue;
    const yol = path.join(kimlikDir, 'karakterler', path.basename(k.dosya));
    if (!fs.existsSync(yol)) continue;
    out[k.id] = guvenliYukle(yol)({ C, f, karakter });
  }
  return out;
}

function istemMetni(kimlikDir, diziId) {
  const l = liste(kimlikDir, diziId);
  if (!l.length) return 'Bu kanalın kütüphanesinde hazır karakter yok.';
  return l.map(k => {
    const yol = k.dosya ? path.join(kimlikDir, 'karakterler', path.basename(k.dosya)) : null;
    const nasil = k.dosya ? `kutuphane.${k.id}({ ... })` : (k.kullanim || '(kullanım yazılmamış)');
    const kim = k.dizi ? 'bu hikâyenin tekrar eden kişisi' : 'kanalın her videosunda';
    return `### ${k.ad} (${kim}): ${nasil}\nGörünüm: ${k.gorunum || ''}${yol && fs.existsSync(yol) ? `\n${basYorum(yol)}` : ''}`;
  }).join('\n\n');
}

// sahneler.js code -> ids of library characters it calls (kutuphane.<id>( or the narrator's own call)
const kullanilanlar = (kod, l) => l.filter(k => (k.dosya && new RegExp(`kutuphane\\.${k.id}\\s*\\(`).test(kod)) || (!k.dosya && k.kullanim && kod.includes(k.kullanim.split('(')[0]))).map(k => k.id);

function kullanimEkle(kimlikDir, ids, bolum) {
  if (!ids.length) return;
  const j = oku(kimlikDir);
  let degisti = false;
  for (const k of j.karakterler) if (ids.includes(k.id) && !(k.bolumler || []).includes(bolum)) { k.bolumler = [...(k.bolumler || []), bolum]; degisti = true; }
  if (degisti) fs.writeFileSync(dosyaYolu(kimlikDir), JSON.stringify(j, null, 2) + '\n');
}

module.exports = { liste, yukle, istemMetni, kullanilanlar, kullanimEkle, oku };
