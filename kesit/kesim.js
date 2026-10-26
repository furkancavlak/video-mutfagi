// Cut lists for a vertical clip taken from a long video: sentences from Whisper words, cut resolution
// (phrase or sentence -> exact source seconds), the clip's own timeline, and an offline (no language model) picker.
// Pure functions only: no files, no ffmpeg. kesit.js does the I/O, secim.js the writer/judge generations.
//
// A cut list ("parcalar") is what the viewer hears, in order:
//   ["cumle", 12, 14]                                   sentences 12..14 of metin.txt, whole
//   ["ses", "peki bu kadar", 311.3, "güvenilir mi", 318]  from a phrase to a phrase (word-prefix match,
//                                                        nearest to the given source second; the end phrase
//                                                        ends on its LAST word)
const { norm } = require('../uretim/cekirdek');

const BOSLUK = 0.22;      // breath between two cuts
const NEFES = 0.35;       // breath after the last cut, then the end card
// teaser: the voice runs 20-25 s, then a ~5 s card ("CEVAP TAM VİDEODA"); moment: one self-contained stretch
const MODLAR = {
  tanitim: { hedef: [20, 25], sinir: [18, 27], enCok: 4, kart: 4.96 },
  an: { hedef: [20, 40], sinir: [15, 48], enCok: 3, kart: 3.0 },
};

