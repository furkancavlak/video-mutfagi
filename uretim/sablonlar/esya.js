// Props ("eşya") for data-driven templates: simple flat SVG objects that carry a joke or a fact on screen
// (a minibus, a petition, a stamp, a factory...). A template places them in its world and plays their entrance;
// this file only knows how each one looks and moves.
//
// Each prop is drawn in its own local units:
//   zemin  stands on the ground: (0,0) is the middle of its base, it grows up to y = -h
//   su     sits on the sea surface: (0,0) is the middle of its waterline, it grows up to y = -h
//   hava   floats: (0,0) is its centre
// koltuk: where the recurring character sits on it [x, y, scale] (minibus driver window, balcony...), or null.
// muhur: where a stamp of the same step lands on it [x, y] (clear of its own text); default its middle.
// yazi: the short text the prop carries (roof plate, paper title, stamp...); every prop reads well without it.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ust = s => String(s || '').toLocaleUpperCase('tr');
// AntonTR is narrow: a capital is about half its size wide
const sigdir = (s, maxW, taban) => Math.max(12, Math.min(taban, Math.floor(maxW / (Math.max(1, [...s].length) * .5))));
// text centred on (cx, cy); goes to two lines when one line would shrink it too much
function yazi(s, cx, cy, maxW, taban, renk, satirMax = 2) {
  s = ust(s).trim(); if (!s) return '';
  let sat = [s];
  if (satirMax > 1 && sigdir(s, maxW, taban) < taban * .8 && s.includes(' ')) {
    const bosluk = [...s.matchAll(/ /g)].map(m => m.index), orta = s.length / 2;
    const k = bosluk.reduce((a, b) => Math.abs(b - orta) < Math.abs(a - orta) ? b : a);
    sat = [s.slice(0, k), s.slice(k + 1)];
  }
  const boy = Math.min(...sat.map(x => sigdir(x, maxW, taban))), lh = boy * 1.04, y0 = cy - (sat.length - 1) * lh / 2 + boy * .36;
  return sat.map((x, i) => `<text x="${cx}" y="${(y0 + i * lh).toFixed(1)}" text-anchor="middle" font-family="AntonTR" font-size="${boy}" fill="${renk}">${esc(x)}</text>`).join('');
}
const yaziGen = (s, taban, min, max) => Math.max(min, Math.min(max, [...ust(s)].length * taban * .5 + 40));

// small fish used by the crowd and the rain (side view, facing right)
const balikK = (renk, ink, x = 0, y = 0, s = 1, ek = '') => `<g transform="translate(${x} ${y}) scale(${s})"${ek}><path d="M-20 0 L -36 -12 L -36 12 Z" fill="${renk}"/><ellipse cx="0" cy="0" rx="24" ry="12" fill="${renk}"/><circle cx="11" cy="-3" r="3" fill="${ink}"/></g>`;

