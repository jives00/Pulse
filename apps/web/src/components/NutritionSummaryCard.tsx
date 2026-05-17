import { GLASS_OZ } from '@pulse/api-client';

interface Props {
  actual: { calories: number; carbsG: number; proteinG: number; fatG: number };
  goals: { calories: number; carbsG: number; proteinG: number; fatG: number } | null;
  waterOz: number;
  waterGoalOz: number;
  onAddWater?: (oz: number) => void;
}

function Ring({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(pct, 1) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={9} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={9}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
    </svg>
  );
}

function MacroTile({
  icon, label, actual, goal, color, leftBorder,
}: {
  icon: string; label: string; actual: number; goal?: number; color: string; leftBorder?: boolean;
}) {
  const pct = goal ? Math.min(actual / goal, 1) : 0;
  const over = goal != null && actual > goal;
  const remaining = goal != null ? Math.round(goal - actual) : null;

  return (
    <div className="flex flex-col gap-1.5 px-4 py-4">
      <div className="flex items-center gap-1.5">
        <span className="text-xl leading-none">{icon}</span>
        <span className="text-sm font-semibold uppercase tracking-wider" style={{ color }}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-white">{Math.round(actual)}</span>
        <span className="text-sm text-slate-400">/ {goal ?? '—'}g</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${color}22` }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct * 100}%`, backgroundColor: over ? '#f87171' : color }}
        />
      </div>
      {remaining != null && (
        <div className="text-sm font-medium" style={{ color: over ? '#f87171' : color }}>
          {over ? `${Math.abs(remaining)}g over` : `${Math.abs(remaining)}g left`}
        </div>
      )}
    </div>
  );
}

const BOTTLE_OZ = 20;

function WaterTile({
  waterOz, waterGoalOz, onAddWater,
}: {
  waterOz: number; waterGoalOz: number; onAddWater?: (oz: number) => void;
}) {
  const glasses = (waterOz / GLASS_OZ).toFixed(1);
  const goalGlasses = Math.round(waterGoalOz / GLASS_OZ);
  const pct = waterGoalOz > 0 ? Math.min(waterOz / waterGoalOz, 1) : 0;
  const remainingGlasses = Math.max(0, (waterGoalOz - waterOz) / GLASS_OZ).toFixed(1);

  return (
    <div className="flex flex-col gap-1.5 px-4 py-4">
      <div className="flex items-center gap-1.5">
        <span className="text-xl leading-none">💧</span>
        <span className="text-sm font-semibold uppercase tracking-wider text-cyan-400">Water</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-white">{glasses}</span>
        <span className="text-sm text-dram-muted">/ {goalGlasses} glasses</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-cyan-400/10">
        <div className="h-full rounded-full bg-cyan-400 transition-all duration-500" style={{ width: `${pct * 100}%` }} />
      </div>
      {waterOz < waterGoalOz ? (
        <div className="text-sm font-medium text-cyan-400">{remainingGlasses} glasses left</div>
      ) : (
        <div className="text-sm font-medium text-green-400">Goal reached!</div>
      )}
      {onAddWater && (
        <div className="mt-1 flex gap-2">
          <button onClick={() => onAddWater(GLASS_OZ)}
            className="flex-1 bg-dram-card hover:bg-dram-border/50 border border-dram-border rounded-lg py-2 text-sm font-medium text-white transition-colors">
            + Glass (8oz)
          </button>
          <button onClick={() => onAddWater(BOTTLE_OZ)}
            className="flex-1 bg-dram-card hover:bg-dram-border/50 border border-dram-border rounded-lg py-2 text-sm font-medium text-white transition-colors">
            + Bottle (20oz)
          </button>
        </div>
      )}
    </div>
  );
}

export default function NutritionSummaryCard({ actual, goals, waterOz, waterGoalOz, onAddWater }: Props) {
  const calPct = goals ? actual.calories / goals.calories : 0;
  const calOver = goals ? actual.calories > goals.calories : false;
  const remaining = goals ? Math.round(goals.calories - actual.calories) : null;
  const ringColor = calOver ? '#f87171' : calPct >= 0.9 ? '#34d399' : '#D4A843';

  return (
    <div className="bg-dram-card rounded-2xl overflow-hidden">
      {/* Gold top accent bar */}
      <div className="h-[3px] bg-dram-accent rounded-t-2xl" />

      {/* ── Hero: Calories ─────────────────────────────────── */}
      <div className="relative px-6 py-5">
        <div className="flex items-center gap-4">

          {/* Left: donut ring */}
          <div className="relative shrink-0 mr-2">
            <Ring pct={calPct} color={ringColor} size={108} />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <span className="text-2xl font-bold text-white leading-none">
                {Math.abs(remaining ?? Math.round(actual.calories)).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                kcal<br />{remaining != null ? (calOver ? 'over' : 'left') : 'eaten'}
              </span>
            </div>
          </div>

          {/* Right: title + progress */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl leading-none">🔥</span>
              <span className="text-base font-bold text-white">Calories</span>
            </div>

            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold text-white">{Math.round(actual.calories).toLocaleString()}</span>
              <span className="text-sm text-slate-400">
                {goals ? ` / ${goals.calories.toLocaleString()} kcal` : ' kcal'}
              </span>
            </div>

            {/* Calorie bar */}
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(calPct, 1) * 100}%`, backgroundColor: ringColor }}
              />
            </div>

            {remaining != null && (
              <div className="mt-1.5 text-sm font-medium" style={{ color: calOver ? '#f87171' : '#D4A843' }}>
                {calOver
                  ? `${Math.abs(remaining).toLocaleString()} kcal over goal`
                  : `${remaining.toLocaleString()} kcal remaining`}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Macro + Water row ──────────────────────────────── */}
      <div className="grid grid-cols-4">
        <MacroTile icon="💪" label="Protein" actual={actual.proteinG} goal={goals?.proteinG} color="#818cf8" />
        <MacroTile icon="🌾" label="Carbs"   actual={actual.carbsG}   goal={goals?.carbsG}   color="#fb923c" leftBorder />
        <MacroTile icon="🥑" label="Fat"     actual={actual.fatG}     goal={goals?.fatG}     color="#facc15" leftBorder />
        <WaterTile waterOz={waterOz} waterGoalOz={waterGoalOz} onAddWater={onAddWater} />
      </div>
    </div>
  );
}
