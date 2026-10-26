// FREE-tier template "simulasyon": one cross-section world (sky / coast with forest and town / sea down to the seabed)
// whose state is driven by data, so a language model can fill a video without writing code.
// Data: <video>/simulasyon.json
//   {
//     "zaman_cetveli": ["BUGÜN", "1 GÜN", "1 YIL", "100 YIL", "1000 YIL"],
//     "baslangic": { ...state... },
//     "adimlar": [ { "an": "kelime:balıklar@1", "yil": "1 GÜN", "odak": "deniz", "tabela": "BALIKLAR YÜZEYDE",
//                    "buyuk": "1 GÜN SONRA", "durum": { "deniz_o2": 40, "balik": 0.4, ... } } ]
//   }
// State knobs (any subset per step; unspecified ones keep their value):
//   deniz_o2, hava_o2 (0-100, shown as a draining bar + NORMAL / AZALIYOR / YOK; no made-up percentages on screen)
//   balik, plankton, mercan, orman, kus, kasaba (0-1) · gaz (0-1 sulphur bubbles + haze)
//   camur (0-1 the beach turns to black mud) · bakteri (0-1 purple bacteria mat on the seabed)
//   deniz_renk, gok_renk (preset name or #hex)
// odak (where the camera goes): genel | gok | kiyi | yuzey | deniz | dip. Between steps the camera keeps creeping in,
// so no shot is ever frozen. Signs are placed automatically where the camera looks; the old sign fades on every step.
// Recurring character (the script's absurd running gag), optional:
//   top level  "kahraman": { "ad": "HAMSİ CEMİL", "tur": "balik", "renk": "#9FB7C9", "bant": "#E8553A" }
//   per step   "kahraman": { "yer": "deniz|yuzey|kiyi|balkon|kara|dip", "yazi": "DİLEKÇE VERDİM" }  (yazi <= 18 chars, speech bubble)
//   A step with kahraman and no odak sends the camera to him. He stays hidden until his first step.
//   "yer": "esya" seats him in the step's prop (see props below).
// Props ("eşya"): every joke of the script gets its own object on screen, so the joke is shown, not only said.
// Drawings and entrances live in uretim/sablonlar/esya.js. Optional, per step:
//   "esya": { "ad": "dolmus", "yazi": "BELEDİYE DOLMUŞU" }      or two: [ { "ad": "fabrika" }, { "ad": "damga", "yazi": "KAPANDI", "an": "kelime:kapandı@4" } ]
//   ad    stands on the ground: dolmus (yellow minibus, drives in) · fabrika (chimney, facade sign; stamped: shutter comes down)
//           apartman (block with a balcony) · belediye (town hall) · pano (notice board) · kalabalik (protest crowd with a placard;
//           "nesne": "balik" makes it a crowd of fish)
//         floats on the sea: tekne (fishing boat, name on the hull, sails in)
//         hangs in the shot: kagit (petition / letter, title on top) · damga (rubber stamp) · burun (big nose + smell: stink jokes)
//           telefon (phone + notification) · para (banknotes + tag) · fis (receipt that prints, text = its total) · megafon
//           (announcement) · cay (tea glass; "bosal": true drains it and the steam flies off)
//         rains over the shot: balik-yagmuru, para-yagmuru, kagit-yagmuru
//         (also understood: dilekce, mektup, belge → kagit · araba, otobus → dolmus · ev, bina, balkon → apartman · kayik → tekne ·
//          bardak → cay · tabela, afis, ilan → pano · koku → burun · anons → megafon · fatura, makbuz → fis · muhur → damga)
//   yazi  the short text it carries (roof plate, title, stamp, notification, placard...): BÜYÜK HARF, <= 16 chars, optional
//   yer   genel|gok|kiyi|yuzey|deniz|dip: where it stands (default: the step's odak, else where the camera is). The camera
//         goes to the prop. Ground props stand on the land (kiyi) or the seabed (deniz, dip); asked for genel/gok/yuzey they
//         go to kiyi. The boat floats on open water (gok, yuzey; elsewhere it goes to yuzey). Hanging props go anywhere.
//   an    its own time (the stamp lands on a later word); default: the step's an
//   A second prop (a damga, usually) lands on the first one, clear of the first one's text.
//   Placement is automatic: the prop keeps clear of the sign, the gauges, the character and his bubble, the ruler and the
//   captions. It enters on its word and leaves on the next step that brings a prop, a sign, a camera move or the character
//   (vehicles drive off, buildings sink, the rest fades); the last props stay through the closing wide shot. Give each one
//   >= 2 s. A ground prop in the little town hides the houses it covers until it leaves.
//   The character sits in it with "kahraman": { "yer": "esya", "yazi": "..." } (seats: dolmus window, tekne wheelhouse,
//   apartman balcony, belediye door, fabrika door); his bubble goes above the prop or beside it.
// Rules followed (dersler/KURGU-DILI.md): light ground, one world, text lives on objects (buoy, station, sign),
// the camera travels to the information, ambient motion is slow, no shake.
const fs = require('fs'), path = require('path');
const E = require('./esya');

const DENIZ = { mavi: ['#5FB3D4', '#1F6F96', '#0E3E5C'], yesil: ['#6FB8A0', '#2F7C6A', '#18493F'], mor: ['#9C7CB8', '#5E3F86', '#2E1C4A'], kahve: ['#A99A72', '#6B5B3A', '#3A3020'], soluk: ['#9CC3CF', '#5D8A99', '#33525C'] };
const GOK = { mavi: ['#8FD0EA', '#E8F5F8'], soluk: ['#C9D9DC', '#F1F1EA'], sari: ['#D9D69A', '#F3EFD2'], mor: ['#B9A3CF', '#EFE6F3'], gri: ['#B8BCBC', '#E9E7E1'] };
const seviye = v => (v >= 95 ? 'NORMAL' : v > 0 ? 'AZALIYOR' : 'YOK');
const karis = (a, b, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - k) + parseInt(b.substr(i, 2), 16) * k).toString(16).padStart(2, '0')).join('');
// where the recurring character stands (world coords) and which camera preset shows him
// [x, y, camera, bubble x offset]; spots and offsets checked so he, his bubble, the sign and the gauges never overlap
const KAHRAMAN_YER = { deniz: [700, 1050, 'deniz', 0], yuzey: [540, 615, 'yuzey', 0], kiyi: [360, 600, 'kiyi', -100], balkon: [277, 512, 'kiyi', 80], kara: [250, 545, 'kiyi', 110], dip: [680, 1380, 'dip', 0] };
// sign centre on SCREEN per camera preset (the sign is scaled against the zoom, so it always reads the same size)
const TABELA_EKRAN = { genel: [700, 560, ''], gok: [720, 600, ''], kiyi: [820, 520, ''], yuzey: [330, 540, ''], deniz: [620, 1100, '2'], dip: [760, 640, '2'] };
// props: which ground each shot shows ('kara' = land top, 'dip' = seabed); shots without ground send ground props elsewhere
// (genel is the wide establishing shot: its ground is too far away for a hero prop, so ground props go to kiyi)
const ESYA_ZEMIN = { kiyi: ['kara'], deniz: ['dip'], dip: ['dip'] };
const ESYA_YEDEK = { zemin: { genel: 'kiyi', gok: 'kiyi', yuzey: 'kiyi' }, su: { genel: 'yuzey', kiyi: 'yuzey', deniz: 'yuzey', dip: 'yuzey' } };
// where a floating prop would ideally hang on SCREEN per shot (free sky or open water); the final spot is searched around it
const ESYA_TERCIH = { genel: [700, 1100], gok: [540, 900], kiyi: [600, 760], yuzey: [540, 700], deniz: [760, 800], dip: [380, 740] };
// screen pixels per prop unit: props read about the same size in every shot (the coast is cramped between the
// weather station and the sign post, so its props are a little smaller; their text still reads >= 36 px)
const ESYA_EKRAN = { kiyi: 1.15 }, ESYA_EKRAN_V = 1.4;
// a point on a quadratic curve at x (x is monotonic on every ground curve of this world)
const qY = (p0, p1, p2, x) => { let a = 0, b = 1; for (let i = 0; i < 30; i++) { const m = (a + b) / 2, xm = (1 - m) ** 2 * p0[0] + 2 * m * (1 - m) * p1[0] + m * m * p2[0]; if (xm < x) a = m; else b = m; } const t = (a + b) / 2; return (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1]; };
const renk = (v, tablo, d) => Array.isArray(v) ? v : (tablo[v] || (typeof v === 'string' && v.startsWith('#') ? [v, v, v] : tablo[d]));

