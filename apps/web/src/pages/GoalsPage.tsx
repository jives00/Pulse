import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { goalsV2Api, measurementsApi, goalsByCategory, type Goal, type GoalStatus, type GoalCategory, type GoalProgressEntry } from '@pulse/api-client';

type NudgeReason = 'deadline' | 'target_crossed';
interface Nudge { goal: Goal; reason: NudgeReason; }

function isTargetCrossed(goal: Goal): boolean {
  if (goal.currentValue == null) return false;
  // Determine direction: if startValue exists use it, otherwise infer from progress vs target
  if (goal.startValue != null) {
    return goal.targetValue < goal.startValue
      ? goal.currentValue <= goal.targetValue   // going down (e.g. lose weight)
      : goal.currentValue >= goal.targetValue;  // going up  (e.g. max weight PR)
  }
  // No startValue — can't determine direction safely, skip
  return false;
}
import AddGoalModal from '../components/goals/AddGoalModal';
import LogProgressModal from '../components/goals/LogProgressModal';
import CloseGoalModal from '../components/goals/CloseGoalModal';
import { CATEGORY_COLORS } from '../components/goals/goalConstants';

const CATEGORY_LABELS: Record<GoalCategory, string> = {
  body:      'Body Composition',
  nutrition: 'Nutrition',
  exercise:  'Exercise',
  activity:  'Activity',
};

const CATEGORY_ORDER: GoalCategory[] = ['body', 'nutrition', 'exercise', 'activity'];

type ViewMode = 'active' | 'history';

const STATUS_CFG = {
  active:    { label: 'Active',    color: '#60a5fa' },
  achieved:  { label: 'Achieved',  color: '#7BB389' },
  missed:    { label: 'Missed',    color: '#C9714F' },
  abandoned: { label: 'Abandoned', color: '#6b7280' },
};

