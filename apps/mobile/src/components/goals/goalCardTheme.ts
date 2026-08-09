// Shared visual constants for the mobile dashboard goal cards.
//
// Mirrors apps/web/src/components/goals/dashboard/goalCardTheme.ts and the palette
// dashboard.tsx defines for its other widgets — kept as its own copy (no dependency on
// the screen module, only the reverse) exactly like the web version.

import type { GoalCardStatus } from '../../../../../packages/api-client/src/index';

export const COL_GOLD   = '#D4A843';
export const COL_GOOD   = '#7BB389';
export const COL_WARN   = '#C9714F';

// One pair of colors for the two projection concepts — the status row (ETA labels)
// and the chart lines/legend share these, matching web.
export const TREND_COLOR = '#818cf8';
export const TDEE_COLOR  = '#f97316';

// One overdue color used everywhere a deadline has passed.
export const OVERDUE_COLOR = '#f87171';

// One projection horizon for every trend card (matches the weight card's prior 28d).
export const PROJECTION_DAYS = 28;

export const fmt1 = (n: number) => n.toFixed(1);

export const STATUS_CFG: Record<GoalCardStatus, { color: string; label: string }> = {
  achieved: { color: COL_GOOD,  label: 'Achieved' },
  ahead:    { color: COL_GOOD,  label: 'Ahead'    },
  on_track: { color: COL_GOLD,  label: 'On track' },
  behind:   { color: COL_WARN,  label: 'Behind'   },
  no_data:  { color: '#94a3b8', label: '—'        },
};
