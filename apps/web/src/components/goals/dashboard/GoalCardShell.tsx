// The chrome shared by every dashboard goal card: title, target/deadline meta,
// status chip, a uniform stat row, variant-specific body, and an optional legend.
// No renderer below this component formats its own header — see the 14-item fix
// list in DashboardPage.tsx's goal progress section for what this replaces.

import type { Goal } from '@pulse/api-client';
import { CARD, LINE, MUTED, MUTED2 } from './goalCardTheme';
import { STATUS_CFG, daysUntil, fmtDeadline, fmtGoalValue, OVERDUE_COLOR, titleFor } from './goalCardHelpers';
import type { GoalStatus } from './goalCardHelpers';

export function StatusChip({ status }: { status: GoalStatus }) {
  const { color, label } = STATUS_CFG[status];
  return (
    <span style={{ padding: '2px 9px', borderRadius: 99, background: color + '28', color, fontSize: 11, fontWeight: 600, letterSpacing: '.02em' }}>
      {label}
    </span>
  );
}

export interface GoalCardStat {
  label: string;
  value: string;
  color?: string;
  labelColor?: string;
  pushRight?: boolean;
  /** 'measure' is the big display number; 'date' keeps dates at mono body size so an
   *  ETA like "Mar 3, 2026" doesn't wrap the stat row. Defaults to 'measure'. */
  kind?: 'measure' | 'date';
}

export interface GoalCardShellProps {
  goal: Goal;
  span: number;
  showTarget: boolean;
  showDeadline: boolean;
  showStatus: boolean;
  status?: GoalStatus;
  stats: GoalCardStat[];
  legend?: React.ReactNode;
  showLegend: boolean;
  empty?: string;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export function GoalCardShell({
  goal, span, showTarget, showDeadline, showStatus, status, stats, legend, showLegend, empty, isLoading, children,
}: GoalCardShellProps) {
  // Fix #5: one deadline formatter, one overdue color, decided here rather than by
  // each renderer (previously three different layouts / two different colors).
  const days    = showDeadline ? daysUntil(goal.deadline) : null;
  const overdue = days != null && days < 0;
  const metaParts: string[] = [];
  if (showTarget) metaParts.push(`target ${fmtGoalValue(goal.targetValue, goal.unit)}`);
  if (showDeadline && goal.deadline) {
    metaParts.push(overdue ? `${Math.abs(days!)}d overdue` : days === 0 ? 'due today' : `by ${fmtDeadline(goal.deadline)}`);
  }

  const showChip = showStatus && status != null && status !== 'no_data';

  return (
    <div style={{
      gridColumn: `span ${span}`, background: CARD, border: `1px solid ${LINE}`,
      borderRadius: 0, padding: '18px 20px', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
          <span className="micro" style={{ color: MUTED, fontSize: 12 }}>{titleFor(goal)}</span>
          {metaParts.length > 0 && (
            <span className="font-mono" style={{ fontSize: 10, color: overdue ? OVERDUE_COLOR : MUTED2 }}>
              {metaParts.join(' · ')}
            </span>
          )}
        </div>
        {showChip && <StatusChip status={status!} />}
      </div>

      {empty ? (
        <div style={{ fontSize: 13, color: MUTED2 }}>{isLoading ? 'Loading…' : empty}</div>
      ) : (
        <>
          {stats.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 12, flexWrap: 'wrap' as const }}>
              {stats.map((s, i) => (
                <div key={i} style={s.pushRight ? { marginLeft: 'auto' } : undefined}>
                  <div className="micro" style={{ fontSize: 9, color: s.labelColor ?? MUTED, marginBottom: 3 }}>{s.label}</div>
                  {s.kind === 'date' ? (
                    <span className="font-mono" style={{ fontSize: 12, color: s.color ?? MUTED }}>{s.value}</span>
                  ) : (
                    <span className="font-display" style={{ fontSize: 22, fontWeight: 600, color: s.color ?? 'white' }}>
                      {s.value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {children}
          {showLegend && legend && (
            <div className="font-mono" style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: MUTED2, flexWrap: 'wrap' as const }}>
              {legend}
            </div>
          )}
        </>
      )}
    </div>
  );
}