module.exports = function ({ C: C0, T, at, f, r2, W, H, dir }) {
  const veri = JSON.parse(fs.readFileSync(path.join(dir, 'simulasyon.json'), 'utf8'));
  const C = Object.assign({ sand: '#E7D3A6', sand2: '#CDB27B', soil: '#B98F5E', soil2: '#8E6B45', leaf: '#5E9B54', leaf2: '#3F7A3E', dry: '#A98446', trunk: '#7A5638', wall: '#F2E8D5', roof: '#C9553A', fish: '#F2A541', fish2: '#E8553A', coral: '#E8735A', coral2: '#F2A0A0', bleach: '#EDE8DC', alu: '#BCC6CC', alu2: '#8E9AA2', bub: '#D8E36A' }, C0);
  const { cue, ifade, L, END } = T;
  const tl = [];
  const SY = 640;                      // sea surface y (world coords)
  const st = Object.assign({ deniz_o2: 100, hava_o2: 100, balik: 1, plankton: 1, mercan: 1, orman: 1, kus: 1, kasaba: 1, gaz: 0, deniz_renk: 'mavi', gok_renk: 'mavi' }, veri.baslangic || {});
  const ilkDeniz = renk(st.deniz_renk, DENIZ, 'mavi'), ilkGok = renk(st.gok_renk, GOK, 'mavi');

  // ---------- static world
  const defs = `<defs>
    <linearGradient id="gokG" x1="0" y1="0" x2="0" y2="1"><stop id="gok0" offset="0" stop-color="${ilkGok[0]}"/><stop id="gok1" offset="1" stop-color="${ilkGok[1]}"/></linearGradient>
    <linearGradient id="denizG" x1="0" y1="0" x2="0" y2="1"><stop id="dz0" offset="0" stop-color="${ilkDeniz[0]}"/><stop id="dz1" offset=".55" stop-color="${ilkDeniz[1]}"/><stop id="dz2" offset="1" stop-color="${ilkDeniz[2]}"/></linearGradient>
    <linearGradient id="isikG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="vig" cx="50%" cy="45%" r="75%"><stop offset="65%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#2A2116" stop-opacity=".22"/></radialGradient>
    <clipPath id="suC"><path d="M330 ${SY} L 1400 ${SY} L 1400 2300 L 330 2300 Z"/></clipPath>
  </defs>`;
  // sky, sun, clouds
  const bulut = (x, y, s, cls) => `<g class="${cls}" transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="80" ry="36" fill="#fff"/><ellipse cx="60" cy="-22" rx="64" ry="44" fill="#fff"/><ellipse cx="120" cy="0" rx="70" ry="32" fill="#fff"/></g>`;
  let w = `<rect x="-400" y="-400" width="2000" height="${SY + 400}" fill="url(#gokG)"/>
    <circle cx="900" cy="440" r="70" fill="#FFE7A0"/><circle cx="900" cy="440" r="100" fill="#FFE7A0" opacity=".25"/>
    <g id="bulutlar">${bulut(40, 420, .9, 'bl')}${bulut(560, 380, .7, 'bl')}${bulut(300, 500, .6, 'bl')}</g>
    <rect class="pus" x="-400" y="-400" width="2000" height="${SY + 460}" fill="${C.bub}" opacity="0"/>`;
  // land (left): hill, forest, town, weather station, sign; beach slope into the sea
  // (drawn after the sea so the underwater slope reads as seabed)
  const camurK = `<path id="camurK" opacity="0" d="M250 ${SY - 26} Q 360 ${SY - 44} 440 ${SY - 6} Q 480 ${SY + 10} 560 ${SY + 34} Q 470 ${SY + 46} 380 ${SY + 20} Q 300 ${SY + 4} 250 ${SY - 4} Z" fill="#2E2A24"/>`;
  const kara = `<path d="M-400 ${SY - 70} Q 120 ${SY - 150} 300 ${SY - 30} Q 380 ${SY - 5} 430 ${SY + 25} Q 500 ${SY + 220} 540 ${SY + 700} L 560 2400 L -400 2400 Z" fill="${C.soil}"/>
    <path d="M-400 ${SY - 70} Q 120 ${SY - 150} 300 ${SY - 30} L 300 ${SY - 10} L -400 ${SY - 10} Z" fill="${C.leaf}" opacity=".9"/>
    <path d="M300 ${SY - 30} Q 380 ${SY - 5} 430 ${SY + 25} Q 500 ${SY + 220} 540 ${SY + 700} L 505 ${SY + 700} Q 470 ${SY + 230} 400 ${SY + 25} Q 350 ${SY + 2} 290 ${SY - 12} Z" id="kumsal" fill="${C.sand}"/>
    <path d="M-400 ${SY + 160} Q 200 ${SY + 200} 470 ${SY + 160} Q 520 ${SY + 480} 550 ${SY + 1000} L 560 2400 L -400 2400 Z" fill="${C.soil2}" opacity=".5"/>`;
  const agaclar = Array.from({ length: 9 }, (_, i) => ({ x: -60 + i * 38 + r2(-8, 8), y: SY - 95 + Math.abs(i - 4) * 9 + r2(-6, 6), s: r2(.8, 1.15) }));
  w += agaclar.map((a, i) => `<g class="agac agac${i}" data-x="${f(a.x)}" data-y="${f(a.y + 40 * a.s)}"><rect x="${f(a.x - 5)}" y="${f(a.y)}" width="10" height="${f(40 * a.s)}" fill="${C.trunk}"/><circle class="yaprak" cx="${f(a.x)}" cy="${f(a.y - 6)}" r="${f(26 * a.s)}" fill="${i % 2 ? C.leaf : C.leaf2}"/></g>`).join('');
  const evler = [[150, SY - 118], [205, SY - 104], [255, SY - 84]];
  w += evler.map(([x, y], i) => `<g class="ev" id="ev${i}"><rect x="${x}" y="${y}" width="44" height="34" fill="${C.wall}" stroke="#D9CBB0" stroke-width="2"/><path d="M${x - 4} ${y} L ${x + 22} ${y - 20} L ${x + 48} ${y} Z" fill="${C.roof}"/><rect class="pencere" x="${x + 15}" y="${y + 11}" width="14" height="12" fill="#FFD66B"/></g>`).join('');
  // weather station (air O2)
  // gauges show a draining bar and a word, never a number the script did not say
  // layout inside a 168x92 screen centred at y=-8: label, bar, word
  const gosterge = (id, ad, deger) => `<text x="0" y="-24" text-anchor="middle" font-family="AntonTR" font-size="24" letter-spacing="1" fill="#9FD3DD">${ad}</text>
    <rect x="-70" y="-14" width="140" height="12" rx="4" fill="#0B2530"/><rect id="${id}Bar" x="-70" y="-14" width="${f(140 * deger / 100)}" height="12" rx="4" fill="#5FE0F0"/>
    <text id="${id}Yazi" x="0" y="34" text-anchor="middle" font-family="AntonTR" font-size="36" fill="#5FE0F0">${seviye(deger)}</text>`;
  w += `<g id="istasyon" transform="translate(0 ${SY - 250})"><rect x="-3" y="40" width="6" height="140" fill="${C.alu2}"/><rect x="-92" y="-62" width="184" height="108" rx="10" fill="${C.ink}"/><rect x="-84" y="-54" width="168" height="92" rx="6" fill="#10343F"/>
    ${gosterge('hava', 'HAVADA O₂', st.hava_o2)}</g>`;
  // the sea (right), with light rays, plankton, fish, corals, seabed, bubbles
  w += `<g clip-path="url(#suC)"><rect x="330" y="${SY}" width="1070" height="${2300 - SY}" fill="url(#denizG)"/>
    ${[0, 1, 2].map(i => `<path class="isin" d="M${560 + i * 170} ${SY} L ${640 + i * 170} ${SY} L ${520 + i * 170} 1300 L ${470 + i * 170} 1300 Z" fill="url(#isikG)"/>`).join('')}`;
  const plk = Array.from({ length: 60 }, () => ({ x: r2(440, 1060), y: r2(SY + 30, SY + 420), r: r2(2.5, 5) }));
  w += plk.map((p, i) => `<circle class="plk plk${i}" cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r)}" fill="#BFE8A6" opacity=".85"/>`).join('');
  const baliklar = Array.from({ length: 20 }, (_, i) => ({ x: r2(470, 1020), y: r2(SY + 110, 1300), s: r2(.7, 1.3), yon: i % 3 ? 1 : -1, k: i % 2 }));
  const balikSvg = (b, i) => `<g class="balikD bd${i}"><g class="balik balik${i}" transform="translate(${f(b.x)} ${f(b.y)}) scale(${f(b.s * b.yon)} ${f(b.s)})"><ellipse cx="0" cy="0" rx="22" ry="11" fill="${b.k ? C.fish : C.fish2}"/><path d="M-20 0 L -36 -11 L -36 11 Z" fill="${b.k ? C.fish : C.fish2}"/><circle cx="10" cy="-3" r="2.6" fill="${C.ink}"/></g></g>`;
  w += baliklar.map(balikSvg).join('');
  w += `<path d="M330 1420 Q 600 1380 760 1430 Q 920 1470 1100 1410 Q 1250 1380 1400 1420 L 1400 2300 L 330 2300 Z" fill="${C.sand2}"/>
    <path d="M330 1560 Q 700 1530 1000 1570 Q 1200 1590 1400 1560 L 1400 2300 L 330 2300 Z" fill="${C.soil2}" opacity=".45"/>`;
  w += `<g id="bakteri" opacity="0"><path d="M330 1416 Q 600 1376 760 1426 Q 920 1466 1100 1406 Q 1250 1376 1400 1416 L 1400 1446 Q 1250 1410 1100 1438 Q 920 1498 760 1458 Q 600 1408 330 1446 Z" fill="#B65CC9"/>
    ${Array.from({ length: 14 }, (_, i) => `<ellipse cx="${f(360 + i * 76 + r2(-14, 14))}" cy="${f(1416 + Math.sin(i * 1.3) * 18)}" rx="${f(r2(16, 30))}" ry="${f(r2(8, 13))}" fill="#D58BE3"/>`).join('')}</g>`;
  const mercanlar = [[600, 1420], [700, 1438], [830, 1442], [930, 1428], [1020, 1414], [530, 1410]];
  w += mercanlar.map(([x, y], i) => `<g class="mercanG"><path class="mercan mercan${i}" d="M${x} ${y} q -18 -40 -6 -70 q 8 22 10 40 q 6 -40 22 -58 q 4 36 -4 60 q 18 -16 30 -18 q -8 30 -26 46 Z" fill="${i % 2 ? C.coral : C.coral2}"/></g>`).join('');
  const kabarcik = Array.from({ length: 24 }, () => ({ x: r2(480, 1050), y: r2(1380, 1440), r: r2(5, 11) }));
  w += kabarcik.map((b, i) => `<circle class="kab kab${i}" cx="${f(b.x)}" cy="${f(b.y)}" r="${f(b.r)}" fill="${C.bub}" opacity="0"/>`).join('');
  w += `</g>` + kara + camurK + Array.from({ length: 7 }, (_, i) => `<g class="kiyiOlu" opacity="0" transform="translate(${300 + i * 26} ${f(SY - 30 + i * 6)}) rotate(${(i % 3 - 1) * 14}) scale(.9)"><ellipse cx="0" cy="0" rx="20" ry="9" fill="#C9C2B4"/><path d="M-18 0 L -30 -9 L -30 9 Z" fill="#C9C2B4"/><path d="M6 -5 l5 5 m0 -5 l-5 5" stroke="${C.ink}" stroke-width="2"/></g>`).join('');
  // surface: waves, buoy (sea O2), dead fish floating
  w += `<path id="dalga" d="M330 ${SY} ${Array.from({ length: 20 }, (_, i) => `q 30 -10 60 0`).join(' ')} L 1530 ${SY + 6} L 330 ${SY + 6} Z" fill="${ilkDeniz[0]}"/>
    <g id="samandira" transform="translate(760 ${SY - 10})"><g id="samIc"><path d="M-40 10 L 40 10 L 30 50 L -30 50 Z" fill="${C.coral}"/><rect x="-4" y="-90" width="8" height="100" fill="${C.alu2}"/>
      <rect x="-92" y="-196" width="184" height="108" rx="12" fill="${C.ink}"/><rect x="-84" y="-188" width="168" height="92" rx="7" fill="#10343F"/>
      <g transform="translate(0 -134)">${gosterge('deniz', 'DENİZDE O₂', st.deniz_o2)}</g></g></g>`;
  const olu = baliklar.map((b, i) => ({ x: 470 + (i * 37) % 820, i }));
  w += olu.map(o => `<g class="olu olu${o.i}" opacity="0" transform="translate(${o.x} ${SY + 2}) scale(1.15 -1.15)"><ellipse cx="0" cy="0" rx="22" ry="10" fill="#C9C2B4"/><path d="M-20 0 L -34 -10 L -34 10 Z" fill="#C9C2B4"/><path d="M8 -6 l6 6 m0 -6 l-6 6" stroke="${C.ink}" stroke-width="2"/></g>`).join('');
  // birds
  w += `<g id="kuslar">${[0, 1, 2, 3, 4].map(i => `<path class="kus kus${i}" d="M${60 + i * 70} ${430 + (i % 2) * 40} q 12 -12 24 0 q 12 -12 24 0" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>`).join('')}</g>`;
  w += '<!--ESYA-->';
  // shore sign (the per-step headline lives on it)
  // (both signs are moved to TABELA_EKRAN spots per step; the outer group carries the move, the inner one the drawing)
  w += `<g id="tabela" opacity="0"><g id="tabelaS"><rect x="-6" y="40" width="12" height="150" fill="${C.trunk}"/><rect id="tabelaK" x="-160" y="-50" width="320" height="96" rx="10" fill="#F4EEDF" stroke="${C.trunk}" stroke-width="6"/><text id="tabelaYazi" x="0" y="13" text-anchor="middle" font-family="AntonTR" font-size="40" fill="${C.ink}"></text></g></g>`;
  w += `<g id="tabela2" opacity="0"><g id="tabela2S"><rect x="-6" y="40" width="12" height="150" fill="${C.alu2}"/><rect id="tabela2K" x="-160" y="-50" width="320" height="96" rx="10" fill="#F4EEDF" stroke="${C.alu2}" stroke-width="6"/><text id="tabela2Yazi" x="0" y="13" text-anchor="middle" font-family="AntonTR" font-size="40" fill="${C.ink}"></text></g></g>`;
  // the recurring character (a fish with a headband) and his speech bubble
  const K = veri.kahraman || null;
  if (K) {
    const govde = K.renk || '#9FB7C9', bant = K.bant || C.coral;
    w += `<g id="kahD" opacity="0"><g id="kahS"><g id="kahIc">
      <path d="M-44 0 L -76 -26 L -68 0 L -76 26 Z" fill="${karis(govde, '#000000', .2)}"/>
      <ellipse cx="0" cy="0" rx="50" ry="25" fill="${govde}"/><ellipse cx="6" cy="9" rx="36" ry="11" fill="#E4ECF1"/>
      <path d="M-6 -24 Q 4 -40 18 -24 Z" fill="${karis(govde, '#000000', .2)}"/>
      <path d="M14 -24 L 26 -23 L 25 24 L 13 23 Z" fill="${bant}"/><path d="M15 -20 L -2 -38 L 4 -18 Z M15 -18 L 0 -10 L 14 -10 Z" fill="${bant}"/>
      <circle cx="34" cy="-6" r="9" fill="#fff"/><circle cx="36" cy="-6" r="4.5" fill="${C.ink}"/>
      <path d="M48 8 Q 42 13 36 8" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/></g></g>
      <g id="kahBalon" opacity="0"><g id="kahBalonS"><g id="kahBalonIc"><rect id="kahBalonK" x="-120" y="-138" width="240" height="64" rx="16" fill="#fff" stroke="${C.ink}" stroke-width="4"/>
      <text id="kahYazi" x="0" y="-94" text-anchor="middle" font-family="AntonTR" font-size="34" fill="${C.ink}"></text></g><path id="kahKuyruk" d="M-8 -77 L 8 -77 L 0 -50 Z" fill="${C.ink}"/></g></g></g>`;
  }

  // time ruler (top, outside the camera so it stays put)
  const cetvel = veri.zaman_cetveli || ['BUGÜN', '1 GÜN', '1 YIL', '100 YIL', '1000 YIL'];
  const cx = i => 120 + i * (840 / (cetvel.length - 1));
  // a soft paper band behind the corner tag and the ruler, so world objects never collide with them
  const ustBant = `<linearGradient id="ustG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.paper}" stop-opacity=".95"/><stop offset=".75" stop-color="${C.paper}" stop-opacity=".85"/><stop offset="1" stop-color="${C.paper}" stop-opacity="0"/></linearGradient>
    <rect id="ustBant" width="${W}" height="380" fill="url(#ustG)" opacity="0"/>`;
  const ruler = `<g id="cetvel"><rect x="100" y="250" width="880" height="10" rx="5" fill="${C.ink}" opacity=".18"/><rect id="cetvelDolu" x="100" y="250" width="20" height="10" rx="5" fill="${C.coral}"/>
    ${cetvel.map((c, i) => `<circle cx="${cx(i)}" cy="255" r="11" fill="#F4EEDF" stroke="${C.ink}" stroke-width="4"/><text x="${cx(i)}" y="310" text-anchor="middle" font-family="AntonTR" font-size="38" fill="${C.ink}">${c}</text>`).join('')}
    <circle id="cetvelIsaret" cx="${cx(0)}" cy="255" r="18" fill="${C.coral}"/></g>`;

  // ---------- camera presets (world scale + offset so the region sits in the free middle of the frame)
  const NOKTA = { genel: [1, 440, 900], gok: [1.3, 560, 470], kiyi: [1.6, 200, 560], yuzey: [1.5, 640, 640], deniz: [1.35, 760, 1220], dip: [1.55, 780, 1380] };
  // the focus point lands at screen (540, 930); zoom > 1 is the slow creep between steps
  const kamera = (o, t, d = 1.6, zoom = 1, ease = 'power2.inOut') => {
    const [s0, wx, wy] = NOKTA[o] || NOKTA.genel, s = +(s0 * zoom).toFixed(4);
    const x = Math.round(-s * (wx - 540)), y = Math.round(30 - s * (wy - 900));
    tl.push(`tl.to('#dunya',{scale:${s},x:${x},y:${y},duration:${f(d)},ease:'${ease}'},${at(t)});`);
  };
  tl.push(`gsap.set('#dunya',{svgOrigin:'540 900',scale:1,x:0,y:0});`);

  // ---------- ambient life (slow, low contrast)
  tl.push(`tl.fromTo('#bulutlar',{x:-40},{x:120,duration:${at(END)},ease:'none'},0);`);
  tl.push(`tl.fromTo('#dalga',{x:0},{x:-60,duration:2.4,ease:'none',repeat:${Math.ceil(END / 2.4)}},0);`);
  tl.push(`tl.fromTo('#samIc',{y:0,rotation:-2},{y:6,rotation:2,transformOrigin:'50% 100%',duration:1.8,ease:'sine.inOut',yoyo:true,repeat:${Math.ceil(END / 1.8)}},0);`);
  baliklar.forEach((b, i) => tl.push(`tl.fromTo('.bd${i}',{x:0},{x:${f(b.yon * r2(30, 70))},duration:${f(r2(3, 5))},ease:'sine.inOut',yoyo:true,repeat:${Math.ceil(END / 3)}},${f(r2(0, 1))});`));
  tl.push(`tl.fromTo('.isin',{opacity:.6},{opacity:1,duration:2.5,ease:'sine.inOut',yoyo:true,repeat:${Math.ceil(END / 2.5)},stagger:.7},0);`);
  tl.push(`tl.fromTo('.kus',{y:0},{y:-10,duration:.6,ease:'sine.inOut',yoyo:true,repeat:${Math.ceil(END / .6)},stagger:.12},0);tl.fromTo('#kuslar',{x:-60},{x:260,duration:${at(END)},ease:'none'},0);`);
  kabarcik.forEach((b, i) => tl.push(`tl.fromTo('.kab${i}',{y:0},{y:${f(-r2(500, 760))},duration:${f(r2(3.5, 6))},ease:'none',repeat:${Math.ceil(END / 3.5)}},${f(r2(0, 3))});`));

  // ---------- state changes, each locked to its word
  const durumUygula = (d, t, dur = 1.6, akis = dur) => {      // akis: how long a gauge takes to drain (until the next step)
    for (const g of ['deniz', 'hava']) {
      const v = d[g + '_o2']; if (v == null) continue;
      const rk = v >= 95 ? '#5FE0F0' : v > 0 ? '#F2C14E' : C.coral;
      tl.push(`tl.to('#${g}Bar',{attr:{width:${f(140 * Math.max(0, Math.min(100, v)) / 100)},fill:'${rk}'},duration:${f(akis)},ease:'none'},${at(t)});tl.set('#${g}Yazi',{textContent:'${seviye(v)}'},${at(t)});tl.to('#${g}Yazi',{attr:{fill:'${rk}'},duration:.3},${at(t)});`);
    }
    if (d.camur != null) tl.push(`tl.to('#kumsal',{attr:{fill:'${karis(C.sand, '#2E2A24', Math.max(0, Math.min(1, d.camur)))}'},duration:${dur}},${at(t)});tl.to('#camurK',{opacity:${f(Math.max(0, Math.min(1, d.camur)))},duration:${dur}},${at(t)});`);
    if (d.bakteri != null) tl.push(`tl.to('#bakteri',{opacity:${f(Math.max(0, Math.min(1, d.bakteri)) * .95)},duration:${dur}},${at(t)});`);
    if (d.balik != null) {
      const n = Math.round(d.balik * baliklar.length);
      baliklar.forEach((_, i) => {
        const yasar = i < n;
        tl.push(`tl.to('.balik${i}',{opacity:${yasar ? 1 : 0},duration:.8},${at(t + (i % 6) * .08)});tl.to('.olu${i}',{opacity:${yasar ? 0 : .95},duration:1.2},${at(t + .4 + (i % 6) * .1)});`);
      });
    }
    if (d.balik != null) tl.push(`tl.to('.kiyiOlu',{opacity:${d.balik < .7 ? 1 : 0},duration:.5,stagger:.12},${at(t + .3)});`);
    if (d.plankton != null) { const n = Math.round(d.plankton * plk.length); plk.forEach((_, i) => tl.push(`tl.to('.plk${i}',{opacity:${i < n ? .85 : 0},duration:1},${at(t + (i % 10) * .05)});`)); }
    if (d.mercan != null) mercanlar.forEach((_, i) => tl.push(`tl.to('.mercan${i}',{attr:{fill:'${d.mercan > .5 ? (i % 2 ? C.coral : C.coral2) : C.bleach}'},opacity:${.35 + .65 * Math.max(d.mercan, .4)},duration:${dur}},${at(t + i * .1)});`));
    if (d.orman != null) agaclar.forEach((a, i) => { const ok = i < Math.round(d.orman * agaclar.length); tl.push(`tl.to('.agac${i} .yaprak',{attr:{fill:'${ok ? (i % 2 ? C.leaf : C.leaf2) : C.dry}'},opacity:${ok ? 1 : .55},duration:${dur}},${at(t + i * .06)});`); });
    if (d.kus != null) [0, 1, 2, 3, 4].forEach(i => tl.push(`tl.to('.kus${i}',{opacity:${i < Math.round(d.kus * 5) ? 1 : 0},duration:.8},${at(t + i * .1)});`));
    if (d.kasaba != null) tl.push(`tl.to('.pencere',{attr:{fill:'${d.kasaba > .5 ? '#FFD66B' : '#6E6A60'}'},duration:.8,stagger:.15},${at(t)});`);
    if (d.gaz != null) { tl.push(`tl.to('.kab',{opacity:${f(d.gaz * .9)},duration:1.2},${at(t)});tl.to('.pus',{opacity:${f(d.gaz * .28)},duration:${dur}},${at(t)});`); }
    if (d.deniz_renk != null) { const r = renk(d.deniz_renk, DENIZ, 'mavi'); tl.push(`tl.to('#dz0',{attr:{'stop-color':'${r[0]}'},duration:${dur}},${at(t)});tl.to('#dz1',{attr:{'stop-color':'${r[1]}'},duration:${dur}},${at(t)});tl.to('#dz2',{attr:{'stop-color':'${r[2]}'},duration:${dur}},${at(t)});tl.to('#dalga',{attr:{fill:'${r[0]}'},duration:${dur}},${at(t)});`); }
    if (d.gok_renk != null) { const r = renk(d.gok_renk, GOK, 'mavi'); tl.push(`tl.to('#gok0',{attr:{'stop-color':'${r[0]}'},duration:${dur}},${at(t)});tl.to('#gok1',{attr:{'stop-color':'${r[1]}'},duration:${dur}},${at(t)});`); }
  };

  // start: the world as it is; camera wide
  durumUygula(st, 0, .01);
  tl.push(`gsap.set('#cetvel',{opacity:0});gsap.set('#ustBant',{opacity:1});tl.to('#cetvel',{opacity:1,duration:.5},${at(L[1] + .3)});`);
  const adimlar = (veri.adimlar || []).map(a => ({ ...a, t: ifade(a.an) })).sort((x, y) => x.t - y.t);
  // a step about the character with no camera of its own goes to him
  for (const a of adimlar) if (!a.odak && a.kahraman && KAHRAMAN_YER[a.kahraman.yer]) a.odak = KAHRAMAN_YER[a.kahraman.yer][2];
  // props: read the names, pick the shot each one stands in; the camera goes to the prop
  let bolgeSimdi = 'genel';
  for (const a of adimlar) {
    const ham = Array.isArray(a.esya) ? a.esya : a.esya ? [a.esya] : [];
    a.es = ham.map(e => e && E.cozumle({ ...e, tur: e.ad || e.tur })).filter(Boolean).slice(0, 2);
    if (a.es.length) {
      const ana = a.es.find(e => E.ESYA[e.tur].tip !== 'hava') || a.es[0], tip = E.ESYA[ana.tur].tip;
      let b = NOKTA[ana.yer] ? ana.yer : a.odak || bolgeSimdi;
      if (tip === 'zemin' && !ESYA_ZEMIN[b]) b = ESYA_YEDEK.zemin[b];
      if (tip === 'su' && ESYA_YEDEK.su[b]) b = ESYA_YEDEK.su[b];
      a.esyaBolge = b;
      if (a.odak || b !== bolgeSimdi) a.odak = b;
    }
    if (a.odak) bolgeSimdi = a.odak;
  }
  let SON = T.Z.sting[1] != null ? T.Z.sting[1] - 2.6 : END;
  // the closing wide shot waits for a prop that lands on the last words (the punchline)
  const sonEsya = Math.max(-1, ...adimlar.flatMap(a => a.es.map(e => e.an != null ? ifade(e.an) : a.t)));
  if (T.Z.sting[1] != null && sonEsya > SON - 1.5) SON = Math.min(T.Z.sting[1] - 1.2, sonEsya + 1.5);
  // camera: every move is followed by a slow creep until the next move, so no stretch of the video stands still
  let odak = 'genel', kt = 0;
  const surun = (bitis) => { if (bitis - kt > 1) kamera(odak, kt, bitis - kt, 1.07, 'none'); };
  for (const a of adimlar) if (a.odak) {
    const [bas, sure] = a.es.length ? [a.t - .7, 1.2] : [a.t - .3, 1.6];      // a prop's shot is reached sooner so the prop enters into a settled frame
    surun(Math.max(0, bas)); kamera(a.odak, Math.max(0, bas), sure); odak = a.odak; kt = bas + sure;
  }
  surun(SON);
  if (T.Z.sting[1] != null) { kamera('genel', SON, 1.4); tl.push(`tl.to('#tabela,#tabela2,#kahBalon',{opacity:0,duration:.3},${at(SON - .2)});`); }   // wide shot again before the closing sting

  let gorunen = null, odakSimdi = 'genel', kahGorundu = false, gorunenY = 0;
  // what the props must stay clear of: the sign on screen (world boxes), where the character stands, whether he sits in a prop
  let tabelaW = null, kahYer = null, kahGizli = false, kahOturdu = false, esyaSvg = '';
  const evGizli = {};          // house -> when it comes back (a ground prop in the town hides the houses behind it)
  // world <-> screen in a camera preset (the slow creep adds up to 7 % around the centre)
  const ekr = (o, x, y) => { const [s, fx, fy] = NOKTA[o]; return [540 + s * (x - fx), 930 + s * (y - fy)]; };
  const dny = (o, sx, sy) => { const [s, fx, fy] = NOKTA[o]; return [fx + (sx - 540) / s, fy + (sy - 930) / s]; };
  const kutuE = (o, [x0, y0, x1, y1]) => { const a = ekr(o, x0, y0), b = ekr(o, x1, y1), z = p => [540 + (p[0] - 540) * 1.07, 930 + (p[1] - 930) * 1.07], c = z(a), d = z(b); return [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(b[0], d[0]), Math.max(b[1], d[1])]; };
  const kes = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const alan = b => (b[2] - b[0]) * (b[3] - b[1]);
  const CERCEVE = [30, 470, 1050, 1560];          // below the ruler / big-sentence band, above the captions
  // ground lines of the world (the same curves the land and the seabed are drawn with)
  const zeminY = (z, x) => z === 'kara' ? qY([-400, SY - 70], [120, SY - 150], [300, SY - 30], x)
    : x < 760 ? qY([330, 1420], [600, 1380], [760, 1430], x) : x < 1100 ? qY([760, 1430], [920, 1470], [1100, 1410], x) : qY([1100, 1410], [1250, 1380], [1400, 1420], x);
  // visible stretches of ground: the hill top before the beach slope; the seabed right of the underwater cliff
  const ZEMIN_X = { kara: [-400, 340], dip: [552, 1400] };
  const girisSure = tur => ({ sur: 1.3, yuz: 1.6, dus: 1, yazdir: 1.1, zipla: .9 })[E.ESYA[tur].giris] || .6;
  // local box of a prop: zemin/su grow up from the base, hava sits on its centre
  const yerelKutu = tur => { const { tip, w: pw, h } = E.ESYA[tur]; return tip === 'hava' ? [-pw / 2, -h / 2, pw / 2, h / 2] : [-pw / 2, -h, pw / 2, tip === 'su' ? 10 : 0]; };

  // Places the props of step k and plays them; returns the seat for the character if one of them has a koltuk
  function esyaKoy(a, k, t) {
    const o = a.esyaBolge, [s] = NOKTA[o], ek = ESYA_EKRAN[o] || ESYA_EKRAN_V, kw = ek / s, birim = 1 / ek;
    // leaves on the next step that brings a prop, a sign, a camera move or the character; the last props stay through the
    // closing wide shot (they are part of the world) until the closing sting covers them; every prop gets >= 1.8 s
    let j = k + 1; while (j < adimlar.length && !(adimlar[j].es.length || adimlar[j].odak || adimlar[j].tabela || adimlar[j].kahraman)) j++;
    const sting1 = T.Z.sting[1] != null ? T.Z.sting[1] : END;
    let bitis = j < adimlar.length ? adimlar[j].t - .3 : sting1 - .3;
    bitis = Math.max(bitis, ...a.es.map((e, i) => (e.an != null ? ifade(e.an) : t + (i ? 1.3 : 0)) + 1.8));
    // fixed things on screen in this shot
    const engel = [[-92, SY - 312, 92, SY - 204], [-4, SY - 204, 4, SY - 70], [668, SY - 206, 852, SY - 98], [748, SY - 100, 772, SY + 50]].map(b => [kutuE(o, b), 10]);
    if (tabelaW) tabelaW.forEach(b => engel.push([kutuE(o, b), 10]));
    const oturur = K && a.kahraman && a.kahraman.yer === 'esya';
    const kahSimdi = K && a.kahraman && KAHRAMAN_YER[a.kahraman.yer] ? KAHRAMAN_YER[a.kahraman.yer] : (!oturur && !kahGizli ? kahYer : null);
    if (kahSimdi) { const [kx, ky, , bx] = kahSimdi; engel.push([kutuE(o, [kx - 82, ky - 46, kx + 62, ky + 34]), 10], [kutuE(o, [kx + bx - 135, ky - 142, kx + bx + 135, ky - 46]), 10]); }
    if (o === 'kiyi' || o === 'genel') engel.push([kutuE(o, [146, SY - 142, 307, SY - 50]), 3]);    // rather not hide the little town
    const yerlesen = [];
    a.es.forEach((e, i) => {
      const P = E.ESYA[e.tur], te = e.an != null ? ifade(e.an) : i && yerlesen[0] ? yerlesen[0].te + girisSure(yerlesen[0].tur) : t, id = `es${k}_${i}`;
      if (P.tip === 'alan') {      // rain: objects fall across the shot onto its ground (land / sea surface, or the seabed under water)
        const dipte = o === 'deniz' || o === 'dip';
        let g = '';
        for (let m = 0; m < 9; m++) {
          const sx = 150 + m * 97 + r2(-25, 25), [wx] = dny(o, sx, 0);
          if (dipte ? wx < 560 || wx > 1390 : wx < -390) continue;
          const wy = dipte ? zeminY('dip', wx) : wx < 300 ? zeminY('kara', wx) : wx < 330 ? SY - 30 + (wx - 300) * .4 : SY + 4, [, sy] = ekr(o, wx, wy);
          if (sy > 1540) continue;
          g += `<g transform="translate(${f(wx)} ${f(wy)}) scale(${(1 / s).toFixed(4)})"><g id="${id}_${m}" opacity="0"><g transform="rotate(${Math.round(r2(-30, 30))}) translate(0 -14)">${E.yagmurNesne(e.nesne, C, m)}</g></g></g>`;
          const tm = te + (m * 5 % 9) * .11;      // falls from just below the ruler band, appearing as it starts
          tl.push(`tl.fromTo('#${id}_${m}',{y:${f(-(sy - 430))}},{y:0,duration:.7,ease:'power2.in',immediateRender:false},${at(tm)});tl.fromTo('#${id}_${m}',{opacity:0},{opacity:1,duration:.12,ease:'none',immediateRender:false},${at(tm)});`);
        }
        esyaSvg += `<g id="${id}">${g}</g>`;
        tl.push(`tl.to('#${id}',{opacity:0,duration:.35},${at(Math.max(bitis, te + 2))});`);
        return;
      }
      const lk = yerelKutu(e.tur), ekrK = (bx, by, lb) => kutuE(o, [bx + lb[0] * kw, by + lb[1] * kw, bx + lb[2] * kw, by + lb[3] * kw]);
      // the seated character's bubble counts as part of the prop: above it, or beside it when there is no room above
      let balonlar = [null];
      if (oturur && P.koltuk && !yerlesen.some(x => x.koltuk)) {
        const yz = a.kahraman.yazi || (kahGorundu ? '' : K.ad || '');
        if (yz) {
          const bk = Math.min(1, 1.3 / s), gn = Math.max(160, Math.round(yz.length * 17 + 50)) * bk / kw, ky0 = P.koltuk[1], yan = [ky0 - (30 + 32) * bk / kw, ky0 - (30 - 32) * bk / kw];
          balonlar = [['ust', [P.koltuk[0] - gn / 2, lk[1] - (88 * bk + 6) / kw, P.koltuk[0] + gn / 2, lk[1] - 6 / kw]],
            ['sag', [lk[2] + 12 / kw, yan[0], lk[2] + 12 / kw + gn, yan[1]]], ['sol', [lk[0] - 12 / kw - gn, yan[0], lk[0] - 12 / kw, yan[1]]]];
        }
      }
      let bx, by;
      const ortak = yerlesen[0];
      let olcek = 1, balon = null;
      if (i && ortak && P.tip === 'hava') {             // a stamp (or any floating second prop) lands on the first one, clear of its text
        const m = E.ESYA[ortak.tur].muhur, kb = ortak.kutu;
        if (m) { bx = ortak.bx + m[0] * kw; by = ortak.by + m[1] * kw; } else [bx, by] = dny(o, (kb[0] + kb[2]) / 2, (kb[1] + kb[3]) / 2);
        olcek = .8;
      } else {
        const aday = [];
        const yar = P.w / 2 * kw;          // the whole base stands on visible ground / the whole hull floats on open water
        if (P.tip === 'zemin') for (const z of ESYA_ZEMIN[o] || []) for (let x = ZEMIN_X[z][0] + yar; x <= ZEMIN_X[z][1] - yar; x += 10)
          aday.push([x, Math.max(zeminY(z, x - yar * .8), zeminY(z, x), zeminY(z, x + yar * .8)) + 2]);
        else if (P.tip === 'su') for (let x = 400 + yar; x <= 1395 - yar; x += 10) aday.push([x, SY + 2]);
        else for (let sx = 140; sx <= 940; sx += 20) for (let sy = 480; sy <= 1480; sy += 20) aday.push(dny(o, sx, sy));
        const [px, py] = ESYA_TERCIH[o];
        let eniyi = null;
        for (const [x, y] of aday) for (const bl of balonlar) {
          const kb = [lk, ...(bl ? [bl[1]] : [])].map(b => ekrK(x, y, b));
          let ceza = bl && bl[0] !== 'ust' ? 2000 : 0;          // above the prop reads best
          for (const b of kb) { ceza += 10 * (alan(b) - kes(b, CERCEVE)); for (const [e2, ag] of engel) ceza += ag * kes(b, e2); }
          // a vehicle that drives in from the left should not drive through the gauges or the sign on its way
          if (P.giris === 'sur') { const yol = [0, kb[0][1], kb[0][0], kb[0][3]]; for (const [e2, ag] of engel) if (ag >= 10) ceza += 3 * kes(yol, e2); }
          const [cx, cy] = [(kb[0][0] + kb[0][2]) / 2, (kb[0][1] + kb[0][3]) / 2];
          ceza += P.tip === 'hava' ? Math.hypot(cx - px, cy - py) * 2 : Math.abs(cx - 540) * 2;
          if (!eniyi || ceza < eniyi[2]) eniyi = [x, y, ceza, bl];
        }
        if (!eniyi) return;
        [bx, by, , balon] = eniyi;
      }
      const kutu = ekrK(bx, by, lk.map(v => v * olcek));
      // a ground prop standing in the little town hides the houses it covers until it leaves (no roof peeking under a bus)
      if (P.tip === 'zemin') evler.forEach(([hx, hy], h) => {
        const ev = kutuE(o, [hx - 4, hy - 20, hx + 48, hy + 34]);
        if (kes(ev, kutu) <= .1 * alan(ev)) return;
        if (evGizli[h] != null && evGizli[h] >= te - .6) { evGizli[h] = bitis + .5; return; }     // still hidden by the previous prop: stay hidden
        if (evGizli[h] != null) tl.push(`tl.to('#ev${h}',{opacity:1,duration:.4},${at(evGizli[h])});`);
        tl.push(`tl.to('#ev${h}',{opacity:0,duration:.3},${at(te)});`); evGizli[h] = bitis + .5;
      });
      // a vehicle drives in from the left edge, or from just past a gauge or sign standing in its way
      let yol = 900;
      if (P.giris === 'sur') { const sag = Math.max(-1e9, ...engel.filter(([e2, ag]) => ag >= 10 && e2 !== kutu && e2[2] < kutu[0] + 20 && e2[1] < kutu[3] && e2[3] > kutu[1]).map(([e2]) => e2[2])); if (sag > 0) yol = Math.max(160, kutu[0] - sag - 12); }
      engel.push([kutu, 10]); if (balon) engel.push([ekrK(bx, by, balon[1]), 10]);
      yerlesen.push({ ...e, te, id, bx, by, kw: kw * olcek, kutu, yol, koltuk: P.koltuk && oturur && !yerlesen.some(x => x.koltuk) ? P.koltuk : null, h: P.h, tip: P.tip, balon: balon && { yer: balon[0], kutu: balon[1].map(v => v * kw) } });
    });
    // draw + play (a stamp on a factory pulls its shutter down)
    const damga = yerlesen.find(x => x.tur === 'damga');
    for (const y of yerlesen) {
      const omur = bitis - y.te;
      esyaSvg += `<g transform="translate(${f(y.bx)} ${f(y.by)}) scale(${y.kw.toFixed(4)})"><g id="${y.id}">${E.ESYA[y.tur].ciz(C, y.yazi, y)}</g></g>`;
      tl.push(...E.giris(y.tur, '#' + y.id, y.te, omur, { at, f, birim, damgaT: damga && damga !== y ? damga.te : null, bosal: !!y.bosal, yol: y.yol }));
      tl.push(...E.cikis(y.tur, '#' + y.id, y.te + omur, { at, f, birim }).tl);
    }
    const koltuk = yerlesen.find(y => y.koltuk);
    return koltuk ? { ...koltuk, bitis, s } : null;
  }

  adimlar.forEach((a, k) => {
    const t = a.t, sonraki = adimlar[k + 1] ? adimlar[k + 1].t : SON;
    if (a.odak) odakSimdi = a.odak;
    if (a.yil) {
      const i = cetvel.indexOf(a.yil);
      if (i >= 0) tl.push(`tl.to('#cetvelIsaret',{attr:{cx:${cx(i)}},duration:.8,ease:'power2.inOut'},${at(t)});tl.to('#cetvelDolu',{attr:{width:${cx(i) - 100}},duration:.8,ease:'power2.inOut'},${at(t)});`);
    }
    if (a.buyuk) tl.push(`gsap.set('.buyuk${k}',{opacity:0,y:20});tl.to('.buyuk${k}',{opacity:1,y:0,duration:.45,ease:'power3.out'},${at(t)});tl.to('.buyuk${k}',{opacity:0,duration:.35},${at(t + 1.8)});`);
    // signs: the old one leaves on every step; a new one stands where this camera looks, its text shrunk to fit
    if (gorunen !== null && (a.tabela || a.odak)) { tl.push(`tl.to('#tabela${gorunen}',{opacity:0,duration:.25},${at(t - .3)});`); gorunen = null; tabelaW = null; }
    if (a.tabela) {
      const [sx, sy, alt] = TABELA_EKRAN[odakSimdi] || TABELA_EKRAN.genel, [ks, kwx, kwy] = NOKTA[odakSimdi] || NOKTA.genel;
      const tx = Math.round(kwx + (sx - 540) / ks), ty = Math.round(kwy + (sy - 930) / ks), tsk = +(1.1 / ks).toFixed(3);
      const boy = a.tabela.length <= 14 ? 40 : 34, gen = Math.min(600, Math.max(320, Math.round(a.tabela.length * boy * .5 + 70)));
      tl.push(`tl.set('#tabela${alt}',{x:${tx},y:${ty}},${at(t)});tl.set('#tabela${alt}S',{attr:{transform:'scale(${tsk})'}},${at(t)});tl.set('#tabela${alt}Yazi',{textContent:${JSON.stringify(a.tabela)},attr:{'font-size':${boy}}},${at(t)});tl.set('#tabela${alt}K',{attr:{x:${-gen / 2},width:${gen}}},${at(t)});tl.fromTo('#tabela${alt}',{opacity:0},{opacity:1,duration:.45,ease:'power3.out'},${at(t + .2)});`);
      gorunen = alt;
      tabelaW = [[tx - gen / 2 * tsk, ty - 52 * tsk, tx + gen / 2 * tsk, ty + 48 * tsk], [tx - 8 * tsk, ty + 40 * tsk, tx + 8 * tsk, ty + 190 * tsk]];
    }
    const koltuk = a.es.length ? esyaKoy(a, k, t) : null;
    // the character sits in the prop: he leaves wherever he was and pops up in its seat, his bubble above the prop
    if (K && a.kahraman && a.kahraman.yer === 'esya' && koltuk) {
      const [ox, oy, os] = koltuk.koltuk, kx = koltuk.bx + ox * koltuk.kw, ky = koltuk.by + oy * koltuk.kw, te = koltuk.te + girisSure(koltuk.tur);
      const yazi = a.kahraman.yazi || (kahGorundu ? '' : K.ad || ''), son = Math.min(sonraki - .2, te + 4, koltuk.bitis);
      if (kahGorundu && !kahGizli) tl.push(`tl.to('#kahD',{opacity:0,duration:.2},${at(te - .3)});`);
      tl.push(`tl.to('#kahBalon',{opacity:0,duration:.2},${at(Math.min(t, te - .3))});tl.set('#kahD',{x:${f(kx)},y:${f(ky)}},${at(te - .08)});tl.set('#kahS',{attr:{transform:'scale(${(os * koltuk.kw).toFixed(4)})'}},${at(te - .08)});tl.to('#kahD',{opacity:1,duration:.3},${at(te)});tl.fromTo('#kahIc',{scale:.4},{scale:1,transformOrigin:'50% 50%',duration:.45,ease:'back.out(2)'},${at(te)});`);
      if (yazi) {
        // bubble box centre in world units (chosen with the prop's spot); above the prop the tail points down at it, beside it there is no tail
        // the bubble keeps one screen size in every shot (bk), like the props
        const bk = Math.min(1, 1.3 / koltuk.s), genis = Math.max(160, Math.round(yazi.length * 17 + 50)), B = koltuk.balon || { yer: 'ust', kutu: [ox * koltuk.kw - genis * bk / 2, 0, ox * koltuk.kw + genis * bk / 2, -koltuk.h * koltuk.kw - 6] };
        const dx = koltuk.bx + (B.kutu[0] + B.kutu[2]) / 2 - kx, dy = B.yer === 'ust' ? koltuk.by - koltuk.h * koltuk.kw - 6 - ky + 50 * bk : koltuk.by + (B.kutu[1] + B.kutu[3]) / 2 - ky + 106 * bk;
        tl.push(`tl.set('#kahBalonS',{attr:{transform:'scale(${bk.toFixed(4)})'}},${at(te + .3)});`);
        tl.push(`tl.set('#kahYazi',{textContent:${JSON.stringify(yazi.toLocaleUpperCase('tr'))},attr:{x:0}},${at(te + .3)});tl.set('#kahBalonK',{attr:{x:${-genis / 2},width:${genis}}},${at(te + .3)});tl.set('#kahBalonIc',{x:0},${at(te + .3)});tl.set('#kahBalon',{x:${f(dx)},y:${f(dy)}},${at(te + .3)});tl.set('#kahKuyruk',{opacity:${B.yer === 'ust' ? 1 : 0}},${at(te + .3)});tl.fromTo('#kahBalon',{opacity:0,scale:.6},{opacity:1,scale:1,transformOrigin:'50% 100%',duration:.35,ease:'back.out(2)'},${at(te + .4)});tl.to('#kahBalon',{opacity:0,duration:.3},${at(Math.max(te + 1.5, son))});`);
      }
      // he leaves with the prop: rides off with a vehicle, fades with anything else
      const g = E.ESYA[koltuk.tur].giris;
      if (g === 'sur' || g === 'yuz') tl.push(`tl.to('#kahD',{x:'+=${f(1100 / koltuk.s)}',duration:1,ease:'power2.in'},${at(koltuk.bitis)});tl.set('#kahD',{opacity:0},${at(koltuk.bitis + 1)});`);
      else tl.push(`tl.to('#kahD',{opacity:0,duration:.3},${at(koltuk.bitis)});`);
      gorunenY = ky; kahGorundu = true; kahGizli = true; kahOturdu = true; kahYer = null;
    }
    // the recurring character hops to his spot and says his line
    if (K && a.kahraman && KAHRAMAN_YER[a.kahraman.yer]) {
      const [kx, ky, , bx] = KAHRAMAN_YER[a.kahraman.yer], yazi = a.kahraman.yazi || (kahGorundu ? '' : K.ad || '');
      if (kahOturdu) tl.push(`tl.set('#kahS',{attr:{transform:'scale(1)'}},${at(t - .2)});tl.set('#kahBalon',{x:0,y:0},${at(t - .2)});tl.set('#kahKuyruk',{opacity:1},${at(t - .2)});tl.set('#kahBalonS',{attr:{transform:'scale(1)'}},${at(t - .2)});`);
      if (!kahGorundu || kahGizli) tl.push(`tl.set('#kahD',{x:${kx},y:${ky}},${at(t - .2)});tl.to('#kahD',{opacity:1,duration:.4},${at(t)});tl.fromTo('#kahIc',{scale:.4},{scale:1,transformOrigin:'50% 50%',duration:.5,ease:'back.out(2)'},${at(t)});`);
      else tl.push(`tl.to('#kahD',{x:${kx},duration:.9,ease:'power1.inOut'},${at(t)});tl.to('#kahD',{keyframes:[{y:${Math.min(ky, gorunenY) - 120},duration:.45,ease:'power2.out'},{y:${ky},duration:.45,ease:'power2.in'}]},${at(t)});`);
      gorunenY = ky; kahGorundu = true; kahGizli = false; kahYer = KAHRAMAN_YER[a.kahraman.yer];
      tl.push(`tl.to('#kahBalon',{opacity:0,duration:.2},${at(t)});`);
      if (yazi) {
        const genis = Math.max(160, Math.round(yazi.length * 17 + 50));
        tl.push(`tl.set('#kahYazi',{textContent:${JSON.stringify(yazi.toLocaleUpperCase('tr'))}},${at(t + .8)});tl.set('#kahBalonK',{attr:{x:${-genis / 2},width:${genis}}},${at(t + .8)});tl.set('#kahYazi',{attr:{x:0}},${at(t + .8)});tl.set('#kahBalonIc',{x:${bx}},${at(t + .8)});tl.fromTo('#kahBalon',{opacity:0,scale:.6},{opacity:1,scale:1,transformOrigin:'50% 100%',duration:.35,ease:'back.out(2)'},${at(t + .9)});tl.to('#kahBalon',{opacity:0,duration:.3},${at(Math.min(sonraki - .2, t + 4))});`);
      }
    }
    durumUygula(a.durum || {}, t + .2, 1.6, Math.max(1.6, sonraki - t - .4));
  });
  for (const h in evGizli) tl.push(`tl.to('#ev${h}',{opacity:1,duration:.4},${at(evGizli[h])});`);
  if (K) tl.push(`tl.fromTo('#kahIc',{y:0},{y:-8,duration:.7,ease:'sine.inOut',yoyo:true,repeat:${Math.ceil(END / .7)}},0);`);

  const buyukler = adimlar.map((a, k) => a.buyuk ? `<div class="buyuk buyuk${k}"><span>${a.buyuk}</span></div>` : '').join('');
  const html = `<div class="sc" id="sim"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}
    <rect width="${W}" height="${H}" fill="${C.paper}"/>
    <g id="dunya">${w.replace('<!--ESYA-->', esyaSvg)}</g><rect width="${W}" height="${H}" fill="url(#vig)"/>${ustBant}${ruler}</svg>${buyukler}</div>`;
  const css = `.buyuk{position:absolute;left:0;top:350px;width:${W}px;text-align:center;font:400 84px/1 "AntonTR";color:${C.paper}}.buyuk span{display:inline-block;background:${C.ink};padding:14px 34px 10px;border-radius:18px;box-shadow:0 8px 24px rgba(0,0,0,.25)}`;
  return { html, tl, css };
};