function ValueCell({ value, unit, muted }: { value: number | null; unit: string; muted?: boolean }) {
  if (value == null) return <span className="text-slate-600 text-xs font-mono">—</span>;
  return (
    <span className={`text-sm font-mono ${muted ? 'text-slate-400' : 'text-white'}`}>
      {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      <span className="text-slate-600 text-xs ml-1">{unit}</span>
    </span>
  );
}

function GoalRowMenu({ goal, onLog, onClose, onDelete, onToggleDashboard, onSyncScale }: {
  goal: Goal;
  onLog: () => void;
  onClose: () => void;
  onDelete: () => void;
  onToggleDashboard: () => void;
  onSyncScale?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setMenuStyle({ position: 'fixed', top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(o => !o);
  }

  return (
    <div ref={ref}>
      <button ref={btnRef} onClick={handleOpen} className="px-2 py-1 text-slate-500 hover:text-white transition-colors text-lg leading-none">···</button>
      {open && (
        <div style={menuStyle} className="z-50 bg-dram-card border border-dram-border rounded shadow-lg py-1 w-44">
          {([
            { label: 'Log Progress', action: onLog },
            ...(onSyncScale ? [{ label: 'Sync from Scale', action: onSyncScale }] : []),
            { label: goal.showOnDashboard ? 'Remove from Dashboard' : 'Pin to Dashboard', action: onToggleDashboard },
            { label: 'Close Goal', action: onClose },
            { label: 'Delete', action: onDelete, danger: true },
          ] as { label: string; action: () => void; danger?: boolean }[]).map(item => (
            <button key={item.label} onClick={() => { setOpen(false); item.action(); }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${item.danger ? 'text-red-400 hover:bg-red-900/20' : 'text-slate-300 hover:bg-dram-bg hover:text-white'}`}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GoalRow({ goal, onUpdated, onDeleted, onLogProgress, onClose }: {
  goal: Goal;
  onUpdated: (g: Goal) => void;
  onDeleted: (id: number) => void;
  onLogProgress: (g: Goal) => void;
  onClose: (g: Goal) => void;
}) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const catColor = CATEGORY_COLORS[goal.category];
  const statusCfg = STATUS_CFG[goal.status];
  const days = goal.deadline
    ? Math.ceil((new Date(goal.deadline + 'T12:00:00').getTime() - Date.now()) / 86400000)
    : null;

  async function handleDelete() {
    if (!confirm(`Delete "${goal.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try { await goalsV2Api.delete(goal.id); onDeleted(goal.id); }
    catch { setDeleting(false); }
  }

  async function handleToggleDashboard() {
    try { const u = await goalsV2Api.update(goal.id, { showOnDashboard: !goal.showOnDashboard }); onUpdated(u); }
    catch { /* silent */ }
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
    <tr className={`border-t border-dram-border/50 hover:bg-dram-bg/30 transition-colors ${deleting ? 'opacity-40' : ''}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-4 rounded-full shrink-0" style={{ background: catColor }} />
          <div>
            <div className="text-sm text-white font-medium">{goal.name}</div>
            {goal.sourceName && <div className="text-xs text-slate-500">{goal.sourceName}</div>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <ValueCell value={goal.targetValue} unit={goal.unit} muted />
      </td>
      <td className="px-4 py-3">
        <ValueCell value={goal.currentValue} unit={goal.unit} />
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        {goal.deadline ? (
          <span className={`text-sm font-mono ${days != null && days < 0 ? 'text-red-400' : days != null && days <= 7 ? 'text-orange-400' : 'text-slate-400'}`}>
            {days != null && days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d`}
          </span>
        ) : <span className="text-slate-600 text-xs">—</span>}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="text-sm font-semibold px-2 py-0.5 rounded-full"
          style={{ background: statusCfg.color + '28', color: statusCfg.color }}>
          {statusCfg.label}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {goal.status === 'active' ? (
          <div className="flex items-center justify-end gap-1">
            {syncMsg && <span className="text-xs text-slate-400 mr-1">{syncMsg}</span>}
            <button onClick={() => onLogProgress(goal)}
              className="text-sm text-slate-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-dram-bg">
              Log
            </button>
            <button onClick={() => navigate(`/goals/${goal.id}/progress`)}
              className="text-sm text-slate-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-dram-bg">
              History
            </button>
            <GoalRowMenu goal={goal} onLog={() => onLogProgress(goal)} onClose={() => onClose(goal)}
              onDelete={handleDelete} onToggleDashboard={handleToggleDashboard}
              onSyncScale={goal.catalogKey === 'body_weight' ? handleSyncScale : undefined} />
          </div>
        ) : (
          <span className="text-sm text-slate-600 font-mono">
            {goal.closedAt ? new Date(goal.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
          </span>
        )}
      </td>
    </tr>
  );
}

export default function GoalsPage() {
  const navigate = useNavigate();
  const [goals, setGoals]         = useState<Goal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [viewMode, setViewMode]   = useState<ViewMode>('active');
  const [collapsed, setCollapsed] = useState<Set<GoalCategory>>(new Set());
  const [deadlineNudges, setDeadlineNudges] = useState<Goal[]>([]);

  const [showAdd, setShowAdd]     = useState(false);
  const [logGoal, setLogGoal]     = useState<Goal | null>(null);
  const [closeGoal, setCloseGoal] = useState<Goal | null>(null);

  useEffect(() => {
    loadGoals(viewMode === 'active' ? 'active' : undefined);
    if (viewMode === 'active') {
      goalsV2Api.getNudges().then(setDeadlineNudges).catch(() => {});
    } else {
      setDeadlineNudges([]);
    }
  }, [viewMode]);

  async function loadGoals(status?: GoalStatus) {
    setLoading(true);
    try {
      if (status) {
        const data = await goalsV2Api.getAll(status);
        setGoals(data);
      } else {
        const [achieved, missed, abandoned] = await Promise.all([
          goalsV2Api.getAll('achieved').catch(() => [] as Goal[]),
          goalsV2Api.getAll('missed').catch(() => [] as Goal[]),
          goalsV2Api.getAll('abandoned').catch(() => [] as Goal[]),
        ]);
        setGoals([...achieved, ...missed, ...abandoned]);
      }
    } catch {
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }

  function handleGoalUpdated(updated: Goal) {
    setGoals(prev => prev.map(g => g.id === updated.id ? updated : g));
  }

  function handleGoalDeleted(id: number) {
    setGoals(prev => prev.filter(g => g.id !== id));
  }

  function handleGoalCreated(goal: Goal) {
    setGoals(prev => [...prev, goal]);
    setShowAdd(false);
  }

  function handleLogged(_entry: GoalProgressEntry, updatedGoal: Goal) {
    handleGoalUpdated(updatedGoal);
    setLogGoal(null);
  }

  function handleClosed(updated: Goal) {
    if (viewMode === 'active') {
      setGoals(prev => prev.filter(g => g.id !== updated.id));
    } else {
      handleGoalUpdated(updated);
    }
    setCloseGoal(null);
    setDeadlineNudges(prev => prev.filter(n => n.id !== updated.id));
  }

  // Merge deadline nudges + target-crossed goals, deduplicated by id
  const nudges = useMemo<Nudge[]>(() => {
    if (viewMode !== 'active') return [];
    const seen = new Set<number>();
    const result: Nudge[] = [];
    for (const g of deadlineNudges) {
      seen.add(g.id);
      result.push({ goal: g, reason: 'deadline' });
    }
    for (const g of goals) {
      if (!seen.has(g.id) && g.status === 'active' && isTargetCrossed(g)) {
        seen.add(g.id);
        result.push({ goal: g, reason: 'target_crossed' });
      }
    }
    return result;
  }, [deadlineNudges, goals, viewMode]);

  function toggleCollapse(cat: GoalCategory) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  const grouped = goalsByCategory(goals);

  return (
    <div className="min-h-screen bg-dram-bg">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b border-dram-border">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-200">Goals</h1>
          <div className="flex items-center gap-2">
            <div className="flex bg-dram-card border border-dram-border rounded-lg p-0.5">
              {(['active', 'history'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors capitalize ${
                    viewMode === mode ? 'bg-dram-accent text-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {mode === 'history' ? 'History' : 'Active'}
                </button>
              ))}
            </div>
            {viewMode === 'active' && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-dram-accent text-black hover:opacity-90 transition-opacity"
              >
                <span className="text-base leading-none">+</span> Add Goal
              </button>
            )}
          </div>
        </div>

        {/* Sub-nav */}
        <div className="flex gap-1 mt-3">
          <button className="px-4 py-2 text-sm font-medium transition border-b-2 -mb-px border-dram-accent text-dram-accent">
            Goals
          </button>
          <button
            onClick={() => navigate('/goals/planning')}
            className="px-4 py-2 text-sm font-medium transition border-b-2 -mb-px border-transparent text-dram-muted hover:text-slate-200"
          >
            Planning
          </button>
        </div>
      </div>

      {/* Nudge banners */}
      {nudges.length > 0 && (
        <div className="px-6 pt-4 space-y-2">
          {nudges.map(({ goal: n, reason }) => {
            const isTargetHit = reason === 'target_crossed';
            const days = n.deadline
              ? Math.ceil((new Date(n.deadline + 'T12:00:00').getTime() - Date.now()) / 86400000)
              : null;
            const subtext = isTargetHit
              ? `You've hit your target of ${n.targetValue} ${n.unit}!`
              : days != null && days < 0
                ? `${Math.abs(days)}d past deadline`
                : 'Deadline reached';
            return (
              <div
                key={n.id}
                className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                  isTargetHit
                    ? 'bg-emerald-950/40 border border-emerald-800/40'
                    : 'bg-orange-950/40 border border-orange-800/40'
                }`}
              >
                <div>
                  <span className={`text-sm font-medium ${isTargetHit ? 'text-emerald-300' : 'text-orange-300'}`}>
                    {n.name}
                  </span>
                  <span className={`text-xs ml-2 ${isTargetHit ? 'text-emerald-600' : 'text-orange-500'}`}>
                    {subtext}
                  </span>
                </div>
                <button
                  onClick={() => setCloseGoal(n)}
                  className={`text-xs font-medium transition-colors ml-4 ${
                    isTargetHit
                      ? 'text-emerald-400 hover:text-emerald-200'
                      : 'text-orange-400 hover:text-orange-200'
                  }`}
                >
                  {isTargetHit ? 'Mark achieved →' : 'Mark complete →'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="px-6 py-6 space-y-6">
        {loading ? (
          <div className="text-slate-500 text-sm">Loading…</div>
        ) : goals.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-slate-500 text-sm mb-4">
              {viewMode === 'active' ? 'No active goals yet.' : 'No goal history yet.'}
            </div>
            {viewMode === 'active' && (
              <button
                onClick={() => setShowAdd(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-dram-accent text-white hover:opacity-90 transition-opacity"
              >
                Add your first goal
              </button>
            )}
          </div>
        ) : (
          <div className="bg-dram-card border border-dram-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dram-border text-sm text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-bold">Goal</th>
                  <th className="text-left px-4 py-3 font-bold hidden sm:table-cell">Target</th>
                  <th className="text-left px-4 py-3 font-bold">Current</th>
                  <th className="text-left px-4 py-3 font-bold hidden md:table-cell">Deadline</th>
                  <th className="text-left px-4 py-3 font-bold hidden lg:table-cell">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const categoriesWithGoals = CATEGORY_ORDER.filter(cat => grouped[cat].length > 0);
                  return categoriesWithGoals.flatMap((cat, catIdx) => {
                  const catGoals = grouped[cat];
                  const isCollapsed = collapsed.has(cat);
                  return [
                    // Category header row
                    <tr
                      key={`cat-${cat}`}
                      onClick={() => toggleCollapse(cat)}
                      className={`bg-dram-bg/50 cursor-pointer hover:bg-dram-bg transition-colors ${catIdx > 0 ? 'border-t-4 border-dram-bg' : ''}`}
                    >
                      <td colSpan={6} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            {CATEGORY_LABELS[cat]}
                          </span>
                          <span className="text-xs text-slate-600">({catGoals.length})</span>
                          <span className="text-slate-600 text-xs ml-auto">{isCollapsed ? '▶' : '▼'}</span>
                        </div>
                      </td>
                    </tr>,
                    // Goal rows
                    ...(!isCollapsed ? catGoals.map(goal => (
                      <GoalRow
                        key={goal.id}
                        goal={goal}
                        onUpdated={handleGoalUpdated}
                        onDeleted={handleGoalDeleted}
                        onLogProgress={g => setLogGoal(g)}
                        onClose={g => setCloseGoal(g)}
                      />
                    )) : []),
                  ];
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {/* Modals */}
      {showAdd && (
        <AddGoalModal onClose={() => setShowAdd(false)} onCreated={handleGoalCreated} />
      )}
      {logGoal && (
        <LogProgressModal goal={logGoal} onClose={() => setLogGoal(null)} onLogged={handleLogged} />
      )}
      {closeGoal && (
        <CloseGoalModal goal={closeGoal} onClose={() => setCloseGoal(null)} onClosed={handleClosed} />
      )}
    </div>
  );
}