const sa = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const sonNokta = w => /[.?!…]["'»”]?$/.test(w);

// Whisper words [[w, a, b], ...] -> sentences. A sentence ends on . ? ! … or on a pause longer than 0.9 s;
// a run-on of 40+ words is broken at its next comma (at 60 words in any case).
function cumleler(W) {
  const S = []; let bas = 0;
  for (let i = 0; i < W.length; i++) {
    const w = W[i][0], son = i === W.length - 1, ara = son ? 0 : W[i + 1][1] - W[i][2];
    if (son || sonNokta(w) || ara > 0.9 || (i - bas >= 40 && /,$/.test(w)) || i - bas >= 60) {
      S.push({ i: S.length, bas, son: i, a: W[bas][1], b: W[i][2], metin: W.slice(bas, i + 1).map(x => x[0]).join(' ') });
      bas = i + 1;
    }
  }
  return S;
}
// Whisper splits some tokens: "1 .5", "2 -3", "TL 'lik", "e -ticaret". Glue them back onto the word before.
function yapistir(W) {
  const out = [];
  for (const [w, a, b] of W) {
    const l = out[out.length - 1];
    if (l && (/^['’]/.test(w) || /^-\S/.test(w) || /^[.,]\d/.test(w)) && a - l[2] < 0.3) { l[0] += w.replace('’', "'"); l[2] = b; }
    else out.push([w, a, b]);
  }
  return out;
}
const metinTxt = S => S.map(s => `[${s.i}] ${sa(s.a)}–${sa(s.b)} ${s.metin}`).join('\n') + '\n';

// first word index of `ifade` (word-prefix match) whose start (or, sonda: last word's end) is nearest `yakin`
function ifadeBul(W, ifade, yakin, sonda = false) {
  const ps = String(ifade).split(/\s+/).map(norm).filter(Boolean);
  if (!ps.length) return -1;
  let en = -1, fark = Infinity;
  for (let i = 0; i + ps.length <= W.length; i++) {
    if (!ps.every((p, j) => norm(W[i + j][0]).startsWith(p))) continue;
    const k = sonda ? i + ps.length - 1 : i, t = sonda ? W[k][2] : W[k][1], d = Math.abs(t - (+yakin || 0));
    if (d < fark) { fark = d; en = k; }
  }
  return en;
}

// A cut list -> exact source seconds per cut, the clip's timeline and its words in clip seconds.
// Cut edges: start 0.06 s before the first word, end 0.12 s after the last, but never into the next word.
function coz(parcalar, W, S, mod = 'tanitim') {
  const M = MODLAR[mod] || MODLAR.tanitim, hata = [], kesit = [], kelimeler = [];
  let t = 0;
  (parcalar || []).forEach((p, n) => {
    let s, e;
    if (p[0] === 'cumle') {
      const x = S[+p[1]], y = S[+(p[2] ?? p[1])];
      if (!x || !y) { hata.push(`${n + 1}. parça: cümle ${p[1]}-${p[2]} yok`); return; }
      s = x.bas; e = y.son;
    } else if (p[0] === 'ses') {
      s = ifadeBul(W, p[1], p[2]); e = ifadeBul(W, p[3], p[4], true);
      if (s < 0) hata.push(`${n + 1}. parça: başlangıç "${p[1]}" bulunamadı`);
      if (e < 0) hata.push(`${n + 1}. parça: bitiş "${p[3]}" bulunamadı`);
      if (s < 0 || e < 0) return;
    } else { hata.push(`${n + 1}. parça: bilinmeyen tür "${p[0]}" ("cumle" ya da "ses" olmalı)`); return; }
    if (e < s) { hata.push(`${n + 1}. parça: bitiş başlangıçtan önce`); return; }
    const onceki = s > 0 ? W[s - 1][2] : 0;
    const v0 = Math.max(W[s][1] - 0.06, Math.min(onceki + 0.01, W[s][1] - 0.01), 0);
    let v1 = W[e][2] + 0.12;
    if (W[e + 1]) v1 = Math.min(v1, Math.max(W[e][2] + 0.03, W[e + 1][1] - 0.05));
    if (v1 - v0 < 0.8) hata.push(`${n + 1}. parça çok kısa (${(v1 - v0).toFixed(1)} sn)`);
    const li = kesit.length;
    kesit.push({ v0: +v0.toFixed(3), v1: +v1.toFixed(3), l0: +t.toFixed(3), metin: W.slice(s, e + 1).map(x => x[0]).join(' '), w0: s, w1: e });
    for (let i = s; i <= e; i++) kelimeler.push({ w: W[i][0], a: +(W[i][1] - v0 + t).toFixed(3), b: +(W[i][2] - v0 + t).toFixed(3), satir: li });
    t += v1 - v0 + BOSLUK;
  });
  const son = +(Math.max(0, t - BOSLUK) + NEFES).toFixed(3);
  if (!kesit.length && !hata.length) hata.push('liste boş');
  if (kesit.length > M.enCok) hata.push(`${kesit.length} parça var, en fazla ${M.enCok}`);
  if (kesit.length && (son < M.sinir[0] || son > M.sinir[1])) hata.push(`ses ${son.toFixed(1)} sn, ${M.sinir[0]}-${M.sinir[1]} sn arası olmalı (hedef ${M.hedef[0]}-${M.hedef[1]})`);
  return { kesit, kelimeler, son, kart: M.kart, sure: +(son + M.kart).toFixed(3), hata };
}

// what the viewer hears, cut by cut (the same printout writers and judges read)
function deneMetni(r) {
  const satir = r.kesit.map((k, j) => {
    const l1 = j + 1 < r.kesit.length ? r.kesit[j + 1].l0 : r.son;
    return `${j + 1}. kaynak ${sa(k.v0)}–${sa(k.v1)}  klip ${k.l0.toFixed(2)}–${l1.toFixed(2)} (${(l1 - k.l0).toFixed(1)} sn)  ${k.metin}`;
  });
  satir.push(`SES TOPLAM ${r.son.toFixed(1)} sn (+ kart ${r.kart.toFixed(1)} sn = ${r.sure.toFixed(1)} sn)`);
  satir.push('HATA ' + (r.hata.length ? r.hata.join('; ') : 'yok'));
  return satir.join('\n');
}

// end-card question from a spoken question: its last 2-4 words, upper case ("güvenilir mi?" -> "GÜVENİLİR Mİ?")
function soruKart(metin) {
  const w = String(metin).replace(/[.!…"'«»“”]/g, '').replace(/\?+$/, '').trim().split(/\s+/).filter(Boolean);
  let k = Math.min(2, w.length);
  while (k < w.length && k < 4 && w.slice(-k).join(' ').length < 10) k++;
  return (w.slice(-k).join(' ') + '?').toLocaleUpperCase('tr');
}

// ---- offline picker: no language model. Scores sentences by plain signals, builds cuts, keeps the best.
const CEKICI = ['ama', 'peki', 'neden', 'nasıl', 'hiç', 'gerçekten', 'aslında', 'ilk', 'sonunda', 'kimse', 'herkes', 'sadece', 'tek',
  'aynı', 'hangisi', 'kim', 'sır', 'hata', 'para', 'bedava', 'yüzde', 'milyon', 'milyar', 'bin', 'saat', 'dakika', 'bitti', 'yaptım', 'denedim'];
const KAPI = ['abone', 'beğen', 'yorum', 'selam', 'merhaba', 'link', 'açıklama', 'kanalıma', 'bildirim', 'sponsor', 'reklam'];
function cumlePuani(s, S, sonT) {
  const ws = s.metin.split(/\s+/).map(norm), n = ws.length;
  let p = 0;
  if (/\?\s*$/.test(s.metin)) p += 3;
  if (/\d/.test(s.metin)) p += 1.5;
  p += Math.min(3, ws.filter(w => CEKICI.some(c => w.startsWith(norm(c)))).length);
  if (ws.some(w => /(d|t)(ı|i|u|ü)m$/.test(w))) p += 0.5;        // first-person story ("yaptırdım", "kopyaladım")
  if (n >= 6 && n <= 22) p += 1; else if (n < 4) p -= 1.5; else if (n > 30) p -= 1;
  if (s.a < sonT * 0.04 || s.b > sonT * 0.94) p -= 2;                // intros and outros
  if (ws.some(w => KAPI.some(k => w.startsWith(k)))) p -= 3;
  return +p.toFixed(2);
}

// candidate -> {parcalar, ...}; sentence-level cuts, contiguous runs merged
function parcalarYap(idler) {
  const out = [];
  for (const i of idler) { const l = out[out.length - 1]; if (l && l[2] === i - 1) l[2] = i; else out.push(['cumle', i, i]); }
  return out;
}
const sesSuresi = (S, idler) => idler.reduce((t, i) => t + (S[i].b - S[i].a) + 0.18 + BOSLUK, 0) - BOSLUK + NEFES;

function sezgisel(W, S, mod = 'tanitim', adet = 3) {
  const M = MODLAR[mod] || MODLAR.tanitim, sonT = S.length ? S[S.length - 1].b : 0;
  const P = S.map(s => cumlePuani(s, S, sonT)), aday = [];
  const ekle = (idler, neden, soru = '') => {
    const parcalar = parcalarYap(idler), r = coz(parcalar, W, S, mod);
    if (r.hata.length) return;
    const ort = idler.reduce((a, i) => a + P[i], 0) / idler.length;
    const uzak = Math.max(0, M.hedef[0] - r.son, r.son - M.hedef[1]);
    aday.push({ parcalar, soru, kanca: '', neden, skor: +(P[idler[0]] * 1.5 + ort + (soru ? P[idler[idler.length - 1]] : 0) - uzak).toFixed(2), kaynak: [S[idler[0]].a, S[idler[idler.length - 1]].b] });
  };
  if (mod === 'tanitim') {
    // the run ends on a spoken question; the answer must follow in the long video (cut right before it)
    S.forEach((q, qi) => {
      if (!/\?\s*$/.test(q.metin) || qi > S.length - 3 || P[qi] < 2) return;
      let k = qi; while (k > 0 && qi - k < 8 && sesSuresi(S, range(k - 1, qi)) <= M.hedef[1]) k--;
      const run = range(k, qi);
      if (sesSuresi(S, run) >= M.sinir[0]) ekle(run, `soruda biter: "${q.metin}"`, soruKart(q.metin));
      // a stronger opening line from the minute before the question, then the build-up to it
      let h = -1;
      for (let i = Math.max(0, k - 25); i < k; i++) if (S[i].b - S[i].a <= 8 && (h < 0 || P[i] > P[h])) h = i;
      if (h >= 0 && P[h] > P[run[0]] + 1) {
        let k2 = qi; while (k2 > h + 1 && sesSuresi(S, [h, ...range(k2 - 1, qi)]) <= M.hedef[1]) k2--;
        const ids = [h, ...range(k2, qi)];
        if (sesSuresi(S, ids) >= M.sinir[0]) ekle(ids, `en güçlü cümleyle açılır, soruda biter: "${q.metin}"`, soruKart(q.metin));
      }
    });
  }
  if (mod === 'an' || !aday.length) {
    // one self-contained stretch: opens strong, ends on a full stop (not a question)
    S.forEach((s, i) => {
      if (P[i] < 1.5) return;
      for (let j = i; j < S.length && j - i < 12; j++) {
        const d = sesSuresi(S, range(i, j));
        if (d > M.hedef[1]) break;
        if (d >= M.hedef[0] && !/\?\s*$/.test(S[j].metin)) ekle(range(i, j), `güçlü açılış, ${S[j].metin.split(' ').slice(-3).join(' ')} ile kapanır`);
      }
    });
  }
  return enIyiler(aday.sort((x, y) => y.skor - x.skor), adet);
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// best first, skipping candidates that mostly reuse an already chosen stretch of the long video
function enIyiler(aday, adet) {
  const sec = [];
  for (const a of aday) {
    const cak = sec.some(b => { const o = Math.min(a.kaynak[1], b.kaynak[1]) - Math.max(a.kaynak[0], b.kaynak[0]); return o > 0.3 * (a.kaynak[1] - a.kaynak[0]); });
    if (!cak) sec.push(a);
    if (sec.length >= adet) break;
  }
  return sec;
}

module.exports = { BOSLUK, NEFES, MODLAR, sa, yapistir, cumleler, metinTxt, ifadeBul, coz, deneMetni, soruKart, cumlePuani, sezgisel, enIyiler };
