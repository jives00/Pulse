import { useEffect, useRef, useState } from 'react';
import type { LogEntry, MealSlot, ServingSize } from '@pulse/api-client';
import { foodsApi } from '@pulse/api-client';
import { useLogStore, todayStr } from '../store/logStore';

const MEAL_META: Record<MealSlot, { label: string; emoji: string; from: string; color: string }> = {
  breakfast: { label: 'Breakfast', emoji: '🍳', from: 'from-amber-500/20',  color: '#f59e0b' },
  lunch:     { label: 'Lunch',     emoji: '🥗', from: 'from-green-500/20',  color: '#22c55e' },
  dinner:    { label: 'Dinner',    emoji: '🍽️', from: 'from-blue-500/20',   color: '#60a5fa' },
  snack:     { label: 'Snacks',    emoji: '🍎', from: 'from-rose-500/20',   color: '#f87171' },
};

const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function offsetDate(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtShort(iso: string) {
  const today = todayStr();
  const yesterday = offsetDate(today, -1);
  const tomorrow = offsetDate(today, 1);
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  if (iso === tomorrow) return 'Tomorrow';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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
  const [targetDate, setTargetDate] = useState(currentDate);
  const [saving, setSaving] = useState(false);

  // Quick date options: yesterday, today, tomorrow, +2
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
          <div className="text-sm text-slate-500 mb-1.5 uppercase tracking-wide">Meal</div>
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
          <div className="text-sm text-slate-500 mb-1.5 uppercase tracking-wide">Date</div>
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

interface EditEntryModalProps {
  entry: LogEntry;
  onClose: () => void;
}

function EditEntryModal({ entry, onClose }: EditEntryModalProps) {
  const updateEntry = useLogStore((s) => s.updateEntry);
  const [servingSizes, setServingSizes] = useState<ServingSize[]>([]);
  const [loadingServings, setLoadingServings] = useState(true);
  const [selectedServing, setSelectedServing] = useState<ServingSize>(entry.servingSize);
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [saving, setSaving] = useState(false);

  // Fetch serving sizes on mount
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

  const qty = parseFloat(quantity) || 0;
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
              <div className="text-sm text-slate-500 mb-1.5 uppercase tracking-wide">Serving size</div>
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
              <div className="text-sm text-slate-500 mb-1.5 uppercase tracking-wide">Quantity</div>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-dram-bg border border-dram-border rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-dram-accent"
              />
              {caloriesPreview !== null && (
                <div className="text-sm text-slate-500 mt-1.5 text-center">{caloriesPreview} kcal</div>
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

interface Props {
  meal: MealSlot;
  entries: LogEntry[];
  onAdd: (meal: MealSlot) => void;
  photoUrl?: string | null;
}

export default function MealSection({ meal, entries, photoUrl }: Props) {
  const currentDate = useLogStore((s) => s.currentDate);
  const [expanded, setExpanded] = useState(true);
  const [activeEntry, setActiveEntry] = useState<LogEntry | null>(null);
  const meta = MEAL_META[meal];

  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.nutrition.calories  ?? 0),
      protein:  acc.protein  + (e.nutrition.protein  ?? 0),
      carbs:    acc.carbs    + (e.nutrition.carbs    ?? 0),
      fat:      acc.fat      + (e.nutrition.fat      ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <div className="flex flex-col bg-dram-card border border-dram-border rounded-2xl overflow-hidden">

      {/* Photo header */}
      <div className="relative h-32 overflow-hidden bg-dram-border flex-shrink-0">
        {photoUrl ? (
          <img src={photoUrl} alt={meta.label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">
            {meta.emoji}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-2">
          <div className="text-sm font-semibold uppercase tracking-wider text-white/80">{meta.label}</div>
          <div className="text-2xl font-bold text-white leading-tight">{Math.round(totals.calories)} <span className="text-sm font-normal text-white/60">kcal</span></div>
        </div>
      </div>

      {/* Item count */}
      <button
        onClick={() => entries.length > 0 && setExpanded((v) => !v)}
        className="text-sm font-semibold py-1.5 transition-colors"
        style={{ color: entries.length > 0 ? meta.color : 'rgb(var(--color-muted))' }}
      >
        {entries.length > 0 ? `${entries.length} item${entries.length !== 1 ? 's' : ''}` : 'Nothing logged'}
      </button>

      {/* Macros */}
      <div className="px-3 pb-3 space-y-1.5">
        {[
          { icon: '🌾', label: 'Carbs',   val: totals.carbs,   color: '#fb923c' },
          { icon: '💪', label: 'Protein', val: totals.protein, color: '#818cf8' },
          { icon: '🥑', label: 'Fat',     val: totals.fat,     color: '#facc15' },
        ].map(({ icon, label, val, color }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-400 text-sm">
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </div>
            <span className="text-sm font-semibold" style={{ color }}>{Math.round(val)}g</span>
          </div>
        ))}
      </div>

      {/* Expanded item list */}
      {expanded && entries.length > 0 && (
        <div className="border-t border-dram-border divide-y divide-dram-border/50">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center px-3 py-2 hover:bg-white/5 group">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-100 truncate">{entry.food.name}</div>
                <div className="text-sm text-slate-400">
                  {entry.quantity} × {entry.servingSize.label}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <div className="text-right">
                  <div className="text-sm text-slate-300">{Math.round(entry.nutrition.calories)} cal</div>
                  <div className="text-xs text-slate-500">
                    P {Math.round(entry.nutrition.protein)}g · C {Math.round(entry.nutrition.carbs)}g · F {Math.round(entry.nutrition.fat)}g
                  </div>
                </div>
                <button
                  onClick={() => setActiveEntry(entry)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-200 transition-all text-base leading-none px-1"
                  title="Options"
                >
                  ⋯
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
