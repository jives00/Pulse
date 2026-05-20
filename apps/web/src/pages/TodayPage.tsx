import { useEffect, useState } from 'react';
import { useLogStore, todayStr } from '../store/logStore';
import MealSection from '../components/MealSection';
import FoodSearchModal from '../components/FoodSearchModal';
import NutritionSummaryCard from '../components/NutritionSummaryCard';
import { recipesApi } from '@pulse/api-client';
import type { MealSlot } from '@pulse/api-client';

const MEAL_SUBCATEGORIES: Record<MealSlot, string> = {
  breakfast: 'breakfast',
  lunch:     'side',
  dinner:    'main',
  snack:     'dessert',
};

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

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

function offsetDate(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function TodayPage() {
  const { currentDate, dailyLog, waterDay, loading, setDate, fetchDay, addWater, copyFromDate } = useLogStore();
  const [showAddModal, setShowAddModal]   = useState(false);
  const [addModalMeal, setAddModalMeal]   = useState<MealSlot | null>(null);
  const [mealPhotos, setMealPhotos]       = useState<Record<MealSlot, string | null>>({
    breakfast: null, lunch: null, dinner: null, snack: null,
  });

  useEffect(() => { fetchDay(); }, []);

  useEffect(() => {
    const meals: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    Promise.all(
      meals.map((meal) =>
        recipesApi.getAll({ subcategory: MEAL_SUBCATEGORIES[meal], sort: 'random', limit: 1 })
          .then((results) => ({ meal, url: results[0]?.photo_url ?? null }))
          .catch(() => ({ meal, url: null }))
      )
    ).then((results) => {
      setMealPhotos(Object.fromEntries(results.map(({ meal, url }) => [meal, url])) as Record<MealSlot, string | null>);
    });
  }, []);

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

            {/* ── Band: Meals / What you ate today ── */}
            <section style={{ padding: '28px 36px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{ width: 18, height: 2, background: ACCENT, flexShrink: 0 }} />
                <span style={{ fontSize: 14, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600, color: 'white' }}>Meals</span>
                <button
                  onClick={() => copyFromDate(offsetDate(currentDate, -1))}
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
                    photoUrl={mealPhotos[meal]}
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
    </div>
  );
}
