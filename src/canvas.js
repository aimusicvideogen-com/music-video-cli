import { existsSync } from 'node:fs';
import path from 'node:path';
import { runFfmpeg } from './ffmpeg.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

/**
 * Makes a Spotify Canvas: a silent 1080x1920 H.264 MP4 of 3-8 seconds. Videos are cut from
 * `start` and centre-cropped to 9:16; still images get a slow zoom in and back out so the loop
 * is seamless.
 */
export async function makeCanvas({ input, output, start = 0, length = 8 }) {
  if (!existsSync(input)) throw new Error(`File not found: ${input}`);
  const seconds = Math.min(8, Math.max(3, Number(length) || 8));
  const target =
    output || path.join(path.dirname(input), `${path.parse(input).name}-canvas.mp4`);
  const isImage = IMAGE_EXTENSIONS.has(path.extname(input).toLowerCase());
  const fps = 30;
  const frames = Math.round(seconds * fps);
  const crop = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1';
  const args = isImage
    ? [
        '-loop', '1', '-i', input, '-t', String(seconds),
        '-vf',
        // Scale up first so the zoom stays sharp, then zoom 1.00 -> 1.06 -> 1.00 over the loop.
        `scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,` +
          `zoompan=z='1+0.06*sin(PI*on/${frames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${fps},setsar=1`,
      ]
    : ['-ss', String(start), '-i', input, '-t', String(seconds), '-vf', `${crop},fps=${fps}`];
  args.push(
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-crf', '18',
    '-movflags', '+faststart', '-y', target,
  );
  await runFfmpeg(args);
  return {
    output: target,
    width: 1080,
    height: 1920,
    seconds,
    audio: false,
    note: 'Upload in Spotify for Artists: open the song, then Canvas. Spotify reviews it before it goes live.',
  };
}
