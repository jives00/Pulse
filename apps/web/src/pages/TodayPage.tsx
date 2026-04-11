import { useEffect, useState } from 'react';
import { useLogStore, todayStr } from '../store/logStore';
import MealSection from '../components/MealSection';
import FoodSearchModal from '../components/FoodSearchModal';
import RecipeForm from '../components/RecipeForm';
import NutritionSummaryCard from '../components/NutritionSummaryCard';
import NutritionHistoryCharts from '../components/NutritionHistoryCharts';
import { recipesApi, goalsApi, GLASS_OZ } from '@pulse/api-client';
import type { MealSlot, GoalsSummary } from '@pulse/api-client';

function NutritionGoalEditor({ current, onClose, onSaved }: {
  current: GoalsSummary['nutrition']['goals'];
  onClose: () => void;
  onSaved: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const [calories, setCalories] = useState(String(current?.calories ?? ''));
  const [carbsG, setCarbsG] = useState(String(current?.carbsG ?? ''));
  const [proteinG, setProteinG] = useState(String(current?.proteinG ?? ''));
  const [fatG, setFatG] = useState(String(current?.fatG ?? ''));
  const [waterGlasses, setWaterGlasses] = useState(
    current?.waterGoalOz != null ? String(Math.round(current.waterGoalOz / GLASS_OZ)) : ''
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!calories || !carbsG || !proteinG || !fatG) return;
    setSaving(true);
    try {
      await goalsApi.saveNutrition({
        calories: Number(calories),
        carbsG: Number(carbsG),
        proteinG: Number(proteinG),
        fatG: Number(fatG),
        waterGoalOz: waterGlasses !== '' ? Number(waterGlasses) * GLASS_OZ : undefined,
      });
      onClose();
      onSaved();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full bg-dram-bg border border-dram-border rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-dram-accent';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dram-card rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm border border-dram-border p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-200">Nutrition Goals</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['Calories (kcal)', calories, setCalories],
            ['Carbs (g)', carbsG, setCarbsG],
            ['Protein (g)', proteinG, setProteinG],
            ['Fat (g)', fatG, setFatG],
          ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
            <div key={label}>
              <label className="block text-sm text-slate-500 mb-1">{label}</label>
              <input type="number" min="0" value={val} onChange={(e) => setter(e.target.value)} className={inputCls} />
            </div>
          ))}
          <div>
            <label className="block text-sm text-slate-500 mb-1">Water (glasses/day)</label>
            <input type="number" min="0" value={waterGlasses} onChange={(e) => setWaterGlasses(e.target.value)} className={inputCls} placeholder="e.g. 8" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 text-sm text-slate-400 hover:text-slate-200 transition-colors py-1.5">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !calories || !carbsG || !proteinG || !fatG}
            className="flex-1 bg-dram-accent text-black text-sm font-semibold rounded-lg py-1.5 hover:brightness-110 disabled:opacity-50 transition"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const MEAL_SUBCATEGORIES: Record<MealSlot, string> = {
  breakfast: 'breakfast',
  lunch:     'side',
  dinner:    'main',
  snack:     'dessert',
};

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function offsetDate(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function TodayPage() {
  const { currentDate, dailyLog, waterDay, loading, setDate, fetchDay, addWater, copyFromDate } = useLogStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRecipeFormModal, setShowRecipeFormModal] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [mealPhotos, setMealPhotos] = useState<Record<MealSlot, string | null>>({
    breakfast: null, lunch: null, dinner: null, snack: null,
  });

  useEffect(() => { fetchDay(); }, []);

  useEffect(() => {
    if (!showRecipeFormModal) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowRecipeFormModal(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showRecipeFormModal]);

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

  const goals = dailyLog?.goals;
  const totals = dailyLog?.totals ?? { calories: 0, carbs: 0, protein: 0, fat: 0 };
  const nutritionGoals = goals ? { calories: goals.calories, carbsG: goals.carbsG, proteinG: goals.proteinG, fatG: goals.fatG, waterGoalOz: goals.waterGoalOz } : null;
  const waterTotal = waterDay?.totalOz ?? 0;
  const waterGoal = waterDay?.goalOz ?? goals?.waterGoalOz ?? 64;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dram-bg text-white">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-dram-border flex items-center gap-3">
        {/* Title */}
        <h1 className="text-xl font-semibold text-slate-200 flex-shrink-0">Nutrition</h1>

        {/* Date nav */}
        <div className="flex items-center gap-1 flex-1 justify-center">
          <button
            onClick={() => setDate(offsetDate(currentDate, -1))}
            className="p-2 rounded-lg hover:bg-dram-card text-slate-400 hover:text-slate-100 transition-colors"
          >
            ◀
          </button>
          <div className="text-slate-200 font-medium px-1 min-w-[200px] text-center text-sm">{fmtDate(currentDate)}</div>
          <button
            onClick={() => setDate(offsetDate(currentDate, 1))}
            className="p-2 rounded-lg hover:bg-dram-card text-slate-400 hover:text-slate-100 transition-colors"
            disabled={currentDate >= todayStr()}
          >
            ▶
          </button>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGoalsModal(true)}
            className="border border-dram-border text-slate-300 hover:text-white hover:border-slate-400 rounded-lg px-4 py-2 text-sm transition-colors"
          >
            Edit Goals
          </button>
          <button
            onClick={() => setShowRecipeFormModal(true)}
            className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition"
          >
            Create Custom Food
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition"
          >
            Log Food
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading ? (
          <div className="text-center text-slate-500 py-8">Loading…</div>
        ) : (
          <>
            {/* Summary card — full width */}
            <NutritionSummaryCard
              actual={{ calories: totals.calories, carbsG: totals.carbs, proteinG: totals.protein, fatG: totals.fat }}
              goals={nutritionGoals}
              waterOz={waterTotal}
              waterGoalOz={waterGoal}
              onAddWater={(oz) => addWater(oz)}
            />

            {/* 30-day history charts */}
            <NutritionHistoryCharts
              calorieGoal={goals?.calories}
              proteinGoal={goals?.proteinG}
            />

            {/* Copy from yesterday */}
            <div className="flex justify-end">
              <button
                onClick={() => copyFromDate(offsetDate(currentDate, -1))}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Copy from yesterday
              </button>
            </div>

            {/* Meal cards */}
            <div className="grid grid-cols-4 gap-3">
              {MEALS.map((meal) => (
                <MealSection
                  key={meal}
                  meal={meal}
                  entries={dailyLog?.meals[meal] ?? []}
                  onAdd={() => setShowAddModal(true)}
                  photoUrl={mealPhotos[meal]}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {showGoalsModal && (
        <NutritionGoalEditor
          current={nutritionGoals}
          onClose={() => setShowGoalsModal(false)}
          onSaved={() => fetchDay()}
        />
      )}

      {showAddModal && (
        <FoodSearchModal
          onClose={() => setShowAddModal(false)}
          onCreateCustomFood={() => { setShowAddModal(false); setShowRecipeFormModal(true); }}
        />
      )}

      {showRecipeFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRecipeFormModal(false)} />
          <div className="relative w-full max-w-lg h-[90vh] rounded-2xl overflow-hidden shadow-2xl">
            <RecipeForm
              initialType="food"
              onSaved={() => setShowRecipeFormModal(false)}
              onCancel={() => setShowRecipeFormModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
