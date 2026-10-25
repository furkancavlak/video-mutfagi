// oxygbio v01 "uçak" — FREE tier scenes (code animation). Called by uretim/kurgu.js.
// Rules this file follows (dersler/KURGU-DILI.md): one world (a cabin drawn in one-point perspective),
// light ground, the information lives INSIDE the scene (monitor, armrest screen, plates, field signs),
// the camera travels to the object that carries the information, 2-4 ambient touches, no shake/elastic.
// Captions, brand screens and the corner tag come from the core; this file only draws the story.
module.exports = function ({ C: C0, T, at, f, r2, rnd, W }) {
const { Z, L, LE, cue } = T, HIT = Z.sting[0], END = T.END;

// palette: light, warm, one accent (coral) + oxygen cyan
const C = Object.assign({ paper: '#F4EEDF', wall: '#E9E2D2', wall2: '#D8D0BE', ceil: '#F7F3EA', floor: '#9AA7AE', floor2: '#7E8B93', seat: '#7D8F99', seat2: '#6A7C86', tea: '#B5521B', ink: '#1F2A30', coral: '#E8553A', o2: '#1FA9BE', sky: '#A9DCEB', sky2: '#E3F4F8', alu: '#BCC6CC', alu2: '#8E9AA2', skin: '#E2B08A', hair: '#3B2C22' }, C0);
// ---------- one-point perspective cabin
const VP = { x: 540, y: 900 }, K = 1;                 // vanishing point
const P = (X, Y, z) => [VP.x + X * K / z, VP.y + Y * K / z];
const poly = (pts, fill, extra = '') => `<polygon points="${pts.map(p => p.map(f).join(',')).join(' ')}" fill="${fill}" ${extra}/>`;
const WX = 560, FY = 1060, CY = -960;                 // wall X, floor Y, ceiling Y (world units at z=1 => pixels)
const ZN = 0.95, ZF = 9;
let cabin = '';
// shells
cabin += poly([P(-WX, CY, ZN), P(0, CY, ZN), P(0, CY, ZF), P(-WX, CY, ZF)], C.ceil);
cabin += `<g class="rwall">${poly([P(0, CY, ZN), P(WX, CY, ZN), P(WX, CY, ZF), P(0, CY, ZF)], C.ceil)}${poly([P(0, FY, ZN), P(WX, FY, ZN), P(WX, FY, ZF), P(0, FY, ZF)], C.floor)}</g>`;
cabin += poly([P(-WX, FY, ZN), P(0, FY, ZN), P(0, FY, ZF), P(-WX, FY, ZF)], C.floor);
cabin += poly([P(-90, FY, ZN), P(90, FY, ZN), P(90, FY, ZF), P(-90, FY, ZF)], C.floor2);            // aisle carpet
cabin += `<g class="lwall">${poly([P(-WX, CY, ZN), P(-WX, FY, ZN), P(-WX, FY, ZF), P(-WX, CY, ZF)], C.wall)}</g>`;
cabin += `<g class="rwall">${poly([P(WX, CY, ZN), P(WX, FY, ZN), P(WX, FY, ZF), P(WX, CY, ZF)], C.wall2)}</g>`;
cabin += poly([P(-WX, FY, ZF), P(WX, FY, ZF), P(WX, CY, ZF), P(-WX, CY, ZF)], '#CFC6B2');            // back bulkhead
// windows + overhead bins along both walls (far to near)
const winL = [], winR = [];
for (let z = 8.4; z >= 1.2; z -= 0.9) {
  const a = z, b = z + 0.42;
  winL.push(poly([P(-WX, -330, a), P(-WX, -40, a), P(-WX, -40, b), P(-WX, -330, b)], C.sky, 'class="win"'));
  winR.push(poly([P(WX, -330, a), P(WX, -40, a), P(WX, -40, b), P(WX, -330, b)], C.sky, 'class="win"'));
}
cabin += `<g class="lwall">${winL.join('')}</g><g class="rwall">${winR.join('')}</g>`;
cabin += poly([P(-WX, CY, ZN), P(-WX + 260, CY, ZN), P(-WX + 260, CY + 260, ZN), P(-WX, CY + 330, ZN), P(-WX, CY + 330, ZF), P(-WX + 260, CY + 260, ZF), P(-WX + 260, CY, ZF), P(-WX, CY, ZF)], '#ECE6D8', 'stroke="#D2CAB7" stroke-width="2"');
cabin += `<g class="rwall">${poly([P(WX, CY, ZN), P(WX - 260, CY, ZN), P(WX - 260, CY + 260, ZN), P(WX, CY + 330, ZN), P(WX, CY + 330, ZF), P(WX - 260, CY + 260, ZF), P(WX - 260, CY, ZF), P(WX, CY, ZF)], '#E2DBCB', 'stroke="#CBC2AE" stroke-width="2"')}</g>`;
// seat rows (far first). each row: two seats left, two right; some heads
const rowsL = [], rowsR = [];
for (let z = 8.6; z >= 1.6; z -= 0.7) {
  for (const side of [-1, 1]) {
    let g = '';
    for (const sx of [0, 1]) {
      const x0 = side < 0 ? -WX + 50 + sx * 205 : 100 + 20 + sx * 205, x1 = x0 + 180;
      g += poly([P(x0, FY, z), P(x1, FY, z), P(x1, 360, z), P(x0, 360, z)], C.seat);                  // back
      g += poly([P(x0 + 10, 360, z), P(x1 - 10, 360, z), P(x1 - 20, 250, z), P(x0 + 20, 250, z)], C.seat2); // headrest
      g += poly([P(x0 + 30, 250, z), P(x1 - 30, 250, z), P(x1 - 30, 225, z), P(x0 + 30, 225, z)], '#F3F0E8'); // headrest cover
      if (rnd() > .35) { const SH = ['#E8553A', '#D9A441', '#6E9A5A', '#8A5A7A', '#F2EFE6'][Math.floor(rnd() * 5)]; const [sx0, sy0] = P(x0 + 25, 330, z + .05), [sx1, sy1] = P(x1 - 25, 250, z + .05); g += `<rect class="head" x="${f(sx0)}" y="${f(sy1)}" width="${f(sx1 - sx0)}" height="${f(sy0 - sy1)}" rx="${f((sx1 - sx0) / 3)}" fill="${SH}"/>`; const [hx, hy] = P((x0 + x1) / 2, 200, z + .05); const r = 70 / z; g += `<circle class="head" cx="${f(hx)}" cy="${f(hy)}" r="${f(r)}" fill="${C.skin}"/><path class="head" d="M${f(hx - r)} ${f(hy - r * .1)} Q ${f(hx)} ${f(hy - r * 1.5)} ${f(hx + r)} ${f(hy - r * .1)} Z" fill="${rnd() > .5 ? C.hair : '#7A5230'}"/>`; }
    }
    (side < 0 ? rowsL : rowsR).push(g);
  }
}
for (let i = 0; i < rowsL.length; i++) cabin += rowsL[i] + `<g class="rwall rseat">${rowsR[i]}</g>`;
// ceiling lights strip
for (let z = 8; z >= 1.2; z -= 1) cabin += poly([P(-40, CY + 2, z), P(40, CY + 2, z), P(40, CY + 2, z + .5), P(-40, CY + 2, z + .5)], '#FFF8E6', 'class="lamp"');

// drop-down monitor (A language: the information lives on it) at z=2.4
const [mx, my] = P(0, -520, 2.4), ms = 1 / 2.4;
const monitor = `<g id="mon" transform="translate(${f(mx)} ${f(my)}) scale(${(ms * 2.2).toFixed(3)})">
  <rect x="-10" y="-120" width="20" height="60" fill="${C.alu2}"/>
  <rect x="-230" y="-70" width="460" height="250" rx="18" fill="${C.ink}"/>
  <rect x="-212" y="-52" width="424" height="214" rx="8" fill="#10343F"/>
  <text class="m1" x="0" y="20" text-anchor="middle" font-family="AntonTR" font-size="52" fill="#9FE6F2">İRTİFA 11.000 m</text>
  <text class="m2" x="0" y="64" text-anchor="middle" font-family="Inter Tight" font-weight="800" font-size="24" letter-spacing="3" fill="#7FB9C4">HAVADAKİ O₂</text>
  <text class="m3a" x="0" y="140" text-anchor="middle" font-family="AntonTR" font-size="80" fill="#5FE0F0">%21</text>
  <text class="m3b" x="0" y="140" text-anchor="middle" font-family="AntonTR" font-size="80" fill="${C.coral}" opacity="0">%0</text>
  <g class="mk" opacity="0"><rect x="-212" y="-52" width="424" height="100" fill="#10343F"/><text x="0" y="30" text-anchor="middle" font-family="AntonTR" font-size="50" fill="${C.coral}">KAPTAN KONUŞUYOR</text></g>
</g>`;
// seatbelt sign (ambient pulse)
const [bx, by] = P(0, CY + 40, 3.6);
const belt = `<g class="belt" transform="translate(${f(bx)} ${f(by)}) scale(.45)"><rect x="-80" y="-30" width="160" height="60" rx="10" fill="#2A3238"/><circle cx="-40" cy="0" r="16" fill="#FFC94A"/><text x="20" y="10" font-family="Inter Tight" font-weight="800" font-size="28" fill="#FFC94A" text-anchor="middle">⧉</text></g>`;

// trolley drawn at z=1 in the aisle, scaled around VP to its depth
const trolley = `<g id="trol"><g>
  <rect x="${VP.x - 85}" y="${VP.y + FY - 330}" width="170" height="300" rx="10" fill="${C.alu}" stroke="${C.alu2}" stroke-width="6"/>
  <rect x="${VP.x - 70}" y="${VP.y + FY - 300}" width="140" height="40" rx="5" fill="${C.alu2}"/><rect x="${VP.x - 70}" y="${VP.y + FY - 240}" width="140" height="40" rx="5" fill="${C.alu2}"/>
  <rect x="${VP.x - 75}" y="${VP.y + FY - 368}" width="20" height="40" fill="#5DA35F"/><rect x="${VP.x - 45}" y="${VP.y + FY - 378}" width="22" height="50" fill="${C.coral}"/><rect x="${VP.x - 15}" y="${VP.y + FY - 360}" width="24" height="32" fill="#E8C35A"/>
  <circle cx="${VP.x - 60}" cy="${VP.y + FY - 18}" r="14" fill="#333"/><circle cx="${VP.x + 60}" cy="${VP.y + FY - 18}" r="14" fill="#333"/></g></g>`;

// O2 molecules floating at depth (far = small + blurred)
const mol = Array.from({ length: 26 }, () => ({ X: r2(-480, 480), Y: r2(-700, 600), z: r2(1.1, 6.5) })).sort((a, b) => b.z - a.z);
const mols = mol.map((m, i) => { const [x, y] = P(m.X, m.Y, m.z); const r = 34 / m.z; const blur = m.z > 3.5 ? 'url(#bl2)' : m.z < 1.4 ? 'url(#bl1)' : ''; return `<g class="mo mo${i}" filter="${blur}"><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${C.o2}" opacity=".88"/><text x="${f(x)}" y="${f(y + r * .36)}" text-anchor="middle" font-family="AntonTR" font-size="${f(r * 1.05)}" fill="#fff">O₂</text></g>`; }).join('');

// right-wall dust (for the captain gag)
const rdust = Array.from({ length: 70 }, () => { const z = r2(1, 8), [x, y] = P(WX - r2(0, 60), r2(CY, FY), z); return { x, y, s: r2(10, 30) / Math.sqrt(z) }; });

// ---------- window close-up (S2)
const shards = Array.from({ length: 60 }, () => ({ x: r2(330, 750), y: r2(500, 1180), s: r2(10, 28), dx: r2(-50, 50), dy: r2(-40, 40) }));
const napkins = Array.from({ length: 6 }, (_, i) => ({ x: r2(120, 960), y: r2(1250, 1500), r: r2(-30, 30) }));
const cl = (x, y, s, o = 1) => `<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}"><ellipse cx="0" cy="0" rx="70" ry="34" fill="#fff"/><ellipse cx="50" cy="-18" rx="56" ry="40" fill="#fff"/><ellipse cx="100" cy="0" rx="60" ry="30" fill="#fff"/></g>`;
const PIT = cue('pıt', L[1]);

// ---------- timeline
const tl = [];
// camera on the cabin: slow push, then glide into the nearest left window before the sting
tl.push(`gsap.set('#cam',{scale:1,x:0,y:0,svgOrigin:'540 900'});tl.to('#cam',{scale:1.12,duration:${at(HIT - .9)},ease:'sine.inOut'},0);`);
// trolley approaches down the aisle
tl.push(`gsap.set('#trol',{scale:${(1 / 7).toFixed(3)},svgOrigin:'540 900'});tl.to('#trol',{scale:${(1 / 2.1).toFixed(3)},duration:4.2,ease:'power1.out'},${at(L[0] + .6)});`);
// molecules drift; on "yok" they fade one by one (no pop, no bounce)
mol.forEach((m, i) => tl.push(`tl.to('.mo${i}',{y:${f(r2(-30, -70) / m.z)},x:${f(r2(-20, 20) / m.z)},duration:${at(cue('yok', L[0]) - L[0])},ease:'sine.inOut'},${at(L[0])});tl.to('.mo${i}',{opacity:0,duration:.35},${at(cue('yok', L[0]) + i * .03)});`));
// monitor: altitude -> O2 21% -> 0%
tl.push(`gsap.set('.m2,.m3a',{opacity:0});tl.to('.m2,.m3a',{opacity:1,duration:.35},${at(cue('evrendeki', L[0]))});`);
tl.push(`tl.to('.m3a',{opacity:0,duration:.25},${at(cue('yok', L[0]))});tl.to('.m3b',{opacity:1,duration:.25},${at(cue('yok', L[0]))});`);
tl.push(`tl.to('#mon',{y:'+=0',duration:.01},${at(L[0])});`);
// ambient: seatbelt sign breathes, clouds slide in the windows
tl.push(`tl.fromTo('.belt circle',{opacity:1},{opacity:.35,duration:.9,yoyo:true,repeat:${Math.floor(END / .9)},ease:'sine.inOut'},0);`);
// camera dives toward the near-left window into the sting
tl.push(`tl.to('#cam',{scale:3.2,x:1494,y:493,duration:.85,ease:'power3.in'},${at(HIT - .9)});tl.to('#s1',{opacity:0,duration:.2},${at(HIT - .15)});`);
// S2 window
tl.push(`gsap.set('#s2',{opacity:0});tl.to('#s2',{opacity:1,duration:.3},${at(L[1] + .2)});`);
tl.push(`gsap.set('#wcam',{scale:1.08,svgOrigin:'540 840'});tl.to('#wcam',{scale:1,duration:${at(PIT - L[1])},ease:'sine.out'},${at(L[1] + .2)});`);
tl.push(`tl.fromTo('#wcl1',{x:0},{x:-220,duration:${at(LE[1] - L[1])},ease:'none'},${at(L[1])});tl.fromTo('#wcl2',{x:0},{x:-120,duration:${at(LE[1] - L[1])},ease:'none'},${at(L[1])});`);
tl.push(`gsap.set('.plac',{opacity:0,y:10});tl.to('.plac',{opacity:1,y:0,duration:.45,ease:'power3.out'},${at(cue('akrilik', L[1]))});`);
tl.push(`gsap.set('.stamp',{opacity:0,scale:1.4,svgOrigin:'540 760'});tl.to('.stamp',{opacity:1,scale:1,duration:.3,ease:'power3.out'},${at(cue('üçte', L[1]))});`);
// pit: pane turns to dust and drifts out; blind flips up; napkins sail across (single smooth moves)
tl.push(`tl.to('.pane,.stamp',{opacity:0,duration:.35},${at(PIT)});gsap.set('.shard',{opacity:0});tl.set('.shard',{opacity:.9},${at(PIT)});`);
shards.forEach((s, i) => tl.push(`tl.to('.sh${i}',{x:${f(s.dx * 8)},y:${f(s.dy * 8 - 200)},opacity:0,duration:${r2(1.2, 2).toFixed(2)},ease:'power2.out'},${at(PIT + r2(0, .15))});`));
tl.push(`tl.to('#blind',{y:-330,duration:.6,ease:'power2.out'},${at(PIT + .05)});`);
napkins.forEach((n, i) => tl.push(`gsap.set('.nap${i}',{opacity:0});tl.set('.nap${i}',{opacity:1},${at(PIT + .3 + i * .12)});tl.fromTo('.nap${i}',{x:0,y:0,rotation:0},{x:${f(r2(-200, 200))},y:${f(-r2(700, 1100))},rotation:${f(r2(-200, 200))},duration:1.6,ease:'power2.in'},${at(PIT + .3 + i * .12)});`));
tl.push(`gsap.set('.wind2',{opacity:0});tl.set('.wind2',{opacity:.8},${at(PIT + .2)});tl.fromTo('.wind2',{x:-500},{x:1300,duration:.9,ease:'none',stagger:.12,repeat:${Math.floor((LE[1] - PIT) / 1.2)}},${at(PIT + .2)});`);
tl.push(`tl.to('#s2',{opacity:0,duration:.3},${at(LE[1] + .1)});`);

// S3 captain: back to the cabin wide, monitor says KAPTAN, camera pans right, right wall turns to dust
tl.push(`gsap.set('#s3',{opacity:0});tl.to('#s3',{opacity:1,duration:.35},${at(LE[1] + .1)});`);
tl.push(`gsap.set('.mk3',{opacity:0});tl.to('.mk3',{opacity:1,duration:.3},${at(Z.chime[0])});tl.to('#mons3 .m1',{opacity:0,duration:.2},${at(Z.chime[0])});`);
tl.push(`gsap.set('.ring3',{scale:.5,opacity:0,svgOrigin:'540 300'});tl.to('.ring3',{scale:1.6,opacity:.0,duration:1.1,stagger:.25,startAt:{opacity:.7}},${at(Z.chime[0])});`);
tl.push(`gsap.set('#cam3',{x:0,svgOrigin:'540 900'});tl.to('#cam3',{x:-260,scale:1.1,duration:1.4,ease:'sine.inOut'},${at(cue('sağ', L[2]))});`);
const KAL = cue('kalmamıştır', L[2]);
tl.push(`tl.to('#s3 .rwall',{opacity:0,duration:.5},${at(KAL)});gsap.set('.rd',{opacity:0});tl.set('.rd',{opacity:1},${at(KAL)});`);
rdust.forEach((d, i) => tl.push(`tl.to('.rd${i}',{x:${f(r2(200, 700))},y:${f(r2(-200, 200))},opacity:0,duration:${r2(1, 1.8).toFixed(2)},ease:'power2.out'},${at(KAL + r2(0, .3))});`));
tl.push(`gsap.set('.outsky',{opacity:0});tl.to('.outsky',{opacity:1,duration:.5},${at(KAL)});`);

tl.push(`tl.to('#s3',{opacity:0,duration:.35},${at(LE[2] + .3)});`);
const S2 = sahneler2({ C, cue, L, LE, Z, r2, f, at, defs: `<defs><filter id="bl1"><feGaussianBlur stdDeviation="5"/></filter><filter id="bl2"><feGaussianBlur stdDeviation="2.2"/></filter><radialGradient id="vig" cx="50%" cy="45%" r="70%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#3A2E1E" stop-opacity=".28"/></radialGradient><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7EC8DF"/><stop offset="1" stop-color="${C.sky2}"/></linearGradient></defs>`, cl });
tl.push(...S2.tl);

const defs = `<defs><filter id="bl1"><feGaussianBlur stdDeviation="5"/></filter><filter id="bl2"><feGaussianBlur stdDeviation="2.2"/></filter>
  <radialGradient id="vig" cx="50%" cy="45%" r="70%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#3A2E1E" stop-opacity=".28"/></radialGradient>
  <linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7EC8DF"/><stop offset="1" stop-color="${C.sky2}"/></linearGradient>
  <linearGradient id="frameg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FBF8F1"/><stop offset="1" stop-color="#D9D1BF"/></linearGradient></defs>`;

const cabinScene = (id, camId, extra = '') => `<div class="sc" id="${id}"><svg width="1080" height="1920" viewBox="0 0 1080 1920">${defs}
  <rect width="1080" height="1920" fill="${C.paper}"/>
  <g id="${camId}">${extra.includes('sky') ? `<rect class="outsky" x="540" y="0" width="1400" height="1920" fill="url(#skyg)"/>${cl(800, 600, 1.4)}${cl(1100, 1100, 1.8)}` : ''}${cabin}${id === 's1' ? mols : ''}${belt}${monitor.replace('id="mon"', `id="mon${id}"`).replace('class="mk"', `class="mk${id === 's3' ? '3' : ''}"`)}
  ${id === 's1' ? trolley : ''}
  ${id === 's3' ? rdust.map((d, i) => `<rect class="rd rd${i}" x="${f(d.x)}" y="${f(d.y)}" width="${f(d.s)}" height="${f(d.s)}" fill="${C.wall2}"/>`).join('') + [0, 1, 2].map(i => `<circle class="ring3" cx="540" cy="300" r="90" fill="none" stroke="${C.coral}" stroke-width="8"/>`).join('') : ''}
  </g><rect width="1080" height="1920" fill="url(#vig)"/></svg></div>`;

const windowScene = `<div class="sc" id="s2"><svg width="1080" height="1920" viewBox="0 0 1080 1920">${defs}
  <rect width="1080" height="1920" fill="${C.wall}"/>
  <g id="wcam">
    <rect x="140" y="260" width="800" height="1180" rx="330" fill="url(#frameg)"/>
    <rect x="215" y="335" width="650" height="1030" rx="280" fill="#CFC7B4"/>
    <clipPath id="pc"><rect x="290" y="410" width="500" height="880" rx="230"/></clipPath>
    <g clip-path="url(#pc)">
      <rect x="290" y="410" width="500" height="880" fill="url(#skyg)"/>
      <g id="wcl2">${cl(300, 1000, 1.3, .7)}${cl(620, 760, 1, .7)}</g>
      <g id="wcl1">${cl(380, 640, 1.6)}${cl(600, 1120, 2)}${cl(820, 900, 1.4)}</g>
      ${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect class="wind2" x="0" y="${520 + i * 100}" width="${f(r2(180, 340))}" height="7" rx="3" fill="#fff"/>`).join('')}
      <rect class="pane" x="290" y="410" width="500" height="880" fill="#DDF3F8" opacity=".42"/><path class="pane" d="M300 900 L 700 420 L 780 420 L 380 1000 Z" fill="#fff" opacity=".22"/>
      <path class="pane" d="M330 520 Q 420 450 520 440" stroke="#fff" stroke-width="16" stroke-linecap="round" fill="none" opacity=".55"/>
      <g id="blind"><rect x="290" y="350" width="500" height="260" fill="#EFE9DC"/><rect x="290" y="595" width="500" height="18" fill="#D8D0BE"/><rect x="510" y="580" width="60" height="16" rx="8" fill="#BDB4A0"/></g>
    </g>
    <g class="stamp"><rect x="370" y="660" width="340" height="190" rx="14" fill="none" stroke="${C.coral}" stroke-width="9" transform="rotate(-8 540 760)"/><text x="540" y="745" text-anchor="middle" font-family="AntonTR" font-size="64" fill="${C.coral}" transform="rotate(-8 540 760)">ÜÇTE BİRİ</text><text x="540" y="820" text-anchor="middle" font-family="AntonTR" font-size="64" fill="${C.coral}" transform="rotate(-8 540 760)">OKSİJEN</text></g>
    ${shards.map((s, i) => `<rect class="shard sh${i}" x="${f(s.x)}" y="${f(s.y)}" width="${f(s.s)}" height="${f(s.s * .8)}" fill="#F2FBFD"/>`).join('')}
    <g class="plac"><rect x="330" y="1395" width="420" height="78" rx="10" fill="#F8F4EA" stroke="#BFB6A2" stroke-width="3"/><text x="540" y="1447" text-anchor="middle" font-family="AntonTR" font-size="44" fill="${C.ink}" letter-spacing="2">PENCERE: AKRİLİK</text></g>
  </g>
  ${napkins.map((n, i) => `<rect class="nap${i}" x="${f(n.x)}" y="${f(n.y)}" width="110" height="110" fill="#fff" stroke="#E0D9C9" stroke-width="3" transform="rotate(${f(n.r)} ${f(n.x + 55)} ${f(n.y + 55)})"/>`).join('')}
  <rect width="1080" height="1920" fill="url(#vig)"/></svg></div>`;

tl.unshift("gsap.set('#s3',{opacity:0});");
return {
  html: [cabinScene('s1', 'cam'), windowScene, cabinScene('s3', 'cam3', 'sky'), S2.html].join('\n'),
  tl,
  css: `.big8{position:absolute;left:0;top:300px;width:${W}px;text-align:center;font:400 118px/1.02 "AntonTR";color:${C.ink}}.big8 span{color:${C.coral}}`,
};
};

// ---- scenes 4-8: passenger, outside, cockpit, the fall, the survivor
function sahneler2 ({ C, cue, L, LE, Z, r2, f, at, defs, cl }) {
  const tl = [], html = [];
  const sc = (id, from, to, body, bg = C.paper) => {
    html.push(`<div class="sc" id="${id}"><svg width="1080" height="1920" viewBox="0 0 1080 1920">${defs}<rect width="1080" height="1920" fill="${bg}"/>${body}<rect width="1080" height="1920" fill="url(#vig)"/></svg></div>`);
    tl.push(`gsap.set('#${id}',{opacity:0});tl.to('#${id}',{opacity:1,duration:.35},${at(from)});tl.to('#${id}',{opacity:0,duration:.35},${at(to - .35)});`);
  };
  const SHIRT = [C.coral, '#D9A441', '#6E9A5A', '#8A5A7A'];

  // ---- S4: a passenger in close-up, armrest screen carries the numbers; body -> sack, tea -> vapour
  {
    const s0 = LE[2] + .15, s1 = LE[3] + .3;
    const GID = cue('gidince', L[3]), TOR = cue('torba', L[3]), CAY = cue('çay', L[3]), BUH = cue('buhar', L[3]), SU = cue('suyun', L[3]);
    const dust = Array.from({ length: 70 }, () => ({ x: r2(330, 750), y: r2(520, 1180), s: r2(10, 26) }));
    sc('s4', s0, s1, `
      <g id="c4">
        <rect x="0" y="0" width="1080" height="1920" fill="${C.wall}"/>
        <rect x="70" y="330" width="230" height="330" rx="100" fill="#D2CAB7"/><rect x="95" y="355" width="180" height="280" rx="85" fill="url(#skyg)"/>${'' /* window behind */}
        <rect x="250" y="360" width="580" height="1100" rx="120" fill="${C.seat}"/>
        <rect x="320" y="300" width="440" height="190" rx="70" fill="${C.seat2}"/><rect x="360" y="320" width="360" height="70" rx="20" fill="#F3F0E8"/>
        <g class="pax">
          <rect x="300" y="760" width="480" height="560" rx="150" fill="${C.coral}"/>
          <rect x="250" y="900" width="120" height="380" rx="60" fill="#D84A30"/><rect x="710" y="900" width="120" height="380" rx="60" fill="#D84A30"/>
          <rect x="460" y="700" width="160" height="110" rx="40" fill="${C.skin}"/>
          <circle cx="540" cy="590" r="150" fill="${C.skin}"/>
          <path d="M390 575 Q 400 410 540 420 Q 690 410 690 575 Q 640 500 540 505 Q 450 500 390 575 Z" fill="${C.hair}"/>
          <circle cx="490" cy="600" r="14" fill="${C.ink}"/><circle cx="595" cy="600" r="14" fill="${C.ink}"/>
          <path d="M495 670 Q 542 700 590 670" fill="none" stroke="${C.ink}" stroke-width="10" stroke-linecap="round"/>
        </g>
        <g class="dust4">${dust.map((d, i) => `<rect class="d4 d4_${i}" x="${f(d.x)}" y="${f(d.y)}" width="${f(d.s)}" height="${f(d.s)}" fill="${i % 3 ? C.coral : C.skin}"/>`).join('')}</g>
        <g class="sack" opacity="0">
          <path d="M360 1300 Q 300 1000 440 880 L 410 820 L 670 820 L 640 880 Q 780 1000 720 1300 Z" fill="#B08A5E"/>
          <path d="M410 820 L 670 820 L 655 860 L 425 860 Z" fill="#8C6A44"/>
          <g transform="rotate(-6 540 1080)"><rect x="440" y="1020" width="200" height="110" rx="8" fill="#F4EEDF"/><text x="540" y="1095" text-anchor="middle" font-family="AntonTR" font-size="62" fill="${C.ink}">C · H · N</text></g>
        </g>
        <rect x="160" y="1320" width="760" height="40" rx="12" fill="#B9B0A0"/><rect x="180" y="1355" width="720" height="330" fill="#CFC6B2"/>
        <g id="glass4">
          <ellipse cx="760" cy="1316" rx="110" ry="22" fill="#E7E0D0"/>
          <clipPath id="gl4"><path d="M700 1060 L 820 1060 Q 808 1150 780 1190 Q 808 1240 808 1305 L 712 1305 Q 712 1240 740 1190 Q 712 1150 700 1060 Z"/></clipPath>
          <g clip-path="url(#gl4)"><rect x="690" y="1050" width="140" height="270" fill="#F2F7F8"/><rect class="tea4" x="690" y="1110" width="140" height="210" fill="${C.tea || '#B5521B'}"/></g>
          <path d="M700 1060 L 820 1060 Q 808 1150 780 1190 Q 808 1240 808 1305 L 712 1305 Q 712 1240 740 1190 Q 712 1150 700 1060 Z" fill="none" stroke="#FFFFFF" stroke-width="6" opacity=".9"/>
          ${[0, 1, 2].map(i => `<path class="st4 st4_${i}" d="M${735 + i * 25} 1040 q -18 -40 0 -80 q 18 -40 0 -80" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" opacity=".55"/>`).join('')}
        </g>
        <g id="scr4" transform="translate(860 860)">
          <rect x="-40" y="120" width="30" height="180" fill="${C.alu2}"/>
          <rect x="-180" y="-20" width="220" height="160" rx="14" fill="${C.ink}"/><rect x="-168" y="-8" width="196" height="136" rx="8" fill="#10343F"/>
          <g class="t4i"><text x="-70" y="78" text-anchor="middle" font-family="Inter Tight" font-weight="800" font-size="20" fill="#7FB9C4" letter-spacing="2">KİŞİSEL EKRAN</text></g><g class="t4a" opacity="0"><text x="-70" y="40" text-anchor="middle" font-family="Inter Tight" font-weight="800" font-size="18" fill="#7FB9C4" letter-spacing="1">VÜCUTTA OKSİJEN</text><text x="-70" y="108" text-anchor="middle" font-family="AntonTR" font-size="70" fill="#5FE0F0">%65</text><text class="t4z" x="-70" y="108" text-anchor="middle" font-family="AntonTR" font-size="70" fill="${C.coral}" opacity="0">YOK</text></g>
          <g class="t4b" opacity="0"><text x="-70" y="40" text-anchor="middle" font-family="Inter Tight" font-weight="800" font-size="18" fill="#7FB9C4" letter-spacing="1">SUDA OKSİJEN</text><text x="-70" y="108" text-anchor="middle" font-family="AntonTR" font-size="70" fill="#5FE0F0">%89</text></g>
        </g>
      </g>`, C.wall);
    tl.push(`gsap.set('#c4',{scale:1.1,svgOrigin:'540 800'});tl.to('#c4',{scale:1,duration:${at(GID - s0)},ease:'sine.out'},${at(s0)});`);
    tl.push(`tl.to('.t4i',{opacity:0,duration:.2},${at(cue('vücudunun', L[3]) - .1)});tl.to('.t4a',{opacity:1,duration:.4},${at(cue('vücudunun', L[3]))});tl.to('.t4a text:nth-child(2)',{opacity:0,duration:.3},${at(GID + .4)});tl.to('.t4z',{opacity:1,duration:.3},${at(GID + .4)});`);
    tl.push(`gsap.set('.dust4',{opacity:0});tl.set('.dust4',{opacity:1},${at(GID)});tl.to('.pax',{opacity:0,duration:.6},${at(GID)});`);
    dust.forEach((d, i) => tl.push(`tl.to('.d4_${i}',{x:${f(r2(-260, 260))},y:${f(r2(-500, -100))},opacity:0,duration:${r2(1.2, 2).toFixed(2)},ease:'power2.out'},${at(GID + r2(0, .4))});`));
    tl.push(`tl.fromTo('.sack',{opacity:0,y:40},{opacity:1,y:0,duration:.5,ease:'power2.out'},${at(TOR - .2)});`);
    // camera moves to the tea, which turns to vapour
    tl.push(`tl.to('#c4',{scale:1.55,x:-330,y:-560,duration:1.1,ease:'power2.inOut'},${at(CAY - .4)});`);
    tl.push(`tl.to('.tea4',{y:220,duration:1.2,ease:'power2.in'},${at(BUH)});`);
    [0, 1, 2].forEach(i => tl.push(`tl.fromTo('.st4_${i}',{y:0,opacity:.55},{y:-260,opacity:0,duration:1.6,ease:'power1.out'},${at(BUH + i * .15)});`));
    tl.push(`tl.fromTo('.st4',{y:0},{y:-40,duration:1.2,ease:'sine.inOut',yoyo:true,repeat:1},${at(s0)});`);
    tl.push(`tl.to('.t4a',{opacity:0,duration:.3},${at(SU - .1)});tl.to('.t4b',{opacity:1,duration:.4},${at(SU)});tl.to('#c4',{x:-560,y:-300,duration:.9,ease:'power2.inOut'},${at(SU - .2)});`);
  }

  // ---- S5: outside; the fuselage panel says what it's made of; windows go dark, engines quit, glide
  {
    const s0 = LE[3] + .2, s1 = LE[4] + .35;
    const HER = cue('herkes', L[4]), SON = cue('sönük', L[4]), SUZ = cue('süzülüyor', L[4]), ALU = cue('alüminyum', L[4]);
    let wins = '';
    for (let i = 7; i < 16; i++) wins += `<rect class="w5" x="${250 + i * 46}" y="895" width="24" height="34" rx="11" fill="#FFE7A6"/>`;
    sc('s5', s0, s1, `
      <g id="cl5">${cl(80, 500, 1.6)}${cl(700, 380, 1.2)}${cl(300, 1500, 2)}${cl(820, 1700, 1.5)}${cl(60, 2100, 1.8)}${cl(640, 2400, 1.6)}</g>
      <g transform="translate(0 0)"><g id="p5">
        <path class="trail" d="M-400 905 L 120 905" stroke="#FFFFFF" stroke-width="22" stroke-linecap="round" opacity=".7"/>
        <path d="M110 960 Q 80 870 220 862 L 900 862 Q 975 862 1010 800 L 1050 800 L 1035 890 Q 1022 970 950 975 L 200 978 Q 130 978 110 960 Z" fill="#F7F4EC" stroke="${C.alu2}" stroke-width="5"/>
        <path d="M110 960 Q 80 870 220 862 L 250 862 L 250 978 L 200 978 Q 130 978 110 960 Z" fill="${C.alu}"/>
        <path d="M150 890 Q 175 872 220 870 L 225 900 L 146 908 Z" fill="#22343F"/>
        ${wins}
        <rect x="250" y="945" width="760" height="10" fill="${C.o2}"/>
        <path d="M430 965 L 690 965 L 790 1100 L 720 1100 Z" fill="${C.alu}" stroke="${C.alu2}" stroke-width="3"/>
        <g id="eng5"><rect x="520" y="1000" width="150" height="62" rx="30" fill="${C.alu2}"/><circle cx="672" cy="1031" r="28" fill="#5D6A72"/><g class="fan5"><line x1="672" y1="1006" x2="672" y2="1056" stroke="#C8D0D5" stroke-width="6"/><line x1="647" y1="1031" x2="697" y2="1031" stroke="#C8D0D5" stroke-width="6"/></g></g>
        <g class="fl5"><path d="M520 1012 L 430 1031 L 520 1050 Z" fill="${C.coral}"/><path d="M520 1020 L 470 1031 L 520 1042 Z" fill="#FFD27A"/></g>
        <g class="plate5"><rect x="262" y="880" width="290" height="56" rx="6" fill="#DCE3E7" stroke="${C.alu2}" stroke-width="3"/>${[0, 1, 2, 3].map(i => `<circle cx="${276 + i * 87}" cy="890" r="3.5" fill="${C.alu2}"/>`).join('')}<text x="407" y="921" text-anchor="middle" font-family="AntonTR" font-size="28" fill="${C.ink}" letter-spacing="2">GÖVDE: ALÜMİNYUM</text></g>
        <path d="M990 870 L 1060 860 L 1060 880 Z" fill="${C.alu}"/>
      </g></g>
      <path class="glide5" d="M560 1010 Q 760 1250 980 1640" fill="none" stroke="${C.ink}" stroke-width="6" stroke-dasharray="18 16" opacity="0"/>`, 'url(#skyg)');
    tl.push(`gsap.set('#p5',{scale:1.25,svgOrigin:'560 920'});tl.to('#p5',{scale:1,duration:${at(ALU - s0 + .4)},ease:'sine.inOut'},${at(s0)});`);
    tl.push(`tl.to('#p5',{scale:1.6,x:180,y:0,duration:.8,ease:'power2.inOut'},${at(ALU - .3)});tl.to('#p5',{scale:1,x:0,y:0,duration:.8,ease:'power2.inOut'},${at(HER - .4)});`);
    tl.push(`tl.to('.w5',{fill:'#2B3A42',duration:.15,stagger:.05},${at(HER)});`);
    tl.push(`tl.to('.fan5',{rotation:1440,svgOrigin:'672 1031',duration:${at(SON - s0)},ease:'none'},${at(s0)});tl.to('.fan5',{rotation:'+=200',svgOrigin:'672 1031',duration:1.6,ease:'power3.out'},${at(SON)});`);
    tl.push(`tl.to('.fl5',{scaleX:0,svgOrigin:'520 1031',duration:.5,ease:'power2.in'},${at(SON)});tl.to('.trail',{opacity:0,duration:.8},${at(SON)});`);
    tl.push(`tl.to('#p5',{rotation:13,svgOrigin:'600 920',duration:2.4,ease:'sine.inOut'},${at(SUZ - .2)});tl.to('.glide5',{opacity:.5,duration:.4},${at(SUZ)});`);
    tl.push(`tl.fromTo('#cl5',{y:0},{y:-1100,duration:${at(s1 - s0)},ease:'none'},${at(s0)});`);
  }

  // ---- S6: empty cockpit, the display says who is talking; headset swings
  {
    const s0 = Z.chime[1] - .1, s1 = LE[5] + .35;
    sc('s6', s0, s1, `
      <g id="c6cam"><path d="M0 360 L 1080 360 L 980 900 L 100 900 Z" fill="url(#skyg)"/><g id="cl6">${cl(180, 640, 1.3)}${cl(640, 760, 1)}${cl(420, 1000, 1.6)}</g>
      <path d="M0 0 L 1080 0 L 1080 360 L 0 360 Z M0 360 L 100 900 L 0 900 Z M1080 360 L 980 900 L 1080 900 Z" fill="#3A4A53"/>
      <rect x="0" y="880" width="1080" height="320" fill="#2C3A42"/>
      <line x1="540" y1="360" x2="540" y2="900" stroke="#3A4A53" stroke-width="26"/>
      <g transform="translate(150 930)"><rect width="300" height="200" rx="12" fill="#11181C"/><rect x="12" y="12" width="276" height="176" rx="6" fill="#10343F"/><text class="k6" x="150" y="85" text-anchor="middle" font-family="AntonTR" font-size="40" fill="${C.coral}">KAPTAN</text><text class="k6" x="150" y="135" text-anchor="middle" font-family="AntonTR" font-size="40" fill="${C.coral}">KONUŞUYOR</text><text class="k6b" x="150" y="110" text-anchor="middle" font-family="AntonTR" font-size="44" fill="#7FB9C4" opacity="0">KOLTUK: BOŞ</text></g>
      <g transform="translate(630 930)"><rect width="300" height="200" rx="12" fill="#11181C"/><rect x="12" y="12" width="276" height="176" rx="6" fill="#1B2F48"/><path d="M40 150 L 260 60" stroke="#7FB9C4" stroke-width="6"/><text x="150" y="180" text-anchor="middle" font-family="Inter Tight" font-weight="800" font-size="22" fill="#7FB9C4" letter-spacing="3">İRTİFA ↓</text></g>
      <rect x="120" y="1250" width="300" height="560" rx="60" fill="#8A9AA4"/><rect x="660" y="1250" width="300" height="560" rx="60" fill="#8A9AA4"/>
      <rect x="150" y="1180" width="240" height="120" rx="40" fill="#9DADB6"/><rect x="690" y="1180" width="240" height="120" rx="40" fill="#9DADB6"/>
      <g id="hs6"><path d="M700 1500 Q 700 1420 810 1410 Q 920 1420 920 1500 Z" fill="#1F2D4A"/><rect x="680" y="1495" width="260" height="34" rx="17" fill="#141E33"/><rect x="785" y="1440" width="50" height="34" rx="6" fill="#D9A441"/></g></g>`, '#2C3A42');
    tl.push(`tl.fromTo('#c6cam',{scale:1},{scale:1.12,svgOrigin:'810 1450',duration:${at(s1 - s0)},ease:'sine.inOut'},${at(s0)});`);
    tl.push(`tl.fromTo('#cl6',{y:0},{y:-300,duration:${at(s1 - s0)},ease:'none'},${at(s0)});`);
    const KON = cue('konuşuyordu', L[5]);
    tl.push(`tl.to('.k6',{opacity:0,duration:.25},${at(KON)});tl.to('.k6b',{opacity:1,duration:.3},${at(KON)});`);
  }

  // ---- S7: the fall; the field sign tells the facts; the ground goes, no fire
  {
    const s0 = LE[5] + .2, s1 = LE[6] + .3;
    const DU = cue('düşer', L[6]), PA = cue('parçalanır', L[6]), KAL = cue('kalmadı', L[6]), YAR = cue('yarısı', L[6]), CAK = cue('çakılıyor', L[6]), YAN = cue('yanmıyor', L[6]);
    const grains = Array.from({ length: 90 }, () => ({ x: r2(0, 1080), y: r2(1180, 1700), s: r2(14, 40) }));
    const piece = (cls, x0, x1) => `<g class="${cls}"><clipPath id="cp${cls}"><rect x="${x0}" y="700" width="${x1 - x0}" height="400"/></clipPath><g clip-path="url(#cp${cls})">
        <path d="M110 960 Q 80 870 220 862 L 900 862 Q 975 862 1010 800 L 1050 800 L 1035 890 Q 1022 970 950 975 L 200 978 Q 130 978 110 960 Z" fill="#F7F4EC" stroke="${C.alu2}" stroke-width="5"/>
        ${Array.from({ length: 16 }, (_, i) => `<rect x="${250 + i * 46}" y="895" width="24" height="34" rx="11" fill="#2B3A42"/>`).join('')}
        <rect x="250" y="945" width="760" height="10" fill="${C.o2}"/><path d="M430 965 L 690 965 L 790 1100 L 720 1100 Z" fill="${C.alu}"/></g></g>`;
    sc('s7', s0, s1, `
      <g class="ground7"><rect x="0" y="1180" width="1080" height="740" fill="#C9A56F"/><rect x="0" y="1180" width="1080" height="70" fill="#7FA35A"/><rect x="0" y="1380" width="1080" height="540" fill="#A9834F"/>
        <g class="sign7" transform="translate(250 1010)"><rect x="-8" y="0" width="16" height="190" fill="#6B5640"/><rect x="-170" y="-110" width="340" height="140" rx="10" fill="#F4EEDF" stroke="#6B5640" stroke-width="6"/><text class="sg1" x="0" y="-48" text-anchor="middle" font-family="AntonTR" font-size="40" fill="${C.ink}">YERKABUĞU</text><text class="sg1" x="0" y="5" text-anchor="middle" font-family="AntonTR" font-size="46" fill="${C.coral}">%46 OKSİJEN</text></g></g>
      <g class="grains7">${grains.map((g, i) => `<rect class="g7 g7_${i}" x="${f(g.x)}" y="${f(g.y)}" width="${f(g.s)}" height="${f(g.s)}" fill="${i % 2 ? '#C9A56F' : '#A9834F'}"/>`).join('')}</g>
      <g id="p7" transform="translate(0 0)"><g id="p7i">${piece('q1', 0, 380)}${piece('q2', 380, 700)}${piece('q3', 700, 1100)}</g></g>
      <g class="dust7">${[0, 1, 2, 3, 4, 5].map(i => `<circle cx="${180 + i * 150}" cy="${1300 - (i % 2) * 60}" r="${150 + (i % 3) * 30}" fill="#E1D2B6"/>`).join('')}</g>
      <g class="fire7" transform="translate(560 1420)"><path d="M0 -110 Q 70 -30 45 30 Q 30 80 0 80 Q -30 80 -45 30 Q -70 -30 0 -110 Z" fill="${C.coral}"/><path d="M0 -40 Q 30 0 18 40 Q 8 60 0 60 Q -8 60 -18 40 Q -30 0 0 -40 Z" fill="#FFD27A"/></g>
      <g transform="translate(540 760) rotate(-5)"><g class="sign7b" opacity="0"><rect x="-260" y="-70" width="520" height="140" rx="12" fill="#F4EEDF" stroke="${C.ink}" stroke-width="6"/><text x="0" y="22" text-anchor="middle" font-family="AntonTR" font-size="62" fill="${C.ink}">YANGIN RİSKİ: SIFIR</text></g></g>`, 'url(#skyg)');
    tl.push(`gsap.set('#p7',{x:-60,y:-420,scale:.75,svgOrigin:'540 920'});tl.to('#p7',{y:-260,rotation:8,duration:${at(DU - s0)},ease:'sine.inOut'},${at(s0)});`);
    tl.push(`tl.to('#p7',{y:-60,rotation:16,duration:1.4,ease:'power2.in'},${at(DU)});`);
    tl.push(`tl.to('.q1',{x:-70,y:-40,rotation:-8,svgOrigin:'380 920',duration:.9,ease:'power2.out'},${at(PA)});tl.to('.q3',{x:90,y:40,rotation:12,svgOrigin:'700 920',duration:.9,ease:'power2.out'},${at(PA)});`);
    tl.push(`tl.to('.sign7',{opacity:0,duration:.3},${at(PA - .2)});`);
    tl.push(`tl.to('#p7',{y:'+=150',rotation:'+=6',duration:${at(Math.max(.3, CAK - .5 - (PA + .9)))},ease:'none'},${at(PA + .9)});tl.to('.q1',{rotation:'-=10',y:'+=60',svgOrigin:'380 920',duration:2,ease:'sine.in'},${at(PA + .9)});tl.to('.q3',{rotation:'+=14',y:'+=90',svgOrigin:'700 920',duration:2,ease:'sine.in'},${at(PA + .9)});`);
    tl.push(`gsap.set('.grains7',{opacity:0});tl.set('.grains7',{opacity:1},${at(KAL)});tl.to('.ground7',{opacity:0,duration:.4},${at(KAL)});`);
    grains.forEach((g, i) => tl.push(`tl.to('.g7_${i}',{y:${f(r2(200, 700))},opacity:0,duration:${r2(1.2, 2.2).toFixed(2)},ease:'power1.in'},${at(KAL + r2(0, .6))});`));
    tl.push(`tl.to('#p7',{y:330,rotation:28,duration:.7,ease:'power3.in'},${at(CAK - .5)});`);
    tl.push(`gsap.set('.dust7',{opacity:0});tl.fromTo('.dust7',{opacity:0,scale:.4,svgOrigin:'540 1300'},{opacity:1,scale:1.15,duration:.8,ease:'expo.out'},${at(CAK + .15)});`);
    tl.push(`gsap.set('.fire7',{opacity:0});`);
    tl.push(`tl.fromTo('.sign7b',{opacity:0,y:30},{opacity:1,y:0,duration:.45,ease:'power3.out'},${at(YAN)});`);
  }

  // ---- S8: the survivor; the trolley's own plate says aluminium; one big line (P)
  {
    const s0 = LE[6] + .2, s1 = Z.sting[1] - .15;
    const IK = cue('ikram', L[7]), AL = cue('alüminyum', L[7]);
    sc('s8', s0, s1, `
      ${[0, 1, 2, 3, 4, 5].map(i => `<circle class="haze8" cx="${100 + i * 180}" cy="${1250 + (i % 2) * 70}" r="${170 + (i % 3) * 40}" fill="#E1D2B6" opacity=".9"/>`).join('')}
      <rect x="0" y="1330" width="1080" height="590" fill="#CDB892"/>
      ${[0, 1, 2].map(i => `<path d="M${120 + i * 330} ${1420 + i * 40} l 120 -30 l 40 50 l -150 20 z" fill="#B8C1C7"/>`).join('')}
      <g transform="translate(340 760)"><g id="tr8">
        <clipPath id="trc8"><rect x="0" y="0" width="400" height="560" rx="18"/></clipPath>
        <rect x="0" y="0" width="400" height="560" rx="18" fill="${C.alu}" stroke="${C.alu2}" stroke-width="10"/>
        <rect x="35" y="60" width="330" height="80" rx="8" fill="${C.alu2}"/><rect x="35" y="180" width="330" height="80" rx="8" fill="${C.alu2}"/>
        <g class="pl8"><rect x="95" y="320" width="210" height="64" rx="6" fill="#E3E9EC" stroke="${C.alu2}" stroke-width="3"/><text x="200" y="364" text-anchor="middle" font-family="AntonTR" font-size="34" fill="${C.ink}" letter-spacing="2">ALÜMİNYUM</text></g>
        <rect x="380" y="-30" width="90" height="34" rx="17" fill="${C.alu2}"/>
        <circle cx="70" cy="590" r="34" fill="#333"/><circle cx="330" cy="590" r="34" fill="#333"/>
        <ellipse cx="200" cy="625" rx="240" ry="26" fill="#000" opacity=".18"/><g clip-path="url(#trc8)"><rect class="shine8" x="-160" y="-20" width="60" height="620" fill="#fff" opacity=".6" transform="skewX(-18)"/></g>
      </g></g><rect class="fog8" x="0" y="600" width="1080" height="900" fill="#E8DCC4"/>`, '#E8DCC4');
    html.push(`<div class="big8">TEK SAĞ KALAN:<br><span>İKRAM ARABASI</span></div>`);
    tl.push(`gsap.set('.fog8',{opacity:.4});tl.to('.fog8',{opacity:0,duration:1,ease:'power2.out'},${at(IK - .2)});tl.fromTo('#s8 svg',{scale:1},{scale:1.08,svgOrigin:'540 1040',duration:${at(s1 - s0)},ease:'sine.inOut'},${at(s0)});`);
    tl.push(`tl.fromTo('.haze8',{x:0},{x:60,duration:${at(s1 - s0)},ease:'none'},${at(s0)});`);
    tl.push(`tl.fromTo('.shine8',{x:0},{x:620,duration:.9,ease:'power2.inOut'},${at(AL)});`);
    tl.push(`gsap.set('.big8',{opacity:0,y:30});tl.to('.big8',{opacity:1,y:0,duration:.5,ease:'power3.out'},${at(IK + .3)});tl.to('.big8',{opacity:0,duration:.3},${at(s1 - .3)});`);
  }
  return { html: html.join('\n'), tl };
}
