// formul sample (oxygbio, 29.10.2026): "Ağaçlar oksijen üretmeyi bıraksa ne olur?"
// Shows the STRUCTURE of a formul video (dersler/FORMUL.md): one shot per line with hard cuts, the channel's character
// acting (karakter.ciz / karakter.ifade), the fact shown as a mechanism (bubbles riding back into the mushrooms),
// every object drawn for THIS story (tubes, dial, scrap truck, AC, toilet rolls), actions locked to words (M.k), and the
// channel's signature 1000-year jump. Drawings here belong to this story only: a new video draws its own.
module.exports = function ({ C: C0, T, f, r2, M, karakter }) {
const { L, LE } = T, END = T.END, k = M.k;
// the channel palette (kimlik.json → renkler + gorsel_dil.palet) plus a few story colours
const C = Object.assign({}, C0, { gok: '#DCEEF2', yaprak: '#5FA35C', yaprak2: '#4C8C4A', gri: '#A3AE9C', govde: '#8A5A3B', toprak: '#B98A5E', toprak2: '#9C7149',
  duvar: '#EADBC2', duvar2: '#D9C6A6', celik: '#C9D3D8', celik2: '#9AA8B0', pas: '#A0613A' });
const cemil = (id, x, y, s, o) => M.yer(x, y, karakter.ciz(id, o), { s });

// ---------- drawings made for this story
const agac = (cls, x, y, s = 1) => M.yer(x, y, `<g class="${cls}-in">
  <path d="M-34 0 L -22 -260 L 22 -260 L 34 0 Z" fill="${C.govde}"/><path d="M-6 -200 L -70 -300 M 8 -230 L 66 -320" stroke="${C.govde}" stroke-width="18" stroke-linecap="round"/>
  <g class="${cls}-tac">${[[-120, -360, 120], [110, -380, 125], [0, -470, 150], [-60, -300, 110], [70, -300, 105]].map(([cx, cy, r], i) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${i % 2 ? C.yaprak2 : C.yaprak}"/>`).join('')}</g></g>`, { s, sinif: cls });
const fidan = (x, y, s, i) => M.yer(x, y, `<rect x="-8" y="-70" width="16" height="70" fill="${C.govde}"/><circle cy="-100" r="52" fill="${i % 2 ? C.yaprak2 : C.yaprak}"/>`, { s, sinif: `kt kt${i}` });
const kabarcik = (cls, x, y, r, yazi, renk) => M.yer(x, y, `<circle r="${r}" fill="${renk}" opacity=".9"/><text y="${f(r * .32)}" text-anchor="middle" font-family="AntonTR" font-size="${f(r * .9)}" fill="#fff">${yazi}</text>`, { sinif: cls });
const tup = (cls, x, y, pas = false) => M.yer(x, y, `<rect x="-34" y="-190" width="68" height="190" rx="30" fill="${pas ? C.pas : C.celik}" stroke="${pas ? '#7A4526' : C.celik2}" stroke-width="5"/>
  <rect x="-34" y="-150" width="68" height="34" fill="${pas ? '#8A5130' : C.o2}"/><text x="0" y="-124" text-anchor="middle" font-family="AntonTR" font-size="26" fill="#fff">O₂</text>
  <rect x="-12" y="-214" width="24" height="26" fill="${C.ink}"/><circle cx="0" cy="-222" r="14" fill="${C.ink}"/>`, { sinif: cls });
const cephe = `<rect width="1080" height="1920" fill="${C.duvar}"/>${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="0" y="${i * 230}" width="1080" height="6" fill="${C.duvar2}" opacity=".6"/>`).join('')}
  <rect x="610" y="420" width="300" height="520" rx="8" fill="#BFDDE6" stroke="${C.duvar2}" stroke-width="18"/><rect x="752" y="420" width="16" height="520" fill="${C.duvar2}"/>
  <rect x="80" y="1290" width="920" height="40" fill="#CBB792"/>`;
const korkuluk = `<g>${Array.from({ length: 17 }, (_, i) => `<rect x="${92 + i * 56}" y="1050" width="10" height="240" fill="${C.ink}"/>`).join('')}<rect x="80" y="1040" width="920" height="18" rx="8" fill="${C.ink}"/></g>`;
const olcer = (cls, x, y, r) => M.yer(x, y, `<circle r="${r}" fill="#FFFDF6" stroke="${C.ink}" stroke-width="${f(r * .06)}"/>
  ${Array.from({ length: 11 }, (_, i) => { const a = (-210 + i * 24) * Math.PI / 180; return `<line x1="${f(Math.cos(a) * r * .78)}" y1="${f(Math.sin(a) * r * .78)}" x2="${f(Math.cos(a) * r * .9)}" y2="${f(Math.sin(a) * r * .9)}" stroke="${C.ink}" stroke-width="${f(r * .025)}"/>`; }).join('')}
  <text y="${f(r * .42)}" text-anchor="middle" font-family="AntonTR" font-size="${f(r * .2)}" fill="${C.ink}">HAVADAKİ O₂</text>
  <g class="${cls}-ibre"><path d="M0 ${f(r * .06)} L ${f(-r * .04)} 0 L 0 ${f(-r * .7)} L ${f(r * .04)} 0 Z" fill="${C.coral}"/></g><circle r="${f(r * .07)}" fill="${C.ink}"/>`, { sinif: cls });
const damga = (cls, x, y, yazi, boy = 120, don = -6) => M.yer(x, y, `<text text-anchor="middle" font-family="AntonTR" font-size="${boy}" fill="${C.coral}">${yazi}</text>`, { r: don, sinif: cls });
const cip = (cls, x, y, yazi, zemin) => M.yer(x, y, `<rect x="${-yazi.length * 17 - 26}" y="-46" width="${yazi.length * 34 + 52}" height="70" rx="35" fill="${zemin}"/><text y="10" text-anchor="middle" font-family="AntonTR" font-size="48" fill="#fff">${yazi}</text>`, { sinif: cls });

// shot boundaries: a hard cut on each line (the brand screen covers 4.25 -> L1); the 1000-year card is its own shot
const S = [0, L[1], L[2], L[3], L[4], k('hâlâ', 4) - .05, L[5], L[6], END];
M.kesmeler(S);

// ---------- 1 · the trees stop (hero: one big tree breathing O2)
const B0 = Array.from({ length: 9 }, (_, i) => [r2(300, 780), r2(560, 720), i]);
M.sahne('s0', `<rect width="1080" height="1920" fill="${C.gok}"/><circle cx="860" cy="330" r="90" fill="#F6D57A"/>
  <g id="c0">${[[120, 1250, .9], [250, 1270, .7], [860, 1260, .8], [980, 1250, 1], [380, 1280, .55], [720, 1285, .6]].map(([x, y, s], i) => fidan(x, y, s, i)).join('')}
  <rect y="1250" width="1080" height="700" fill="${C.toprak}"/><rect y="1250" width="1080" height="26" fill="${C.yaprak2}"/>
  ${agac('t0', 540, 1262, 1.15)}${B0.map(([x, y, i]) => kabarcik('b0' + i, x, y, 28, 'O₂', C.o2)).join('')}
  ${damga('dur0', 540, 980, 'ÜRETİM DURDU', 112)}</g>`);
M.kes('s0', 0);
M.yaklas('#c0', 0, S[1], 1, 1.1);
M.tl.push(`gsap.set('.kt',{scale:0,svgOrigin:'0 0'});tl.to('.kt',{scale:1,duration:.45,ease:'power3.out',stagger:.07},${(k('ağaçlar', 0) - .05).toFixed(3)});`);   // "bütün ağaçlar": the horizon fills
M.nefes('.t0-tac', .2, { kac: 2, oda: '0 -360' });
B0.forEach(([, , i]) => { const t0 = .25 + i * .36;
  M.yol('.b0' + i, t0, Math.min(2.4, k('bırakıyor', 0) + i * .03 - t0), [{ x: r2(-40, 40), y: -r2(380, 520) }]); });
M.renk('.t0-tac circle', k('bırakıyor', 0), C.gri, .35);
M.tl.push(`tl.to('.t0-in',{scaleY:.95,svgOrigin:'0 0',duration:.35,ease:'power2.out'},${k('bırakıyor', 0).toFixed(3)});`);
M.vur('.dur0', k('bırakıyor', 0) + .15);

// ---------- 2 · panic on the balcony (hero: Cemil; objects: the tubes he hoards)
const TX = [180, 290, 400, 500, 610, 720, 830, 935];
M.sahne('s1', `<g id="c1">${cephe}${TX.map((x, i) => tup('tb' + i, x, 1290)).join('')}${cemil('cem1', 400, 1100, 1.25)}${korkuluk}
  ${damga('pan1', 300, 560, 'PANİK!', 150, -8)}</g>`);
M.kes('s1', 1);
M.yaklas('#c1', S[1], S[2], 1.04, 1.12, '540 1100');
M.vur('.pan1', k('panik', 1)); M.kaybol('.pan1', k('hamsi', 1) + .2);
karakter.ifade(M, 'cem1', 'panik', k('panik', 1));
M.tl.push(`tl.to('#cem1',{x:-120,duration:.5,ease:'power2.inOut',yoyo:true,repeat:3},${k('bakkaldaki', 1).toFixed(3)});`);   // runs back and forth
const tA = k('tüplerini', 1), tB = LE[1] - .1;                                   // the tubes land one by one through "diziyor"
TX.forEach((_, i) => M.dus('.tb' + i, tA + i * (tB - tA) / TX.length));

// ---------- 3 · the meter does not move (hero: the dial; Cemil peeks in)
const A21 = -210 + 21 / 100 * 240 + 90;                                           // needle angle for 21 % on a 0-100 dial
M.sahne('s2', `<rect width="1080" height="1920" fill="${C.duvar}"/><g id="c2">${olcer('d2', 540, 820, 380)}
  <text class="y21" x="540" y="1450" text-anchor="middle" font-family="AntonTR" font-size="230" fill="${C.ink}">%21</text>
  <g class="pk2"><g transform="translate(1010,1220) scale(-1.1,1.1)">${karakter.ciz('cem2')}</g></g></g>`);
M.kes('s2', 2);
M.yaklas('#c2', S[2], S[3], 1, 1.06);
M.tl.push(`gsap.set('.d2-ibre',{rotation:${f(A21 - 18)},svgOrigin:'0 0'});tl.to('.d2-ibre',{rotation:${f(A21)},duration:.6,ease:'power3.out'},${(S[2] + .05).toFixed(3)});`);
M.tl.push(`tl.fromTo('.d2-ibre',{rotation:${f(A21 - 1.2)}},{rotation:${f(A21 + 1.2)},duration:.07,yoyo:true,repeat:7,ease:'none'},${k('kıpırdamıyor', 2).toFixed(3)});tl.to('.d2-ibre',{rotation:${f(A21)},duration:.1},${(k('kıpırdamıyor', 2) + .6).toFixed(3)});`);
M.vur('.y21', k('yüzde', 2), '540 1380');
M.tl.push(`gsap.set('.pk2',{x:260});tl.to('.pk2',{x:0,duration:.45,ease:'power3.out'},${(k('amına', 2) - .35).toFixed(3)});`);
karakter.ifade(M, 'cem2', 'sok', k('amına', 2));

// ---------- 4 · the mechanism: the forest breathes its own oxygen back in
M.sahne('s3', `<rect width="1080" height="1920" fill="${C.gok}"/><g id="c3">
  <rect y="1250" width="1080" height="700" fill="${C.toprak}"/><rect y="1250" width="1080" height="26" fill="${C.yaprak2}"/>
  ${agac('t3', 330, 1262, .95)}
  <rect x="660" y="1150" width="300" height="70" rx="35" fill="#7A5434"/>${[[700, 1150], [790, 1130], [880, 1155]].map(([x, y]) => `<rect x="${x - 12}" y="${y - 40}" width="24" height="44" fill="#F1E6D0"/><path d="M${x - 50} ${y - 36} Q ${x} ${y - 110} ${x + 50} ${y - 36} Z" fill="${C.coral}"/>`).join('')}
  <path d="M720 1330 q 30 -26 60 0 q 30 26 60 0" fill="none" stroke="#C9787A" stroke-width="18" stroke-linecap="round"/>
  <path class="ok3" d="M360 760 Q 560 420 820 980" fill="none" stroke="${C.o2}" stroke-width="12" stroke-dasharray="26 18" stroke-linecap="round"/>
  ${[0, 1, 2, 3, 4, 5, 6].map(i => kabarcik('b3' + i, 360, 760, 30, 'O₂', C.o2)).join('')}
  ${cip('uret3', 330, 470, 'ÜRETİR', C.yaprak2)}${cip('harca3', 830, 980, 'GERİ HARCAR', C.coral)}
  <text class="net3" x="540" y="1480" text-anchor="middle" font-family="AntonTR" font-size="110" fill="${C.ink}">KÂR: NEREDEYSE SIFIR</text></g>`);
M.kes('s3', 3);
M.yaklas('#c3', S[3], S[4], 1, 1.05);
M.belir('.t3', k('orman', 3) - .1, { olcek: 1 });
M.belir('.uret3', k('ürettiği', 3), { olcek: .7 }); M.belir('.harca3', k('geri', 3), { olcek: .7 });
M.tl.push(`gsap.set('.ok3',{opacity:0});tl.to('.ok3',{opacity:.55,duration:.3},${k('ürettiği', 3).toFixed(3)});tl.fromTo('.ok3',{strokeDashoffset:0},{strokeDashoffset:-220,duration:${(S[4] - k('ürettiği', 3)).toFixed(3)},ease:'none'},${k('ürettiği', 3).toFixed(3)});`);
// bubbles leave the leaves on "ürettiği", ride the arc (a quadratic curve), and dive into the mushrooms by "harcıyor"
const egri = n => ({ x: (820 - 360) * n, y: (1 - n) * (1 - n) * 760 + 2 * (1 - n) * n * 420 + n * n * 980 - 760 });
[0, 1, 2, 3, 4, 5, 6].forEach(i => { const t = k('ürettiği', 3) + i * .42;
  M.yol('.b3' + i, t, Math.max(1.6, k('harcıyor', 3) + .3 - t), [.25, .5, .75, 1].map(egri)); });
M.belir('.net3', k('harcıyor', 3), { olcek: .9, oda: '540 1440' });

// ---------- 5 · the channel's signature: the 1000-year jump, then the same balcony gone to rust
M.sahne('s4', `<rect width="1080" height="1920" fill="${C.ink}"/><g class="yil4"><text x="540" y="900" text-anchor="middle" font-family="AntonTR" font-size="330" fill="${C.paper}">1000</text>
  <text x="540" y="1100" text-anchor="middle" font-family="AntonTR" font-size="170" fill="${C.coral}">YIL SONRA</text></g>`);
M.kes('s4', 4);
M.tl.push(`gsap.set('.yil4',{scale:1.35,svgOrigin:'540 960',opacity:0});tl.to('.yil4',{scale:1,opacity:1,duration:.28,ease:'power4.out'},${S[4].toFixed(3)});tl.to('.yil4',{scale:.94,duration:${(S[5] - S[4] - .28).toFixed(3)},ease:'none'},${(S[4] + .28).toFixed(3)});`);
const ag = (x, y, s) => `<g transform="translate(${x},${y}) scale(${s})" opacity=".55">${[0, 30, 60, 90].map(a => `<line x1="0" y1="0" x2="${f(Math.cos(a * Math.PI / 180) * 120)}" y2="${f(Math.sin(a * Math.PI / 180) * 120)}" stroke="#fff" stroke-width="3"/>`).join('')}${[40, 75, 110].map(r => `<path d="M${r} 0 Q ${r * .8} ${r * .45} ${f(r * .71)} ${f(r * .71)} Q ${r * .45} ${r * .8} 0 ${r}" fill="none" stroke="#fff" stroke-width="3"/>`).join('')}</g>`;
M.sahne('s4b', `<g id="c4">${cephe}<rect width="1080" height="1920" fill="#6B5A40" opacity=".18"/>${TX.map(x => tup('tp', x, 1290, true)).join('')}${korkuluk}
  ${ag(80, 1060, 1.3)}${ag(1000, 1060, -1.3)}${olcer('d4', 300, 640, 170)}${ag(150, 480, 1)}
  ${damga('h21', 540, 940, 'HÂLÂ %21', 170, -5)}</g>`);
M.kes('s4b', 5);
M.yaklas('#c4', S[5], S[6], 1.12, 1.04, '540 1100');
M.tl.push(`gsap.set('.d4-ibre',{rotation:${f(A21)},svgOrigin:'0 0'});`);
M.vur('.h21', k('yirmi', 4));

// ---------- 6 · the real blow (no "nothing happens" ending): rotting forests pump CO2, the world turns into an oven
const kuru = (x, y, s) => M.yer(x, y, `<path d="M-22 0 L -14 -240 L 14 -240 L 22 0 Z" fill="#8C7B6B"/><path d="M-4 -180 L -80 -280 M 6 -210 L 70 -320 M 0 -240 L -10 -330" stroke="#8C7B6B" stroke-width="16" stroke-linecap="round"/>`, { s });
const C6 = Array.from({ length: 16 }, (_, i) => [r2(80, 1000), r2(1150, 1260), r2(30, 52), i]);
M.sahne('sc', `<rect class="gok6" width="1080" height="1920" fill="${C.gok}"/><circle class="gun6" cx="300" cy="360" r="110" fill="#F6D57A"/><g id="c6">
  <rect y="1250" width="1080" height="700" fill="${C.toprak2}"/><rect y="1250" width="1080" height="20" fill="#8C7B6B"/>
  ${[[150, 1262, .8], [380, 1262, 1], [620, 1262, .85], [860, 1262, .95]].map(([x, y, s]) => kuru(x, y, s)).join('')}
  ${C6.map(([x, y, r, i]) => kabarcik('cb' + i, x, y, r, 'CO₂', '#8E8A85')).join('')}
  <g transform="translate(900,520)"><rect x="-44" y="-330" width="88" height="560" rx="44" fill="#fff" stroke="${C.ink}" stroke-width="8"/><circle cy="270" r="80" fill="${C.coral}" stroke="${C.ink}" stroke-width="8"/>
    <g class="cv6"><rect x="-22" y="-300" width="44" height="560" rx="22" fill="${C.coral}"/></g>
    ${[-260, -180, -100, -20, 60, 140].map(y => `<rect x="44" y="${y}" width="30" height="6" fill="${C.ink}"/>`).join('')}</g>
  ${damga('fr6', 500, 760, 'FIRIN!', 190, -6)}</g>`);
M.kes('sc', 6);
M.yaklas('#c6', S[6], S[7], 1, 1.08);
C6.forEach(([, , , i]) => { const t = k('çürüyen', 5) + i * .12;
  M.belir('.cb' + i, t, { olcek: .3 }); M.tl.push(`tl.to('.cb${i}',{y:${f(-r2(500, 950))},x:${f(r2(-60, 60))},duration:${(S[7] - t).toFixed(3)},ease:'sine.out'},${t.toFixed(3)});`); });
M.tl.push(`gsap.set('.cv6',{scaleY:.18,svgOrigin:'0 260'});tl.to('.cv6',{scaleY:.5,duration:.8,ease:'power2.out'},${k('karbondioksit', 5).toFixed(3)});tl.to('.cv6',{scaleY:1,duration:.7,ease:'power2.out'},${k('fırına', 5).toFixed(3)});`);
M.renk('.gok6', k('fırına', 5), '#F3B07A', .6);
M.tl.push(`tl.to('.gun6',{scale:2.3,svgOrigin:'300 360',attr:{fill:'#F08A4B'},duration:.8,ease:'power2.out'},${k('fırına', 5).toFixed(3)});`);
M.vur('.fr6', k('dönüyor', 5));

// ---------- 7 · the punchline: the grandson sells the tubes for an AC; grandpa's other hoard in the thought bubble
M.sahne('s5', `<rect width="1080" height="1920" fill="${C.gok}"/><g id="c5">
  <rect y="1100" width="1080" height="820" fill="#B9B2A4"/><rect y="1100" width="1080" height="16" fill="#8E877A"/>
  <path d="M940 1100 L 940 930 Q 940 900 970 900 L 1020 900 L 1060 980 L 1060 1100 Z" fill="#D9A23A" stroke="#B9862A" stroke-width="6"/><path d="M975 920 L 1015 920 L 1045 980 L 975 980 Z" fill="#BFE3EE"/>
  <rect x="420" y="900" width="520" height="200" rx="14" fill="#E9B949" stroke="#C99A2E" stroke-width="6"/>
  <text x="680" y="1080" text-anchor="middle" font-family="AntonTR" font-size="72" fill="${C.ink}">HURDACI</text>
  ${[0, 1, 2, 3, 4].map(i => M.yer(500 + i * 80, 980, tup('', 0, 0, true), { r: -8 + i * 4, sinif: 'kt5' + i })).join('')}
  ${[520, 860].map(x => `<circle cx="${x}" cy="1110" r="46" fill="${C.ink}"/><circle cx="${x}" cy="1110" r="18" fill="${C.celik}"/>`).join('')}
  ${tup('el5', 300, 1010, true)}
  ${M.yer(115, 930, `<rect x="-110" y="-60" width="220" height="120" rx="18" fill="#FFFFFF" stroke="${C.celik2}" stroke-width="6"/>${[-30, -10, 10, 30].map(y => `<rect x="-86" y="${y}" width="172" height="6" rx="3" fill="${C.celik}"/>`).join('')}<text x="0" y="-24" text-anchor="middle" font-family="AntonTR" font-size="34" fill="${C.o2}">KLİMA</text>`, { s: .7, sinif: 'kl5' })}
  ${cemil('cem5', 210, 1060, .95, { sapka: true })}
  <g class="dus5"><ellipse cx="300" cy="560" rx="270" ry="210" fill="#fff" stroke="${C.ink}" stroke-width="6"/><circle cx="330" cy="815" r="26" fill="#fff" stroke="${C.ink}" stroke-width="6"/><circle cx="315" cy="880" r="14" fill="#fff" stroke="${C.ink}" stroke-width="6"/>
    ${cemil('cem5y', 220, 600, .55, { yasli: true })}
    ${[[340, 640], [410, 640], [480, 640], [375, 570], [445, 570], [410, 500]].map(([x, y], i) => `<g class="rl rl${i}"><rect x="${x - 32}" y="${y - 34}" width="64" height="68" rx="10" fill="#FFFDF6" stroke="#CDBE9E" stroke-width="4"/><ellipse cx="${x}" cy="${y - 34}" rx="32" ry="10" fill="#EFE7D6" stroke="#CDBE9E" stroke-width="3"/><circle cx="${x}" cy="${y - 34}" r="7" fill="#CDBE9E"/></g>`).join('')}</g>
  ${damga('st5', 820, 560, 'STOKÇU', 120, -7)}</g>`);
M.kes('s5', 7);
M.yaklas('#c5', S[7], END, 1, 1.06);
[0, 1, 2, 3, 4].forEach(i => M.dus('.kt5' + i, k('torunu', 6) + i * .3, { yuk: 60, sure: .25 }));
M.git('.el5', k('satıp', 6) - .2, { x: 260, y: -80, don: 70, oda: '0 -100', sure: .6 }); M.kaybol('.el5', k('satıp', 6) + .4, .15);
M.zipla('#cem5', k('satıp', 6) - .2, { kac: 3 });
M.belir('.kl5', k('klima', 6), { olcek: .4 });
M.belir('.dus5', k('dedem', 6), { olcek: .6, oda: '315 880' });
M.tl.push(`tl.to('.cem5y-in',{rotation:-6,svgOrigin:'0 0',duration:.3,yoyo:true,repeat:5,ease:'sine.inOut'},${(k('dedem', 6) + .2).toFixed(3)});`);
M.tl.push(`gsap.set('.rl',{opacity:0,y:-40});tl.to('.rl',{opacity:1,y:0,duration:.22,ease:'power3.in',stagger:.1},${k('tuvalet', 6).toFixed(3)});`);
M.vur('.st5', k('stoklamıştı', 6));

return M.bitir();
};
