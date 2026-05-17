interface MacroBarProps {
  label: string;
  value: number;
  goal: number;
  unit?: string;
  color?: string;
}

export default function MacroBar({ label, value, goal, unit = 'g', color = 'bg-brand-500' }: MacroBarProps) {
  const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
  const over = goal > 0 && value > goal;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm text-slate-400">
        <span>{label}</span>
        <span className={over ? 'text-red-400' : ''}>
          {Math.round(value)}{unit} / {goal}{unit}
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
