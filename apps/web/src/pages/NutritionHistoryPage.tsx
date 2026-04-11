import { useState, useEffect } from 'react';
import { apiClient } from '@pulse/api-client';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { historyApi, goalsApi } from '@pulse/api-client';
import type { DailyHistoryEntry, WeeklyHistoryEntry, UserGoals } from '@pulse/api-client';

type Range = '14d' | '30d' | '90d';

const RANGES: { label: string; value: Range; days: number }[] = [
  { label: '2 weeks', value: '14d', days: 14 },
  { label: '30 days', value: '30d', days: 30 },
  { label: '90 days', value: '90d', days: 90 },
];

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtWeek(entry: WeeklyHistoryEntry) {
  return fmtDate(entry.startDate);
}

export default function HistoryPage() {
  const [range, setRange] = useState<Range>('30d');
  const [daily, setDaily] = useState<DailyHistoryEntry[]>([]);
  const [weekly, setWeekly] = useState<WeeklyHistoryEntry[]>([]);
  const [goals, setGoals] = useState<UserGoals | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const days = RANGES.find((r) => r.value === range)!.days;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    const year = end.getFullYear();

    setLoading(true);
    Promise.all([
      historyApi.daily(dateStr(start), dateStr(end)),
      historyApi.weekly(year),
      goalsApi.get().catch(() => null),
    ]).then(([d, w, g]) => {
      setDaily(d);
      setWeekly(w);
      setGoals(g);
    }).finally(() => setLoading(false));
  }, [range]);

  async function handleExport() {
    const d = RANGES.find((r) => r.value === range)!.days;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - d + 1);
    setExporting(true);
    try {
      const res = await apiClient.get('/export/excel', {
        params: { start: dateStr(start), end: dateStr(end) },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `food-tracker-${dateStr(start)}-${dateStr(end)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    } finally {
      setExporting(false);
    }
  }

  const calGoal = goals?.calories ?? 2000;

  // Fill missing days with 0 so chart has continuous x-axis
  const days = RANGES.find((r) => r.value === range)!.days;
  const filledDaily = (() => {
    const map = new Map(daily.map((d) => [d.date, d]));
    const result: (DailyHistoryEntry & { display: string })[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = dateStr(d);
      const entry = map.get(iso);
      result.push({
        date: iso,
        display: fmtDate(iso),
        calories: entry?.calories ?? 0,
        carbsG: entry?.carbsG ?? 0,
        proteinG: entry?.proteinG ?? 0,
        fatG: entry?.fatG ?? 0,
        entryCount: entry?.entryCount ?? 0,
      });
    }
    return result;
  })();

  // Only show weeks within the selected range
  const cutoff = (() => {
    const d = new Date();
    d.setDate(d.getDate() - days + 1);
    return dateStr(d);
  })();
  const filteredWeekly = weekly.filter((w) => w.endDate >= cutoff);

  const avgCal = daily.length
    ? Math.round(daily.reduce((s, d) => s + d.calories, 0) / daily.length)
    : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-dram-border flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-200">History</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="border border-dram-border text-slate-300 hover:text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50 transition-colors"
          >
            {exporting ? 'Exporting…' : '↓ Export'}
          </button>
          <div className="flex gap-1 bg-dram-card rounded-lg p-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  range === r.value
                    ? 'bg-dram-accent text-black font-semibold'
                    : 'text-dram-muted hover:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

      {loading && (
        <div className="text-center text-slate-500 py-16">Loading…</div>
      )}

      {!loading && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Days logged', value: daily.length },
              { label: 'Avg calories', value: avgCal },
              { label: 'Calorie goal', value: calGoal },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-semibold text-slate-100">{value.toLocaleString()}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Calorie line chart */}
          <div className="bg-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-medium text-slate-300 mb-4">Calories</h2>
            {daily.length === 0 ? (
              <div className="text-center text-slate-600 text-sm py-8">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={filledDaily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="display"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickLine={false}
                    interval={Math.floor(days / 6)}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#cbd5e1', fontSize: 12 }}
                    itemStyle={{ color: '#10b981', fontSize: 12 }}
                    formatter={(v: number) => [v ? `${v} kcal` : '–', 'Calories']}
                  />
                  <ReferenceLine y={calGoal} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.6} />
                  <Line
                    type="monotone"
                    dataKey="calories"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#10b981' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Macro bar chart */}
          <div className="bg-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-medium text-slate-300 mb-4">Macros per day</h2>
            {daily.length === 0 ? (
              <div className="text-center text-slate-600 text-sm py-8">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={filledDaily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barSize={range === '90d' ? 3 : 6}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="display"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickLine={false}
                    interval={Math.floor(days / 6)}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#cbd5e1', fontSize: 12 }}
                    itemStyle={{ fontSize: 12 }}
                    formatter={(v: number, name: string) => [`${v}g`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  <Bar dataKey="carbsG"   name="Carbs"   fill="#f59e0b" stackId="a" />
                  <Bar dataKey="proteinG" name="Protein" fill="#3b82f6" stackId="a" />
                  <Bar dataKey="fatG"     name="Fat"     fill="#a78bfa" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Weekly summary table */}
          <div className="bg-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h2 className="text-sm font-medium text-slate-300">Weekly averages</h2>
            </div>
            {filteredWeekly.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-600">No data yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-700">
                    <th className="px-4 py-2 text-left font-normal">Week of</th>
                    <th className="px-4 py-2 text-right font-normal">Calories</th>
                    <th className="px-4 py-2 text-right font-normal">Carbs</th>
                    <th className="px-4 py-2 text-right font-normal">Protein</th>
                    <th className="px-4 py-2 text-right font-normal">Fat</th>
                    <th className="px-4 py-2 text-right font-normal">Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filteredWeekly.map((w) => {
                    const over = w.avgCalories > calGoal * 1.1;
                    const under = w.avgCalories < calGoal * 0.9 && w.avgCalories > 0;
                    return (
                      <tr key={`${w.year}-${w.week}`} className="hover:bg-slate-700/30">
                        <td className="px-4 py-2.5 text-slate-300">{fmtWeek(w)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${over ? 'text-red-400' : under ? 'text-yellow-400' : 'text-slate-200'}`}>
                          {Math.round(w.avgCalories).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{Math.round(w.avgCarbsG)}g</td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{Math.round(w.avgProteinG)}g</td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{Math.round(w.avgFatG)}g</td>
                        <td className="px-4 py-2.5 text-right text-slate-500">{w.daysLogged}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
      </div>
      </div>
    </div>
  );
}
