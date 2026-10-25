// Caption words come from the approved script, timings from Whisper.
// Whisper mishears ("kükürt" -> "tükürt"), splits ("Hassiktir" -> "Ha siktir", "Cemil'in" -> "Cemil" + "'in")
// and drops letters ("Hamsi" -> "Amsi"). We align the two word sequences (edit distance over words, with a
// letter-similarity cost) and give every script word the time span of the Whisper words it lines up with.
//
//   hizala("[excited] Lan, deniz bitiyor…", [["Lan,", 0.1, 0.4], ["deniz", 0.45, 0.8], ...]) -> [["Lan,", 0.1, 0.4], ...]
const temizle = metin => metin.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
const kok = w => w.toLocaleLowerCase('tr').replace(/[’']/g, "'").replace(/[^a-zçğıöşü0-9']/g, '');

function benzerlik(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

function hizala(metin, duyulan) {
  const S = temizle(metin).split(' ').filter(w => kok(w)), W = duyulan.filter(x => kok(x[0]));
  if (!S.length) return [];
  if (!W.length) return null;
  const n = S.length, m = W.length, sk = S.map(kok), wk = W.map(x => kok(x[0]));
  // cost[i][j]: align S[0..i) with W[0..j); gap cost 1, substitution 1.6*(1 - similarity) so a near-match beats two gaps
  const c = Array.from({ length: n + 1 }, () => new Float64Array(m + 1)), yol = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) { c[i][0] = i; yol[i][0] = 1; }
  for (let j = 1; j <= m; j++) { c[0][j] = j; yol[0][j] = 2; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const es = c[i - 1][j - 1] + 1.6 * (1 - benzerlik(sk[i - 1], wk[j - 1])), sil = c[i - 1][j] + 1, ekle = c[i][j - 1] + 1;
    if (es <= sil && es <= ekle) { c[i][j] = es; yol[i][j] = 0; } else if (sil <= ekle) { c[i][j] = sil; yol[i][j] = 1; } else { c[i][j] = ekle; yol[i][j] = 2; }
  }
  // walk back: eslesen[i] = Whisper indexes that belong to script word i
  const eslesen = S.map(() => []), artik = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const y = yol[i][j];
    if (i > 0 && j > 0 && y === 0) { eslesen[i - 1].unshift(j - 1); i--; j--; }
    else if (i > 0 && (j === 0 || y === 1)) i--;
    else { artik.push({ j: j - 1, sonraki: i }); j--; }      // extra Whisper word sitting before script word i
  }
  // an extra Whisper word ("siktir" after "Ha", "'in" after "Cemil") joins the script word before it, else the next one
  for (const { j: k, sonraki } of artik) {
    if (sonraki > 0) eslesen[sonraki - 1].push(k); else if (sonraki < n) eslesen[sonraki].unshift(k);
  }
  const zaman = eslesen.map(ks => ks.length ? [Math.min(...ks.map(k => W[k][1])), Math.max(...ks.map(k => W[k][2]))] : null);
  // script words Whisper missed: share the gap between their timed neighbours
  for (let a = 0; a < n; a++) if (!zaman[a]) {
    let b = a; while (b < n && !zaman[b]) b++;
    const t0 = a > 0 ? zaman[a - 1][1] : (zaman[b] ? zaman[b][0] : 0), t1 = b < n ? zaman[b][0] : t0 + 0.3 * (b - a);
    const adim = (t1 - t0) / (b - a);
    for (let k = a; k < b; k++) zaman[k] = [t0 + adim * (k - a), t0 + adim * (k - a + 1)];
    a = b;
  }
  return S.map((w, k) => [w, +zaman[k][0].toFixed(3), +Math.max(zaman[k][1], zaman[k][0] + 0.05).toFixed(3)]);
}

module.exports = { hizala, temizle };
