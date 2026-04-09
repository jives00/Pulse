export type ColorScheme = 'blue' | 'slate';

export type Colors = typeof PALETTES.blue;

export const PALETTES = {
  blue: {
    bg: '#193549',
    card: '#0d2137',
    accent: '#D4A843',
    border: '#1e4a6e',
    text: '#FFFFFF',
    muted: '#6fa7c5',
    error: '#F87171',
  },
  slate: {
    bg: '#0f172a',
    card: '#1e293b',
    accent: '#D4A843',
    border: '#334155',
    text: '#FFFFFF',
    muted: '#94a3b8',
    error: '#F87171',
  },
} as const;

/** Fallback static export — use useColors() hook in components for reactive theming */
export const colors = PALETTES.blue;

export const fontSize = {
  xs: 13,
  sm: 15,
  base: 17,
  lg: 19,
  xl: 22,
  '2xl': 26,
  '3xl': 32,
  '4xl': 40,
};
