import { useEffect, useState } from 'react';
import { useLogStore } from '../store/logStore';
import MacroBar from '../components/MacroBar';
import MealSection from '../components/MealSection';
import FoodSearchModal from '../components/FoodSearchModal';
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
  const [waterInput, setWaterInput] = useState('');
  const [showWaterInput, setShowWaterInput] = useState(false);

  useEffect(() => { fetchDay(); }, []);

  const goals = dailyLog?.goals;
  const totals = dailyLog?.totals ?? { calories: 0, carbs: 0, protein: 0, fat: 0 };
  const calPct = goals ? Math.min((totals.calories / goals.calories) * 100, 100) : 0;
  const calOver = goals ? totals.calories > goals.calories : false;

  function handleAddWater() {
    const ml = Number(waterInput);
    if (ml > 0) {
      addWater(ml);
      setWaterInput('');
      setShowWaterInput(false);
    }
  }

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
          {/* Calorie summary card */}
          <div className="bg-slate-800 rounded-xl p-4 mb-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-medium">
                {Math.round(totals.calories)}
                <span className="text-slate-500 font-normal"> / {goals?.calories ?? 2000} kcal</span>
              </span>
              <span className={`text-sm font-medium ${calOver ? 'text-red-400' : 'text-brand-400'}`}>
                {Math.round(calPct)}%
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${calOver ? 'bg-red-500' : 'bg-brand-500'}`}
                style={{ width: `${calPct}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-1">
              <MacroBar label="Carbs" value={totals.carbs} goal={goals?.carbsG ?? 250} />
              <MacroBar label="Protein" value={totals.protein} goal={goals?.proteinG ?? 150} color="bg-blue-500" />
              <MacroBar label="Fat" value={totals.fat} goal={goals?.fatG ?? 65} color="bg-yellow-500" />

              {/* Water */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Water</span>
                  <span>{(waterTotal / 1000).toFixed(1)} / {(waterGoal / 1000).toFixed(1)} L</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all"
                    style={{ width: `${Math.min((waterTotal / waterGoal) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Water quick-add */}
            <div className="flex items-center gap-2 pt-1">
              {showWaterInput ? (
                <>
                  <input
                    type="number"
                    placeholder="ml"
                    value={waterInput}
                    onChange={(e) => setWaterInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddWater()}
                    className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
                    autoFocus
                  />
                  <button onClick={handleAddWater} className="text-xs text-brand-400 hover:text-brand-300">Add</button>
                  <button onClick={() => setShowWaterInput(false)} className="text-xs text-slate-500 hover:text-slate-400">Cancel</button>
                  {[250, 500].map((ml) => (
                    <button
                      key={ml}
                      onClick={() => { addWater(ml); setShowWaterInput(false); }}
                      className="text-xs text-slate-400 hover:text-slate-200 bg-slate-700 px-2 py-1 rounded transition-colors"
                    >
                      +{ml}ml
                    </button>
                  ))}
                </>
              ) : (
                <button
                  onClick={() => setShowWaterInput(true)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  + Add water
                </button>
              )}
            </div>
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
