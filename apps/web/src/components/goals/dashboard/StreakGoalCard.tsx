// Goal Progress: 'streak' variant — an 8-week hit/miss grid for a single per-routine
// frequency goal. Used only for exercise_routine_sessions (see defaultVariantFor).
//
// Previously WorkoutFreqCard rendered every routine-frequency goal inside one shared
// panel and could only ever report 'achieved' or 'on_track' (fix #4). Each goal is
// now its own card driven by the flat sortOrder pass in DashboardPage, and status can
// report 'behind' when the routine was missed in the majority of the last 8 weeks.

import { getWeekStart, localDateStr, type Goal, type GoalCardConfig, type RoutineSummary, type WorkoutSummary } from '@pulse/api-client';
import { ACCENT, COL_GOOD, LINE_SOFT, MUTED2 } from './goalCardTheme';
import { T } from '../../../utils/typeScale';
import { GoalCardShell } from './GoalCardShell';
import { emptyMessageFor, goalStatusForStreak } from './goalCardHelpers';

export function StreakGoalCard({ goal, cfg, routines, workouts, isLoading }: {
  goal: Goal;
  cfg: GoalCardConfig;
  routines: RoutineSummary[];
  workouts: WorkoutSummary[];
  isLoading: boolean;
}) {
  const routineId = goal.sourceId;
  const target    = goal.targetValue;

  if (routineId == null || !target) {
    return (
      <GoalCardShell
        goal={goal} span={cfg.span} showTarget={false} showDeadline={cfg.showDeadline}
        showStatus={false} stats={[]} showLegend={false}
        empty={emptyMessageFor(goal)} isLoading={isLoading}
      />
    );
  }

  const today = localDateStr();
  const weeks: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i * 7);
    weeks.push(getWeekStart(localDateStr(d)));
  }
  const thisWeek = weeks[weeks.length - 1];

  function weekEnd(ws: string): string {
    const d = new Date(ws + 'T12:00:00');
    d.setDate(d.getDate() + 6);
    return localDateStr(d);
  }
  function countForWeek(ws: string): number {
    const we = weekEnd(ws);
    return workouts.filter(w => w.routineId === routineId && w.workoutDate >= ws && w.workoutDate <= we).length;
  }

  const counts   = weeks.map(countForWeek);
  const hits     = counts.map(c => c >= target);
  const thisCount = counts[counts.length - 1];
  const status    = goalStatusForStreak(hits);
  const routineName = goal.sourceName ?? routines.find(r => r.id === routineId)?.name ?? `Routine ${routineId}`;

  return (
    <GoalCardShell
      goal={goal} span={cfg.span} showTarget={false} showDeadline={cfg.showDeadline}
      showStatus={cfg.showStatus} status={status}
      stats={[{ label: 'This week', value: `${thisCount}/${target}` }]}
      showLegend={false}
    >
      <div style={{ fontSize: T.body, color: MUTED2, marginBottom: 8 }}>{routineName}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {weeks.map((ws, i) => {
          const isHit  = hits[i];
          const isThis = ws === thisWeek;
          return (
            <div
              key={ws}
              title={`${ws}: ${counts[i]}/${target}`}
              style={{
                flex: 1, height: 22, borderRadius: 3,
                background: isHit ? (isThis ? ACCENT : COL_GOOD + 'aa') : LINE_SOFT,
                border: isThis ? `1px solid ${ACCENT}55` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {isHit && <span style={{ fontSize: T.label, color: isThis ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)' }}>✓</span>}
            </div>
          );
        })}
      </div>
      <div className="font-mono" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: T.small, color: MUTED2 }}>
        <span>8 weeks ago</span>
        <span>this week</span>
      </div>
    </GoalCardShell>
  );
}
