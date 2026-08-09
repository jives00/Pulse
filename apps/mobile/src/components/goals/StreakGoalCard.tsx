// Goal Progress: 'streak' variant — an 8-week hit/miss grid for a single per-routine
// frequency goal. Used only for exercise_routine_sessions (see defaultVariantFor).
// Mirrors apps/web/src/components/goals/dashboard/StreakGoalCard.tsx: each pinned
// routine-frequency goal is its own card in the flat sortOrder pass, so unlike the
// legacy mobile "Workout frequency" panel, status is per-goal and can report 'behind'
// when the routine was missed in the majority of the last 8 weeks.

import { View, Text } from 'react-native';
import {
  getWeekStart, localDateStr, goalStatusForStreak, emptyMessageFor,
  type Goal, type GoalCardConfig, type RoutineSummary, type WorkoutSummary,
} from '../../../../../packages/api-client/src/index';
import type { Colors } from '../../theme';
import { GoalCardShell } from './GoalCardShell';
import { COL_GOLD, COL_GOOD } from './goalCardTheme';

export function StreakGoalCard({ goal, cfg, routines, workouts, isLoading, c }: {
  goal: Goal;
  cfg: GoalCardConfig;
  routines: RoutineSummary[];
  workouts: WorkoutSummary[];
  isLoading: boolean;
  c: Colors;
}) {
  const routineId = goal.sourceId;
  const target    = goal.targetValue;

  if (routineId == null || !target) {
    return (
      <GoalCardShell
        goal={goal} showTarget={false} showDeadline={cfg.showDeadline}
        showStatus={false} stats={[]} showLegend={false}
        empty={emptyMessageFor(goal)} isLoading={isLoading} c={c}
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

  const counts    = weeks.map(countForWeek);
  const hits      = counts.map(cnt => cnt >= target);
  const thisCount = counts[counts.length - 1];
  const status    = goalStatusForStreak(hits);
  const routineName = goal.sourceName ?? routines.find(r => r.id === routineId)?.name ?? `Routine ${routineId}`;

  return (
    <GoalCardShell
      goal={goal} showTarget={false} showDeadline={cfg.showDeadline}
      showStatus={cfg.showStatus} status={status}
      stats={[{ label: 'This week', value: `${thisCount}/${target}` }]}
      showLegend={false} c={c}
    >
      <Text style={{ fontSize: 12, color: c.muted }}>{routineName}</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {weeks.map((ws, i) => {
          const isHit  = hits[i];
          const isThis = ws === thisWeek;
          return (
            <View
              key={ws}
              style={{
                flex: 1, height: 22, borderRadius: 3,
                backgroundColor: isHit ? (isThis ? COL_GOLD : COL_GOOD + 'aa') : 'rgba(255,255,255,0.06)',
                borderWidth: isThis ? 1 : 0,
                borderColor: COL_GOLD + '55',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {isHit && <Text style={{ fontSize: 8, color: isThis ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.6)' }}>✓</Text>}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, color: c.muted }}>8 weeks ago</Text>
        <Text style={{ fontSize: 11, color: c.muted }}>this week</Text>
      </View>
    </GoalCardShell>
  );
}
