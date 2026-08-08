// Dispatcher for the dashboard "Goal progress" band. One flat pass over
// showOnDashboard goals (fix #12) renders each through here; the resolved
// GoalCardConfig — not an if-ladder over goal.category (fix #11) — decides which
// body variant a goal gets.

import { resolveGoalCard, type Goal, type GoalCardConfig, type BodyMeasurement, type FoodLogHistoryDay, type StepsDay,
         type TDEEBreakdown, type RoutineSummary, type WorkoutSummary, type WeekBucket } from '@pulse/api-client';
import { TrendGoalCard } from './TrendGoalCard';
import { DailyGoalCard } from './DailyGoalCard';
import { StreakGoalCard } from './StreakGoalCard';
import { ProgressGoalCard } from './ProgressGoalCard';

export function DashboardGoalCard({
  goal, measurements, foodLogHistory, stepsHistory, weeklyData, workouts, routines, tdee,
  measurementsReady, phase2Ready,
}: {
  goal: Goal;
  measurements: BodyMeasurement[];
  foodLogHistory: FoodLogHistoryDay[];
  stepsHistory: StepsDay[];
  weeklyData: WeekBucket[];
  workouts: WorkoutSummary[];
  routines: RoutineSummary[];
  tdee: TDEEBreakdown | null;
  measurementsReady: boolean;
  phase2Ready: boolean;
}) {
  // `cardConfig` is being added to the Goal type by another in-flight change; read it
  // defensively until that lands so this compiles either way.
  const stored = (goal as unknown as { cardConfig?: Partial<GoalCardConfig> | null }).cardConfig ?? null;
  const cfg = resolveGoalCard(goal.catalogKey, stored);

  const isLoading = goal.category === 'body' ? !measurementsReady : !phase2Ready;

  switch (cfg.variant) {
    case 'trend':
      return <TrendGoalCard goal={goal} cfg={cfg} measurements={measurements} foodLogHistory={foodLogHistory} tdee={tdee} isLoading={isLoading} />;
    case 'streak':
      return <StreakGoalCard goal={goal} cfg={cfg} routines={routines} workouts={workouts} isLoading={isLoading} />;
    case 'daily':
      return <DailyGoalCard goal={goal} cfg={cfg} foodLogHistory={foodLogHistory} stepsHistory={stepsHistory} weeklyData={weeklyData} isLoading={isLoading} />;
    case 'progress':
    default:
      return <ProgressGoalCard goal={goal} cfg={cfg} isLoading={isLoading} />;
  }
}
