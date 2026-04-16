export type ColorScheme = 'blue' | 'slate' | 'sand';

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
} as const;

export type Colors = typeof PALETTES.blue;

/** Fallback static export — use useColors() in components for reactive theming */
export const colors = PALETTES.blue;
