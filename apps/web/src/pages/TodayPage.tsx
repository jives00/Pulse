import { useEffect, useState } from 'react';
import { useLogStore, todayStr } from '../store/logStore';
import MealSection from '../components/MealSection';
import FoodSearchModal from '../components/FoodSearchModal';
import NutritionSummaryCard from '../components/NutritionSummaryCard';
import { logApi } from '@pulse/api-client';
import type { MealSlot, LogEntry, DailyLog } from '@pulse/api-client';

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks',
};

const ACCENT = '#D4A843';
const MUTED  = '#828ea8';

function fmtDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month   = d.toLocaleDateString('en-US', { month: 'short' });
  const day     = d.getDate();
  const year    = d.getFullYear();
  return `${weekday} · ${month} ${day} · ${year}`;
}

function fmtShort(iso: string) {
  const today     = todayStr();
  const yesterday = offsetDate(today, -1);
  if (iso === today)     return 'Today';
  if (iso === yesterday) return 'Yesterday';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function offsetDate(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── Copy-from-day modal ──────────────────────────────────────────────────────

interface CopyItem { entry: LogEntry; meal: MealSlot }

function CopyFromDayModal({ fromDate, toDate, onClose }: { fromDate: string; toDate: string; onClose: () => void }) {
  const { fetchDay } = useLogStore();
  const [loading, setLoading]   = useState(true);
  const [items, setItems]       = useState<CopyItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    logApi.getDay(fromDate)
      .then((log: DailyLog) => {
        const all: CopyItem[] = [];
        for (const meal of MEALS) {
          for (const entry of log.meals[meal] ?? []) {
            all.push({ entry, meal });
          }
        }
        setItems(all);
        setSelected(new Set(all.map((i) => i.entry.id)));
      })
      .finally(() => setLoading(false));
  }, [fromDate]);

  function toggleEntry(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleMeal(meal: MealSlot) {
    const mealIds = items.filter((i) => i.meal === meal).map((i) => i.entry.id);
    const allOn   = mealIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      allOn ? mealIds.forEach((id) => next.delete(id)) : mealIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleCopy() {
    const toCopy = items.filter((i) => selected.has(i.entry.id));
    if (!toCopy.length) return;
    setSaving(true);
    try {
      await Promise.all(toCopy.map(({ entry, meal }) => logApi.copyEntry(entry, meal, toDate)));
      await fetchDay();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const count = selected.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dram-card border border-dram-border rounded-2xl w-full max-w-md flex flex-col"
        style={{ maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-dram-border flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-200">Copy from {fmtShort(fromDate)}</h2>
          <div className="flex items-center gap-3">
            {!loading && items.length > 0 && (
              <button
                onClick={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.entry.id)))}
                className="text-xs text-dram-muted hover:text-slate-200 transition-colors"
              >
                {selected.size === items.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">Nothing logged on {fmtShort(fromDate)}</div>
          ) : (
            MEALS.map((meal) => {
              const mealItems = items.filter((i) => i.meal === meal);
              if (!mealItems.length) return null;
              const allOn = mealItems.every((i) => selected.has(i.entry.id));
              return (
                <div key={meal}>
                  <div className="px-5 py-2 flex items-center justify-between bg-white/[0.02] border-b border-dram-border/50">
                    <span className="text-xs font-semibold uppercase tracking-[.14em] text-dram-muted">{MEAL_LABEL[meal]}</span>
                    <button
                      onClick={() => toggleMeal(meal)}
                      className="text-xs text-dram-muted hover:text-slate-200 transition-colors"
                    >
                      {allOn ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  {mealItems.map(({ entry }) => (
                    <label
                      key={entry.id}
                      className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/5 cursor-pointer border-b border-dram-border/20"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(entry.id)}
                        onChange={() => toggleEntry(entry.id)}
                        className="w-4 h-4 flex-shrink-0 accent-dram-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-100 truncate">{entry.food.name}</div>
                        <div className="text-xs text-slate-500">
                          {entry.quantity !== 1 ? `${entry.quantity} × ` : ''}{entry.servingSize.label}
                        </div>
                      </div>
                      <span className="text-sm text-slate-400 flex-shrink-0">{Math.round(entry.nutrition.calories)} kcal</span>
                    </label>
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {!loading && items.length > 0 && (
          <div className="px-5 py-4 border-t border-dram-border flex gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="flex-1 text-sm text-slate-400 hover:text-slate-200 transition-colors py-2"
            >
              Cancel
            </button>
            <button
              onClick={handleCopy}
              disabled={saving || count === 0}
              className="flex-1 bg-dram-accent text-black text-sm font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
            >
              {saving ? 'Copying…' : `Copy ${count} item${count !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const { currentDate, dailyLog, waterDay, loading, setDate, fetchDay, addWater } = useLogStore();
  const [showAddModal, setShowAddModal]   = useState(false);
  const [addModalMeal, setAddModalMeal]   = useState<MealSlot | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);

  useEffect(() => { fetchDay(); }, []);

  const goals  = dailyLog?.goals;
  const totals = dailyLog?.totals ?? { calories: 0, carbs: 0, protein: 0, fat: 0 };
  const nutritionGoals = goals
    ? { calories: goals.calories, carbsG: goals.carbsG, proteinG: goals.proteinG, fatG: goals.fatG, waterGoalOz: goals.waterGoalOz }
    : null;
  const waterTotal = waterDay?.totalOz ?? 0;
  const waterGoal  = waterDay?.goalOz ?? goals?.waterGoalOz ?? 64;

  function openAddModal(meal?: MealSlot) {
    setAddModalMeal(meal ?? null);
    setShowAddModal(true);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dram-bg text-white">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-dram-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-200">Food Log</h1>
          <button
            onClick={() => setDate(offsetDate(currentDate, -1))}
            className="p-1 rounded text-slate-500 hover:text-slate-200 transition-colors"
            aria-label="Previous day"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M6.5 1.5 L2.5 5 L6.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span className="text-xl font-semibold text-slate-400 select-none">{fmtDate(currentDate)}</span>
          <button
            onClick={() => setDate(offsetDate(currentDate, 1))}
            disabled={currentDate >= todayStr()}
            className="p-1 rounded text-slate-500 hover:text-slate-200 transition-colors disabled:opacity-30"
            aria-label="Next day"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3.5 1.5 L7.5 5 L3.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <button
          onClick={() => openAddModal()}
          className="bg-dram-accent text-black font-semibold px-3.5 py-2 rounded-lg text-sm hover:brightness-110 transition flex items-center gap-1.5"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1 V9 M1 5 H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Log food
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8" style={{ color: MUTED }}>Loading…</div>
        ) : (
          <>
            {/* ── Band: Today / Fuel + macros ── */}
            <section style={{ padding: '28px 36px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{ width: 18, height: 2, background: ACCENT, flexShrink: 0 }} />
                <span style={{ fontSize: 14, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600, color: 'white' }}>Today</span>
              </div>
              <NutritionSummaryCard
                actual={{ calories: totals.calories, carbsG: totals.carbs, proteinG: totals.protein, fatG: totals.fat }}
                goals={nutritionGoals}
                waterOz={waterTotal}
                waterGoalOz={waterGoal}
                onAddWater={(oz) => addWater(oz)}
              />
            </section>

            {/* ── Band: Meals ── */}
            <section style={{ padding: '28px 36px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{ width: 18, height: 2, background: ACCENT, flexShrink: 0 }} />
                <span style={{ fontSize: 14, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600, color: 'white' }}>Meals</span>
                <button
                  onClick={() => setShowCopyModal(true)}
                  className="border border-dram-border text-dram-muted hover:text-white hover:border-slate-400 transition-colors text-xs px-2.5 py-1"
                  style={{ marginLeft: 'auto', borderRadius: 6 }}
                >
                  Copy from yesterday →
                </button>
              </div>
              <div className="grid grid-cols-4" style={{ gap: 14 }}>
                {MEALS.map((meal) => (
                  <MealSection
                    key={meal}
                    meal={meal}
                    entries={dailyLog?.meals[meal] ?? []}
                    onAdd={(m) => openAddModal(m)}
                  />
                ))}
              </div>
            </section>

            <div className="pb-16" />
          </>
        )}
      </div>

      {showAddModal && (
        <FoodSearchModal
          meal={addModalMeal ?? undefined}
          onClose={() => { setShowAddModal(false); setAddModalMeal(null); }}
        />
      )}

      {showCopyModal && (
        <CopyFromDayModal
          fromDate={offsetDate(currentDate, -1)}
          toDate={currentDate}
          onClose={() => setShowCopyModal(false)}
        />
      )}
    </div>
  );
}
