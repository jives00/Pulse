// Palette for the dashboard page, its goal cards, and its editor chrome.
//
// These constants used to be copy-pasted into six files, which is how MUTED2 ended
// up being fixed in one place and left at an unreadable alpha in the others. One
// definition now; every dashboard module imports from here.
export const ACCENT = 'rgb(var(--color-accent))';
export const TEXT   = 'rgb(var(--color-text))';
export const MUTED  = 'rgb(var(--color-muted))';

// 0.55 alpha put this at ~2.2:1 on the card fill — below the readable floor for any
// text, and it carries real content (axis labels, table headers, dates). 0.8 keeps
// the hierarchy while clearing the large-text threshold.
export const MUTED2 = 'rgba(var(--color-muted) / 0.8)';

export const BG   = 'rgb(var(--color-bg))';
export const CARD = 'rgb(var(--color-card))';
export const LINE = 'rgb(var(--color-border))';
// Tracks the palette rather than assuming a dark background.
export const LINE_SOFT = 'rgba(var(--color-muted) / 0.14)';

export const COL_GOOD = '#7BB389';
// Lightened from #C9714F, which only reached 3.5:1 on the card fill — this marks
// surplus/regression, the state you least want to be hard to read.
export const COL_WARN = '#D5825F';
