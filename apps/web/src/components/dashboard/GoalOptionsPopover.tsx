// Per-goal card-options popover, anchored to a goal card while the dashboard is in
// customize mode. Entirely driven by the already-built goalCardConfig helpers —
// editableOptionsFor decides which rows this variant actually uses (e.g. a
// progress-bar card never gets a projection row), and allowedVariantsFor/
// TDEE_PROJECTION_KEYS gate the variant and trend+tdee choices respectively.

import { useEffect, useRef } from 'react';
import {
  resolveGoalCard, allowedVariantsFor, editableOptionsFor, defaultGoalCardConfig, GOAL_CARD_WINDOW_DAYS,
  type Goal, type GoalCardConfig, type GoalCardVariant, type GoalCardWindow, type GoalCardProjection,
  type GoalCardDirection, type GoalCardMetricLine,
} from '@pulse/api-client';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { ACCENT, CARD, LINE, MUTED, MUTED2 } from '../../utils/dashboardTheme';
import { T } from '../../utils/typeScale';


const VARIANT_LABEL:    Record<GoalCardVariant, string>    = { trend: 'Trend', daily: 'Daily', streak: 'Streak', progress: 'Progress' };
const WINDOW_LABEL:     Record<GoalCardWindow, string>     = { '30d': '30d', '90d': '90d', '180d': '180d', '1y': '1y', all: 'All' };
const PROJECTION_LABEL: Record<GoalCardProjection, string> = { none: 'None', trend: 'Trend', 'trend+tdee': 'Trend+TDEE' };
const DIRECTION_LABEL:  Record<GoalCardDirection, string>  = { auto: 'Auto', up: 'Up', down: 'Down' };
const METRIC_LABEL:     Record<GoalCardMetricLine, string> = { value: 'Value', avg: 'Average', both: 'Both' };

const WINDOWS:    GoalCardWindow[]    = Object.keys(GOAL_CARD_WINDOW_DAYS) as GoalCardWindow[];
const DIRECTIONS: GoalCardDirection[] = ['auto', 'up', 'down'];
const METRICS:    GoalCardMetricLine[] = ['value', 'avg', 'both'];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '5px 0' }}>
      <span className="micro" style={{ fontSize: T.label, color: MUTED, flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        background: 'none', border: `1px solid ${active ? ACCENT : LINE}`, borderRadius: 4,
        color: active ? ACCENT : MUTED, fontSize: T.label, lineHeight: 1, padding: '4px 8px', cursor: 'pointer',
        fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' as const,
      }}
    >{children}</button>
  );
}

export function GoalOptionsPopover({ goal, cfg, onChange, onClose }: {
  goal: Goal;
  cfg: GoalCardConfig;
  onChange: (cfg: GoalCardConfig) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const opts     = editableOptionsFor(cfg, goal.catalogKey);
  const variants = allowedVariantsFor(goal.catalogKey);
  const projections: GoalCardProjection[] = opts.tdee ? ['none', 'trend', 'trend+tdee'] : ['none', 'trend'];

  function set(partial: Partial<GoalCardConfig>) {
    onChange(resolveGoalCard(goal.catalogKey, { ...cfg, ...partial }));
  }

  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 30,
        background: CARD, border: `1px solid ${LINE}`, borderRadius: 6, padding: '10px 12px',
        minWidth: 250, boxShadow: '0 8px 24px rgba(0,0,0,0.45)', fontFamily: 'var(--font-mono)',
      }}
    >
      {variants.length > 1 && (
        <Row label="Variant">
          {variants.map((v) => (
            <Chip key={v} active={cfg.variant === v} onClick={() => set({ variant: v })}>{VARIANT_LABEL[v]}</Chip>
          ))}
        </Row>
      )}

      {opts.window && (
        <Row label="Window">
          {WINDOWS.map((w) => (
            <Chip key={w} active={cfg.window === w} onClick={() => set({ window: w })}>{WINDOW_LABEL[w]}</Chip>
          ))}
        </Row>
      )}

      {opts.projection && (
        <Row label="Projection">
          {projections.map((p) => (
            <Chip key={p} active={cfg.projection === p} onClick={() => set({ projection: p })}>{PROJECTION_LABEL[p]}</Chip>
          ))}
        </Row>
      )}

      <Row label="Direction">
        {DIRECTIONS.map((d) => (
          <Chip key={d} active={cfg.direction === d} onClick={() => set({ direction: d })}>{DIRECTION_LABEL[d]}</Chip>
        ))}
      </Row>

      {opts.metricLine && (
        <Row label="Metric line">
          {METRICS.map((m) => (
            <Chip key={m} active={cfg.metricLine === m} onClick={() => set({ metricLine: m })}>{METRIC_LABEL[m]}</Chip>
          ))}
        </Row>
      )}

      <div style={{ height: 1, background: LINE, margin: '6px 0' }} />

      <Row label="Status">
        <Chip active={cfg.showStatus} onClick={() => set({ showStatus: !cfg.showStatus })}>{cfg.showStatus ? 'Shown' : 'Hidden'}</Chip>
      </Row>
      <Row label="Target">
        <Chip active={cfg.showTarget} onClick={() => set({ showTarget: !cfg.showTarget })}>{cfg.showTarget ? 'Shown' : 'Hidden'}</Chip>
      </Row>
      <Row label="Deadline">
        <Chip active={cfg.showDeadline} onClick={() => set({ showDeadline: !cfg.showDeadline })}>{cfg.showDeadline ? 'Shown' : 'Hidden'}</Chip>
      </Row>
      {opts.legend && (
        <Row label="Legend">
          <Chip active={cfg.showLegend} onClick={() => set({ showLegend: !cfg.showLegend })}>{cfg.showLegend ? 'Shown' : 'Hidden'}</Chip>
        </Row>
      )}

      <div style={{ height: 1, background: LINE, margin: '6px 0' }} />

      <button
        type="button"
        onClick={() => onChange(defaultGoalCardConfig(goal.catalogKey))}
        style={{ background: 'none', border: 'none', color: MUTED2, fontSize: T.small, cursor: 'pointer', padding: '4px 0', fontFamily: 'var(--font-mono)' }}
      >
        Reset card
      </button>
    </div>
  );
}
