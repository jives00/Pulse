// Shared visual constants for the dashboard goal cards.
//
// Mirrors the palette DashboardPage.tsx defines for its other widgets — kept as a
// separate copy here (rather than imported) so this folder has no dependency on the
// page module, only the reverse.

export const ACCENT    = 'rgb(var(--color-accent))';
export const MUTED     = 'rgb(var(--color-muted))';
export const MUTED2    = 'rgba(var(--color-muted) / 0.55)';
export const CARD      = 'rgb(var(--color-card))';
export const LINE      = 'rgb(var(--color-border))';
export const LINE_SOFT = 'rgba(255,255,255,0.06)';
export const COL_GOOD  = '#7BB389';
export const COL_WARN  = '#C9714F';

// Fix #8: one pair of colors for the two projection concepts, shared by the status
// row (ETA labels) and the chart lines/legend — no more four colors for two ideas.
export const TREND_COLOR = '#818cf8';
export const TDEE_COLOR  = '#f97316';

// Fix #5: one overdue color used everywhere a deadline has passed.
export const OVERDUE_COLOR = '#f87171';

// Fix #6/7: one chart height for both chart-bodied variants (trend, daily).
export const CHART_W = 760;
export const CHART_H = 170;

export const fmt1 = (n: number) => n.toFixed(1);
