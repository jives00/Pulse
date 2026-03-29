import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  getGoalsSummary, getExerciseGoals, saveExerciseGoals, saveNutritionGoals,
} from '../api/client';
import type { GoalsSummary, ExerciseGoals } from '../api/client';

// ─── Ring chart ──────────────────────────────────────────────────────────────

function Ring({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(pct, 1) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#334155" strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
    </svg>
  );
}

function MacroRing({ label, actual, goal, color }: {
  label: string; actual: number; goal: number | null; color: string;
}) {
  const pct = goal ? actual / goal : 0;
  const pctDisplay = goal ? Math.round(pct * 100) : null;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <Ring pct={pct} color={color} size={72} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold text-slate-200">
            {pctDisplay != null ? `${pctDisplay}%` : '—'}
          </span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-medium text-slate-300">{label}</div>
        <div className="text-xs text-slate-500">
          {Math.round(actual)}g{goal != null ? ` / ${Math.round(goal)}g` : ''}
        </div>
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ label, actual, goal, unit, color }: {
  label: string; actual: number; goal: number | null; unit: string; color: string;
}) {
  const pct = goal ? Math.min(actual / goal, 1) : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-sm text-slate-300">{label}</span>
        <span className="text-xs text-slate-500">
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
  const token = useAuthStore((s) => s.token)!;
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
      await saveNutritionGoals(token, {
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
      <button onClick={() => setOpen(true)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
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
            <label className="block text-xs text-slate-500 mb-1">{label}</label>
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
  const token = useAuthStore((s) => s.token)!;
  const [open, setOpen] = useState(false);
  const [workouts, setWorkouts] = useState(String(current?.workoutsPerWeek ?? ''));
  const [minutes, setMinutes] = useState(String(current?.minutesPerWeek ?? ''));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await saveExerciseGoals(token, {
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
      <button onClick={() => setOpen(true)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
        {current ? 'Edit goals' : 'Set goals'}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Workouts / week</label>
          <input type="number" min="0" value={workouts} onChange={(e) => setWorkouts(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Minutes / week</label>
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
  const token = useAuthStore((s) => s.token)!;
  const [summary, setSummary] = useState<GoalsSummary | null>(null);
  const [exGoals, setExGoals] = useState<ExerciseGoals | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      getGoalsSummary(token, today),
      getExerciseGoals(token).catch(() => null),
    ]).then(([s, eg]) => {
      setSummary(s);
      setExGoals(eg);
    }).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [token]);

  if (loading) {
    return <div className="text-center text-sm text-slate-500 py-12">Loading…</div>;
  }

  const nutritionGoals = summary?.nutrition.goals ?? null;
  const nutritionActual = summary?.nutrition.actual;
  const workoutGoals = summary?.workouts.goals ?? null;
  const workoutActual = summary?.workouts.actual;

  const calPct = nutritionGoals && nutritionActual ? nutritionActual.calories / nutritionGoals.calories : 0;
  const calColor = calPct > 1.1 ? '#f87171' : calPct >= 0.9 ? '#34d399' : '#60a5fa';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-semibold text-slate-200">Goals</h1>

      {/* Nutrition section */}
      <div className="bg-slate-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Nutrition — Today</h2>
          <NutritionGoalEditor current={nutritionGoals} onSaved={load} />
        </div>

        {/* Calories ring */}
        <div className="flex items-center gap-4 mb-5">
          <div className="relative shrink-0">
            <Ring pct={calPct} color={calColor} size={96} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-slate-100">
                {Math.round(nutritionActual?.calories ?? 0)}
              </span>
              <span className="text-xs text-slate-500">kcal</span>
            </div>
          </div>
          <div className="flex-1">
            {nutritionGoals ? (
              <div className="space-y-1">
                <div className="text-sm text-slate-400">
                  Goal: <span className="text-slate-200 font-medium">{nutritionGoals.calories} kcal</span>
                </div>
                <div className="text-sm text-slate-400">
                  Remaining: <span className={`font-medium ${(nutritionGoals.calories - (nutritionActual?.calories ?? 0)) < 0 ? 'text-red-400' : 'text-slate-200'}`}>
                    {Math.round(nutritionGoals.calories - (nutritionActual?.calories ?? 0))} kcal
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Set a calorie goal to track progress.</p>
            )}
          </div>
        </div>

        {/* Macro rings */}
        <div className="grid grid-cols-3 gap-3">
          <MacroRing label="Protein" actual={nutritionActual?.proteinG ?? 0} goal={nutritionGoals?.proteinG ?? null} color="#818cf8" />
          <MacroRing label="Carbs"   actual={nutritionActual?.carbsG   ?? 0} goal={nutritionGoals?.carbsG   ?? null} color="#fb923c" />
          <MacroRing label="Fat"     actual={nutritionActual?.fatG     ?? 0} goal={nutritionGoals?.fatG     ?? null} color="#facc15" />
        </div>
      </div>

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