const ESYA = {
  // a yellow minibus; roof plate shows the text (default DOLMUŞ); drives in from the left
  dolmus: { tip: 'zemin', w: 330, h: 188, muhur: [-40, -80], koltuk: [96, -100, .4], giris: 'sur', ciz: (C, y) => {
    const yz = ust(y || 'DOLMUŞ'), pg = yaziGen(yz, 32, 120, 320);
    return `<rect x="${-pg / 2}" y="-186" width="${pg}" height="44" rx="7" fill="#fff" stroke="${C.ink}" stroke-width="4"/>${yazi(yz, 0, -167, pg - 18, 32, C.ink, 1)}
    <rect x="-8" y="-142" width="16" height="4" fill="${C.ink}"/>
    <path d="M-158 -40 L -158 -124 Q -158 -140 -142 -140 L 98 -140 Q 122 -140 134 -122 L 160 -82 L 162 -42 Q 162 -28 148 -28 L -146 -28 Q -158 -28 -158 -40 Z" fill="#F2C14E" stroke="#D9A23A" stroke-width="3"/>
    <rect x="-158" y="-70" width="320" height="12" fill="${C.coral}"/>
    ${[-142, -94, -46, 2].map(x => `<rect x="${x}" y="-128" width="40" height="40" rx="6" fill="#BFE3EE"/>`).join('')}
    <path d="M58 -128 L 112 -128 L 142 -86 L 58 -86 Z" fill="#BFE3EE"/><rect x="48" y="-128" width="6" height="96" fill="#D9A23A"/>
    <circle cx="154" cy="-56" r="7" fill="#FFE7A0"/>
    ${[-96, 102].map(x => `<g class="teker"><circle cx="${x}" cy="-26" r="26" fill="${C.ink}"/><circle cx="${x}" cy="-26" r="11" fill="${C.alu}"/><rect x="${x - 2.5}" y="-46" width="5" height="40" fill="${C.alu2}"/></g>`).join('')}`; } },
  // a sheet of paper (petition, dues book, letter): title on top, lines, signature
  kagit: { tip: 'hava', w: 210, h: 260, muhur: [0, 40], giris: 'dus', ciz: (C, y) => `<path d="M-100 -125 L 60 -125 L 100 -85 L 100 125 L -100 125 Z" fill="#FFFDF6" stroke="#CDBE9E" stroke-width="4"/><path d="M60 -125 L 60 -85 L 100 -85 Z" fill="#E6DCC8"/>
    ${yazi(y || 'DİLEKÇE', -10, -82, 140, 38, C.ink)}
    ${[-30, 0, 30, 60].map((yy, i) => `<rect x="-78" y="${yy}" width="${i === 3 ? 90 : 156}" height="8" rx="4" fill="#CFC6B4"/>`).join('')}
    <path d="M18 98 q 12 -22 22 -4 q 8 14 18 -8 q 6 -10 16 4" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>` },
  // a rubber-stamp mark; lands on the other prop of its step if there is one
  damga: { tip: 'hava', w: 300, h: 120, giris: 'vur', ciz: (C, y) => {
    const yz = ust(y || 'ONAYLANDI'), g = yaziGen(yz, 66, 200, 330);
    return `<g transform="rotate(-11)"><rect x="${-g / 2}" y="-50" width="${g}" height="100" rx="12" fill="#fff" fill-opacity=".55" stroke="${C.coral}" stroke-width="10"/><rect x="${-g / 2 + 12}" y="-38" width="${g - 24}" height="76" rx="6" fill="none" stroke="${C.coral}" stroke-width="3"/>${yazi(yz, 0, 0, g - 40, 64, C.coral, 1)}</g>`; } },
  // a factory with a chimney and a facade sign; when stamped, its shutter comes down
  fabrika: { tip: 'zemin', w: 340, h: 270, muhur: [-20, -40], koltuk: [10, -40, .5], giris: 'yuksel', ciz: (C, y) => `<rect x="112" y="-262" width="36" height="262" fill="#B9AFA0"/><rect x="112" y="-236" width="36" height="12" fill="${C.coral}"/><rect x="112" y="-206" width="36" height="12" fill="${C.coral}"/>
    ${[0, 1, 2].map(i => `<circle class="duman" cx="${130 + i * 14}" cy="${-282 - i * 26}" r="${16 + i * 6}" fill="#DCD6CA"/>`).join('')}
    <path d="M-160 -150 L -160 -196 L -110 -150 L -110 -196 L -60 -150 L -60 -196 L -10 -150 L -10 -196 L 40 -150 L 40 -196 L 90 -150 L 112 -150 L 112 0 L -160 0 Z" fill="${C.alu2}"/>
    <rect x="-160" y="-150" width="272" height="150" fill="#E6DCC8" stroke="#C9B99A" stroke-width="3"/>
    <rect x="-148" y="-140" width="248" height="44" rx="5" fill="#fff" stroke="${C.ink}" stroke-width="3"/>${yazi(y || 'FABRİKA', -24, -118, 230, 30, C.ink, 1)}
    ${[-138, 46].map(x => `<rect x="${x}" y="-80" width="44" height="34" fill="#BFE3EE" stroke="#C9B99A" stroke-width="3"/>`).join('')}
    <rect x="-56" y="-82" width="76" height="82" fill="#5A4E44"/>
    <g class="kepenk"><rect x="-56" y="-82" width="76" height="82" fill="${C.alu}"/>${[0, 1, 2, 3, 4, 5].map(i => `<rect x="-56" y="${-76 + i * 13}" width="76" height="3" fill="${C.alu2}"/>`).join('')}</g>` },
  // an apartment block with a balcony on the second floor; door plate shows the text
  apartman: { tip: 'zemin', w: 250, h: 330, muhur: [0, -150], koltuk: [128, -170, .45], giris: 'yuksel', ciz: (C, y) => `<rect x="-95" y="-312" width="190" height="312" fill="#EBD9BD" stroke="#C9B48F" stroke-width="3"/><rect x="-104" y="-322" width="208" height="14" fill="${C.roof}"/>
    ${[-282, -192, -102].map((yy, f) => [-66, 24].map((x, i) => `<rect x="${x}" y="${yy}" width="42" height="42" fill="${(f + i) % 3 ? '#BFE3EE' : '#FFD66B'}" stroke="#C9B48F" stroke-width="3"/>`).join('')).join('')}
    <rect x="95" y="-152" width="62" height="9" fill="#B9AFA0"/><path d="M95 -186 L 157 -186 M157 -186 L 157 -152 ${[107, 119, 131, 143].map(x => `M${x} -186 L ${x} -152`).join(' ')}" fill="none" stroke="${C.ink}" stroke-width="4"/>
    <rect x="-24" y="-62" width="48" height="62" fill="${C.trunk}"/>
    ${y ? `<rect x="-80" y="-98" width="160" height="30" rx="5" fill="#fff" stroke="${C.ink}" stroke-width="3"/>${yazi(y, 0, -83, 150, 28, C.ink, 1)}` : ''}` },
  // a town hall: pediment, columns, waving flag; plate on the pediment
  belediye: { tip: 'zemin', w: 330, h: 300, muhur: [0, -110], koltuk: [-60, -50, .45], giris: 'yuksel', ciz: (C, y) => `<rect x="-2" y="-300" width="5" height="70" fill="${C.ink}"/><path class="bayrak" d="M3 -298 L 52 -290 L 3 -274 Z" fill="${C.coral}"/>
    <rect x="-160" y="-22" width="320" height="22" fill="#D9CBB0"/><rect x="-145" y="-40" width="290" height="18" fill="#E6DCC8"/>
    <rect x="-130" y="-178" width="260" height="138" fill="${C.wall}" stroke="#D9CBB0" stroke-width="3"/>
    <path d="M-150 -176 L 0 -236 L 150 -176 Z" fill="#E7D3A6" stroke="#CDB27B" stroke-width="3"/>
    ${[-112, -62, 40, 90].map(x => `<rect x="${x}" y="-168" width="22" height="128" fill="#fff" stroke="#D9CBB0" stroke-width="2"/>`).join('')}
    <rect x="-22" y="-104" width="44" height="64" fill="${C.trunk}"/>
    <rect x="-92" y="-214" width="184" height="32" rx="5" fill="#fff" stroke="${C.ink}" stroke-width="3"/>${yazi(y || 'BELEDİYE', 0, -198, 172, 30, C.ink, 1)}` },
  // a big cartoon nose with smell waves drifting at it; a stamp of its step lands on it
  burun: { tip: 'hava', w: 300, h: 280, muhur: [40, 0], giris: 'bel', ciz: (C, y) => `${[-40, 0, 40].map((yy, i) => `<path class="koku" d="M-150 ${yy} q 14 -14 28 0 q 14 14 28 0 q 14 -14 28 0" fill="none" stroke="#9CB84A" stroke-width="7" stroke-linecap="round"/>`).join('')}
    <g transform="translate(40 0)"><path d="M0 -120 Q 30 -110 40 -28 Q 84 4 74 46 Q 64 84 22 78 Q 0 94 -22 78 Q -64 84 -74 46 Q -84 4 -40 -28 Q -30 -110 0 -120 Z" fill="#E9B48F" stroke="#C98E68" stroke-width="5"/>
    <ellipse cx="-26" cy="56" rx="14" ry="9" fill="#8E5A3E"/><ellipse cx="26" cy="56" rx="14" ry="9" fill="#8E5A3E"/><ellipse cx="-14" cy="-50" rx="8" ry="24" fill="#fff" opacity=".35"/>
    ${y ? `<rect x="-90" y="100" width="180" height="40" rx="8" fill="#fff" stroke="${C.ink}" stroke-width="3"/>${yazi(y, 0, 120, 166, 30, C.ink, 1)}` : ''}</g>` },
  // a phone with a notification card popping out of it
  telefon: { tip: 'hava', w: 330, h: 300, muhur: [-80, 60], giris: 'bel', ciz: (C, y) => `<g class="tlfn"><rect x="-150" y="-130" width="140" height="260" rx="22" fill="${C.ink}"/><rect x="-140" y="-112" width="120" height="224" rx="10" fill="#DDF1F5"/><rect x="-102" y="-124" width="44" height="6" rx="3" fill="#44525A"/></g>
    <g class="bildirim"><rect x="-70" y="-70" width="230" height="96" rx="16" fill="#fff" stroke="${C.ink}" stroke-width="4"/><circle cx="-38" cy="-22" r="18" fill="${C.coral}"/>${yazi(y || 'YENİ MESAJ', 56, -22, 170, 36, C.ink)}</g>` },
  // banknotes and coins with a tag
  para: { tip: 'hava', w: 280, h: 220, giris: 'bel', ciz: (C, y) => `${[0, 1, 2].map(i => `<g class="banknot"><g transform="translate(${-40 + i * 14} ${10 - i * 18}) rotate(${-8 + i * 6})"><rect x="-90" y="-44" width="180" height="88" rx="8" fill="#8FBF7A" stroke="#5E8A4E" stroke-width="4"/><circle cx="0" cy="0" r="24" fill="none" stroke="#5E8A4E" stroke-width="4"/><text x="0" y="12" text-anchor="middle" font-family="AntonTR" font-size="34" fill="#5E8A4E">₺</text></g></g>`).join('')}
    ${[[70, 70], [104, 60], [88, 40]].map(([x, yy]) => `<g class="banknot"><ellipse cx="${x}" cy="${yy}" rx="26" ry="14" fill="#F2C14E" stroke="#C99A2E" stroke-width="3"/></g>`).join('')}
    ${y ? `<rect x="-120" y="-108" width="200" height="40" rx="8" fill="#fff" stroke="${C.ink}" stroke-width="3"/>${yazi(y, -20, -88, 186, 30, C.ink, 1)}` : ''}` },
  // a till receipt that prints out; the text is its total line
  fis: { tip: 'hava', w: 200, h: 320, muhur: [0, -30], giris: 'yazdir', ciz: (C, y) => `<path d="M-90 -150 L 90 -150 L 90 140 ${Array.from({ length: 9 }, (_, i) => `L ${90 - (i + .5) * 20} ${i % 2 ? 140 : 152} `).join('')} L -90 140 Z" fill="#fff" stroke="#CDBE9E" stroke-width="3"/>
    <text x="0" y="-110" text-anchor="middle" font-family="AntonTR" font-size="30" fill="${C.ink}">FİŞ</text>
    ${[-80, -50, -20, 10].map(yy => `<rect x="-70" y="${yy}" width="80" height="7" rx="3" fill="#CFC6B4"/><rect x="34" y="${yy}" width="36" height="7" rx="3" fill="#CFC6B4"/>`).join('')}
    <rect x="-70" y="40" width="140" height="4" fill="${C.ink}"/>${yazi(y || 'TOPLAM', 0, 84, 150, 34, C.coral)}` },
  // a notice board on two legs; the text fills it
  pano: { tip: 'zemin', w: 340, h: 270, muhur: [70, -110], giris: 'yuksel', ciz: (C, y) => `<rect x="-120" y="-120" width="14" height="120" fill="${C.trunk}"/><rect x="106" y="-120" width="14" height="120" fill="${C.trunk}"/>
    <rect x="-165" y="-266" width="330" height="160" rx="10" fill="#F4EEDF" stroke="${C.trunk}" stroke-width="8"/>${yazi(y || 'DUYURU', 0, -186, 290, 58, C.ink)}` },
  // a crowd of five (people, or small fish when nesne = balik); the middle one holds a placard with the text
  kalabalik: { tip: 'zemin', w: 360, h: 252, giris: 'zipla', ciz: (C, y, o = {}) => {
    const renk = [C.coral, C.o2, '#F2C14E', '#7A9E5A', '#9C7CB8'];
    const kisi = (x, i) => o.nesne === 'balik'
      ? `<g class="kisi">${balikK(renk[i], C.ink, x, -34 - (i % 2) * 22, 1.9)}</g>`
      : `<g class="kisi"><rect x="${x - 22}" y="-92" width="44" height="92" rx="20" fill="${renk[i]}"/><circle cx="${x}" cy="-112" r="22" fill="${i % 2 ? '#C98E68' : '#E9B48F'}"/><circle cx="${x - 7}" cy="-114" r="3" fill="${C.ink}"/><circle cx="${x + 7}" cy="-114" r="3" fill="${C.ink}"/></g>`;
    const pl = y ? `<g class="kisi"><rect x="-4" y="-200" width="8" height="120" fill="${C.trunk}"/><rect x="-118" y="-250" width="236" height="96" rx="6" fill="#fff" stroke="${C.ink}" stroke-width="4"/>${yazi(y, 0, -202, 210, 38, C.ink)}</g>` : '';
    return [-140, -70, 70, 140].map((x, i) => kisi(x, i)).join('') + pl + kisi(0, 4);
  } },
  // a megaphone with sound arcs and the announcement in a banner
  megafon: { tip: 'hava', w: 410, h: 220, giris: 'bel', ciz: (C, y) => `<path d="M-170 -20 L -130 -20 L -60 -70 L -60 70 L -130 20 L -170 20 Z" fill="${C.coral}"/><rect x="-150" y="20" width="16" height="50" rx="6" fill="${C.ink}"/>
    ${[0, 1, 2].map(i => `<path class="ses" d="M${-40 + i * 22} -40 Q ${-18 + i * 26} 0 ${-40 + i * 22} 40" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>`).join('')}
    <rect x="34" y="-70" width="200" height="140" rx="14" fill="#fff" stroke="${C.ink}" stroke-width="4"/>${yazi(y || 'DUYURU', 134, 0, 178, 44, C.ink)}` },
  // a small fishing boat on the sea surface; its name is painted on the hull (default SON BALIKÇI); sails in from the right
  tekne: { tip: 'su', w: 370, h: 250, muhur: [40, -100], koltuk: [28, -112, .36], giris: 'yuz', ciz: (C, y) => `<rect x="-132" y="-244" width="7" height="190" fill="${C.trunk}"/><g class="flama"><path d="M-125 -242 L -78 -230 L -125 -216 Z" fill="${C.coral}"/></g>
    <path d="M-125 -150 L -62 -76 M-125 -120 L -86 -76" stroke="${C.ink}" stroke-width="3" fill="none"/>
    <rect x="-24" y="-154" width="128" height="92" rx="6" fill="#F4EEDF" stroke="#C9B48F" stroke-width="3"/><rect x="-32" y="-166" width="144" height="16" rx="5" fill="${C.o2}"/>
    <rect x="-6" y="-136" width="68" height="44" rx="6" fill="#BFE3EE"/><rect x="70" y="-136" width="24" height="44" rx="5" fill="#BFE3EE"/>
    <path d="M-184 -66 L 186 -66 Q 178 -22 142 6 L -146 6 Q -174 -22 -184 -66 Z" fill="#fff" stroke="#C9B48F" stroke-width="3"/>
    <path d="M-170 -26 L 172 -26 Q 162 -6 142 6 L -146 6 Q -160 -8 -170 -26 Z" fill="${C.coral}"/>${yazi(y || 'SON BALIKÇI', 0, -45, 290, 32, C.ink, 1)}` },
  // a tulip tea glass on its saucer, steam rising; with bosal: true the tea drains and the steam flies off
  cay: { tip: 'hava', w: 220, h: 330, giris: 'bel', ciz: (C, y) => `${[-22, 4, 30].map((x, i) => `<path class="buhar" d="M${x} -96 q -14 -18 0 -36 q 14 -18 0 -36" fill="none" stroke="#C9C2B4" stroke-width="7" stroke-linecap="round" opacity=".8"/>`).join('')}
    <ellipse cx="0" cy="98" rx="100" ry="18" fill="#fff" stroke="#CDBE9E" stroke-width="4"/><ellipse cx="0" cy="94" rx="58" ry="8" fill="#EDE6D6"/>
    <path class="cayic" d="M-44 -48 Q -34 -28 -30 -10 Q -38 30 -40 70 Q -38 84 0 86 Q 38 84 40 70 Q 38 30 30 -10 Q 34 -28 44 -48 Z" fill="#B4471F"/>
    <path d="M-50 -70 Q -36 -40 -32 -10 Q -42 30 -44 70 Q -42 90 0 92 Q 42 90 44 70 Q 42 30 32 -10 Q 36 -40 50 -70 Z" fill="#E9F4F6" fill-opacity=".35" stroke="#AFC6CC" stroke-width="4"/>
    <ellipse cx="0" cy="-70" rx="50" ry="8" fill="none" stroke="#AFC6CC" stroke-width="4"/><path d="M-22 -50 Q -18 0 -26 60" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".6"/>
    <rect x="30" y="-104" width="7" height="110" rx="3" fill="${C.alu2}" transform="rotate(14 33 -50)"/>
    ${y ? `<rect x="-100" y="124" width="200" height="40" rx="8" fill="#fff" stroke="${C.ink}" stroke-width="3"/>${yazi(y, 0, 144, 186, 30, C.ink, 1)}` : ''}` },
  // objects raining down onto the ground of the shot (fish, money, paper, drops); drawn by the template across the frame
  yagmur: { tip: 'alan', w: 0, h: 0, giris: 'yagmur', ciz: () => '' },
};
const TAKMA = { 'balik-yagmuru': ['yagmur', 'balik'], 'para-yagmuru': ['yagmur', 'para'], 'kagit-yagmuru': ['yagmur', 'kagit'], 'ev-balkon': ['apartman'], ev: ['apartman'], bina: ['apartman'], balkon: ['apartman'],
  araba: ['dolmus'], kayik: ['tekne'], gemi: ['tekne'], balikci: ['tekne'], bardak: ['cay'], caybardagi: ['cay'], arac: ['dolmus'], otobus: ['dolmus'], minibus: ['dolmus'], dilekce: ['kagit'], defter: ['kagit'], belge: ['kagit'], mektup: ['kagit'], fatura: ['fis'], makbuz: ['fis'],
  yuz: ['burun'], koku: ['burun'], tabela: ['pano'], ilan: ['pano'], afis: ['pano'], insanlar: ['kalabalik'], anons: ['megafon'], dukkan: ['fabrika'], muhur: ['damga'] };
