import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogStore, todayStr } from '../store/logStore';
import MealSection from '../components/MealSection';
import FoodSearchModal from '../components/FoodSearchModal';
import RecipeForm from '../components/RecipeForm';
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
  const navigate = useNavigate();
  const { currentDate, dailyLog, waterDay, loading, setDate, fetchDay, addWater, copyFromDate } = useLogStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRecipeFormModal, setShowRecipeFormModal] = useState(false);
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
            onClick={() => navigate('/planning')}
            className="border border-dram-border text-slate-300 hover:text-white hover:border-slate-400 rounded-lg px-4 py-2 text-sm transition-colors"
          >
            Manage Goals
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

            {/* Copy from yesterday */}
            <div className="flex justify-end">
              <button
                onClick={() => copyFromDate(offsetDate(currentDate, -1))}
                className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
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
              enableLogOption
              onSaved={() => { setShowRecipeFormModal(false); fetchDay(); }}
              onCancel={() => setShowRecipeFormModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
