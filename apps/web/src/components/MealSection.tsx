import { useEffect, useRef, useState } from 'react';
import type { LogEntry, MealSlot, ServingSize } from '@pulse/api-client';
import { foodsApi } from '@pulse/api-client';
import { useLogStore, todayStr } from '../store/logStore';
import { MEAL_META, MEAL_SLOTS } from '../utils/meals';

// Visual max per macro (per-meal reference, purely for bar fill proportion)
const MACRO_MAX = { Protein: 70, Carbs: 90, Fat: 30 };
const MACRO_OPACITY = { Protein: 0.95, Carbs: 0.7, Fat: 0.45 };

function offsetDate(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtShort(iso: string) {
  const today = todayStr();
  const yesterday = offsetDate(today, -1);
  const tomorrow  = offsetDate(today, 1);
  if (iso === today)     return 'Today';
  if (iso === yesterday) return 'Yesterday';
  if (iso === tomorrow)  return 'Tomorrow';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Move / Copy picker ──────────────────────────────────────────────────────

interface MovePickerProps {
  entry: LogEntry;
  mode: 'move' | 'copy';
  currentMeal: MealSlot;
  currentDate: string;
  onClose: () => void;
}

function MoveCopyPicker({ entry, mode, currentMeal, currentDate, onClose }: MovePickerProps) {
  const { moveEntry, copyEntry } = useLogStore();
  const [targetMeal, setTargetMeal] = useState<MealSlot>(currentMeal);
  const [targetDate, setTargetDate] = useState(mode === 'copy' ? todayStr() : currentDate);
  const [saving, setSaving] = useState(false);

  const dateOptions = [-1, 0, 1, 2].map((d) => offsetDate(todayStr(), d));

  async function confirm() {
    setSaving(true);
    try {
      if (mode === 'move') {
        await moveEntry(entry.id, targetMeal, targetDate);
      } else {
        await copyEntry(entry, targetMeal, targetDate);
      }
      onClose();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dram-card rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs border border-dram-border p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-200">
            {mode === 'move' ? 'Move' : 'Copy'} to…
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        <div>
          <div className="text-xs text-slate-500 mb-1.5 uppercase tracking-wide">Meal</div>
          <div className="grid grid-cols-2 gap-1.5">
            {MEAL_SLOTS.map((m) => (
              <button
                key={m}
                onClick={() => setTargetMeal(m)}
                className={`py-1.5 rounded-lg text-sm border transition-colors ${
                  targetMeal === m
                    ? 'bg-dram-accent text-black border-dram-accent font-semibold'
                    : 'border-dram-border text-slate-300 hover:border-slate-500'
                }`}
              >
                {MEAL_META[m].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 mb-1.5 uppercase tracking-wide">Date</div>
          <div className="grid grid-cols-2 gap-1.5">
            {dateOptions.map((d) => (
              <button
                key={d}
                onClick={() => setTargetDate(d)}
                className={`py-1.5 rounded-lg text-sm border transition-colors ${
                  targetDate === d
                    ? 'bg-dram-accent text-black border-dram-accent font-semibold'
                    : 'border-dram-border text-slate-300 hover:border-slate-500'
                }`}
              >
                {fmtShort(d)}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="mt-1.5 w-full bg-dram-bg border border-dram-border rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-dram-accent"
          />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 text-sm text-slate-400 hover:text-slate-200 transition-colors py-1.5">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={saving}
            className="flex-1 bg-dram-accent text-black text-sm font-semibold rounded-lg py-1.5 hover:brightness-110 disabled:opacity-50 transition"
          >
            {saving ? 'Saving…' : mode === 'move' ? 'Move' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit entry modal ────────────────────────────────────────────────────────

interface EditEntryModalProps {
  entry: LogEntry;
  onClose: () => void;
}

function EditEntryModal({ entry, onClose }: EditEntryModalProps) {
  const updateEntry = useLogStore((s) => s.updateEntry);
  const [servingSizes, setServingSizes]   = useState<ServingSize[]>([]);
  const [loadingServings, setLoadingServings] = useState(true);
  const [selectedServing, setSelectedServing] = useState<ServingSize>(entry.servingSize);
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    foodsApi.getById(entry.food.id)
      .then((food) => {
        setServingSizes(food.servingSizes);
        const match = food.servingSizes.find((s) => s.id === entry.servingSize.id);
        if (match) setSelectedServing(match);
      })
      .catch(() => setServingSizes([entry.servingSize]))
      .finally(() => setLoadingServings(false));
  }, [entry.food.id, entry.servingSize.id]);

  const qty             = parseFloat(quantity) || 0;
  const caloriesPreview = selectedServing
    ? Math.round(entry.food.nutrition.calories * selectedServing.grams * qty / 100)
    : null;

  async function confirm() {
    const q = parseFloat(quantity);
    if (!q || q <= 0) return;
    setSaving(true);
    try {
      await updateEntry(entry.id, { servingSizeId: selectedServing.id, quantity: q });
      onClose();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dram-card rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm border border-dram-border p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-200 truncate pr-4">{entry.food.name}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none shrink-0">×</button>
        </div>

        {loadingServings ? (
          <div className="text-center text-slate-500 text-sm py-4">Loading…</div>
        ) : (
          <>
            <div>
              <div className="text-xs text-slate-500 mb-1.5 uppercase tracking-wide">Serving size</div>
              <div className="space-y-1">
                {servingSizes.map((sv) => (
                  <button
                    key={sv.id}
                    onClick={() => setSelectedServing(sv)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                      selectedServing.id === sv.id
                        ? 'bg-dram-accent text-black border-dram-accent font-semibold'
                        : 'border-dram-border text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {sv.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1.5 uppercase tracking-wide">Quantity</div>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-dram-bg border border-dram-border rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-dram-accent"
              />
              {caloriesPreview !== null && (
                <div className="text-xs text-slate-500 mt-1.5 text-center">{caloriesPreview} kcal</div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 text-sm text-slate-400 hover:text-slate-200 transition-colors py-1.5">
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={saving || !quantity || parseFloat(quantity) <= 0}
                className="flex-1 bg-dram-accent text-black text-sm font-semibold rounded-lg py-1.5 hover:brightness-110 disabled:opacity-50 transition"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Entry context menu ──────────────────────────────────────────────────────

interface EntryMenuProps {
  entry: LogEntry;
  currentMeal: MealSlot;
  currentDate: string;
  onClose: () => void;
}

function EntryMenu({ entry, currentMeal, currentDate, onClose }: EntryMenuProps) {
  const removeEntry = useLogStore((s) => s.removeEntry);
  const [pickerMode, setPickerMode] = useState<'move' | 'copy' | 'edit' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  if (pickerMode === 'edit') {
    return <EditEntryModal entry={entry} onClose={() => { setPickerMode(null); onClose(); }} />;
  }

  if (pickerMode === 'move' || pickerMode === 'copy') {
    return (
      <MoveCopyPicker
        entry={entry}
        mode={pickerMode}
        currentMeal={currentMeal}
        currentDate={currentDate}
        onClose={() => { setPickerMode(null); onClose(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        ref={ref}
        className="absolute bg-dram-card border border-dram-border rounded-xl shadow-xl overflow-hidden text-sm min-w-[140px]"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="w-full text-left px-4 py-2.5 text-slate-200 hover:bg-white/10 transition-colors"
          onClick={() => setPickerMode('edit')}
        >
          Edit
        </button>
        <button
          className="w-full text-left px-4 py-2.5 text-slate-200 hover:bg-white/10 transition-colors border-t border-dram-border/50"
          onClick={() => setPickerMode('move')}
        >
          Move to…
        </button>
        <button
          className="w-full text-left px-4 py-2.5 text-slate-200 hover:bg-white/10 transition-colors border-t border-dram-border/50"
          onClick={() => setPickerMode('copy')}
        >
          Copy to…
        </button>
        <button
          className="w-full text-left px-4 py-2.5 text-red-400 hover:bg-white/10 transition-colors border-t border-dram-border/50"
          onClick={() => { removeEntry(entry.id); onClose(); }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface Props {
  meal: MealSlot;
  entries: LogEntry[];
  onAdd: (meal: MealSlot) => void;
}

export default function MealSection({ meal, entries, onAdd }: Props) {
  const currentDate = useLogStore((s) => s.currentDate);
  const [activeEntry, setActiveEntry] = useState<LogEntry | null>(null);
  const meta = MEAL_META[meal];

  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.nutrition.calories ?? 0),
      protein:  acc.protein  + (e.nutrition.protein  ?? 0),
      carbs:    acc.carbs    + (e.nutrition.carbs    ?? 0),
      fat:      acc.fat      + (e.nutrition.fat      ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <div className="flex flex-col bg-dram-card border border-dram-border overflow-hidden">

      {/* Card header */}
      <div className="px-4 py-3 border-b border-dram-border flex items-baseline justify-between">
        <span className="text-sm font-semibold uppercase tracking-[.14em] text-dram-muted">{meta.label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold text-slate-200">{Math.round(totals.calories)}</span>
          <span className="micro text-dram-muted">kcal</span>
        </div>
      </div>

      {/* Macro progress bars */}
      <div className="px-4 pt-3.5 pb-3 border-b border-dram-border/50 space-y-2.5">
        {(
          [
            { label: 'Protein', val: totals.protein },
            { label: 'Carbs',   val: totals.carbs   },
            { label: 'Fat',     val: totals.fat      },
          ] as { label: keyof typeof MACRO_MAX; val: number }[]
        ).map(({ label, val }) => {
          const pct = Math.min(val / MACRO_MAX[label], 1);
          return (
            <div key={label} className="grid items-center gap-2" style={{ gridTemplateColumns: '56px 1fr 40px' }}>
              <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</span>
              <div className="h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-dram-accent rounded-full transition-all"
                  style={{ width: `${pct * 100}%`, opacity: MACRO_OPACITY[label] }}
                />
              </div>
              <span className="text-sm text-slate-300 text-right">{Math.round(val)}g</span>
            </div>
          );
        })}
      </div>

      {/* Entry list */}
      <div className="flex-1 flex flex-col">
        {entries.length === 0 ? (
          <div className="py-6 px-4 text-center flex-1 flex flex-col items-center justify-center">
            <div className="text-sm font-mono text-slate-500 mb-3">Nothing logged</div>
            <button
              onClick={() => onAdd(meal)}
              className="border border-dashed border-dram-border/60 hover:border-slate-500 text-slate-500 hover:text-slate-300 text-sm rounded px-3 py-1.5 transition-colors"
            >
              + Log {meta.label.toLowerCase()}
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1">
              {entries.map((entry, i) => (
                <div
                  key={entry.id}
                  className={`flex items-baseline gap-2 px-4 py-2 hover:bg-white/5 group ${i > 0 ? 'border-t border-dram-border/30' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-base text-slate-100 truncate">{entry.food.name}</div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      {entry.quantity !== 1 ? `${entry.quantity} × ` : ''}{entry.servingSize.label}
                      {' · '}{Math.round(entry.nutrition.protein)}p
                      {' · '}{Math.round(entry.nutrition.carbs)}c
                      {' · '}{Math.round(entry.nutrition.fat)}f
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-sm font-mono text-slate-400">{Math.round(entry.nutrition.calories)}</span>
                    <button
                      onClick={() => setActiveEntry(entry)}
                      className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-200 transition-all text-base leading-none px-0.5"
                      title="Options"
                    >
                      ⋯
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => onAdd(meal)}
              className="mx-3 mb-3 mt-1 border border-dashed border-dram-border/50 hover:border-slate-500 text-slate-500 hover:text-slate-300 text-sm rounded py-1.5 transition-colors flex items-center justify-center"
            >
              + Add to {meta.label.toLowerCase()}
            </button>
          </>
        )}
      </div>

      {activeEntry && (
        <EntryMenu
          entry={activeEntry}
          currentMeal={meal}
          currentDate={currentDate}
          onClose={() => setActiveEntry(null)}
        />
      )}
    </div>
  );
}
