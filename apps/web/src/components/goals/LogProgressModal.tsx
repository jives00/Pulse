import { useState } from 'react';
import { goalsV2Api, type Goal, type GoalProgressEntry } from '@pulse/api-client';

interface Props {
  goal: Goal;
  onClose: () => void;
  onLogged: (entry: GoalProgressEntry, updatedGoal: Goal) => void;
}

export default function LogProgressModal({ goal, onClose, onLogged }: Props) {
  const [value, setValue] = useState(goal.currentValue?.toString() ?? '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (value === '') return;
    setSaving(true);
    setError('');
    try {
      const entry = await goalsV2Api.logProgress(goal.id, { value: Number(value), notes: notes || null });
      const updatedGoal = { ...goal, currentValue: Number(value), currentValueAt: entry.loggedAt };
      onLogged(entry, updatedGoal);
    } catch {
      setError('Failed to log progress. Please try again.');
      setSaving(false);
    }
  }

  const pct = (goal.startValue != null && goal.targetValue !== goal.startValue)
    ? Math.min(100, Math.max(0,
        ((Number(value || goal.currentValue || goal.startValue) - goal.startValue) /
         (goal.targetValue - goal.startValue)) * 100
      ))
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-dram-card border border-dram-border rounded-lg w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Log Progress</h2>
        <p className="text-sm text-slate-400 mb-5">{goal.name}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Current value</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="any"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={goal.currentValue?.toString() ?? '0'}
                autoFocus
                required
                className="flex-1 bg-dram-bg border border-dram-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              />
              <span className="text-slate-400 text-sm w-10 shrink-0">{goal.unit}</span>
            </div>
          </div>

          {pct != null && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{goal.startValue} {goal.unit}</span>
                <span className="text-slate-300">{Math.round(pct)}%</span>
                <span>{goal.targetValue} {goal.unit}</span>
              </div>
              <div className="h-1.5 bg-dram-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-dram-accent rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Notes <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. measured after morning workout"
              className="w-full bg-dram-bg border border-dram-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded text-sm text-slate-400 hover:text-white border border-dram-border transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || value === ''}
              className="flex-1 py-2 rounded text-sm font-medium bg-dram-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Saving…' : 'Log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
