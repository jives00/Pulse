import { useEffect, useState, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell } from 'recharts';
import { historyApi } from '@pulse/api-client';
import type { DailyHistoryEntry } from '@pulse/api-client';

interface Props {
  calorieGoal?: number | null;
  proteinGoal?: number | null;
}

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shortDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

const BAR_WIDTH = 14;
const BAR_GAP = 3;
const ITEM_WIDTH = BAR_WIDTH + BAR_GAP;
const CHART_HEIGHT = 80;

function CustomTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-xs text-slate-200 shadow-lg">
      <p className="font-medium mb-0.5 text-slate-400">{label}</p>
      <p style={{ color: payload[0]?.fill }}>
        {Math.round(payload[0]?.value)}{unit}
      </p>
    </div>
  );
}

function ScrollChart({ data, dataKey, label, icon, color, goal, unit }: {
  data: DailyHistoryEntry[];
  dataKey: string;
  label: string;
  icon: string;
  color: string;
  goal?: number | null;
  unit: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartWidth = Math.max(data.length * ITEM_WIDTH + 20, 200);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [data.length]);

  return (
    <div className="flex-1 min-w-0 bg-dram-card rounded-xl border border-dram-border px-4 pt-3 pb-2 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-base leading-none">{icon}</span>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
        </div>
        {goal && (
          <span className="text-xs text-slate-500">Goal: {goal}{unit}</span>
        )}
      </div>

      <div ref={scrollRef} className="overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div style={{ width: chartWidth, height: CHART_HEIGHT }}>
          <BarChart
            width={chartWidth}
            height={CHART_HEIGHT}
            data={data}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            barCategoryGap={BAR_GAP}
          >
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval={Math.floor(data.length / 6)}
            />
            <YAxis hide domain={[0, goal ? Math.max(goal * 1.3, Math.max(...data.map(d => (d as any)[dataKey] ?? 0)) * 1.1) : 'auto']} />
            <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            {goal && (
              <ReferenceLine y={goal} stroke={color} strokeDasharray="4 3" strokeOpacity={0.45} strokeWidth={1.5} />
            )}
            <Bar dataKey={dataKey} name={label} maxBarSize={BAR_WIDTH} radius={[3, 3, 0, 0]}>
              {data.map((entry) => {
                const val = (entry as any)[dataKey] ?? 0;
                const over = goal ? val > goal : false;
                const pct = goal ? val / goal : 1;
                const barColor = over ? '#f87171' : pct >= 0.85 ? color : `${color}55`;
                return <Cell key={entry.date} fill={barColor} />;
              })}
            </Bar>
          </BarChart>
        </div>
      </div>
    </div>
  );
}

export default function NutritionHistoryCharts({ calorieGoal, proteinGoal }: Props) {
  const [data, setData] = useState<DailyHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);

    historyApi.daily(dateStr(start), dateStr(end))
      .then((raw) => {
        const byDate = new Map(raw.map((d) => [d.date, d]));
        const filled: DailyHistoryEntry[] = [];
        for (let i = 0; i < 30; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const key = dateStr(d);
          filled.push(byDate.get(key) ?? { date: key, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, entryCount: 0 });
        }
        setData(filled);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex gap-3">
      {['Calories', 'Protein'].map((l) => (
        <div key={l} className="flex-1 bg-dram-card rounded-xl border border-dram-border px-4 py-3 h-[120px] flex items-center justify-center">
          <p className="text-xs text-slate-600">Loading…</p>
        </div>
      ))}
    </div>
  );

  if (error) return (
    <div className="flex gap-3">
      {['Calories', 'Protein'].map((l) => (
        <div key={l} className="flex-1 bg-dram-card rounded-xl border border-dram-border px-4 py-3 h-[120px] flex items-center justify-center">
          <p className="text-xs text-slate-600">Could not load history.</p>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex gap-3">
      <ScrollChart
        data={data}
        dataKey="calories"
        label="Calories"
        icon="🔥"
        color="#60a5fa"
        goal={calorieGoal}
        unit=" kcal"
      />
      <ScrollChart
        data={data}
        dataKey="proteinG"
        label="Protein"
        icon="💪"
        color="#818cf8"
        goal={proteinGoal}
        unit="g"
      />
    </div>
  );
}
