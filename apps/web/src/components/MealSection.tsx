import { useState } from 'react';
import type { LogEntry, MealSlot } from '@pulse/api-client';
import { useLogStore } from '../store/logStore';

const MEAL_META: Record<MealSlot, { label: string; emoji: string; from: string; color: string }> = {
  breakfast: { label: 'Breakfast', emoji: '🍳', from: 'from-amber-500/20',  color: '#f59e0b' },
  lunch:     { label: 'Lunch',     emoji: '🥗', from: 'from-green-500/20',  color: '#22c55e' },
  dinner:    { label: 'Dinner',    emoji: '🍽️', from: 'from-blue-500/20',   color: '#60a5fa' },
  snack:     { label: 'Snacks',    emoji: '🍎', from: 'from-rose-500/20',   color: '#f87171' },
};

interface Props {
  meal: MealSlot;
  entries: LogEntry[];
  onAdd: (meal: MealSlot) => void; // reserved for global add button
  photoUrl?: string | null;
}

export default function MealSection({ meal, entries, photoUrl }: Props) {
  const removeEntry = useLogStore((s) => s.removeEntry);
  const [expanded, setExpanded] = useState(false);
  const meta = MEAL_META[meal];

  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.nutrition.calories  ?? 0),
      protein:  acc.protein  + (e.nutrition.protein  ?? 0),
      carbs:    acc.carbs    + (e.nutrition.carbs    ?? 0),
      fat:      acc.fat      + (e.nutrition.fat      ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <div className="flex flex-col bg-dram-card border border-dram-border rounded-2xl overflow-hidden">

      {/* Photo header */}
      <div className="relative h-32 overflow-hidden bg-dram-border flex-shrink-0">
        {photoUrl ? (
          <img src={photoUrl} alt={meta.label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">
            {meta.emoji}
          </div>
        )}
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
        {/* Text on top of photo */}
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-2">
          <div className="text-sm font-semibold uppercase tracking-wider text-white/80">{meta.label}</div>
          <div className="text-2xl font-bold text-white leading-tight">{Math.round(totals.calories)} <span className="text-sm font-normal text-white/60">kcal</span></div>
        </div>
      </div>

      {/* Item count */}
      <button
        onClick={() => entries.length > 0 && setExpanded((v) => !v)}
        className="text-xs font-semibold py-1.5 transition-colors"
        style={{ color: entries.length > 0 ? meta.color : '#475569' }}
      >
        {entries.length > 0 ? `${entries.length} item${entries.length !== 1 ? 's' : ''}` : 'Nothing logged'}
      </button>

      {/* Macros */}
      <div className="px-3 pb-3 space-y-1.5">
        {[
          { icon: '🌾', label: 'Carbs',   val: totals.carbs,   color: '#fb923c' },
          { icon: '💪', label: 'Protein', val: totals.protein, color: '#818cf8' },
          { icon: '🥑', label: 'Fat',     val: totals.fat,     color: '#facc15' },
        ].map(({ icon, label, val, color }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-400 text-sm">
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </div>
            <span className="text-sm font-semibold" style={{ color }}>{Math.round(val)}g</span>
          </div>
        ))}
      </div>

      {/* Expanded item list */}
      {expanded && entries.length > 0 && (
        <div className="border-t border-dram-border divide-y divide-dram-border/50">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center px-3 py-2 hover:bg-white/5 group">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-100 truncate">{entry.food.name}</div>
                <div className="text-sm text-slate-400">
                  {entry.quantity} × {entry.servingSize.label}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <span className="text-sm text-slate-300">{Math.round(entry.nutrition.calories)} cal</span>
                <button
                  onClick={() => removeEntry(entry.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
