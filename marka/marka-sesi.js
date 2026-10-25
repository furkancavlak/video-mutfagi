// Brand sting ("marka sesi") synthesizer — pure JS, no samples, no dependencies.
// Structure: short riser (filtered noise opening + rising sine glide + faint high partials)
// -> impact (sub drop + bright detuned chord + quick rising sparkle notes + small reverb), ~3 s.
// Usage: node marka/marka-sesi.js <preset> <out.wav>     presets listed at the bottom.
const fs = require('fs');
const SR = 48000;

function wav(file, L, R) {
  const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.89 / (pk || 1);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4); b.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4); }
  fs.writeFileSync(file, b);
}

let seed = 1; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const saw = ph => 2 * (ph - Math.floor(ph + 0.5));
const soft = x => Math.tanh(x);

function make(o) {
  const RISE = o.rise, T = RISE + o.tail, N = Math.round(SR * T);
  const L = new Float32Array(N), R = new Float32Array(N);
  // --- riser
  let lp = 0, lp2 = 0, ph = 0, ph2 = 0;
  for (let i = 0; i < Math.round(RISE * SR); i++) {
    const t = i / SR, x = t / RISE;
    const fc = 400 * Math.pow(18000 / 400, x * x);               // filter opens toward the hit
    const a = 1 - Math.exp(-2 * Math.PI * fc / SR);
    lp += a * (rnd() - lp); lp2 += a * (lp - lp2);
    const noise = (lp - lp2 * 0.3) * Math.pow(x, 1.6) * 0.35;
    const curve = o.glideCurve || 1;
    const f = o.glideFrom * Math.pow(o.glideTo / o.glideFrom, Math.pow(x, curve));
    ph += f / SR; ph2 += f * 2 / SR;
    const tone = o.glideSine ? (Math.sin(2 * Math.PI * ph) + 0.35 * Math.sin(2 * Math.PI * ph2)) : (saw(ph) + saw(ph * 1.006)) * 0.5;
    const glide = tone * Math.pow(x, o.swell || 1.2) * (o.glideGain ?? 0.22);
    let spark = 0;
    for (const hz of o.partials) spark += Math.sin(2 * Math.PI * hz * t) * (o.padGain || 0.012);
    const padEnv = o.padIn ? Math.min(1, x * 2.5) : x;
    const gap = o.gap && t > RISE - o.gap ? 0 : 1;
    const s = (noise * (o.noiseGain ?? 1) + glide + spark * padEnv) * gap;
    L[i] += s; R[i] += s * 0.95 + noise * 0.05 * gap;
  }
  // --- impact
  const h0 = Math.round(RISE * SR);
  let sp = 0;
  const voices = o.chord.flatMap(hz => [hz, hz * 1.004, hz * 0.996]);
  const vph = voices.map(() => Math.random());
  let clp = 0;
  for (let i = h0; i < N; i++) {
    const t = (i - h0) / SR;
    const env = Math.exp(-t / o.decay);
    const trem = 1 - o.tremDepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * o.tremHz * t));
    // sub drop
    const fs_ = o.subTo + (o.subFrom - o.subTo) * Math.exp(-t / 0.08);
    sp += fs_ / SR;
    const sub = soft(Math.sin(2 * Math.PI * sp) * 2.2) * 0.75 * env * trem;
    // transient click
    const click = t < 0.03 ? rnd() * (1 - t / 0.03) * 0.9 : 0;
    // bright chord (detuned saws, lowpassed)
    let ch = 0;
    for (let k = 0; k < voices.length; k++) { vph[k] += voices[k] / SR; ch += saw(vph[k]); }
    ch /= voices.length;
    const fc = 1500 + 5000 * Math.exp(-t / 0.35);
    clp += (1 - Math.exp(-2 * Math.PI * fc / SR)) * (ch - clp);
    const chord = clp * 0.55 * Math.exp(-t / (o.decay * 1.15)) * trem;
    // rising sparkle notes right after the hit
    let arp = 0;
    o.arp.forEach((hz, k) => {
      const t0 = 0.06 + k * o.arpStep;
      if (t > t0) { const tt = t - t0; arp += Math.sin(2 * Math.PI * hz * tt) * Math.exp(-tt / 0.18) * 0.12; }
    });
    const s = sub + click + chord + arp;
    const w = Math.sin(2 * Math.PI * 0.7 * t) * 0.15;      // slow stereo movement of the chord
    L[i] += s + chord * w; R[i] += s - chord * w;
  }
  // --- simple stereo reverb (feedback combs) on everything after the hit
  const combs = [[1557, 0.82], [1617, 0.81], [1491, 0.83], [1422, 0.8]];
  const outL = Float32Array.from(L), outR = Float32Array.from(R);
  for (const [d, fb] of combs) {
    const bufL = new Float32Array(d), bufR = new Float32Array(d + 23);
    for (let i = 0; i < N; i++) {
      const yl = bufL[i % d], yr = bufR[i % (d + 23)];
      bufL[i % d] = L[i] * 0.5 + yl * fb; bufR[i % (d + 23)] = R[i] * 0.5 + yr * fb;
      outL[i] += yl * o.wet; outR[i] += yr * o.wet;
    }
  }
  // fade out
  const fo = Math.round(0.35 * SR);
  for (let i = 0; i < fo; i++) { const g = 1 - i / fo; outL[N - fo + i] *= g; outR[N - fo + i] *= g; }
  return [outL, outR];
}

const C = [523.25, 659.25, 783.99, 1046.5];      // C major
const SUS = [587.33, 783.99, 880.0, 1174.66];    // D sus4
const AM = [440.0, 523.25, 659.25, 880.0];       // A minor
const base = { rise: 0.85, tail: 2.1, glideFrom: 150, glideTo: 420, partials: [2093, 3136, 5587, 7040, 9397],
  subFrom: 110, subTo: 46, decay: 0.9, tremHz: 11, tremDepth: 0.45, wet: 0.08, arpStep: 0.05 };
const v4 = { ...base, chord: C, arp: [784, 988, 1175, 1568], tremDepth: 0.05, wet: 0.12 };
const V = [
  ['5-temiz-kayis', { ...v4, glideSine: true, glideGain: 0.35, padIn: true, padGain: 0.02 }],
  ['6-temiz-kayis-bosluk', { ...v4, glideSine: true, glideGain: 0.35, padIn: true, padGain: 0.02, swell: 2.2, gap: 0.06 }],
  ['7-hizlanan-kayis', { ...v4, glideSine: true, glideGain: 0.35, glideTo: 640, glideCurve: 2.2, swell: 1.8, padIn: true, padGain: 0.02 }],
  ['8-parilti-perde', { ...v4, glideGain: 0.0, padIn: true, padGain: 0.045, noiseGain: 1.4, rise: 1.0 }],
];
const [, , ad = '7-hizlanan-kayis', out = ad + '.wav'] = process.argv;
const p = V.find(v => v[0] === ad);
if (!p) { console.log('presets: ' + V.map(v => v[0]).join(', ')); process.exit(1); }
seed = 7; const [l, r] = make(p[1]); wav(out, l, r); console.log('wrote ' + out);
