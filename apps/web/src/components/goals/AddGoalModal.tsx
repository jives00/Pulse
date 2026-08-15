import { useState, useEffect } from 'react';
import {
  CATALOG_BY_CATEGORY,
  goalsV2Api, routinesApi, exercisesApi,
  type Goal, type GoalCategory, type GoalCatalogEntry,
  type CreateGoalPayload,
} from '@pulse/api-client';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { CATEGORY_COLORS, CATEGORY_LABELS } from './goalConstants';
import { todayStr } from '../../store/logStore';
import { useFeatures } from '../FeatureGate';

interface Props {
  onClose: () => void;
  onCreated: (goal: Goal) => void;
}

type Step = 1 | 2 | 3;

export default function AddGoalModal({ onClose, onCreated }: Props) {
  useEscapeKey(onClose);
  const features = useFeatures();
  // Goal category keys line up 1:1 with feature module keys (body/nutrition/exercise/activity).
  const enabledCategories = (Object.keys(CATALOG_BY_CATEGORY) as GoalCategory[]).filter((cat) => features[cat]);
  const [step, setStep]           = useState<Step>(1);
  const [activeCategory, setActiveCategory] = useState<GoalCategory>(enabledCategories[0] ?? 'body');
  const [selected, setSelected]   = useState<GoalCatalogEntry | null>(null);
  const [sourceId, setSourceId]   = useState<number | ''>('');
  const [sourceName, setSourceName] = useState('');
  const [sources, setSources]     = useState<{ id: number; name: string }[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  // Step 3 fields
  const [name, setName]           = useState('');
  const [startValue, setStartValue] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [deadline, setDeadline]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    if (step !== 2 || !selected) return;
    setLoadingSources(true);
    const fetch = selected.needsSource === 'exercise'
      ? exercisesApi.getAll().then(r => r.map((e: { id: number; name: string }) => ({ id: e.id, name: e.name })))
      : routinesApi.getAll().then(r => r.map((rt: { id: number; name: string }) => ({ id: rt.id, name: rt.name })));
    fetch
      .then(setSources)
      .catch(() => setSources([]))
      .finally(() => setLoadingSources(false));
  }, [step, selected]);

  function pickCatalogEntry(entry: GoalCatalogEntry) {
    setSelected(entry);
    setName(entry.label);
    if (entry.needsSource) {
      setStep(2);
    } else {
      setStep(3);
    }
  }

  function confirmSource() {
    if (!sourceId) return;
    const src = sources.find(s => s.id === Number(sourceId));
    if (src) {
      setSourceName(src.name);
      setName(`${src.name} — ${selected!.label}`);
    }
    setStep(3);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !targetValue || !deadline) return;
    setSaving(true);
    setError('');

    const payload: CreateGoalPayload = {
      catalogKey:   selected.key,
      name:         name || selected.label,
      category:     selected.category,
      cardType:     selected.cardType,
      targetValue:  Number(targetValue),
      unit:         selected.defaultUnit,
      startedAt:    todayStr(),
      startValue:   startValue !== '' ? Number(startValue) : null,
      deadline:     deadline || null,
      sourceType:   selected.needsSource ? selected.needsSource : null,
      sourceId:     sourceId !== '' ? Number(sourceId) : null,
      sourceName:   sourceName || null,
      showOnDashboard: false,
    };

    try {
      const goal = await goalsV2Api.create(payload);
      onCreated(goal);
    } catch {
      setError('Failed to create goal. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-dram-card border border-dram-border rounded-lg w-full max-w-lg mx-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dram-border shrink-0">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep(step === 3 && selected?.needsSource ? 2 : 1)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ←
              </button>
            )}
            <h2 className="text-base font-semibold text-white">
              {step === 1 ? 'Choose Goal Type' : step === 2 ? 'Select Source' : 'Set Target'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-1">
              {([1, 2, 3] as Step[]).map(s => (
                <div
                  key={s}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    s === step ? 'bg-dram-accent' : s < step ? 'bg-dram-accent/40' : 'bg-dram-border'
                  }`}
                />
              ))}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-lg leading-none">×</button>
          </div>
        </div>

        {/* Step 1: Catalog picker */}
        {step === 1 && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex border-b border-dram-border shrink-0">
              {enabledCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    activeCategory === cat ? 'text-white border-b-2 border-dram-accent' : 'text-slate-400 hover:text-white'
                  }`}
                  style={activeCategory === cat ? { borderColor: CATEGORY_COLORS[cat] } : {}}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto p-4 grid grid-cols-2 gap-3">
              {CATALOG_BY_CATEGORY[activeCategory].map(entry => (
                <button
                  key={entry.key}
                  onClick={() => pickCatalogEntry(entry)}
                  className="text-left p-3 rounded-lg bg-dram-bg border border-dram-border hover:border-dram-accent/50 transition-colors"
                >
                  <div className="text-sm font-medium text-white mb-1">{entry.label}</div>
                  <div className="text-xs text-slate-500 leading-snug">{entry.description}</div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-xs font-mono text-slate-500">{entry.defaultUnit}</span>
                    {entry.needsSource && (
                      <span className="text-xs text-slate-600">· requires source</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Source picker */}
        {step === 2 && selected && (
          <div className="p-6 flex-1 overflow-y-auto">
            <p className="text-sm text-slate-400 mb-4">
              Select the {selected.needsSource === 'exercise' ? 'exercise' : 'routine'} this goal applies to.
            </p>
            {loadingSources ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : (
              <div className="space-y-1 mb-6">
                {sources.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSourceId(s.id)}
                    className={`w-full text-left px-3 py-2.5 rounded text-sm transition-colors ${
                      sourceId === s.id
                        ? 'bg-dram-accent/20 text-white border border-dram-accent/40'
                        : 'text-slate-300 hover:bg-dram-bg hover:text-white'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={confirmSource}
              disabled={!sourceId}
              className="w-full py-2 rounded text-sm font-medium bg-dram-accent text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 3: Target form */}
        {step === 3 && selected && (
          <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Goal name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full bg-dram-bg border border-dram-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Starting value <span className="text-slate-600">(optional)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    value={startValue}
                    onChange={e => setStartValue(e.target.value)}
                    placeholder="Current"
                    className="flex-1 bg-dram-bg border border-dram-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
                  />
                  <span className="text-xs text-slate-500 shrink-0">{selected.defaultUnit}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Target value</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    value={targetValue}
                    onChange={e => setTargetValue(e.target.value)}
                    required
                    className="flex-1 bg-dram-bg border border-dram-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
                  />
                  <span className="text-xs text-slate-500 shrink-0">{selected.defaultUnit}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                required
                min={todayStr()}
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
                disabled={saving}
                className="flex-1 py-2 rounded text-sm font-medium bg-dram-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Creating…' : 'Create Goal'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
