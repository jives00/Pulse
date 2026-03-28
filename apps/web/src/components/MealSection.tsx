import type { LogEntry, MealSlot } from '@food-tracker/api-client';
import { useLogStore } from '../store/logStore';

const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

interface Props {
  meal: MealSlot;
  entries: LogEntry[];
  onAdd: (meal: MealSlot) => void;
}

export default function MealSection({ meal, entries, onAdd }: Props) {
  const removeEntry = useLogStore((s) => s.removeEntry);
  const total = entries.reduce((sum, e) => sum + e.nutrition.calories, 0);

  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200 uppercase tracking-wide">
            {MEAL_LABELS[meal]}
          </span>
          {entries.length > 0 && (
            <span className="text-xs text-slate-400">· {Math.round(total)} cal</span>
          )}
        </div>
        <button
          onClick={() => onAdd(meal)}
          className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
        >
          + Add
        </button>
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="px-4 py-3 text-sm text-slate-600 italic">Nothing logged yet</div>
      ) : (
        <div className="divide-y divide-slate-700/50">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center px-4 py-2.5 hover:bg-slate-800/50 group">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-200 truncate">{entry.food.name}</div>
                <div className="text-xs text-slate-500">
                  {entry.quantity} × {entry.servingSize.label}
                  {entry.food.brand && ` · ${entry.food.brand}`}
                </div>
              </div>
              <div className="flex items-center gap-3 ml-3 shrink-0">
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
