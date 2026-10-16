/** Upload specs for music videos and loops on the main platforms (checked October 2026). */
export const SPECS = {
  'spotify-canvas': {
    name: 'Spotify Canvas',
    aspect: '9:16',
    resolution: '1080x1920 recommended, at least 720 px tall',
    length: '3 to 8 seconds, loops',
    format: 'MP4 (H.264) or JPG, no audio',
    notes: 'Keep text and faces out of the top and bottom ~20%, the Spotify player UI covers them.',
    tool: 'https://aimusicvideogen.com/tools/spotify-canvas-maker',
  },
  tiktok: {
    name: 'TikTok',
    aspect: '9:16',
    resolution: '1080x1920',
    length: '15-60 s works best for a song clip',
    format: 'MP4 or MOV, H.264, AAC audio',
    notes: 'Open on the hook. Keep captions above the bottom ~15% (buttons and caption overlay).',
  },
  'instagram-reels': {
    name: 'Instagram Reels',
    aspect: '9:16',
    resolution: '1080x1920',
    length: 'up to 3 minutes; 15-30 s for a song teaser',
    format: 'MP4, H.264, AAC audio, 30 fps',
    notes: 'The grid crops the cover to 4:5 (and to 3:4 on profiles), so keep the subject centred.',
  },
  'youtube-shorts': {
    name: 'YouTube Shorts',
    aspect: '9:16',
    resolution: '1080x1920',
    length: 'up to 3 minutes',
    format: 'MP4, H.264, AAC audio',
    notes: 'Shorts over 1 minute with a Content ID claim can be blocked; use music you own.',
  },
  youtube: {
    name: 'YouTube (full music video)',
    aspect: '16:9',
    resolution: '1920x1080 or 3840x2160',
    length: 'full song',
    format: 'MP4, H.264, AAC audio, same frame rate as recorded',
    notes: 'Tick "altered or synthetic content" if the video uses realistic AI-generated people.',
  },
};

export function getSpecs(platform) {
  if (!platform) return SPECS;
  const key = platform.toLowerCase().replace(/[\s_]+/g, '-');
  const match =
    SPECS[key] ??
    Object.values(SPECS).find((spec) => spec.name.toLowerCase().includes(platform.toLowerCase()));
  if (!match) throw new Error(`Unknown platform "${platform}". Known: ${Object.keys(SPECS).join(', ')}`);
  return match;
}
