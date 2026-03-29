import { useState } from 'react';

interface Props {
  actual: { calories: number; carbsG: number; proteinG: number; fatG: number };
  goals: { calories: number; carbsG: number; proteinG: number; fatG: number } | null;
  waterMl: number;
  waterGoalMl: number;
  onAddWater?: (ml: number) => void;
}

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
  const over = goal ? actual > goal : false;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <Ring pct={pct} color={over ? '#f87171' : color} size={68} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold text-slate-200">
            {goal ? `${Math.round(pct * 100)}%` : '—'}
          </span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium text-slate-300">{label}</div>
        <div className="text-xs text-slate-500">
          {Math.round(actual)}g{goal != null ? ` / ${Math.round(goal)}g` : ''}
        </div>
      </div>
    </div>
  );
}

export default function NutritionSummaryCard({ actual, goals, waterMl, waterGoalMl, onAddWater }: Props) {
  const [showWaterInput, setShowWaterInput] = useState(false);
  const [waterInput, setWaterInput] = useState('');

  const calPct = goals ? actual.calories / goals.calories : 0;
  const calOver = goals ? actual.calories > goals.calories : false;
  const calColor = calOver ? '#f87171' : calPct >= 0.9 ? '#34d399' : '#60a5fa';
  const remaining = goals ? Math.round(goals.calories - actual.calories) : null;
  const waterPct = waterGoalMl > 0 ? Math.min(waterMl / waterGoalMl, 1) : 0;

  function handleAddWater() {
    const ml = Number(waterInput);
    if (ml > 0 && onAddWater) {
      onAddWater(ml);
      setWaterInput('');
      setShowWaterInput(false);
    }
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 space-y-4">
      {/* Top row: big calorie ring + macro rings */}
      <div className="flex items-center gap-4">
        {/* Calorie ring */}
        <div className="relative shrink-0">
          <Ring pct={calPct} color={calColor} size={100} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-slate-100 leading-tight">
              {Math.round(actual.calories)}
            </span>
            <span className="text-xs text-slate-500">kcal</span>
          </div>
        </div>

        {/* Goal + remaining */}
        <div className="flex-1 space-y-1">
          {goals ? (
            <>
              <div className="text-sm text-slate-400">
                Goal: <span className="text-slate-200 font-medium">{goals.calories} kcal</span>
              </div>
              <div className="text-sm text-slate-400">
                {remaining != null && remaining >= 0 ? 'Remaining: ' : 'Over by: '}
                <span className={`font-medium ${(remaining ?? 0) < 0 ? 'text-red-400' : 'text-slate-200'}`}>
                  {Math.abs(remaining ?? 0)} kcal
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">No calorie goal set.</p>
          )}
        </div>
      </div>

      {/* Macro rings */}
      <div className="grid grid-cols-3 gap-2">
        <MacroRing label="Protein" actual={actual.proteinG} goal={goals?.proteinG ?? null} color="#818cf8" />
        <MacroRing label="Carbs"   actual={actual.carbsG}   goal={goals?.carbsG   ?? null} color="#fb923c" />
        <MacroRing label="Fat"     actual={actual.fatG}     goal={goals?.fatG     ?? null} color="#facc15" />
      </div>

      {/* Water */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-400">Water</span>
          <span className="text-slate-400">
            {(waterMl / 1000).toFixed(1)} / {(waterGoalMl / 1000).toFixed(1)} L
          </span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-cyan-400 transition-all duration-500"
            style={{ width: `${waterPct * 100}%` }}
          />
        </div>

        {onAddWater && (
          <div className="flex items-center gap-2 pt-0.5">
            {showWaterInput ? (
              <>
                <input
                  type="number"
                  placeholder="ml"
                  value={waterInput}
                  onChange={(e) => setWaterInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddWater()}
                  className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                  autoFocus
                />
                <button onClick={handleAddWater} className="text-xs text-cyan-400 hover:text-cyan-300">Add</button>
                <button onClick={() => setShowWaterInput(false)} className="text-xs text-slate-500 hover:text-slate-400">Cancel</button>
                {[250, 500].map((ml) => (
                  <button
                    key={ml}
                    onClick={() => { onAddWater(ml); setShowWaterInput(false); }}
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
        )}
      </div>
    </div>
  );
}
