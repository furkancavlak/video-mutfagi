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
//   deniz_o2, hava_o2 (0-100 %, shown on the buoy / weather station) · balik, plankton, mercan, orman, kus, kasaba (0-1)
//   gaz (0-1 sulphur bubbles + haze) · deniz_renk, gok_renk (preset name or #hex)
// odak (where the camera goes): genel | gok | kiyi | yuzey | deniz | dip
// Rules followed (dersler/KURGU-DILI.md): light ground, one world, text lives on objects (buoy, station, sign),
// the camera travels to the information, ambient motion is slow, no shake.
const fs = require('fs'), path = require('path');

const DENIZ = { mavi: ['#5FB3D4', '#1F6F96', '#0E3E5C'], yesil: ['#6FB8A0', '#2F7C6A', '#18493F'], mor: ['#9C7CB8', '#5E3F86', '#2E1C4A'], kahve: ['#A99A72', '#6B5B3A', '#3A3020'], soluk: ['#9CC3CF', '#5D8A99', '#33525C'] };
const GOK = { mavi: ['#8FD0EA', '#E8F5F8'], soluk: ['#C9D9DC', '#F1F1EA'], sari: ['#D9D69A', '#F3EFD2'], mor: ['#B9A3CF', '#EFE6F3'], gri: ['#B8BCBC', '#E9E7E1'] };
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
    <clipPath id="suC"><path d="M330 ${SY} L 1080 ${SY} L 1080 1560 L 330 1560 Z"/></clipPath>
  </defs>`;
  // sky, sun, clouds
  const bulut = (x, y, s, cls) => `<g class="${cls}" transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="80" ry="36" fill="#fff"/><ellipse cx="60" cy="-22" rx="64" ry="44" fill="#fff"/><ellipse cx="120" cy="0" rx="70" ry="32" fill="#fff"/></g>`;
  let w = `<rect x="-200" y="-200" width="1480" height="${SY + 200}" fill="url(#gokG)"/>
    <circle cx="860" cy="250" r="78" fill="#FFE7A0"/><circle cx="860" cy="250" r="110" fill="#FFE7A0" opacity=".25"/>
    <g id="bulutlar">${bulut(80, 200, 1, 'bl')}${bulut(560, 140, .8, 'bl')}${bulut(300, 360, .7, 'bl')}</g>
    <rect class="pus" x="-200" y="-200" width="1480" height="${SY + 260}" fill="${C.bub}" opacity="0"/>`;
  // land (left): hill, forest, town, weather station, sign; beach slope into the sea
  w += `<path d="M-200 ${SY - 70} Q 120 ${SY - 150} 300 ${SY - 40} L 420 ${SY + 30} L 520 1560 L -200 1560 Z" fill="${C.soil}"/>
    <path d="M-200 ${SY - 70} Q 120 ${SY - 150} 300 ${SY - 40} L 360 ${SY - 5} L -200 ${SY - 5} Z" fill="${C.leaf}" opacity=".9"/>
    <path d="M300 ${SY - 40} L 430 ${SY + 20} L 470 ${SY + 20} L 340 ${SY - 40} Z" fill="${C.sand}"/>
    <path d="M-200 ${SY + 120} L 460 ${SY + 120} L 520 1560 L -200 1560 Z" fill="${C.soil2}" opacity=".55"/>`;
  const agaclar = Array.from({ length: 9 }, (_, i) => ({ x: -60 + i * 38 + r2(-8, 8), y: SY - 95 + Math.abs(i - 4) * 9 + r2(-6, 6), s: r2(.8, 1.15) }));
  w += agaclar.map((a, i) => `<g class="agac agac${i}" data-x="${f(a.x)}" data-y="${f(a.y + 40 * a.s)}"><rect x="${f(a.x - 5)}" y="${f(a.y)}" width="10" height="${f(40 * a.s)}" fill="${C.trunk}"/><circle class="yaprak" cx="${f(a.x)}" cy="${f(a.y - 6)}" r="${f(26 * a.s)}" fill="${i % 2 ? C.leaf : C.leaf2}"/></g>`).join('');
  const evler = [[150, SY - 118], [205, SY - 104], [255, SY - 84]];
  w += evler.map(([x, y], i) => `<g class="ev"><rect x="${x}" y="${y}" width="44" height="34" fill="${C.wall}" stroke="#D9CBB0" stroke-width="2"/><path d="M${x - 4} ${y} L ${x + 22} ${y - 20} L ${x + 48} ${y} Z" fill="${C.roof}"/><rect class="pencere" x="${x + 15}" y="${y + 11}" width="14" height="12" fill="#FFD66B"/></g>`).join('');
  // weather station (air O2)
  w += `<g id="istasyon" transform="translate(40 ${SY - 230})"><rect x="-3" y="40" width="6" height="140" fill="${C.alu2}"/><rect x="-78" y="-40" width="156" height="86" rx="10" fill="${C.ink}"/><rect x="-70" y="-32" width="140" height="70" rx="6" fill="#10343F"/>
    <text x="0" y="-12" text-anchor="middle" font-family="Inter Tight" font-weight="800" font-size="13" letter-spacing="2" fill="#7FB9C4">HAVADA O₂</text>
    <text id="havaYazi" x="0" y="28" text-anchor="middle" font-family="AntonTR" font-size="36" fill="#5FE0F0">%${st.hava_o2}</text></g>`;
  // the sea (right), with light rays, plankton, fish, corals, seabed, bubbles
  w += `<g clip-path="url(#suC)"><rect x="330" y="${SY}" width="760" height="${1560 - SY}" fill="url(#denizG)"/>
    ${[0, 1, 2].map(i => `<path class="isin" d="M${560 + i * 170} ${SY} L ${640 + i * 170} ${SY} L ${520 + i * 170} 1300 L ${470 + i * 170} 1300 Z" fill="url(#isikG)"/>`).join('')}`;
  const plk = Array.from({ length: 60 }, () => ({ x: r2(440, 1060), y: r2(SY + 30, SY + 420), r: r2(2.5, 5) }));
  w += plk.map((p, i) => `<circle class="plk plk${i}" cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r)}" fill="#BFE8A6" opacity=".85"/>`).join('');
  const baliklar = Array.from({ length: 30 }, (_, i) => ({ x: r2(470, 1020), y: r2(SY + 110, 1300), s: r2(.7, 1.3), yon: i % 3 ? 1 : -1, k: i % 2 }));
  const balikSvg = (b, i) => `<g class="balikD"><g class="balik balik${i}" transform="translate(${f(b.x)} ${f(b.y)}) scale(${f(b.s * b.yon)} ${f(b.s)})"><ellipse cx="0" cy="0" rx="22" ry="11" fill="${b.k ? C.fish : C.fish2}"/><path d="M-20 0 L -36 -11 L -36 11 Z" fill="${b.k ? C.fish : C.fish2}"/><circle cx="10" cy="-3" r="2.6" fill="${C.ink}"/></g></g>`;
  w += baliklar.map(balikSvg).join('');
  w += `<path d="M330 1420 Q 600 1380 760 1430 Q 920 1470 1080 1410 L 1080 1560 L 330 1560 Z" fill="${C.sand2}"/>`;
  const mercanlar = [[600, 1420], [700, 1438], [830, 1442], [930, 1428], [1020, 1414], [530, 1410]];
  w += mercanlar.map(([x, y], i) => `<g class="mercanG"><path class="mercan mercan${i}" d="M${x} ${y} q -18 -40 -6 -70 q 8 22 10 40 q 6 -40 22 -58 q 4 36 -4 60 q 18 -16 30 -18 q -8 30 -26 46 Z" fill="${i % 2 ? C.coral : C.coral2}"/></g>`).join('');
  const kabarcik = Array.from({ length: 24 }, () => ({ x: r2(480, 1050), y: r2(1380, 1440), r: r2(5, 11) }));
  w += kabarcik.map((b, i) => `<circle class="kab kab${i}" cx="${f(b.x)}" cy="${f(b.y)}" r="${f(b.r)}" fill="${C.bub}" opacity="0"/>`).join('');
  w += `</g>`;
  // surface: waves, buoy (sea O2), dead fish floating
  w += `<path id="dalga" d="M330 ${SY} ${Array.from({ length: 14 }, (_, i) => `q 30 -10 60 0`).join(' ')} L 1180 ${SY + 6} L 330 ${SY + 6} Z" fill="${ilkDeniz[0]}"/>
    <g id="samandira" transform="translate(760 ${SY - 10})"><g id="samIc"><path d="M-40 10 L 40 10 L 30 50 L -30 50 Z" fill="${C.coral}"/><rect x="-4" y="-90" width="8" height="100" fill="${C.alu2}"/>
      <rect x="-92" y="-190" width="184" height="100" rx="12" fill="${C.ink}"/><rect x="-84" y="-182" width="168" height="84" rx="7" fill="#10343F"/>
      <text x="0" y="-158" text-anchor="middle" font-family="Inter Tight" font-weight="800" font-size="14" letter-spacing="2" fill="#7FB9C4">DENİZDE O₂</text>
      <text id="denizYazi" x="0" y="-112" text-anchor="middle" font-family="AntonTR" font-size="44" fill="#5FE0F0">%${st.deniz_o2}</text></g></g>`;
  const olu = baliklar.map((b, i) => ({ x: 440 + (i * 23) % 600, i }));
  w += olu.map(o => `<g class="olu olu${o.i}" opacity="0" transform="translate(${o.x} ${SY + 2}) scale(.8 -.8)"><ellipse cx="0" cy="0" rx="22" ry="10" fill="#C9C2B4"/><path d="M-20 0 L -34 -10 L -34 10 Z" fill="#C9C2B4"/><path d="M8 -6 l6 6 m0 -6 l-6 6" stroke="${C.ink}" stroke-width="2"/></g>`).join('');
  // birds
  w += `<g id="kuslar">${[0, 1, 2, 3, 4].map(i => `<path class="kus kus${i}" d="M${120 + i * 70} ${180 + (i % 2) * 40} q 12 -12 24 0 q 12 -12 24 0" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>`).join('')}</g>`;
  // shore sign (the per-step headline lives on it)
  w += `<g id="tabela" transform="translate(330 ${SY - 210})" opacity="0"><rect x="-6" y="40" width="12" height="130" fill="${C.trunk}"/><rect id="tabelaK" x="-150" y="-50" width="300" height="96" rx="10" fill="#F4EEDF" stroke="${C.trunk}" stroke-width="6"/><text id="tabelaYazi" x="0" y="12" text-anchor="middle" font-family="AntonTR" font-size="40" fill="${C.ink}"></text></g>`;

  // time ruler (top, outside the camera so it stays put)
  const cetvel = veri.zaman_cetveli || ['BUGÜN', '1 GÜN', '1 YIL', '100 YIL', '1000 YIL'];
  const cx = i => 120 + i * (840 / (cetvel.length - 1));
  const ruler = `<g id="cetvel"><rect x="100" y="250" width="880" height="10" rx="5" fill="${C.ink}" opacity=".18"/><rect id="cetvelDolu" x="100" y="250" width="20" height="10" rx="5" fill="${C.coral}"/>
    ${cetvel.map((c, i) => `<circle cx="${cx(i)}" cy="255" r="11" fill="#F4EEDF" stroke="${C.ink}" stroke-width="4"/><text x="${cx(i)}" y="300" text-anchor="middle" font-family="AntonTR" font-size="30" fill="${C.ink}">${c}</text>`).join('')}
    <circle id="cetvelIsaret" cx="${cx(0)}" cy="255" r="18" fill="${C.coral}"/></g>`;

  // ---------- camera presets (world scale + offset so the region sits in the free middle of the frame)
  const ODAK = { genel: [1, 0, 0], gok: [1.35, 0, 180], kiyi: [1.7, 520, 60], yuzey: [1.55, -280, -20], deniz: [1.45, -300, -420], dip: [1.75, -380, -900] };
  const kamera = (o, t, d = 1.6) => { const [s, x, y] = ODAK[o] || ODAK.genel; tl.push(`tl.to('#dunya',{scale:${s},x:${x},y:${y},duration:${d},ease:'power2.inOut'},${at(t)});`); };
  tl.push(`gsap.set('#dunya',{svgOrigin:'540 900',scale:1,x:0,y:0});`);

  // ---------- ambient life (slow, low contrast)
  tl.push(`tl.fromTo('#bulutlar',{x:-40},{x:120,duration:${at(END)},ease:'none'},0);`);
  tl.push(`tl.fromTo('#dalga',{x:0},{x:-60,duration:2.4,ease:'none',repeat:${Math.ceil(END / 2.4)}},0);`);
  tl.push(`tl.fromTo('#samIc',{y:0,rotation:-2},{y:6,rotation:2,svgOrigin:'0 30',duration:1.8,ease:'sine.inOut',yoyo:true,repeat:${Math.ceil(END / 1.8)}},0);`);
  baliklar.forEach((b, i) => tl.push(`tl.fromTo('.balik${i}',{x:0},{x:${f(b.yon * r2(30, 70))},duration:${f(r2(3, 5))},ease:'sine.inOut',yoyo:true,repeat:${Math.ceil(END / 3)}},${f(r2(0, 1))});`));
  tl.push(`tl.fromTo('.isin',{opacity:.6},{opacity:1,duration:2.5,ease:'sine.inOut',yoyo:true,repeat:${Math.ceil(END / 2.5)},stagger:.7},0);`);
  tl.push(`tl.fromTo('.kus',{y:0},{y:-10,duration:.6,ease:'sine.inOut',yoyo:true,repeat:${Math.ceil(END / .6)},stagger:.12},0);tl.fromTo('#kuslar',{x:-60},{x:260,duration:${at(END)},ease:'none'},0);`);
  kabarcik.forEach((b, i) => tl.push(`tl.fromTo('.kab${i}',{y:0},{y:${f(-r2(500, 760))},duration:${f(r2(3.5, 6))},ease:'none',repeat:${Math.ceil(END / 3.5)}},${f(r2(0, 3))});`));

  // ---------- state changes, each locked to its word
  const durumUygula = (d, t, dur = 1.6) => {
    if (d.deniz_o2 != null) tl.push(`tl.set('#denizYazi',{textContent:'%${Math.round(d.deniz_o2)}'},${at(t)});tl.to('#denizYazi',{attr:{fill:'${d.deniz_o2 < 30 ? C.coral : '#5FE0F0'}'},duration:.3},${at(t)});`);
    if (d.hava_o2 != null) tl.push(`tl.set('#havaYazi',{textContent:'%${Math.round(d.hava_o2)}'},${at(t)});tl.to('#havaYazi',{attr:{fill:'${d.hava_o2 < 60 ? C.coral : '#5FE0F0'}'},duration:.3},${at(t)});`);
    if (d.balik != null) {
      const n = Math.round(d.balik * baliklar.length);
      baliklar.forEach((_, i) => {
        const yasar = i < n;
        tl.push(`tl.to('.balik${i}',{opacity:${yasar ? 1 : 0},duration:.8},${at(t + (i % 6) * .08)});tl.to('.olu${i}',{opacity:${yasar ? 0 : .95},duration:1.2},${at(t + .4 + (i % 6) * .1)});`);
      });
    }
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
  tl.push(`gsap.set('#cetvel',{opacity:0});tl.to('#cetvel',{opacity:1,duration:.5},${at(L[1] + .3)});`);
  const adimlar = (veri.adimlar || []).map(a => ({ ...a, t: ifade(a.an) }));
  adimlar.forEach((a, k) => {
    const t = a.t;
    if (a.odak) kamera(a.odak, Math.max(0, t - .3));
    if (a.yil) {
      const i = cetvel.indexOf(a.yil);
      if (i >= 0) tl.push(`tl.to('#cetvelIsaret',{attr:{cx:${cx(i)}},duration:.8,ease:'power2.inOut'},${at(t)});tl.to('#cetvelDolu',{attr:{width:${cx(i) - 100}},duration:.8,ease:'power2.inOut'},${at(t)});`);
    }
    if (a.buyuk) tl.push(`gsap.set('.buyuk${k}',{opacity:0,y:20});tl.to('.buyuk${k}',{opacity:1,y:0,duration:.45,ease:'power3.out'},${at(t)});tl.to('.buyuk${k}',{opacity:0,duration:.35},${at(t + 1.8)});`);
    if (a.tabela) tl.push(`tl.set('#tabelaYazi',{textContent:${JSON.stringify(a.tabela)}},${at(t + .2)});tl.fromTo('#tabela',{opacity:0,y:20},{opacity:1,y:0,duration:.45,ease:'power3.out'},${at(t + .2)});`);
    durumUygula(a.durum || {}, t + .2);
  });
  // wide shot again before the closing sting
  if (T.Z.sting[1] != null) kamera('genel', T.Z.sting[1] - 2.6, 1.4);

  const buyukler = adimlar.map((a, k) => a.buyuk ? `<div class="buyuk buyuk${k}">${a.buyuk}</div>` : '').join('');
  const html = `<div class="sc" id="sim"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}
    <rect width="${W}" height="${H}" fill="${C.paper}"/>
    <g id="dunya">${w}</g>${ruler}<rect width="${W}" height="${H}" fill="url(#vig)"/></svg>${buyukler}</div>`;
  const css = `.buyuk{position:absolute;left:0;top:380px;width:${W}px;text-align:center;font:400 120px/1 "AntonTR";color:${C.ink};text-shadow:0 6px 24px rgba(244,238,223,.9)}`;
  return { html, tl, css };
};
