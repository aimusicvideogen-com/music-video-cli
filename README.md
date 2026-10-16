# aimusicvideogen: free music video tools (CLI + MCP server)

Small, local tools for musicians and AI music creators who are making a music video for a song:

- **Analyze a song**: BPM, musical key, Camelot code, beat and bar length, and the most energetic 15 s and 30 s windows (usually the chorus or drop, the clip you want for TikTok, Reels and Shorts).
- **Plan beat-synced shots**: a shot list where every cut lands on a bar line, with a visual idea for each section.
- **Make a Spotify Canvas**: turn a video clip or a still image into a silent 1080x1920 MP4 of 3 to 8 seconds.
- **Platform specs**: aspect ratio, resolution, length and format for TikTok, Instagram Reels, YouTube Shorts, YouTube and Spotify Canvas.

Everything runs on your machine with ffmpeg. No account, no API key, nothing is uploaded.

It also runs as an **MCP server**, so Claude, Cursor, Windsurf and other MCP clients can analyze your songs and plan videos for you.

> Want the whole video made for you? [AIMusicVideoGen](https://aimusicvideogen.com) turns a song and one photo of the singer into a lip-synced, beat-cut music video. This repo is the free, open-source toolbox that grew out of it.

## Install

Requires Node.js 18+ and [ffmpeg](https://ffmpeg.org/download.html) (`brew install ffmpeg`, `winget install ffmpeg`, `sudo apt install ffmpeg`). If ffmpeg is not on your PATH, set `FFMPEG_PATH`.

```bash
npm install -g github:aimusicvideogen-com/music-video-cli
# or run without installing
npx github:aimusicvideogen-com/music-video-cli --help
```

## CLI

```bash
aimusicvideogen analyze song.mp3
```

```
Duration    40.4 s (19 bars)
Tempo       119 BPM  (half 59.3, double 237)
Key         Bb major  (Camelot 6B, relative G minor)
Beat / bar  0.506 s / 2.025 s
Best 15 s   21.5s - 36.5s
Best 30 s   6.5s - 36.5s
```

```bash
# Shot list from a song file, or from numbers
aimusicvideogen plan song.mp3
aimusicvideogen plan --bpm 100 --duration 200 --offset 0.4

# Spotify Canvas from a video (cut 8 s from 0:12) or from an image (slow seamless zoom)
aimusicvideogen canvas clip.mp4 --start 12 --length 8
aimusicvideogen canvas cover.jpg --length 6 --out canvas.mp4

# Specs
aimusicvideogen specs spotify-canvas
aimusicvideogen specs            # all platforms

# Any command: --json for machine-readable output
```

## MCP server

Add it to your MCP client. For Claude Desktop (`claude_desktop_config.json`), Cursor (`.cursor/mcp.json`) and most others:

```json
{
  "mcpServers": {
    "aimusicvideogen": {
      "command": "npx",
      "args": ["-y", "github:aimusicvideogen-com/music-video-cli", "mcp"]
    }
  }
}
```

Claude Code:

```bash
claude mcp add aimusicvideogen -- npx -y github:aimusicvideogen-com/music-video-cli mcp
```

### Tools

| Tool | What it does |
| --- | --- |
| `analyze_song` | BPM, key, Camelot, bar length, duration, best 15 s / 30 s clip of a local audio or video file |
| `plan_music_video` | Beat-synced shot list from BPM and duration, optional song structure in bars |
| `make_spotify_canvas` | Silent 1080x1920 MP4 (3-8 s) from a local video or image |
| `video_specs` | Upload specs by platform |
| `create_ai_music_video` | Steps and link to generate a full lip-synced video from a song and one photo on aimusicvideogen.com |

Example prompts:

- "Analyze ~/Music/demo.mp3 and tell me which 15 seconds to use for TikTok."
- "Plan a 16:9 music video for this song with a cut on every bar in the chorus."
- "Make a Spotify Canvas from the first 6 seconds of ~/Videos/teaser.mov."

## How it works

- **Tempo**: spectral-flux onset envelope, autocorrelation, with the half and double tempo scored together and a mild preference for 120 BPM to settle octave errors. Reported between 70 and 180 BPM by default (`minTempo` / `maxTempo` to change).
- **Key**: chromagram from a short-time FFT, matched against the Krumhansl-Kessler major and minor profiles.
- **Highlight**: the loudest sustained window by RMS energy.

These are estimates. Check the BPM against a tap tempo if a song has tempo changes or a loose groove: [free tap tempo](https://aimusicvideogen.com/tools/tap-tempo), [BPM and key finder in the browser](https://aimusicvideogen.com/tools/bpm-finder).

## Related

- [Agent skills for music videos](https://github.com/aimusicvideogen-com/music-video-skills): workflows for Claude and other agents that use these tools.
- [AIMusicVideoGen](https://aimusicvideogen.com): AI music video generator, song + one photo to a finished video.

## License

MIT
