import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { goalsV2Api, type Goal, type GoalProgressEntry, type GoalDetail } from '@pulse/api-client';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

interface EditState { id: number; value: string; notes: string; loggedAt: string; }

export default function GoalProgressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const goalId = Number(id);

  const [goal, setGoal]       = useState<Goal | null>(null);
  const [entries, setEntries] = useState<GoalProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    Promise.all([
      goalsV2Api.getById(goalId).catch(() => null as GoalDetail | null),
      goalsV2Api.getProgress(goalId, 200).catch(() => [] as GoalProgressEntry[]),
    ]).then(([goalDetail, prog]) => {
      setGoal(goalDetail as Goal | null);
      setEntries(prog as GoalProgressEntry[]);
    }).finally(() => setLoading(false));
  }, [goalId]);

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      await goalsV2Api.deleteProgress(goalId, editing.id);
      const created = await goalsV2Api.logProgress(goalId, { value: Number(editing.value), loggedAt: editing.loggedAt, notes: editing.notes || null });
      setEntries(prev => [created, ...prev.filter(e => e.id !== editing.id)].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)));
      setEditing(null);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entryId: number) {
    if (!confirm('Delete this progress entry?')) return;
    try {
      await goalsV2Api.deleteProgress(goalId, entryId);
      setEntries(prev => prev.filter(e => e.id !== entryId));
    } catch { /* silent */ }
  }

  if (loading) return <div className="min-h-screen bg-dram-bg px-6 pt-8 text-slate-500 text-sm">Loading…</div>;

  return (
    <div className="min-h-screen bg-dram-bg">
      {/* Header */}
      <div className="px-6 pt-8 pb-4 border-b border-dram-border">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate('/goals')} className="text-slate-400 hover:text-white transition-colors text-sm">
            ← Goals
          </button>
        </div>
        <h1 className="text-xl font-semibold text-white">{goal?.name ?? 'Goal'}</h1>
        {goal && (
          <p className="text-sm text-slate-400 mt-1">
            Target: <span className="text-white">{goal.targetValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} {goal.unit}</span>
            {goal.deadline && <> · Deadline: <span className="text-white">{fmtDate(goal.deadline)}</span></>}
          </p>
        )}
      </div>

      {/* Progress log */}
      <div className="px-6 py-6">
        {entries.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">No progress entries logged yet.</div>
        ) : (
          <div className="bg-dram-card border border-dram-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dram-border text-sm text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-bold">Date</th>
                  <th className="text-right px-4 py-3 font-bold">Value</th>
                  <th className="text-left px-4 py-3 font-bold hidden sm:table-cell">Notes</th>
                  <th className="text-left px-4 py-3 font-bold hidden md:table-cell">Source</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} className="border-t border-dram-border/50 hover:bg-dram-bg/30 transition-colors">
                    {editing?.id === entry.id ? (
                      <>
                        <td className="px-4 py-2 text-slate-400 text-sm font-mono">{fmtDateTime(entry.loggedAt)}</td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number" step="any" value={editing.value}
                            onChange={e => setEditing(prev => prev ? { ...prev, value: e.target.value } : prev)}
                            className="w-24 bg-dram-bg border border-dram-accent rounded px-2 py-1 text-sm text-white text-right focus:outline-none"
                            autoFocus
                          />
                        </td>
                        <td className="px-4 py-2 hidden sm:table-cell">
                          <input
                            type="text" value={editing.notes}
                            onChange={e => setEditing(prev => prev ? { ...prev, notes: e.target.value } : prev)}
                            placeholder="Notes"
                            className="w-full bg-dram-bg border border-dram-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-dram-accent"
                          />
                        </td>
                        <td className="px-4 py-2 hidden md:table-cell" />
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {error && <span className="text-xs text-red-400">{error}</span>}
                            <button onClick={() => setEditing(null)} className="text-sm text-slate-400 hover:text-white px-2 py-1">Cancel</button>
                            <button onClick={handleSave} disabled={saving}
                              className="text-sm font-medium text-dram-accent hover:opacity-80 px-2 py-1 disabled:opacity-40">
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-slate-400 text-sm font-mono">{entry.source === 'auto' ? fmtDate(entry.loggedAt) : fmtDateTime(entry.loggedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-white font-mono">{entry.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                          {goal && <span className="text-slate-600 text-xs ml-1">{goal.unit}</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-sm hidden sm:table-cell">{entry.notes ?? '—'}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className={`text-sm capitalize ${entry.source === 'auto' ? 'text-slate-600' : 'text-slate-400'}`}>
                            {entry.source}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {entry.source === 'manual' && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setEditing({ id: entry.id, value: String(entry.value), notes: entry.notes ?? '', loggedAt: entry.loggedAt })}
                                className="text-sm text-slate-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-dram-bg"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(entry.id)}
                                className="text-sm text-red-500/60 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-dram-bg"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
