import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyzeSong } from './analyze.js';
import { makeCanvas } from './canvas.js';
import { planShots } from './plan.js';
import { SPECS, getSpecs } from './specs.js';
import { VERSION } from './version.js';

const json = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const failure = (error) => ({ content: [{ type: 'text', text: String(error.message || error) }], isError: true });
const safely = (handler) => async (args) => {
  try {
    return json(await handler(args));
  } catch (error) {
    return failure(error);
  }
};

/** Starts the MCP server on stdio. Every tool runs locally; no files leave the machine. */
export async function startMcpServer() {
  const server = new McpServer({ name: 'aimusicvideogen', version: VERSION });

  server.registerTool(
    'analyze_song',
    {
      title: 'Analyze song',
      description:
        'Detect the BPM (tempo), musical key, Camelot code, bar length and duration of a local audio or ' +
        'video file, and find the most energetic 15 s and 30 s windows (usually the chorus or drop, good ' +
        'clips for TikTok, Reels and Shorts). Runs locally with ffmpeg.',
      inputSchema: {
        path: z.string().describe('Absolute path to an MP3, WAV, M4A, FLAC, OGG or video file'),
        minTempo: z.number().optional().describe('Lowest BPM to report (default 70)'),
        maxTempo: z.number().optional().describe('Highest BPM to report (default 180)'),
      },
    },
    safely(({ path, minTempo, maxTempo }) => analyzeSong(path, { minTempo, maxTempo })),
  );

  server.registerTool(
    'plan_music_video',
    {
      title: 'Plan beat-synced shots',
      description:
        'Build a shot list for a music video where every cut lands on a bar line, with a visual idea per ' +
        'section. Needs only the BPM and duration (get them from analyze_song). Optionally pass the song ' +
        'structure as sections in bars.',
      inputSchema: {
        bpm: z.number().describe('Tempo in beats per minute'),
        durationSeconds: z.number().describe('Length of the song or clip in seconds'),
        offsetSeconds: z.number().optional().describe('Time of the first downbeat (default 0)'),
        beatsPerBar: z.number().optional().describe('Beats per bar (default 4)'),
        sections: z
          .array(
            z.object({
              name: z.string().describe('e.g. intro, verse 1, chorus, bridge, outro'),
              bars: z.number().describe('Length of the section in bars'),
              barsPerShot: z.number().optional().describe('Cut every N bars (default 1 in choruses, 2 elsewhere)'),
            }),
          )
          .optional(),
      },
    },
    safely((args) => planShots(args)),
  );

  server.registerTool(
    'make_spotify_canvas',
    {
      title: 'Make Spotify Canvas',
      description:
        'Turn a local video clip or image into a Spotify Canvas: silent 1080x1920 9:16 MP4, 3-8 seconds. ' +
        'Videos are cut from `start` and centre-cropped; images get a slow seamless zoom loop.',
      inputSchema: {
        input: z.string().describe('Absolute path to a video (MP4, MOV, WEBM) or image (JPG, PNG, WEBP)'),
        output: z.string().optional().describe('Where to write the MP4 (default: next to the input)'),
        start: z.number().optional().describe('Start time in seconds for videos (default 0)'),
        length: z.number().optional().describe('Length in seconds, 3 to 8 (default 8)'),
      },
    },
    safely((args) => makeCanvas(args)),
  );

  server.registerTool(
    'video_specs',
    {
      title: 'Music video specs by platform',
      description: `Aspect ratio, resolution, length and format rules for music videos and loops. Platforms: ${Object.keys(SPECS).join(', ')}.`,
      inputSchema: {
        platform: z.string().optional().describe('Leave empty to list all platforms'),
      },
    },
    safely(({ platform }) => getSpecs(platform)),
  );

  server.registerTool(
    'create_ai_music_video',
    {
      title: 'Create an AI music video online',
      description:
        'How to turn a song and one photo of the singer into a finished, lip-synced, beat-cut music video ' +
        'with AIMusicVideoGen (web app, paid credits). Returns the link and the steps; it does not upload anything.',
      inputSchema: {},
    },
    safely(() => ({
      url: 'https://aimusicvideogen.com/mv-creation',
      steps: [
        'Open the link and upload the song (MP3/WAV, up to 6 minutes) and one clear, front-facing photo of the singer.',
        'Optionally describe the look, story or setting; leave it empty to let the AI follow the song.',
        'Pick 9:16 (TikTok, Reels, Shorts) or 16:9 (YouTube), a 15-30 s clip or the full song, and the resolution.',
        'Create: the AI plans scenes from the song structure, animates each shot with lip sync and cuts it on the beat.',
      ],
      pricing: 'Credits by song length; packs from $4.99. https://aimusicvideogen.com/pricing',
    })),
  );

  await server.connect(new StdioServerTransport());
}
