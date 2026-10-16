import { existsSync } from 'node:fs';
import { decodeMono } from './ffmpeg.js';

/** In-place iterative radix-2 FFT. `re` and `im` must have the same power-of-two length. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k;
        const b = a + size / 2;
        const tRe = re[b] * curRe - im[b] * curIm;
        const tIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

function hannWindow(size) {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  return window;
}

const SAMPLE_RATE = 11025;

/**
 * Onset strength per frame (spectral flux: summed positive change in log magnitude), plus the
 * frame rate in frames per second.
 */
function onsetEnvelope(samples) {
  const size = 1024;
  const hop = 128;
  const window = hannWindow(size);
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  const frames = Math.max(0, Math.floor((samples.length - size) / hop));
  const envelope = new Float32Array(frames);
  let previous = new Float32Array(size / 2);
  let current = new Float32Array(size / 2);
  for (let frame = 0; frame < frames; frame++) {
    const offset = frame * hop;
    for (let i = 0; i < size; i++) {
      re[i] = samples[offset + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    let flux = 0;
    for (let bin = 1; bin < size / 2; bin++) {
      current[bin] = Math.log1p(100 * Math.hypot(re[bin], im[bin]));
      const rise = current[bin] - previous[bin];
      if (rise > 0) flux += rise;
    }
    envelope[frame] = flux;
    [previous, current] = [current, previous];
  }
  // Remove the slow-moving average so only the peaks (onsets) remain.
  const radius = 16;
  const detrended = new Float32Array(frames);
  let sum = 0;
  for (let i = 0; i < Math.min(frames, radius); i++) sum += envelope[i];
  for (let i = 0; i < frames; i++) {
    if (i + radius < frames) sum += envelope[i + radius];
    if (i - radius - 1 >= 0) sum -= envelope[i - radius - 1];
    const count = Math.min(frames, i + radius + 1) - Math.max(0, i - radius);
    detrended[i] = Math.max(0, envelope[i] - sum / count);
  }
  return { envelope: detrended, frameRate: SAMPLE_RATE / hop };
}

/**
 * Tempo in BPM from the autocorrelation of the onset envelope. A lag also scores the beats at
 * twice and half its length, and a mild preference for ~120 BPM settles the usual octave
 * ambiguity. Returns the BPM folded into [minTempo, maxTempo] and a 0-1 confidence.
 */
function estimateTempo(envelope, frameRate, minTempo = 70, maxTempo = 180) {
  const minLag = Math.floor((60 * frameRate) / (maxTempo * 2));
  const maxLag = Math.ceil((60 * frameRate) / (minTempo / 2));
  const n = envelope.length;
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += envelope[i] * envelope[i + lag];
    ac[lag] = sum / (n - lag);
  }
  const at = (lag) => {
    const low = Math.floor(lag);
    const high = Math.min(maxLag + 1, low + 1);
    const t = lag - low;
    return (ac[low] || 0) * (1 - t) + (ac[high] || 0) * t;
  };
  const lowLag = (60 * frameRate) / maxTempo;
  const highLag = (60 * frameRate) / minTempo;
  let bestLag = 0;
  let bestScore = -Infinity;
  const scores = [];
  for (let lag = Math.ceil(lowLag); lag <= Math.floor(highLag); lag++) {
    const bpm = (60 * frameRate) / lag;
    const harmonic = at(lag) + 0.5 * at(lag * 2) + 0.25 * at(lag / 2);
    const prior = Math.exp(-0.5 * Math.log2(bpm / 120) ** 2 / 0.5 ** 2);
    const score = harmonic * (0.6 + 0.4 * prior);
    scores.push(score);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  // Parabolic interpolation around the peak for sub-frame precision.
  const y0 = ac[bestLag - 1] || 0;
  const y1 = ac[bestLag];
  const y2 = ac[bestLag + 1] || 0;
  const denominator = y0 - 2 * y1 + y2;
  const refinedLag = denominator ? bestLag + (0.5 * (y0 - y2)) / denominator : bestLag;
  let bpm = (60 * frameRate) / refinedLag;
  while (bpm < minTempo) bpm *= 2;
  while (bpm > maxTempo) bpm /= 2;
  const mean = scores.reduce((total, value) => total + value, 0) / scores.length;
  const confidence = Math.max(0, Math.min(1, (bestScore / (mean || 1) - 1) / 6));
  return { bpm: Math.round(bpm * 10) / 10, confidence: Math.round(confidence * 100) / 100 };
}

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// Krumhansl-Kessler key profiles (perceived stability of each scale degree).
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
// Camelot wheel codes used by DJs for harmonic mixing, indexed by tonic pitch class.
const CAMELOT_MAJOR = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
const CAMELOT_MINOR = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];

function correlation(a, b) {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - meanA) * (b[i] - meanB);
    denA += (a[i] - meanA) ** 2;
    denB += (b[i] - meanB) ** 2;
  }
  return num / Math.sqrt(denA * denB || 1);
}

