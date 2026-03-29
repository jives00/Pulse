import { useState, useEffect } from 'react';
import { goalsApi, type GoalsSummary, type ExerciseGoals } from '@pulse/api-client';
import NutritionSummaryCard from '../components/NutritionSummaryCard';
import NutritionHistoryCharts from '../components/NutritionHistoryCharts';

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ label, actual, goal, unit, color }: {
  label: string; actual: number; goal: number | null; unit: string; color: string;
}) {
  const pct = goal ? Math.min(actual / goal, 1) : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-sm text-slate-300">{label}</span>
        <span className="text-sm text-slate-500">
          {actual} {unit}{goal != null ? ` / ${goal} ${unit}` : ''}
        </span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Goal editor ─────────────────────────────────────────────────────────────

function NutritionGoalEditor({ current, onSaved }: {
  current: GoalsSummary['nutrition']['goals'];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [calories, setCalories] = useState(String(current?.calories ?? ''));
  const [carbsG, setCarbsG] = useState(String(current?.carbsG ?? ''));
  const [proteinG, setProteinG] = useState(String(current?.proteinG ?? ''));
  const [fatG, setFatG] = useState(String(current?.fatG ?? ''));
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
      });
      setOpen(false);
      onSaved();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500';

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
        {current ? 'Edit goals' : 'Set goals'}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
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
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => setOpen(false)} className="flex-1 text-sm text-slate-400 hover:text-slate-200 transition-colors py-1.5">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving || !calories || !carbsG || !proteinG || !fatG}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-1.5 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function ExerciseGoalEditor({ current, onSaved }: {
  current: ExerciseGoals | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [workouts, setWorkouts] = useState(String(current?.workoutsPerWeek ?? ''));
  const [minutes, setMinutes] = useState(String(current?.minutesPerWeek ?? ''));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await goalsApi.saveExercise({
        workoutsPerWeek: workouts !== '' ? Number(workouts) : null,
        minutesPerWeek: minutes !== '' ? Number(minutes) : null,
      });
      setOpen(false);
      onSaved();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500';

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
        {current ? 'Edit goals' : 'Set goals'}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm text-slate-500 mb-1">Workouts / week</label>
          <input type="number" min="0" value={workouts} onChange={(e) => setWorkouts(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm text-slate-500 mb-1">Minutes / week</label>
          <input type="number" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => setOpen(false)} className="flex-1 text-sm text-slate-400 hover:text-slate-200 transition-colors py-1.5">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-1.5 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [summary, setSummary] = useState<GoalsSummary | null>(null);
  const [exGoals, setExGoals] = useState<ExerciseGoals | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      goalsApi.getSummary(today),
      goalsApi.getExercise().catch(() => null),
    ]).then(([s, eg]) => {
      setSummary(s);
      setExGoals(eg);
    }).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="text-center text-sm text-slate-500 py-12">Loading…</div>;
  }

  const nutritionGoals = summary?.nutrition.goals ?? null;
  const nutritionActual = summary?.nutrition.actual;
  const workoutGoals = summary?.workouts.goals ?? null;
  const workoutActual = summary?.workouts.actual;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-slate-200">Goals</h1>

      {/* Nutrition section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Nutrition — Today</h2>
          <NutritionGoalEditor current={nutritionGoals} onSaved={load} />
        </div>
        <NutritionSummaryCard
          actual={{
            calories: nutritionActual?.calories ?? 0,
            carbsG: nutritionActual?.carbsG ?? 0,
            proteinG: nutritionActual?.proteinG ?? 0,
            fatG: nutritionActual?.fatG ?? 0,
          }}
          goals={nutritionGoals}
          waterMl={0}
          waterGoalMl={2000}
        />
      </div>

      <NutritionHistoryCharts
        calorieGoal={nutritionGoals?.calories}
        proteinGoal={nutritionGoals?.proteinG}
      />

      {/* Workouts section */}
      <div className="bg-slate-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Workouts — This Week</h2>
          <ExerciseGoalEditor current={exGoals} onSaved={load} />
        </div>

        <div className="space-y-4">
          <ProgressBar
            label="Workouts"
            actual={workoutActual?.workoutCount ?? 0}
            goal={workoutGoals?.workoutsPerWeek ?? null}
            unit={workoutGoals?.workoutsPerWeek === 1 ? 'workout' : 'workouts'}
            color="#34d399"
          />
          <ProgressBar
            label="Active minutes"
            actual={workoutActual?.totalMinutes ?? 0}
            goal={workoutGoals?.minutesPerWeek ?? null}
            unit="min"
            color="#60a5fa"
          />
        </div>

        {!workoutGoals && (
          <p className="text-sm text-slate-500 mt-3">Set workout goals to track your weekly progress.</p>
        )}
      </div>
    </div>
  );
}
