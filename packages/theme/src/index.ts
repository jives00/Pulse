export type ColorScheme = 'blue' | 'slate' | 'sand' | 'midnight' | 'tide' | 'graphite' | 'trakt';

export const PALETTES = {
  blue: {
    bg:     '#193549',
    card:   '#0d2137',
    accent: '#D4A843',
    border: '#1e4a6e',
    text:   '#FFFFFF',
    muted:  '#6fa7c5',
    error:  '#F87171',
  },
  slate: {
    bg:     '#0f172a',
    card:   '#1e293b',
    accent: '#D4A843',
    border: '#334155',
    text:   '#FFFFFF',
    muted:  '#94a3b8',
    error:  '#F87171',
  },
  sand: {
    bg:     '#785a3c',
    card:   '#5a4128',
    accent: '#D4A843',
    border: '#967350',
    text:   '#FFFFFF',
    muted:  '#e6d2b9',
    error:  '#F87171',
  },
  midnight: {
    bg:     '#161c2e',
    card:   '#1f2942',
    accent: '#D4A843',
    border: '#2e3a58',
    text:   '#eef2fa',
    muted:  '#abb6cd',
    error:  '#F87171',
  },
  tide: {
    bg:     '#162132',
    card:   '#1f2c40',
    accent: '#D4A843',
    border: '#2d3c54',
    text:   '#eef4fa',
    muted:  '#a6bbd0',
    error:  '#F87171',
  },
  graphite: {
    bg:     '#1c1d22',
    card:   '#262830',
    accent: '#D4A843',
    border: '#373941',
    text:   '#efefe9',
    muted:  '#aeaeb6',
    error:  '#F87171',
  },
  trakt: {
    bg:     '#24262e',
    card:   '#323440',
    accent: '#D4A843',
    border: '#404352',
    text:   '#f0f0f6',
    muted:  '#8890a8',
    error:  '#F87171',
  },
} as const;

export type Colors = typeof PALETTES.blue;

/** Fallback static export — use useColors() in components for reactive theming */
export const colors = PALETTES.blue;
