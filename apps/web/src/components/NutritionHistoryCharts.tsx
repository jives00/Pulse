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

const BAR_WIDTH = 22;
const BAR_GAP = 4;
const ITEM_WIDTH = BAR_WIDTH + BAR_GAP;

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill }}>
          {p.name}: {Math.round(p.value)}{p.name === 'Protein' ? 'g' : ' kcal'}
        </p>
      ))}
    </div>
  );
}

function ScrollChart({ data, dataKey, name, color, goal, unit }: {
  data: DailyHistoryEntry[];
  dataKey: string;
  name: string;
  color: string;
  goal?: number | null;
  unit: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartWidth = Math.max(data.length * ITEM_WIDTH + 40, 300);

  // Scroll to right on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [data.length]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-300">{name}</span>
        {goal && <span className="text-xs text-slate-500">Goal: {goal}{unit}</span>}
      </div>
      <div ref={scrollRef} className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600">
        <div style={{ width: chartWidth, height: 120 }}>
          <BarChart
            width={chartWidth}
            height={120}
            data={data}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            barCategoryGap={BAR_GAP}
          >
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 10, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              interval={Math.floor(data.length / 8)}
            />
            <YAxis hide domain={[0, goal ? Math.max(goal * 1.3, Math.max(...data.map(d => (d as any)[dataKey])) * 1.1) : 'auto']} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            {goal && (
              <ReferenceLine y={goal} stroke={color} strokeDasharray="4 3" strokeOpacity={0.5} strokeWidth={1.5} />
            )}
            <Bar dataKey={dataKey} name={name} maxBarSize={BAR_WIDTH} radius={[3, 3, 0, 0]}>
              {data.map((entry) => {
                const val = (entry as any)[dataKey];
                const over = goal ? val > goal : false;
                const pct = goal ? val / goal : 1;
                const barColor = over ? '#f87171' : pct >= 0.85 ? color : `${color}80`;
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
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="bg-slate-800 rounded-xl p-4">
      <p className="text-xs text-slate-500 text-center py-4">Loading history…</p>
    </div>
  );

  if (error || data.length === 0) return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">Last 30 Days</h3>
      <p className="text-xs text-slate-500 text-center py-4">
        {error ? 'Could not load history.' : 'No nutrition data logged yet.'}
      </p>
    </div>
  );

  return (
    <div className="bg-slate-800 rounded-xl p-4 space-y-5">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Last 30 Days</h3>
      <ScrollChart
        data={data}
        dataKey="calories"
        name="Calories"
        color="#60a5fa"
        goal={calorieGoal}
        unit=" kcal"
      />
      <ScrollChart
        data={data}
        dataKey="proteinG"
        name="Protein"
        color="#818cf8"
        goal={proteinGoal}
        unit="g"
      />
    </div>
  );
}
