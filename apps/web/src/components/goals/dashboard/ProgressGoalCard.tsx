// Goal Progress: 'progress' variant — value + bar + deadline. This is both the
// catalog's declared variant for progress_bar goals (e.g. exercise_max_weight) and,
// per fix #10, the universal fallback: any showOnDashboard goal that resolveGoalCard
// couldn't otherwise place (unmapped catalog key, missing data source) still renders
// a real card here instead of nothing.

import { ACCENT, LINE_SOFT, MUTED, MUTED2 } from './goalCardTheme';
import { T } from '../../../utils/typeScale';
import { GoalCardShell, type GoalCardStat } from './GoalCardShell';
import { goalDirection, goalStatusForProgress, fmtGoalValue, resolveUnit } from './goalCardHelpers';
import type { Goal, GoalCardConfig } from '@pulse/api-client';

export function ProgressGoalCard({ goal, cfg, isLoading }: {
  goal: Goal;
  cfg: GoalCardConfig;
  isLoading: boolean;
}) {
  const unit    = resolveUnit(goal);
  const dir     = goalDirection(goal, cfg);
  const current = goal.currentValue ?? goal.startValue;
  const hasPct  = goal.startValue != null && current != null && goal.targetValue !== goal.startValue;
  // (current - start) / (target - start) already reads correctly for both up- and
  // down- goals: if start is below target the ratio rises toward 100 as current
  // rises, and if start is above target it rises toward 100 as current falls.
  const clampedPct = hasPct ? Math.min(100, Math.max(0, ((current! - goal.startValue!) / (goal.targetValue - goal.startValue!)) * 100)) : null;

  const status = goalStatusForProgress(goal, dir, clampedPct);

  const stats: GoalCardStat[] = [
    { label: 'Current', value: current != null ? fmtGoalValue(current, unit) : '—' },
    ...(cfg.showTarget ? [{ label: 'Target', value: fmtGoalValue(goal.targetValue, unit), color: MUTED } as GoalCardStat] : []),
  ];

  return (
    <GoalCardShell
      goal={goal} span={cfg.span} showTarget={cfg.showTarget} showDeadline={cfg.showDeadline}
      showStatus={cfg.showStatus} status={status} stats={stats} showLegend={false}
      isLoading={isLoading}
    >
      {clampedPct != null && (
        <div style={{ marginTop: 2 }}>
          <div style={{ height: 4, background: LINE_SOFT, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${clampedPct}%`, background: ACCENT, borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          <div className="font-mono" style={{ fontSize: T.label, color: MUTED2, marginTop: 3 }}>{Math.round(clampedPct)}% to goal</div>
        </div>
      )}
      {goal.sourceName && (
        <div className="font-mono" style={{ fontSize: T.small, color: MUTED2, marginTop: clampedPct != null ? 6 : 0 }}>{goal.sourceName}</div>
      )}
    </GoalCardShell>
  );
}
