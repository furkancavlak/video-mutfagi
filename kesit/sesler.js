// Sounds made by code for a clip (no samples, nothing to download or pay for):
//   vuus   a soft whoosh for the joins between cuts (filtered noise, sweeping up and back, panned across)
//   kartMuzigi  a calm chord under the end card that swells in and fades out slowly (never stops abruptly)
const fs = require('fs');
const SR = 48000;

function wav(file, L, R) {
  const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  const k = x => Math.round(Math.max(-1, Math.min(1, x)) * 32767);
  for (let i = 0; i < n; i++) { b.writeInt16LE(k(L[i]), 44 + i * 4); b.writeInt16LE(k(R[i]), 46 + i * 4); }
  fs.writeFileSync(file, b);
}

function tohum(s) { return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

// one whoosh: peak `tepe` seconds into a `sure` long sound; returns { L, R, tepe }
function vuus(sure = 0.55, seed = 7) {
  const N = Math.round(sure * SR), L = new Float32Array(N), R = new Float32Array(N), rnd = tohum(seed), tepe = sure * 0.62;
  let lo = 0, bp = 0, pk = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR, x = t / sure;
    const env = t < tepe ? Math.pow(t / tepe, 2.2) : Math.exp(-(t - tepe) / (sure * 0.13));
    const fc = 500 + 2900 * Math.sin(Math.PI * Math.min(1, x / 0.8)) ** 1.5;      // 500 Hz -> 3.4 kHz -> back down
    const f = 2 * Math.sin(Math.PI * fc / SR), q = 0.55;                         // state-variable band-pass
    const hp = rnd() - lo - q * bp; bp += f * hp; lo += f * bp;
    const s = bp * env; pk = Math.max(pk, Math.abs(s));
    const pan = 0.5 + 0.4 * Math.sin(Math.PI * (x - 0.5));                       // left -> right
    L[i] = s * Math.cos(pan * Math.PI / 2); R[i] = s * Math.sin(pan * Math.PI / 2);
  }
  for (let i = 0; i < N; i++) { L[i] /= pk; R[i] /= pk; }
  return { L, R, tepe };
}

// whooshes for a whole clip: one peaking on every time in `anlar`, 18 dB under full scale
function vuusYatagi(file, sure, anlar) {
  const N = Math.round(sure * SR), L = new Float32Array(N), R = new Float32Array(N), g = Math.pow(10, -18 / 20);
  anlar.forEach((t, j) => {
    const v = vuus(0.55, 701 + 11 * j), a = Math.round((t - v.tepe) * SR);
    for (let i = 0; i < v.L.length; i++) { const k = a + i; if (k >= 0 && k < N) { L[k] += v.L[i] * g; R[k] += v.R[i] * g; } }
  });
  wav(file, L, R);
}

// the end card's music: swells in over 0.6 s, a soft bell on the card's first beat, fades out over `sonus` seconds
function kartMuzigi(file, sure, { giris = 0.4, sonus = 1.8 } = {}) {
  const N = Math.round(sure * SR), L = new Float32Array(N), R = new Float32Array(N);
  const akor = [146.83, 220.0, 293.66, 329.63, 440.0];            // D suspended: open, a question without an answer
  const ses = akor.flatMap((f, k) => [[f * 0.997, k], [f * 1.003, k]]);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const zarf = Math.min(1, t / 0.6) * (t > sure - sonus ? 0.5 + 0.5 * Math.cos(Math.PI * (t - (sure - sonus)) / sonus) : 1);
    let l = 0, r = 0;
    ses.forEach(([f, k], j) => {
      const s = (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * (k === 0 ? 0.9 : 0.55);
      if (j % 2) r += s; else l += s;
    });
    let can = 0;                                                    // bell on the card's beat
    if (t >= giris) { const u = t - giris; for (const f of [587.33, 880]) can += Math.sin(2 * Math.PI * f * u) * Math.exp(-u * 2.2) * Math.min(1, u / 0.005); }
    const yavas = 1 + 0.06 * Math.sin(2 * Math.PI * 0.5 * t);      // a slow breath in the pad
    L[i] = (l * 0.09 * yavas + can * 0.12) * zarf; R[i] = (r * 0.09 * yavas + can * 0.12) * zarf;
  }
  wav(file, L, R);
}

module.exports = { SR, wav, vuus, vuusYatagi, kartMuzigi };
