// Dispatcher for the dashboard "Goal progress" band. One flat pass over
// showOnDashboard goals (sorted by sortOrder then id — see sortPinnedGoals) renders
// each through here; the resolved GoalCardConfig — not an if-ladder over
// goal.catalogKey — decides which body variant a goal gets. Mirrors
// apps/web/src/components/goals/dashboard/DashboardGoalCard.tsx.
//
// Every pinned goal renders something: resolveGoalCard/defaultVariantFor already fall
// back to 'progress' for any catalog key it doesn't otherwise recognize, and the
// switch below defaults to ProgressGoalCard for any variant it doesn't handle, so an
// unmapped key never renders nothing.

import {
  resolveGoalCard,
  type Goal, type GoalCardConfig, type BodyMeasurement, type FoodLogHistoryDay, type StepsEntry,
  type TDEEBreakdown, type RoutineSummary, type WorkoutSummary, type WeekBucket,
} from '../../../../../packages/api-client/src/index';
import type { Colors } from '../../theme';
import { TrendGoalCard } from './TrendGoalCard';
import { DailyGoalCard } from './DailyGoalCard';
import { StreakGoalCard } from './StreakGoalCard';
import { ProgressGoalCard } from './ProgressGoalCard';

/** Pinned goals in dashboard order — sortOrder wins, id breaks ties. Pure so it's
 *  unit-testable without rendering anything. */
export function sortPinnedGoals(goals: Goal[]): Goal[] {
  return goals
    .filter(g => g.showOnDashboard)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
}

/** Which card component a resolved config's variant maps to. Exported so tests can
 *  assert the unmapped-key fallback resolves to ProgressGoalCard without rendering. */
export const GOAL_CARD_COMPONENTS = {
  trend: TrendGoalCard,
  streak: StreakGoalCard,
  daily: DailyGoalCard,
  progress: ProgressGoalCard,
} as const;

export function DashboardGoalCard({
  goal, measurements, foodLogHistory, stepsHistory, weeklyData, workouts, routines, tdee,
  measurementsReady, phase2Ready, c,
}: {
  goal: Goal;
  measurements: BodyMeasurement[];
  foodLogHistory: FoodLogHistoryDay[];
  stepsHistory: StepsEntry[];
  weeklyData: WeekBucket[];
  workouts: WorkoutSummary[];
  routines: RoutineSummary[];
  tdee: TDEEBreakdown | null;
  measurementsReady: boolean;
  phase2Ready: boolean;
  c: Colors;
}) {
  const cfg: GoalCardConfig = resolveGoalCard(goal.catalogKey, goal.cardConfig);
  const isLoading = goal.category === 'body' ? !measurementsReady : !phase2Ready;

  switch (cfg.variant) {
    case 'trend':
      return <TrendGoalCard goal={goal} cfg={cfg} measurements={measurements} foodLogHistory={foodLogHistory} tdee={tdee} isLoading={isLoading} c={c} />;
    case 'streak':
      return <StreakGoalCard goal={goal} cfg={cfg} routines={routines} workouts={workouts} isLoading={isLoading} c={c} />;
    case 'daily':
      return <DailyGoalCard goal={goal} cfg={cfg} foodLogHistory={foodLogHistory} stepsHistory={stepsHistory} weeklyData={weeklyData} isLoading={isLoading} c={c} />;
    case 'progress':
    default:
      return <ProgressGoalCard goal={goal} cfg={cfg} isLoading={isLoading} c={c} />;
  }
}
