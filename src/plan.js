/**
 * Beat-synced shot list for a music video: every cut lands on a bar line. Pure arithmetic, so it
 * works from a BPM and a duration alone (no audio needed).
 */

const DEFAULT_SECTIONS = [
  { name: 'intro', bars: 4, barsPerShot: 4 },
  { name: 'verse 1', bars: 16, barsPerShot: 2 },
  { name: 'pre-chorus', bars: 4, barsPerShot: 1 },
  { name: 'chorus', bars: 8, barsPerShot: 1 },
  { name: 'verse 2', bars: 16, barsPerShot: 2 },
  { name: 'pre-chorus', bars: 4, barsPerShot: 1 },
  { name: 'chorus', bars: 8, barsPerShot: 1 },
  { name: 'bridge', bars: 8, barsPerShot: 2 },
  { name: 'final chorus', bars: 16, barsPerShot: 1 },
  { name: 'outro', bars: 4, barsPerShot: 4 },
];

const IDEAS = {
  intro: 'establishing shot of the setting, slow push-in, no singer yet or singer in silhouette',
  verse: 'singer close-up and mid shots, story moments, calmer camera',
  'pre-chorus': 'faster cuts, light or colour starts to build',
  chorus: 'performance shots with lip sync, wide shots, strongest visuals, cut on every bar',
  bridge: 'change of location or palette, a slower contrasting moment',
  'final chorus': 'biggest energy: crowd, lights, fastest cuts, best lip-sync shots',
  outro: 'pull back, last look at the singer, fade out',
};

const ideaFor = (name) => {
  const key = Object.keys(IDEAS).find((candidate) => name.startsWith(candidate));
  return key ? IDEAS[key] : 'performance or story shot';
};

const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;

/**
 * @param {object} options
 * @param {number} options.bpm            Tempo of the song.
 * @param {number} options.durationSeconds Length of the song (or clip) in seconds.
 * @param {number} [options.beatsPerBar=4]
 * @param {number} [options.offsetSeconds=0] Time of the first downbeat.
 * @param {Array<{name: string, bars: number, barsPerShot?: number}>} [options.sections]
 *   Song structure in bars. Defaults to a typical pop layout, stretched or trimmed to fit.
 */
export function planShots({ bpm, durationSeconds, beatsPerBar = 4, offsetSeconds = 0, sections }) {
  if (!(bpm > 20 && bpm < 400)) throw new Error('bpm must be between 20 and 400.');
  if (!(durationSeconds > 0)) throw new Error('durationSeconds must be positive.');
  const barSeconds = (60 / bpm) * beatsPerBar;
  const totalBars = Math.floor((durationSeconds - offsetSeconds) / barSeconds);
  let layout = sections?.length ? sections : null;
  if (!layout && totalBars < 40) {
    // Short clips (TikTok, Reels, Shorts) are usually the hook: cut on every bar.
    layout = [{ name: 'chorus', bars: totalBars, barsPerShot: 1 }];
  } else if (!layout) {
    // Scale the default pop layout to the song's length, rounding to whole bars.
    const defaultBars = DEFAULT_SECTIONS.reduce((sum, section) => sum + section.bars, 0);
    let used = 0;
    layout = DEFAULT_SECTIONS.map((section, index) => {
      const bars =
        index === DEFAULT_SECTIONS.length - 1
          ? totalBars - used
          : Math.max(1, Math.round((section.bars * totalBars) / defaultBars));
      used += bars;
      return { ...section, bars };
    }).filter((section) => section.bars > 0);
  }
  const shots = [];
  let bar = 0;
  for (const section of layout) {
    const step = Math.max(1, section.barsPerShot ?? (section.name.includes('chorus') ? 1 : 2));
    for (let start = 0; start < section.bars; start += step) {
      const length = Math.min(step, section.bars - start);
      const from = offsetSeconds + (bar + start) * barSeconds;
      shots.push({
        shot: shots.length + 1,
        section: section.name,
        start: formatTime(from),
        startSeconds: Math.round(from * 1000) / 1000,
        lengthSeconds: Math.round(length * barSeconds * 1000) / 1000,
        bars: length,
        idea: ideaFor(section.name),
      });
    }
    bar += section.bars;
  }
  return {
    bpm,
    barSeconds: Math.round(barSeconds * 1000) / 1000,
    totalBars,
    shotCount: shots.length,
    shots,
    note:
      'Cuts sit on bar lines. Adjust offsetSeconds to the first downbeat if the song has a pickup. ' +
      'To generate the shots automatically with lip sync from one photo, see https://aimusicvideogen.com',
  };
}
