// Pace logic for the dashboard's "Weekly goal progress" card.
//
// Not every weekly target wants the same thing from you. A calorie budget is a
// CEILING — running under it is fine, and the only bad outcome is going over.
// Protein, water, workouts, and volume are FLOORS — more is better, and the only
// bad outcome is finishing the week short. Treating both as "hit the number" made
// a healthy calorie deficit read as "Behind", so direction is explicit here.
//
// Pure (no React, no colors) so web and mobile share one implementation.

/** `floor` = hit at least the goal (protein, water). `ceiling` = stay under it (calories). */
export type WeeklyGoalDirection = 'floor' | 'ceiling';

export type WeeklyPaceStatus =
  | 'done'        // floor: goal already met for the week
  | 'on_pace'     // floor: at or above where this day-of-week expects you
  | 'close'       // floor: slightly short of pace
  | 'behind'      // floor: meaningfully short of pace
  | 'under'       // ceiling: comfortably below budget pace
  | 'on_budget'   // ceiling: tracking at roughly the budget line
  | 'trending_over' // ceiling: above budget pace, will blow the week if it holds
  | 'over';       // ceiling: already past the full-week budget

/** How the status should read visually — each platform maps these to its own palette. */
export type WeeklyPaceTone = 'good' | 'caution' | 'bad';

export interface WeeklyPace {
  status:   WeeklyPaceStatus;
  label:    string;
  tone:     WeeklyPaceTone;
  /** Fraction of the goal consumed/earned so far, clamped to 0..1 for bar width. */
  pct:      number;
  /** True when a ceiling goal has passed its full-week number — bar should read as bad. */
  exceeded: boolean;
}

export interface WeeklyPaceInput {
  val:       number;
  goal:      number;
  /** Days elapsed in the week including today, 1..7. */
  daysIn:    number;
  direction: WeeklyGoalDirection;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function weeklyPace({ val, goal, daysIn, direction }: WeeklyPaceInput): WeeklyPace {
  const pct = goal > 0 ? clamp01(val / goal) : 0;
  const expected = goal * (Math.min(7, Math.max(1, daysIn)) / 7);
  const ratio = expected > 0 ? val / expected : 0;

  if (direction === 'ceiling') {
    // Over the whole week's budget already — nothing left to spend.
    if (goal > 0 && val > goal) {
      return { status: 'over', label: 'Over', tone: 'bad', pct: 1, exceeded: true };
    }
    if (ratio > 1.05) {
      return { status: 'trending_over', label: 'Trending over', tone: 'caution', pct, exceeded: false };
    }
    if (ratio >= 0.9) {
      return { status: 'on_budget', label: 'On budget', tone: 'good', pct, exceeded: false };
    }
    return { status: 'under', label: 'Under', tone: 'good', pct, exceeded: false };
  }

  if (pct >= 1)        return { status: 'done',    label: 'Done',    tone: 'good',    pct, exceeded: false };
  if (ratio >= 0.95)   return { status: 'on_pace', label: 'On pace', tone: 'good',    pct, exceeded: false };
  if (ratio >= 0.75)   return { status: 'close',   label: 'Close',   tone: 'caution', pct, exceeded: false };
  return { status: 'behind', label: 'Behind', tone: 'bad', pct, exceeded: false };
}
