import { useState, useRef, useEffect } from 'react';
import { goalsV2Api, measurementsApi, type Goal } from '@pulse/api-client';
import { CATEGORY_COLORS } from './goalConstants';

interface Props {
  goal: Goal;
  onUpdated: (goal: Goal) => void;
  onDeleted: (id: number) => void;
  onLogProgress: (goal: Goal) => void;
  onClose: (goal: Goal) => void;
}

const STATUS_CFG = {
  active:    { label: 'Active',    color: '#60a5fa' },
  achieved:  { label: 'Achieved',  color: '#7BB389' },
  missed:    { label: 'Missed',    color: '#C9714F' },
  abandoned: { label: 'Abandoned', color: '#6b7280' },
};

function daysRemaining(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline + 'T12:00:00').getTime() - Date.now()) / 86400000);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ProgressBar({ start, current, target }: { start: number; current: number; target: number }) {
  const range = target - start;
  const pct   = range === 0 ? 0 : Math.min(100, Math.max(0, ((current - start) / range) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{start}</span>
        <span className="text-slate-300 font-medium">{Math.round(pct)}%</span>
        <span>{target}</span>
      </div>
      <div className="h-1.5 bg-dram-bg rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: 'rgb(var(--color-accent))' }}
        />
      </div>
    </div>
  );
}

function ThreeDotsMenu({ onLog, onClose, onDelete, onToggleDashboard, showOnDashboard, onSyncScale }: {
  onLog: () => void;
  onClose: () => void;
  onDelete: () => void;
  onToggleDashboard: () => void;
  showOnDashboard: boolean;
  onSyncScale?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const items: { label: string; action: () => void; danger?: boolean }[] = [
    { label: 'Log Progress', action: onLog },
    ...(onSyncScale ? [{ label: 'Sync from Scale', action: onSyncScale }] : []),
    { label: showOnDashboard ? 'Remove from Dashboard' : 'Pin to Dashboard', action: onToggleDashboard },
    { label: 'Close Goal', action: onClose },
    { label: 'Delete', action: onDelete, danger: true },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1 rounded text-slate-500 hover:text-white transition-colors"
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-20 bg-dram-card border border-dram-border rounded shadow-lg py-1 w-44">
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => { setOpen(false); item.action(); }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                item.danger ? 'text-red-400 hover:bg-red-900/20' : 'text-slate-300 hover:bg-dram-bg hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GoalCard({ goal, onUpdated, onDeleted, onLogProgress, onClose }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const catColor = CATEGORY_COLORS[goal.category];
  const statusCfg = STATUS_CFG[goal.status];
  const days = daysRemaining(goal.deadline);

  const hasProgress = goal.startValue != null && goal.currentValue != null;
  const current = goal.currentValue ?? goal.startValue;

  async function handleDelete() {
    if (!confirm(`Delete "${goal.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await goalsV2Api.delete(goal.id);
      onDeleted(goal.id);
    } catch {
      setDeleting(false);
    }
  }

  async function handleToggleDashboard() {
    try {
      const updated = await goalsV2Api.update(goal.id, { showOnDashboard: !goal.showOnDashboard });
      onUpdated(updated);
    } catch { /* silent */ }
  }

  async function handleSyncScale() {
    setSyncMsg(null);
    try {
      const result = await measurementsApi.sync();
      setSyncMsg(result.inserted > 0 ? `Synced ${result.inserted} new reading${result.inserted !== 1 ? 's' : ''}` : 'Already up to date');
    } catch {
      setSyncMsg('Sync failed');
    }
    setTimeout(() => setSyncMsg(null), 4000);
  }

  return (
    <div
      className="bg-dram-card border border-dram-border rounded-lg p-4 flex flex-col gap-3"
      style={{ borderLeftWidth: 3, borderLeftColor: catColor, opacity: deleting ? 0.5 : 1 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{goal.name}</div>
          {goal.sourceName && (
            <div className="text-xs text-slate-500 mt-0.5">{goal.sourceName}</div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: statusCfg.color + '28', color: statusCfg.color }}
          >
            {statusCfg.label}
          </span>
          {goal.status === 'active' && (
            <ThreeDotsMenu
              onLog={() => onLogProgress(goal)}
              onClose={() => onClose(goal)}
              onDelete={handleDelete}
              onToggleDashboard={handleToggleDashboard}
              showOnDashboard={goal.showOnDashboard}
              onSyncScale={goal.catalogKey === 'body_weight' ? handleSyncScale : undefined}
            />
          )}
        </div>
      </div>

      {syncMsg && (
        <div className="text-xs text-slate-400">{syncMsg}</div>
      )}

      {/* Progress */}
      {hasProgress && current != null ? (
        <ProgressBar start={goal.startValue!} current={current} target={goal.targetValue} />
      ) : (
        <div className="h-1.5 bg-dram-bg rounded-full" />
      )}

      {/* Values row */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-slate-500 mb-0.5">Current</div>
          <div className="text-lg font-semibold text-white">
            {current != null ? current.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
            <span className="text-xs text-slate-500 ml-1">{goal.unit}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500 mb-0.5">Target</div>
          <div className="text-lg font-semibold" style={{ color: catColor }}>
            {goal.targetValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            <span className="text-xs text-slate-500 ml-1">{goal.unit}</span>
          </div>
        </div>
      </div>

      {/* Deadline */}
      {goal.deadline && (
        <div className="flex items-center gap-2 text-xs">
          {days != null && (
            <span className={days < 0 ? 'text-red-400' : days <= 7 ? 'text-orange-400' : 'text-slate-400'}>
              {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
            </span>
          )}
          <span className="text-slate-600">·</span>
          <span className="text-slate-500">{fmtDate(goal.deadline)}</span>
        </div>
      )}

      {/* Log Progress button for active goals */}
      {goal.status === 'active' && (
        <button
          onClick={() => onLogProgress(goal)}
          className="w-full py-1.5 rounded text-xs font-medium text-slate-400 hover:text-white border border-dram-border hover:border-dram-accent/50 transition-colors"
        >
          Log Progress
        </button>
      )}
    </div>
  );
}
