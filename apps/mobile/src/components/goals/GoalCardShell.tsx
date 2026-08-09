// The chrome shared by every dashboard goal card: title, target/deadline meta,
// status chip, a uniform stat row, variant-specific body, and an optional legend.
// Mirrors apps/web/src/components/goals/dashboard/GoalCardShell.tsx — same structure,
// RN primitives instead of DOM. All formatting/status logic comes from
// @pulse/api-client's goalCardLogic; this file is layout and color only.

import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { Goal, GoalCardStatus } from '../../../../../packages/api-client/src/index';
import { daysUntil, fmtDeadline, fmtGoalValue } from '../../../../../packages/api-client/src/index';
import { fontSize, type Colors } from '../../theme';
import { COL_GOLD, OVERDUE_COLOR, STATUS_CFG } from './goalCardTheme';

export function GoalStatusChip({ status }: { status: GoalCardStatus }) {
  const { color, label } = STATUS_CFG[status];
  return (
    <View style={{ flexShrink: 0, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: color + '28' }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

export interface GoalCardStat {
  label: string;
  value: string;
  color?: string;
  labelColor?: string;
  /** 'date' keeps the value at body size so an ETA like "Mar 3, 2026" doesn't force
   *  the stat row to wrap the way the big display size would. Defaults to 'measure'. */
  kind?: 'measure' | 'date';
}

export interface GoalCardShellProps {
  goal: Goal;
  showTarget: boolean;
  showDeadline: boolean;
  showStatus: boolean;
  status?: GoalCardStatus;
  stats: GoalCardStat[];
  legend?: ReactNode;
  showLegend: boolean;
  empty?: string;
  isLoading?: boolean;
  c: Colors;
  children?: ReactNode;
}

export function GoalCardShell({
  goal, showTarget, showDeadline, showStatus, status, stats, legend, showLegend, empty, isLoading, c, children,
}: GoalCardShellProps) {
  const days    = showDeadline ? daysUntil(goal.deadline) : null;
  const overdue = days != null && days < 0;
  const metaParts: string[] = [];
  if (showTarget) metaParts.push(`target ${fmtGoalValue(goal.targetValue, goal.unit)}`);
  if (showDeadline && goal.deadline) {
    metaParts.push(overdue ? `${Math.abs(days!)}d overdue` : days === 0 ? 'due today' : `by ${fmtDeadline(goal.deadline)}`);
  }

  const showChip = showStatus && status != null && status !== 'no_data';

  return (
    <View style={{ backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{goal.name}</Text>
          {metaParts.length > 0 && (
            <Text style={{ fontSize: 11, color: overdue ? OVERDUE_COLOR : c.muted }}>{metaParts.join(' · ')}</Text>
          )}
        </View>
        {showChip && <GoalStatusChip status={status!} />}
      </View>

      {empty ? (
        isLoading ? <ActivityIndicator color={COL_GOLD} style={{ alignSelf: 'flex-start' }} /> : (
          <Text style={{ fontSize: fontSize.sm, color: c.muted }}>{empty}</Text>
        )
      ) : (
        <>
          {stats.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
              {stats.map((s, i) => (
                <View key={i}>
                  <Text style={{ fontSize: 11, color: s.labelColor ?? c.muted, marginBottom: 2 }}>{s.label}</Text>
                  {s.kind === 'date' ? (
                    <Text style={{ fontSize: 13, color: s.color ?? c.muted, fontWeight: '600' }}>{s.value}</Text>
                  ) : (
                    <Text style={{ fontSize: 22, fontWeight: '700', color: s.color ?? c.text, fontVariant: ['tabular-nums'] }}>{s.value}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
          {children}
          {showLegend && legend}
        </>
      )}
    </View>
  );
}
