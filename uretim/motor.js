// The "formul" motor: timing and motion plumbing for per-video scenes (sahneler.js). It draws NOTHING.
// Every picture in a video is drawn for that story; the channel's look (palette, line, recurring character)
// comes from kanal/<ad>/kimlik.json → gorsel_dil and kanal/<ad>/karakter.js. Rules: dersler/FORMUL.md.
//
// sahneler.js receives it as M:  module.exports = function ({ C, T, at, f, r2, rnd, W, H, M, karakter }) { ...; return M.bitir(css) }
//
//   M.k('kelime', satir)              time of the first word starting with 'kelime' inside line `satir` (Whisper's timing)
//   M.sahne(id, svgIci)               one full-frame shot (1080x1920 SVG); add its html with M.html.push or let M.sahne do it
//   M.kesmeler([t0, t1, ...])         shot boundaries; M.kes(id, i) shows shot id between boundary i and i+1 (hard cut)
//   M.yaklas(sel, a, b, s0, s1, oda)  slow camera push on a group from time a to b (scale s0 -> s1 around oda 'x y')
//   M.yer(x, y, ic, { s, r, sinif })  POSITION WRAPPER. The outer group carries translate/scale/rotate, the inner group gets
//                                     the class. Animate the class, never the outer group: GSAP sets x/y absolutely, so
//                                     moving a group that has its own transform attribute throws it to the top of the frame.
//   M.belir(sel, t, { sure, olcek, oda })   pop in (opacity + scale from olcek)       M.kaybol(sel, t, sure)
//   M.vur(sel, t, oda)                stamp slam: big -> normal, fast, no bounce      M.dus(sel, t, { yuk, sure })  drop in from above
//   M.titre(sel, t, { kac, genlik })  panic shake (x)                                 M.zipla(sel, t, { kac, yuk })  hop in place
//   M.git(sel, t, { x, y, sure, don, oda })  move to an offset (relative to its wrapper), optional rotation
//   M.yol(sel, t, sure, noktalar)     travel along points [{x,y}, ...] relative to the wrapper (bubbles riding an arrow)
//   M.renk(sel, t, renk, sure)        repaint fill (sky turning to oven, leaves going grey)
//   M.nefes(sel, t, { kac, olcek, oda, sure })  slow breathing loop (ambient life)
//   M.bitir(css)                      -> { html, tl, css } for kurgu.js
//
// Motion rules baked in: no elastic/bounce eases, entrances >= .25 s, slams .3 s with power3.out (dersler/KURGU-DILI.md).
module.exports = function motor({ T, at, f }) {
  const { L, cue } = T;
  const html = [], tl = [];
  let sinir = [];
  const M = { html, tl };
  M.k = (w, satir) => cue(w, L[satir]);
  M.sahne = (id, ic) => { const h = `<div class="sh" id="${id}"><svg width="1080" height="1920" viewBox="0 0 1080 1920">${ic}</svg></div>`; html.push(h); return h; };
  M.kesmeler = s => { sinir = s; };
  M.kes = (id, i) => {
    const a = sinir[i], b = sinir[i + 1];
    tl.push(`gsap.set('#${id}',{opacity:0});tl.set('#${id}',{opacity:1},${at(a)});${b != null && b < T.END ? `tl.set('#${id}',{opacity:0},${at(b)});` : ''}`);
  };
  M.yaklas = (sel, a, b, s0 = 1, s1 = 1.08, oda = '540 960') =>
    tl.push(`gsap.set('${sel}',{scale:${s0},svgOrigin:'${oda}'});tl.to('${sel}',{scale:${s1},duration:${at(Math.max(.1, b - a))},ease:'sine.inOut'},${at(a)});`);
  M.yer = (x, y, ic, { s = 1, r = 0, sinif = '' } = {}) =>
    `<g transform="translate(${f(x)},${f(y)})${r ? ` rotate(${r})` : ''}${s !== 1 ? ` scale(${s})` : ''}"><g class="${sinif}">${ic}</g></g>`;
  M.belir = (sel, t, { sure = .3, olcek = .6, oda = '0 0' } = {}) =>
    tl.push(`gsap.set('${sel}',{opacity:0,scale:${olcek},svgOrigin:'${oda}'});tl.to('${sel}',{opacity:1,scale:1,duration:${sure},ease:'power3.out'},${at(t)});`);
  M.kaybol = (sel, t, sure = .25) => tl.push(`tl.to('${sel}',{opacity:0,duration:${sure}},${at(t)});`);
  M.vur = (sel, t, oda = '0 0') =>
    tl.push(`gsap.set('${sel}',{opacity:0,scale:1.3,svgOrigin:'${oda}'});tl.to('${sel}',{opacity:1,scale:1,duration:.3,ease:'power3.out'},${at(t)});`);
  M.dus = (sel, t, { yuk = 900, sure = .32 } = {}) =>
    tl.push(`gsap.set('${sel}',{y:-${yuk},opacity:0});tl.to('${sel}',{y:0,opacity:1,duration:${sure},ease:'power3.in'},${at(t)});tl.fromTo('${sel}',{scaleY:.86,svgOrigin:'0 0'},{scaleY:1,duration:.18,ease:'power2.out'},${at(t + sure)});`);
  M.titre = (sel, t, { kac = 10, genlik = 6 } = {}) =>
    tl.push(`tl.fromTo('${sel}',{x:-${genlik}},{x:${genlik},duration:.08,yoyo:true,repeat:${kac - 1},ease:'none'},${at(t)});tl.to('${sel}',{x:0,duration:.05},${at(t + kac * .08)});`);
  M.zipla = (sel, t, { kac = 3, yuk = 14 } = {}) =>
    tl.push(`tl.fromTo('${sel}',{y:0},{y:-${yuk},duration:.18,yoyo:true,repeat:${kac * 2 - 1},ease:'sine.inOut'},${at(t)});`);
  M.git = (sel, t, { x = 0, y = 0, sure = .5, don = null, oda = '0 0' } = {}) =>
    tl.push(`tl.to('${sel}',{x:${f(x)},y:${f(y)}${don != null ? `,rotation:${don},svgOrigin:'${oda}'` : ''},duration:${sure},ease:'power2.inOut'},${at(t)});`);
  M.yol = (sel, t, sure, noktalar) => {
    const adim = sure / Math.max(1, noktalar.length);
    tl.push(`gsap.set('${sel}',{opacity:0});tl.to('${sel}',{opacity:1,duration:.15},${at(t)});` +
      noktalar.map((p, j) => `tl.to('${sel}',{x:${f(p.x)},y:${f(p.y)},duration:${at(adim)},ease:'none'},${at(t + j * adim)});`).join('') +
      `tl.to('${sel}',{opacity:0,scale:.3,duration:.2},${at(t + sure)});`);
  };
  M.renk = (sel, t, renk, sure = .5) => tl.push(`tl.to('${sel}',{attr:{fill:'${renk}'},duration:${sure}},${at(t)});`);
  M.nefes = (sel, t, { kac = 3, olcek = 1.035, oda = '0 0', sure = .7 } = {}) =>
    tl.push(`tl.fromTo('${sel}',{scale:1},{scale:${olcek},svgOrigin:'${oda}',duration:${sure},yoyo:true,repeat:${kac * 2 - 1},ease:'sine.inOut'},${at(t)});`);
  M.bitir = (css = '') => ({ html: html.join('\n'), tl, css: `.sh{position:absolute;inset:0}\n${css}` });
  return M;
};
