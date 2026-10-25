// Starter scene file (FREE tier). Replace the placeholder with the video's own world.
// Read dersler/KURGU-DILI.md first; the full worked example is videolar/oxygbio-v01-ucak/sahneler.js.
// Receives: C (palette), T = { Z, L, LE, cue, ifade, END }, at (seconds -> string), f, r2/rnd (seeded random), W, H.
// Returns: { html, tl: [gsap lines on the shared `tl`], css }. Captions, brand screens and the corner tag are added by the core.
module.exports = function ({ C, T, at, W, H }) {
  const { L, LE, cue, END } = T;
  const tl = [];
  // one world: a single light scene the camera slowly pushes into
  const html = `<div class="sc" id="s1"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${C.paper}"/>
    <g id="cam"><circle cx="540" cy="900" r="220" fill="${C.o2}" opacity=".25"/>
      <text class="bilgi" x="540" y="930" text-anchor="middle" font-family="AntonTR" font-size="90" fill="${C.ink}">BİLGİ BURADA</text></g>
  </svg></div>`;
  tl.push(`gsap.set('#cam',{svgOrigin:'540 900'});tl.fromTo('#cam',{scale:1},{scale:1.08,duration:${at(END)},ease:'sine.inOut'},0);`);
  // a number lands on the word that says it: cue('<kelime>', L[<satır>])
  tl.push(`gsap.set('.bilgi',{opacity:0});tl.to('.bilgi',{opacity:1,duration:.4},${at(L[1] || 0)});`);
  return { html, tl, css: '' };
};
