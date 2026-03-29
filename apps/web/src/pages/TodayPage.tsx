import { useEffect, useState } from 'react';
import { useLogStore } from '../store/logStore';
import MealSection from '../components/MealSection';
import FoodSearchModal from '../components/FoodSearchModal';
import NutritionSummaryCard from '../components/NutritionSummaryCard';
import NutritionHistoryCharts from '../components/NutritionHistoryCharts';
import type { MealSlot } from '@pulse/api-client';

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function offsetDate(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function TodayPage() {
  const { currentDate, dailyLog, waterDay, loading, setDate, fetchDay, addWater, copyFromDate } = useLogStore();
  const [addingToMeal, setAddingToMeal] = useState<MealSlot | null>(null);

  useEffect(() => { fetchDay(); }, []);

  const goals = dailyLog?.goals;
  const totals = dailyLog?.totals ?? { calories: 0, carbs: 0, protein: 0, fat: 0 };
  const waterTotal = waterDay?.totalMl ?? 0;
  const waterGoal = waterDay?.goalMl ?? goals?.waterGoalMl ?? 2000;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Date navigation */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => setDate(offsetDate(currentDate, -1))}
          className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
        >
          ◀
        </button>
        <div className="text-center">
          <div className="text-slate-200 font-medium">{fmtDate(currentDate)}</div>
        </div>
        <button
          onClick={() => setDate(offsetDate(currentDate, 1))}
          className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          disabled={currentDate >= new Date().toISOString().slice(0, 10)}
        >
          ▶
        </button>
      </div>

      {loading && (
        <div className="text-center text-slate-500 py-8">Loading…</div>
      )}

      {!loading && (
        <>
          {/* Summary card */}
          <div className="mb-4">
            <NutritionSummaryCard
              actual={{ calories: totals.calories, carbsG: totals.carbs, proteinG: totals.protein, fatG: totals.fat }}
              goals={goals ? { calories: goals.calories, carbsG: goals.carbsG, proteinG: goals.proteinG, fatG: goals.fatG } : null}
              waterMl={waterTotal}
              waterGoalMl={waterGoal}
              onAddWater={(ml) => addWater(ml)}
            />
          </div>

          {/* 30-day history charts */}
          <div className="mb-4">
            <NutritionHistoryCharts
              calorieGoal={goals?.calories}
              proteinGoal={goals?.proteinG}
            />
          </div>

          {/* Copy from yesterday */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => copyFromDate(offsetDate(currentDate, -1))}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Copy from yesterday
            </button>
          </div>

          {/* Meal sections */}
          <div className="space-y-3">
            {MEALS.map((meal) => (
              <MealSection
                key={meal}
                meal={meal}
                entries={dailyLog?.meals[meal] ?? []}
                onAdd={(m) => setAddingToMeal(m)}
              />
            ))}
          </div>
        </>
      )}

      {addingToMeal && (
        <FoodSearchModal
          meal={addingToMeal}
          onClose={() => setAddingToMeal(null)}
        />
      )}
    </div>
  );
}
