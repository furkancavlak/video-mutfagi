// oxygbio's recurring character: Hamsi Cemil. Drawn once for the channel (kimlik.json → gorsel_dil.karakter),
// reused in every "formul" video; everything else in a video is drawn new for its story.
// Loaded in a sandbox by uretim/kurgu.js and handed to sahneler.js as `karakter`.
//
//   karakter.ciz(id, { yasli, sapka })   SVG of Cemil at the origin, facing right. About 380 x 230 at scale 1:
//                                        body centre at (0,0), feet on y = +96. Place him with M.yer(x, y, karakter.ciz(...), { s }).
//                                        Mirror him (facing left) with a wrapper: M.yer(x, y, M.yer(0, 0, ciz, { s: ... })) and
//                                        transform="scale(-1,1)" on your own outer <g>.
//   Parts the timeline may animate (all are free inner groups, safe for x/y):
//     #id        the whole fish (walk, hop, run: M.git / M.zipla)
//     .id-in     the body (shake: M.titre)
//     .id-bebek  pupil (attr r: 10 normal, 6 terrified, 13 dazed)
//     .id-agiz   closed mouth   .id-ah  open mouth (opacity 0 → 1 = shouting / shocked)
//     .id-ter    sweat drops (opacity)
//   karakter.ifade(M, id, ad, t)          ready expressions: 'panik' (sweat + shake + open mouth + small pupil),
//                                        'sok' (open mouth + small pupil), 'sakin' (back to normal)
//   options: yasli (grey, monocle: the old Cemil), sapka (black cap: his grandson)
module.exports = function ({ C }) {
  const renk = { govde: '#9FB7C9', karin: '#E3ECF2', bant: C.coral, kol: '#7F98AB', yasli: '#B9C4CB', yasliKol: '#8C99A1' };
  function ciz(id, { yasli = false, sapka = false } = {}) {
    const g = yasli ? renk.yasli : renk.govde;
    return `<g id="${id}"><g class="${id}-in">
  <path d="M-30 40 L -42 96 M 30 40 L 40 96" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/><path d="M-56 96 L -30 96 M 28 96 L 54 96" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/>
  <path d="M-120 0 L -190 -56 L -176 0 L -190 56 Z" fill="${g}"/>
  <ellipse rx="135" ry="68" fill="${g}"/><path d="M-120 18 Q 0 78 128 14 Q 0 60 -120 18 Z" fill="${renk.karin}"/>
  <path d="M46 -64 Q 60 0 46 64" fill="none" stroke="${renk.bant}" stroke-width="20"/>
  ${sapka ? `<path d="M30 -66 Q 80 -110 130 -50 L 30 -50 Z" fill="${C.ink}"/><rect x="100" y="-56" width="60" height="10" rx="5" fill="${C.ink}"/>` : ''}
  <circle cx="86" cy="-14" r="22" fill="#fff"/><circle class="${id}-bebek" cx="92" cy="-14" r="10" fill="${C.ink}"/>
  <path class="${id}-agiz" d="M108 26 Q 120 32 132 24" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>
  <ellipse class="${id}-ah" cx="120" cy="30" rx="12" ry="16" fill="${C.ink}" opacity="0"/>
  <path d="M10 20 Q 40 50 70 46" fill="none" stroke="${yasli ? renk.yasliKol : renk.kol}" stroke-width="16" stroke-linecap="round"/>
  <g class="${id}-ter" opacity="0"><path d="M150 -60 q 10 18 0 26 q -10 -8 0 -26 Z" fill="${C.o2}"/><path d="M170 -20 q 8 14 0 20 q -8 -6 0 -20 Z" fill="${C.o2}"/></g>
  ${yasli ? `<circle cx="86" cy="-14" r="26" fill="none" stroke="${C.ink}" stroke-width="5"/><path d="M112 -6 Q 118 20 110 40" fill="none" stroke="${C.ink}" stroke-width="3"/>` : ''}
</g></g>`;
  }
  function ifade(M, id, ad, t) {
    const at = x => (+x).toFixed(3);
    if (ad === 'panik' || ad === 'sok') {
      M.tl.push(`tl.to('.${id}-agiz',{opacity:0,duration:.1},${at(t)});tl.to('.${id}-ah',{opacity:1,duration:.1},${at(t)});tl.to('.${id}-bebek',{attr:{r:6},duration:.15},${at(t)});`);
      if (ad === 'panik') { M.tl.push(`tl.to('.${id}-ter',{opacity:1,duration:.2},${at(t)});`); M.titre(`.${id}-in`, t, { kac: 10 }); }
    }
    if (ad === 'sakin') M.tl.push(`tl.to('.${id}-ah,.${id}-ter',{opacity:0,duration:.15},${at(t)});tl.to('.${id}-agiz',{opacity:1,duration:.15},${at(t)});tl.to('.${id}-bebek',{attr:{r:10},duration:.2},${at(t)});`);
  }
  return { ad: 'Hamsi Cemil', ciz, ifade };
};
