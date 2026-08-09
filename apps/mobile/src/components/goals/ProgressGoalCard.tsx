// Goal Progress: 'progress' variant — value + bar + deadline. This is both the
// catalog's declared variant for progress_bar goals (e.g. exercise_max_weight) and
// the universal fallback: any showOnDashboard goal that resolveGoalCard couldn't
// otherwise place (unmapped catalog key, missing data source) still renders a real
// card here instead of nothing. Mirrors
// apps/web/src/components/goals/dashboard/ProgressGoalCard.tsx.

import { View, Text } from 'react-native';
import { goalDirection, goalStatusForProgress, fmtGoalValue, resolveUnit, type Goal, type GoalCardConfig } from '../../../../../packages/api-client/src/index';
import type { Colors } from '../../theme';
import { GoalCardShell, type GoalCardStat } from './GoalCardShell';
import { COL_GOLD } from './goalCardTheme';

export function ProgressGoalCard({ goal, cfg, isLoading, c }: {
  goal: Goal;
  cfg: GoalCardConfig;
  isLoading: boolean;
  c: Colors;
}) {
  const unit    = resolveUnit(goal);
  const dir     = goalDirection(goal, cfg);
  const current = goal.currentValue ?? goal.startValue;
  const hasPct  = goal.startValue != null && current != null && goal.targetValue !== goal.startValue;
  // (current - start) / (target - start) reads correctly for both up- and down-
  // goals: if start is below target the ratio rises toward 100 as current rises, and
  // if start is above target it rises toward 100 as current falls.
  const clampedPct = hasPct ? Math.min(100, Math.max(0, ((current! - goal.startValue!) / (goal.targetValue - goal.startValue!)) * 100)) : null;

  const status = goalStatusForProgress(goal, dir, clampedPct);

  const stats: GoalCardStat[] = [
    { label: 'Current', value: current != null ? fmtGoalValue(current, unit) : '—' },
    ...(cfg.showTarget ? [{ label: 'Target', value: fmtGoalValue(goal.targetValue, unit), color: c.muted } as GoalCardStat] : []),
  ];

  return (
    <GoalCardShell
      goal={goal} showTarget={cfg.showTarget} showDeadline={cfg.showDeadline}
      showStatus={cfg.showStatus} status={status} stats={stats} showLegend={false}
      isLoading={isLoading} c={c}
    >
      {clampedPct != null && (
        <View>
          <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${clampedPct}%` as any, borderRadius: 3, backgroundColor: COL_GOLD }} />
          </View>
          <Text style={{ fontSize: 11, color: c.muted, marginTop: 4, textAlign: 'right' }}>{Math.round(clampedPct)}% to goal</Text>
        </View>
      )}
      {goal.sourceName && (
        <Text style={{ fontSize: 11, color: c.muted }}>{goal.sourceName}</Text>
      )}
    </GoalCardShell>
  );
}