/** Musical key from a chromagram matched against the major and minor key profiles. */
function detectKey(samples) {
  const size = 8192;
  const hop = 4096;
  const window = hannWindow(size);
  const chroma = new Array(12).fill(0);
  const binClass = new Int8Array(size / 2).fill(-1);
  for (let bin = 1; bin < size / 2; bin++) {
    const freq = (bin * SAMPLE_RATE) / size;
    if (freq < 65 || freq > 2100) continue;
    const midi = Math.round(12 * Math.log2(freq / 440) + 69);
    binClass[bin] = ((midi % 12) + 12) % 12;
  }
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  const frames = Math.max(1, Math.floor((samples.length - size) / hop));
  for (let frame = 0; frame < frames; frame++) {
    const offset = frame * hop;
    for (let i = 0; i < size; i++) {
      re[i] = (samples[offset + i] ?? 0) * window[i];
      im[i] = 0;
    }
    fft(re, im);
    const frameChroma = new Array(12).fill(0);
    for (let bin = 1; bin < size / 2; bin++) {
      const pitchClass = binClass[bin];
      if (pitchClass >= 0) frameChroma[pitchClass] += Math.hypot(re[bin], im[bin]);
    }
    // Normalise per frame so loud passages do not dominate the estimate.
    const peak = Math.max(...frameChroma);
    if (peak > 0) for (let i = 0; i < 12; i++) chroma[i] += frameChroma[i] / peak;
  }
  const scores = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = chroma.map((_, i) => chroma[(i + tonic) % 12]);
    scores.push({ tonic, mode: 'major', score: correlation(rotated, MAJOR_PROFILE) });
    scores.push({ tonic, mode: 'minor', score: correlation(rotated, MINOR_PROFILE) });
  }
  scores.sort((a, b) => b.score - a.score);
  const [best, runnerUp] = scores;
  const relativeTonic = best.mode === 'major' ? (best.tonic + 9) % 12 : (best.tonic + 3) % 12;
  const confidence = Math.max(0, Math.min(1, (best.score - runnerUp.score) * 4 + best.score / 2));
  return {
    key: `${NOTES[best.tonic]} ${best.mode}`,
    camelot: (best.mode === 'major' ? CAMELOT_MAJOR : CAMELOT_MINOR)[best.tonic],
    relative: `${NOTES[relativeTonic]} ${best.mode === 'major' ? 'minor' : 'major'}`,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * Start (seconds) of the most energetic `length`-second window, which in most songs is the
 * chorus or the drop.
 */
function findHighlight(samples, length) {
  const step = 0.5;
  const hop = Math.floor(SAMPLE_RATE * step);
  const blocks = Math.floor(samples.length / hop);
  const energy = new Float64Array(blocks);
  for (let block = 0; block < blocks; block++) {
    let sum = 0;
    for (let i = block * hop; i < (block + 1) * hop; i += 2) sum += samples[i] * samples[i];
    energy[block] = sum;
  }
  const windowBlocks = Math.max(1, Math.round(length / step));
  if (windowBlocks >= blocks) return 0;
  let current = 0;
  for (let i = 0; i < windowBlocks; i++) current += energy[i];
  let best = current;
  let bestStart = 0;
  for (let start = 1; start + windowBlocks <= blocks; start++) {
    current += energy[start + windowBlocks - 1] - energy[start - 1];
    if (current > best) {
      best = current;
      bestStart = start;
    }
  }
  return bestStart * step;
}

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Analyses a song file: duration, tempo, key, bar length and the strongest 15- and 30-second
 * windows (good clips for TikTok, Reels and Shorts). Runs locally; nothing is uploaded.
 */
export async function analyzeSong(file, { minTempo = 70, maxTempo = 180 } = {}) {
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  const samples = await decodeMono(file, SAMPLE_RATE);
  if (samples.length < SAMPLE_RATE * 3) throw new Error('The file is shorter than 3 seconds.');
  const duration = samples.length / SAMPLE_RATE;
  const { envelope, frameRate } = onsetEnvelope(samples.subarray(0, SAMPLE_RATE * 240));
  const tempo = estimateTempo(envelope, frameRate, minTempo, maxTempo);
  const key = detectKey(samples.subarray(0, SAMPLE_RATE * 240));
  const barSeconds = 240 / tempo.bpm;
  return {
    file,
    durationSeconds: round(duration, 1),
    bpm: Math.round(tempo.bpm),
    bpmPrecise: tempo.bpm,
    tempoConfidence: tempo.confidence,
    alternativeBpm: [round(tempo.bpm / 2, 1), round(tempo.bpm * 2, 1)],
    key: key.key,
    camelot: key.camelot,
    relativeKey: key.relative,
    keyConfidence: key.confidence,
    beatSeconds: round(60 / tempo.bpm, 3),
    barSeconds: round(barSeconds, 3),
    bars: Math.floor(duration / barSeconds),
    highlight15s: { start: findHighlight(samples, 15), length: 15 },
    highlight30s: { start: findHighlight(samples, 30), length: 30 },
  };
}
