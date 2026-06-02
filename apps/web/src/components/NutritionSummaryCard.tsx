import { GLASS_OZ } from '@pulse/api-client';

interface Props {
  actual: { calories: number; carbsG: number; proteinG: number; fatG: number };
  goals: { calories: number; carbsG: number; proteinG: number; fatG: number } | null;
  waterOz: number;
  waterGoalOz: number;
  onAddWater?: (oz: number) => void;
}

const ACCENT = '#D4A843';
const MUTED  = '#828ea8';

function Ring({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const sw = 10;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(pct, 1) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={sw}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
    </svg>
  );
}

function MacroBar({ label, val, goal, opacity }: { label: string; val: number; goal?: number; opacity: number }) {
  const rawPct = goal ? val / goal : 0;
  const pct    = Math.min(rawPct, 1);
  const over  = goal != null && val > goal;
  const remaining = goal != null ? Math.round(goal - val) : null;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="text-sm font-semibold uppercase tracking-[.14em]" style={{ color: MUTED }}>{label}</span>
        <span className="text-sm font-mono" style={{ color: over ? '#f87171' : MUTED }}>{Math.round(rawPct * 100)}%</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 600, color: 'white', letterSpacing: '-.01em' }}>{Math.round(val)}</span>
        <span className="text-sm" style={{ color: MUTED }}>g</span>
        <span className="text-sm font-mono" style={{ color: MUTED, marginLeft: 'auto' }}>/ {goal ?? '—'}</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: ACCENT, opacity }} />
      </div>
      {remaining != null && (
        <div className="text-sm font-mono" style={{ color: over ? '#f87171' : MUTED, marginTop: 6 }}>
          {over ? `+${Math.abs(remaining)}g over` : `${remaining}g left`}
        </div>
      )}
    </div>
  );
}

const BOTTLE_OZ = 20;

function WaterTile({ waterOz, waterGoalOz, onAddWater }: { waterOz: number; waterGoalOz: number; onAddWater?: (oz: number) => void }) {
  const glasses     = waterOz / GLASS_OZ;
  const goalGlasses = Math.max(1, Math.round(waterGoalOz / GLASS_OZ));
  const pct         = Math.min(glasses / goalGlasses, 1);
  const remaining   = Math.max(0, goalGlasses - glasses);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <span className="text-sm font-semibold uppercase tracking-[.14em]" style={{ color: MUTED }}>Water</span>
        <span className="text-sm font-mono" style={{ color: MUTED }}>{Math.round(pct * 100)}%</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 38, fontWeight: 600, color: 'white', letterSpacing: '-.02em', lineHeight: 1 }}>
          {glasses.toFixed(1)}
        </span>
        <span className="text-sm" style={{ color: MUTED }}>/ {goalGlasses}</span>
        <span className="text-sm font-mono" style={{ color: MUTED, marginLeft: 6 }}>glasses · 8 oz</span>
      </div>

      {/* Glass row */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
        {Array.from({ length: goalGlasses }).map((_, i) => {
          const filled  = i < Math.floor(glasses);
          const partial = i === Math.floor(glasses) && glasses % 1 > 0;
          const pf = glasses % 1;
          return (
            <div key={i} style={{ flex: 1, height: 34, border: '1px solid rgb(var(--dram-border))', borderRadius: 2, position: 'relative', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
              {filled  && <div style={{ position: 'absolute', inset: 0, background: ACCENT, opacity: 0.85 }} />}
              {partial && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${pf * 100}%`, background: ACCENT, opacity: 0.85 }} />}
            </div>
          );
        })}
      </div>

      <div className="text-sm font-mono" style={{ color: MUTED, marginBottom: 14 }}>
        {remaining > 0 ? `${remaining.toFixed(1)} glasses left` : 'goal reached'}
      </div>

      {onAddWater && (
        <div className="flex gap-2">
          <button onClick={() => onAddWater(GLASS_OZ)} className="flex-1 border border-dram-border text-dram-muted hover:text-white hover:border-slate-400 text-sm py-2 rounded-md transition-colors">
            + 8 oz
          </button>
          <button onClick={() => onAddWater(BOTTLE_OZ)} className="flex-1 border border-dram-border text-dram-muted hover:text-white hover:border-slate-400 text-sm py-2 rounded-md transition-colors">
            + 20 oz
          </button>
        </div>
      )}
    </div>
  );
}

export default function NutritionSummaryCard({ actual, goals, waterOz, waterGoalOz, onAddWater }: Props) {
  const calPct   = goals ? actual.calories / goals.calories : 0;
  const calOver  = goals ? actual.calories > goals.calories : false;
  const remaining = goals ? Math.round(goals.calories - actual.calories) : null;
  const ringColor = calOver ? '#f87171' : calPct >= 0.9 ? '#34d399' : ACCENT;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
      {/* Left: Energy + macros */}
      <div className="bg-dram-card border border-dram-border" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
          <span className="text-sm font-semibold uppercase tracking-[.14em]" style={{ color: MUTED }}>Energy + macros</span>
          {goals && (
            <span className="text-sm font-mono" style={{ color: MUTED }}>
              {Math.round(actual.calories).toLocaleString()} / {goals.calories.toLocaleString()} kcal
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 36, alignItems: 'center' }}>
          {/* Donut */}
          <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0 }}>
            <Ring pct={Math.min(calPct, 1)} color={ringColor} size={180} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, textAlign: 'center', pointerEvents: 'none' }}>
              <span className="text-sm font-semibold uppercase tracking-[.14em]" style={{ color: MUTED }}>Eaten</span>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 40, fontWeight: 600, color: 'white', letterSpacing: '-.02em', lineHeight: 1 }}>
                {Math.round(actual.calories).toLocaleString()}
              </span>
              <span className="text-sm font-mono" style={{ color: MUTED }}>
                of {(goals?.calories ?? 0).toLocaleString()} kcal
              </span>
            </div>
          </div>

          {/* Right: remaining + macro bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[.14em]" style={{ color: MUTED, marginBottom: 6 }}>Remaining</div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 32, fontWeight: 600, color: calOver ? '#f87171' : ACCENT, letterSpacing: '-.01em', lineHeight: 1 }}>
                {remaining != null ? (calOver ? '+' : '') + Math.abs(remaining).toLocaleString() : '—'}
                <span className="text-sm font-normal" style={{ color: MUTED, marginLeft: 6 }}>kcal</span>
              </div>
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ display: 'flex', gap: 28 }}>
              <MacroBar label="Protein" val={actual.proteinG} goal={goals?.proteinG} opacity={0.95} />
              <MacroBar label="Carbs"   val={actual.carbsG}   goal={goals?.carbsG}   opacity={0.70} />
              <MacroBar label="Fat"     val={actual.fatG}     goal={goals?.fatG}     opacity={0.45} />
            </div>
          </div>
        </div>
      </div>

      {/* Right: Hydration */}
      <div className="bg-dram-card border border-dram-border" style={{ padding: '18px 20px' }}>
        <WaterTile waterOz={waterOz} waterGoalOz={waterGoalOz} onAddWater={onAddWater} />
      </div>
    </div>
  );
}