// "balik-yagmuru" → { tur: 'yagmur', nesne: 'balik' }; unknown names → null
function cozumle(e) {
  const t = String(e.tur || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o');
  const [tur, nesne] = ESYA[t] ? [t] : (TAKMA[t] || []);
  return tur ? { ...e, tur, nesne: e.nesne || nesne || (tur === 'yagmur' ? 'balik' : undefined) } : null;
}
const ADLAR = [...Object.keys(ESYA), ...Object.keys(TAKMA)];

// one falling object for the rain (local units = screen pixels)
function yagmurNesne(nesne, C, i) {
  if (nesne === 'para') return i % 2 ? `<ellipse rx="34" ry="18" fill="#F2C14E" stroke="#C99A2E" stroke-width="4"/>` : `<rect x="-60" y="-30" width="120" height="60" rx="6" fill="#8FBF7A" stroke="#5E8A4E" stroke-width="4"/>`;
  if (nesne === 'kagit') return `<rect x="-40" y="-52" width="80" height="104" fill="#FFFDF6" stroke="#CDBE9E" stroke-width="4"/><rect x="-26" y="-26" width="52" height="6" fill="#CFC6B4"/><rect x="-26" y="-6" width="52" height="6" fill="#CFC6B4"/>`;
  if (nesne === 'damla') return `<path d="M0 -36 Q 26 0 22 14 Q 16 34 0 34 Q -16 34 -22 14 Q -26 0 0 -36 Z" fill="#5FB3D4"/>`;
  const r = i % 2 ? C.fish : C.fish2;
  return `<path d="M-46 0 L -76 -24 L -76 24 Z" fill="${r}"/><ellipse rx="54" ry="26" fill="${r}"/><circle cx="26" cy="-7" r="6" fill="#fff"/><circle cx="27" cy="-7" r="3" fill="${C.ink}"/><path d="M44 8 Q 38 14 32 8" fill="none" stroke="${C.ink}" stroke-width="3"/>`;
}

// Entrance (and the little loops that keep it alive) of one placed prop.
// sel: CSS selector of the prop's inner group (no transform attribute of its own); t: entrance time;
// omur: seconds it stays on screen; birim: local units per screen pixel (to drive in from off-screen)
// yol: how far (screen px) a vehicle drives in; shorter than the default when something stands in its way, then it fades in
function giris(tur, sel, t, omur, { at, f, birim = 1, damgaT = null, bosal = false, yol = 900 }) {
  const tl = [], tekrar = p => Math.max(1, Math.ceil(omur / p));
  tl.push(`gsap.set('${sel}',{opacity:0});`);
  const g = ESYA[tur].giris;
  if (g === 'sur') {
    // (opacity is never left in from-vars alone: after the renderer seeks to the end and back, such a tween stops restoring it)
    tl.push(`tl.fromTo('${sel}',{x:${f(-yol * birim)}},{x:0,duration:1.3,ease:'power2.out',immediateRender:false},${at(t)});`);
    tl.push(yol < 900 ? `tl.fromTo('${sel}',{opacity:0},{opacity:1,duration:.2,ease:'none',immediateRender:false},${at(t)});` : `tl.set('${sel}',{opacity:1},${at(t)});`);
    tl.push(`tl.fromTo('${sel} .teker',{rotation:0},{rotation:900,transformOrigin:'50% 50%',smoothOrigin:false,duration:1.3,ease:'power2.out',immediateRender:false},${at(t)});`);
    tl.push(`tl.fromTo('${sel}',{y:0},{y:${f(-4 * birim)},duration:.5,ease:'sine.inOut',yoyo:true,repeat:${tekrar(.5)},immediateRender:false},${at(t + 1.3)});`);
  } else if (g === 'yuksel') {
    tl.push(`tl.fromTo('${sel}',{opacity:0,scaleY:.05},{opacity:1,scaleY:1,transformOrigin:'50% 100%',smoothOrigin:false,duration:.6,ease:'back.out(1.6)',immediateRender:false},${at(t)});`);
  } else if (g === 'dus') {
    tl.push(`tl.fromTo('${sel}',{opacity:0,y:${f(-420 * birim)},rotation:-28},{opacity:1,y:0,rotation:-5,transformOrigin:'50% 50%',smoothOrigin:false,duration:1,ease:'power2.out',immediateRender:false},${at(t)});`);
    tl.push(`tl.fromTo('${sel}',{rotation:-5},{rotation:3,transformOrigin:'50% 50%',smoothOrigin:false,duration:1.4,ease:'sine.inOut',yoyo:true,repeat:${tekrar(1.4)},immediateRender:false},${at(t + 1)});`);
  } else if (g === 'vur') {
    tl.push(`tl.fromTo('${sel}',{opacity:0,scale:2.6},{opacity:1,scale:1,transformOrigin:'50% 50%',smoothOrigin:false,duration:.24,ease:'power4.in',immediateRender:false},${at(t)});`);
  } else if (g === 'bel') {
    tl.push(`tl.fromTo('${sel}',{opacity:0,scale:.3},{opacity:1,scale:1,transformOrigin:'50% 50%',smoothOrigin:false,duration:.5,ease:'back.out(2)',immediateRender:false},${at(t)});`);
  } else if (g === 'yazdir') {
    tl.push(`tl.set('${sel}',{opacity:1},${at(t)});tl.fromTo('${sel}',{scaleY:0},{scaleY:1,transformOrigin:'50% 0%',smoothOrigin:false,duration:1.1,ease:'steps(9)',immediateRender:false},${at(t)});`);
  } else if (g === 'yuz') {
    tl.push(`tl.set('${sel}',{opacity:1},${at(t)});tl.fromTo('${sel}',{x:${f(760 * birim)}},{x:0,duration:1.6,ease:'power2.out',immediateRender:false},${at(t)});`);
  } else if (g === 'zipla') {
    tl.push(`tl.set('${sel}',{opacity:1},${at(t)});tl.fromTo('${sel} .kisi',{opacity:0,y:${f(60 * birim)}},{opacity:1,y:0,duration:.35,ease:'back.out(2.5)',stagger:.14,immediateRender:false},${at(t)});`);
    tl.push(`tl.fromTo('${sel} .kisi',{y:0},{y:${f(-14 * birim)},duration:.32,ease:'sine.inOut',yoyo:true,repeat:${tekrar(.32)},stagger:.11,immediateRender:false},${at(t + 1.1)});`);
  }
  // loops that keep the prop alive
  if (tur === 'fabrika') {
    tl.push(`tl.fromTo('${sel} .duman',{y:0,opacity:.9},{y:-40,opacity:0,duration:2,ease:'none',stagger:.6,repeat:${tekrar(2)},immediateRender:false},${at(t + .4)});`);
    tl.push(`gsap.set('${sel} .kepenk',{scaleY:0,transformOrigin:'50% 0%',smoothOrigin:false});`);
    if (damgaT != null) tl.push(`tl.to('${sel} .kepenk',{scaleY:1,transformOrigin:'50% 0%',smoothOrigin:false,duration:.6,ease:'power2.in'},${at(damgaT + .25)});tl.to('${sel} .duman',{opacity:0,duration:.4},${at(damgaT + .6)});`);
  }
  if (tur === 'belediye') tl.push(`tl.fromTo('${sel} .bayrak',{scaleX:1},{scaleX:.75,transformOrigin:'0% 50%',smoothOrigin:false,duration:.6,ease:'sine.inOut',yoyo:true,repeat:${tekrar(.6)},immediateRender:false},${at(t)});`);
  if (tur === 'burun') tl.push(`tl.fromTo('${sel} .koku',{x:-30,opacity:0},{x:30,opacity:1,duration:1.1,ease:'sine.inOut',stagger:.25,yoyo:true,repeat:${tekrar(1.1)},immediateRender:false},${at(t + .3)});`);
  if (tur === 'telefon') {
    tl.push(`tl.fromTo('${sel} .bildirim',{opacity:0,y:${f(30 * birim)}},{opacity:1,y:0,duration:.35,ease:'back.out(2)',immediateRender:false},${at(t + .45)});`);
    tl.push(`tl.fromTo('${sel} .tlfn',{rotation:-3},{rotation:3,transformOrigin:'50% 50%',smoothOrigin:false,duration:.09,ease:'none',yoyo:true,repeat:7,immediateRender:false},${at(t + .45)});`);
  }
  if (tur === 'para') tl.push(`tl.fromTo('${sel} .banknot',{y:${f(-160 * birim)},opacity:0},{y:0,opacity:1,duration:.45,ease:'bounce.out',stagger:.12,immediateRender:false},${at(t + .15)});`);
  if (tur === 'tekne') {
    tl.push(`tl.fromTo('${sel}',{rotation:-2},{rotation:2,transformOrigin:'50% 100%',smoothOrigin:false,duration:1.7,ease:'sine.inOut',yoyo:true,repeat:${tekrar(1.7)},immediateRender:false},${at(t)});`);
    tl.push(`tl.fromTo('${sel} .flama',{scaleX:1},{scaleX:.8,transformOrigin:'0% 50%',smoothOrigin:false,duration:.7,ease:'sine.inOut',yoyo:true,repeat:${tekrar(.7)},immediateRender:false},${at(t)});`);
  }
  if (tur === 'cay') {
    tl.push(`tl.fromTo('${sel} .buhar',{y:0,opacity:0},{y:${f(-30 * birim)},opacity:.8,duration:1.2,ease:'sine.inOut',stagger:.3,yoyo:true,repeat:${tekrar(1.2)},immediateRender:false},${at(t + .3)});`);
    if (bosal) tl.push(`tl.to('${sel} .cayic',{scaleY:.06,transformOrigin:'50% 100%',smoothOrigin:false,duration:1.1,ease:'power2.in'},${at(t + .7)});tl.to('${sel} .buhar',{y:${f(-150 * birim)},opacity:0,duration:1.2,ease:'power2.out',stagger:.12,overwrite:'auto'},${at(t + .9)});`);
  }
  if (tur === 'megafon') tl.push(`tl.fromTo('${sel} .ses',{opacity:.2},{opacity:1,duration:.3,stagger:.1,yoyo:true,repeat:${tekrar(.3)},immediateRender:false},${at(t + .3)});`);
  return tl;
}

// Exit of one placed prop at time t: vehicles drive / sail off to the right, buildings and boards sink into
// their ground, the crowd steps down, everything else fades. Returns the gsap lines and how long it takes.
function cikis(tur, sel, t, { at, f, birim = 1 }) {
  const g = ESYA[tur].giris, tl = [];
  if (g === 'sur' || g === 'yuz') {
    tl.push(`tl.to('${sel}',{x:${f(1100 * birim)},duration:1,ease:'power2.in',overwrite:false},${at(t)});tl.set('${sel}',{opacity:0},${at(t + 1)});`);
    return { tl, sure: 1 };
  }
  if (g === 'yuksel') tl.push(`tl.to('${sel}',{scaleY:0,opacity:0,transformOrigin:'50% 100%',smoothOrigin:false,duration:.4,ease:'power2.in'},${at(t)});`);
  else if (g === 'zipla') tl.push(`tl.to('${sel} .kisi',{y:${f(60 * birim)},opacity:0,duration:.3,ease:'power2.in',stagger:.05},${at(t)});`);
  else tl.push(`tl.to('${sel}',{opacity:0,duration:.35,ease:'power1.in'},${at(t)});`);
  return { tl, sure: .4 };
}

module.exports = { ESYA, ADLAR, cozumle, giris, cikis, yazi, yagmurNesne, ust };
