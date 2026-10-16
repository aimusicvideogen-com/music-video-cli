import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

let cached;

/**
 * Finds an ffmpeg binary: $FFMPEG_PATH, then `ffmpeg` on the PATH, then the optional
 * ffmpeg-static package. Throws a readable error if none is available.
 */
export function ffmpegPath() {
  if (cached) return cached;
  const candidates = [];
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  candidates.push('ffmpeg');
  try {
    const require = createRequire(import.meta.url);
    const bundled = require('ffmpeg-static');
    if (bundled) candidates.push(bundled);
  } catch {
    // ffmpeg-static is optional.
  }
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-version'], { stdio: 'ignore' });
    if (probe.status === 0) {
      cached = candidate;
      return cached;
    }
  }
  throw new Error(
    'ffmpeg was not found. Install it (https://ffmpeg.org/download.html, `brew install ffmpeg`, ' +
      '`winget install ffmpeg`) or set FFMPEG_PATH to the binary.',
  );
}

/** Runs ffmpeg with the given arguments and resolves with stdout as a Buffer. */
export function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', ...args]);
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

/** Decodes any audio or video file to mono 32-bit float samples at `sampleRate`. */
export async function decodeMono(file, sampleRate, maxSeconds) {
  const args = ['-i', file, '-vn', '-ac', '1', '-ar', String(sampleRate)];
  if (maxSeconds) args.push('-t', String(maxSeconds));
  args.push('-f', 'f32le', 'pipe:1');
  const raw = await runFfmpeg(args);
  const length = Math.floor(raw.length / 4);
  // Copy so the view is 4-byte aligned whatever offset Node's buffer pool gave us.
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + length * 4));
}
