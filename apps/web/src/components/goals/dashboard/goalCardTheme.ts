// Shared visual constants for the dashboard goal cards.

// Re-exported from the shared dashboard palette so this folder keeps its own import
// surface (no dependency on the page module) without holding a second copy of the
// values that can drift out of sync.
export {
  ACCENT, TEXT, MUTED, MUTED2, CARD, LINE, LINE_SOFT, COL_GOOD, COL_WARN,
} from '../../../utils/dashboardTheme';

// Fix #8: one pair of colors for the two projection concepts, shared by the status
// row (ETA labels) and the chart lines/legend — no more four colors for two ideas.
export const TREND_COLOR = '#818cf8';
export const TDEE_COLOR  = '#f97316';

// Fix #5: one overdue color used everywhere a deadline has passed.
export const OVERDUE_COLOR = '#f87171';

// Fix #6/7: one chart height for both chart-bodied variants (trend, daily).
export const CHART_W = 760;
export const CHART_H = 170;

