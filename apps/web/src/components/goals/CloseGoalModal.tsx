import { useState } from 'react';
import { goalsV2Api, type Goal } from '@pulse/api-client';

interface Props {
  goal: Goal;
  onClose: () => void;
  onClosed: (updated: Goal) => void;
}

export default function CloseGoalModal({ goal, onClose, onClosed }: Props) {
  const [status, setStatus]   = useState<'achieved' | 'missed' | 'abandoned'>('achieved');
  const [actual, setActual]   = useState(goal.currentValue?.toString() ?? '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated = await goalsV2Api.close(goal.id, {
        status,
        actualValueAtClose: actual !== '' ? Number(actual) : null,
      });
      onClosed(updated);
    } catch {
      setError('Failed to close goal. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-dram-card border border-dram-border rounded-lg w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-1">Close Goal</h2>
        <p className="text-sm text-slate-400 mb-5">{goal.name}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-2">Outcome</label>
            <div className="flex gap-2">
              {(['achieved', 'missed', 'abandoned'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2 rounded text-sm font-medium transition-colors capitalize ${
                    status === s
                      ? s === 'achieved' ? 'bg-emerald-600 text-white'
                        : s === 'missed' ? 'bg-orange-700 text-white'
                        : 'bg-slate-600 text-white'
                      : 'bg-dram-bg text-slate-400 hover:text-white border border-dram-border'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Actual value at close <span className="text-slate-600">(optional)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="any"
                value={actual}
                onChange={e => setActual(e.target.value)}
                placeholder="e.g. 152.4"
                className="flex-1 bg-dram-bg border border-dram-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              />
              <span className="text-slate-400 text-sm">{goal.unit}</span>
            </div>
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
              disabled={saving}
              className="flex-1 py-2 rounded text-sm font-medium bg-dram-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Saving…' : 'Close Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
