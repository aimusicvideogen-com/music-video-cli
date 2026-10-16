#!/usr/bin/env node
import { analyzeSong } from '../src/analyze.js';
import { makeCanvas } from '../src/canvas.js';
import { planShots } from '../src/plan.js';
import { getSpecs } from '../src/specs.js';
import { VERSION } from '../src/version.js';

const HELP = `aimusicvideogen ${VERSION} - free music video tools for musicians (runs locally)

Usage:
  aimusicvideogen analyze <song>              BPM, key, Camelot, bar length, best 15 s / 30 s clip
  aimusicvideogen plan --bpm 120 --duration 180 [--offset 0.4]
                                              beat-synced shot list (cuts on bar lines)
  aimusicvideogen plan <song>                 analyze the song, then plan the shots
  aimusicvideogen canvas <video|image> [--start 12] [--length 8] [--out canvas.mp4]
                                              Spotify Canvas: silent 1080x1920 MP4, 3-8 s
  aimusicvideogen specs [platform]            specs for tiktok, instagram-reels, youtube-shorts,
                                              youtube, spotify-canvas
  aimusicvideogen mcp                         run as an MCP server (stdio) for Claude, Cursor, etc.

Options:
  --json        print raw JSON
  -h, --help    show this help
  -v, --version show the version

Needs ffmpeg on the PATH (or FFMPEG_PATH). Make the whole video with AI from one photo:
https://aimusicvideogen.com`;

function parse(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[name] = true;
      else flags[name] = argv[++i];
    } else if (arg === '-h') flags.help = true;
    else if (arg === '-v') flags.version = true;
    else positional.push(arg);
  }
  return { positional, flags };
}

const num = (value) => (value === undefined || value === true ? undefined : Number(value));

function printAnalysis(result) {
  const clip = (h) => `${h.start.toFixed(1)}s - ${(h.start + h.length).toFixed(1)}s`;
  console.log(`File        ${result.file}`);
  console.log(`Duration    ${result.durationSeconds} s (${result.bars} bars)`);
  console.log(`Tempo       ${result.bpm} BPM  (half ${result.alternativeBpm[0]}, double ${result.alternativeBpm[1]})`);
  console.log(`Key         ${result.key}  (Camelot ${result.camelot}, relative ${result.relativeKey})`);
  console.log(`Beat / bar  ${result.beatSeconds} s / ${result.barSeconds} s`);
  console.log(`Best 15 s   ${clip(result.highlight15s)}`);
  console.log(`Best 30 s   ${clip(result.highlight30s)}`);
}

function printPlan(plan) {
  console.log(`${plan.shotCount} shots, ${plan.totalBars} bars at ${plan.bpm} BPM (bar = ${plan.barSeconds} s)\n`);
  for (const shot of plan.shots) {
    console.log(
      `${String(shot.shot).padStart(3)}  ${shot.start}  ${shot.lengthSeconds.toFixed(2).padStart(6)} s  ${shot.section.padEnd(13)} ${shot.idea}`,
    );
  }
  console.log(`\n${plan.note}`);
}

async function main() {
  const { positional, flags } = parse(process.argv.slice(2));
  const [command, target] = positional;
  if (flags.version) return console.log(VERSION);
  if (!command || flags.help || command === 'help') return console.log(HELP);
  const out = (value, pretty) => (flags.json ? console.log(JSON.stringify(value, null, 2)) : pretty(value));

  switch (command) {
    case 'analyze': {
      if (!target) throw new Error('Usage: aimusicvideogen analyze <song>');
      return out(await analyzeSong(target), printAnalysis);
    }
    case 'plan': {
      let bpm = num(flags.bpm);
      let durationSeconds = num(flags.duration);
      if (target) {
        const analysis = await analyzeSong(target);
        bpm ??= analysis.bpm;
        durationSeconds ??= analysis.durationSeconds;
      }
      if (!bpm || !durationSeconds) throw new Error('Usage: aimusicvideogen plan <song>  or  plan --bpm 120 --duration 180');
      return out(planShots({ bpm, durationSeconds, offsetSeconds: num(flags.offset) ?? 0 }), printPlan);
    }
    case 'canvas': {
      if (!target) throw new Error('Usage: aimusicvideogen canvas <video|image> [--start 12] [--length 8]');
      const result = await makeCanvas({ input: target, output: flags.out, start: num(flags.start), length: num(flags.length) });
      return out(result, (r) => console.log(`Saved ${r.output} (${r.width}x${r.height}, ${r.seconds} s, no audio)\n${r.note}`));
    }
    case 'specs':
      return out(getSpecs(target), (specs) => console.log(JSON.stringify(specs, null, 2)));
    case 'mcp': {
      const { startMcpServer } = await import('../src/mcp.js');
      return startMcpServer();
    }
    default:
      throw new Error(`Unknown command "${command}". Run aimusicvideogen --help`);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
