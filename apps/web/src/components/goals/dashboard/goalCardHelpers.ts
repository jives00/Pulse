// Web-side goal card helpers.
//
// The LOGIC (title/unit/direction/status/deadline/empty-state/projections) lives in
// @pulse/api-client's goalCardLogic so web and mobile share one implementation and
// cannot drift apart again. Only the presentation bits — status colors — are here.
// See GoalCardShell.tsx for the chrome that consumes these.

import type { GoalCardStatus } from '@pulse/api-client';
import { OVERDUE_COLOR } from './goalCardTheme';

export type { GoalCardStatus };
export type GoalStatus = GoalCardStatus;

export {
  titleFor, resolveUnit, fmtGoalValue, fmt2, normDateStr, fmtDeadline, fmtETA, daysUntil,
  goalDirection, isGoalAchieved, goalStatusFor, goalStatusForStreak, goalStatusForProgress,
  emptyMessageFor, linregSlope, etaDaysFor, tdeeSlopePerDay, supportsTdeeProjection,
} from '@pulse/api-client';

export const STATUS_CFG: Record<GoalCardStatus, { color: string; label: string }> = {
  achieved: { color: '#7BB389', label: 'Achieved' },
  ahead:    { color: '#7BB389', label: 'Ahead'    },
  on_track: { color: '#D4A843', label: 'On track' },
  behind:   { color: '#C9714F', label: 'Behind'   },
  no_data:  { color: 'rgb(var(--color-muted))', label: '—' },
};

export { OVERDUE_COLOR };
