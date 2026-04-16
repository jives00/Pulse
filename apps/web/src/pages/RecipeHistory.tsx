import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  workoutsApi, logApi, measurementsApi, historyApi, goalsApi,
  type WorkoutSummary,
  type FoodLogHistoryDay, type FoodLogHistoryEntry,
  type BodyMeasurement,
  type DailyHistoryEntry, type WeeklyHistoryEntry, type UserGoals,
  KG_TO_LBS,
} from '@pulse/api-client';
import Spinner from '../components/Spinner';
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

type Tab = 'workouts' | 'nutrition' | 'measurements' | 'charts';

type ChartRange = '14d' | '30d' | '90d';
const CHART_RANGES: { label: string; value: ChartRange; days: number }[] = [
  { label: '2 weeks', value: '14d', days: 14 },
  { label: '30 days', value: '30d', days: 30 },
  { label: '90 days', value: '90d', days: 90 },
];

function chartDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtChartDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const METRICS = [
  { key: 'weight', label: 'Weight', unit: 'lbs' },
  { key: 'waist', label: 'Waist', unit: 'in' },
  { key: 'bicep', label: 'Bicep', unit: 'in' },
];

function groupWorkoutsByDate(workouts: WorkoutSummary[]): { label: string; workouts: WorkoutSummary[] }[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fmtKey = (d: Date) => d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const todayKey = fmtKey(today);
  const yesterdayKey = fmtKey(yesterday);

  const groups: Map<string, WorkoutSummary[]> = new Map();
  for (const w of workouts) {
    const d = new Date(w.workoutDate + 'T12:00:00');
    const key = fmtKey(d);
    const label = key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : key;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(w);
  }
  return Array.from(groups.entries()).map(([label, workouts]) => ({ label, workouts }));
}

function fmtWorkoutDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fmt = (dt: Date) => dt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  if (fmt(d) === fmt(today)) return 'Today';
  if (fmt(d) === fmt(yesterday)) return 'Yesterday';
  return fmt(d);
}

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

function mealCalories(entries: FoodLogHistoryEntry[]): number {
  return Math.round(entries.reduce((s, e) => s + e.calories, 0));
}
function mealProtein(entries: FoodLogHistoryEntry[]): number {
  return Math.round(entries.reduce((s, e) => s + e.proteinG, 0) * 10) / 10;
}
function mealCarbs(entries: FoodLogHistoryEntry[]): number {
  return Math.round(entries.reduce((s, e) => s + e.carbsG, 0) * 10) / 10;
}
function mealFat(entries: FoodLogHistoryEntry[]): number {
  return Math.round(entries.reduce((s, e) => s + e.fatG, 0) * 10) / 10;
}

// ── Measurement edit modal ────────────────────────────────────────────────────

interface MeasurementEditModal {
  entry: BodyMeasurement | null;
  metric: string;
  value: string;
  date: string;
  notes: string;
  isNew: boolean;
}

const EMPTY_MODAL: MeasurementEditModal = { entry: null, metric: '', value: '', date: '', notes: '', isNew: false };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function History() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('workouts');

  // Workout state
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [workoutsLoading, setWorkoutsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Nutrition log history state
  const [foodLogDays, setFoodLogDays] = useState<FoodLogHistoryDay[]>([]);
  const [nutritionLoading, setNutritionLoading] = useState(true);
  const [foodDetail, setFoodDetail] = useState<FoodLogHistoryEntry | null>(null);

  // Measurements state
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [measurementsLoading, setMeasurementsLoading] = useState(true);
  const [editModal, setEditModal] = useState<MeasurementEditModal>(EMPTY_MODAL);
  const [savingMeasurement, setSavingMeasurement] = useState(false);

  // Charts state
  const [chartRange, setChartRange] = useState<ChartRange>('30d');
  const [chartDaily, setChartDaily] = useState<DailyHistoryEntry[]>([]);
  const [chartWeekly, setChartWeekly] = useState<WeeklyHistoryEntry[]>([]);
  const [chartGoals, setChartGoals] = useState<UserGoals | null>(null);
  const [chartsLoading, setChartsLoading] = useState(false);

  useEffect(() => {
    workoutsApi.getAll({ limit: 200 }).then(setWorkouts).finally(() => setWorkoutsLoading(false));
    logApi.getHistory(90).then(setFoodLogDays).finally(() => setNutritionLoading(false));
    measurementsApi.getAll().then(setMeasurements).finally(() => setMeasurementsLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab !== 'charts') return;
    const rangeDef = CHART_RANGES.find((r) => r.value === chartRange)!;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - rangeDef.days + 1);
    setChartsLoading(true);
    Promise.all([
      historyApi.daily(chartDateStr(start), chartDateStr(end)),
      historyApi.weekly(end.getFullYear()),
      goalsApi.get().catch(() => null),
    ]).then(([d, w, g]) => {
      setChartDaily(d);
      setChartWeekly(w);
      setChartGoals(g);
    }).finally(() => setChartsLoading(false));
  }, [activeTab, chartRange]);

  async function handleDeleteWorkout(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!confirm('Delete this workout?')) return;
    setDeletingId(id);
    try {
      await workoutsApi.delete(id);
      setWorkouts((prev) => prev.filter((w) => w.id !== id));
    } catch { /* ignore */ } finally { setDeletingId(null); }
  }

  function openNewMeasurement(metric: string) {
    setEditModal({ entry: null, metric, value: '', date: todayStr(), notes: '', isNew: true });
  }

  function openEditMeasurement(entry: BodyMeasurement) {
    setEditModal({ entry, metric: entry.metric, value: String(entry.value), date: entry.measuredAt, notes: entry.notes ?? '', isNew: false });
  }

  async function saveMeasurement() {
    const val = parseFloat(editModal.value);
    if (isNaN(val) || !editModal.date) return;
    const metaUnit = METRICS.find((m) => m.key === editModal.metric)?.unit ?? 'lbs';
    setSavingMeasurement(true);
    try {
      if (editModal.isNew) {
        const created = await measurementsApi.add({ metric: editModal.metric, value: val, unit: metaUnit, measuredAt: editModal.date, notes: editModal.notes || undefined });
        setMeasurements((prev) => [created, ...prev].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)));
      } else if (editModal.entry) {
        const updated = await measurementsApi.update(editModal.entry.id, { value: val, measuredAt: editModal.date, notes: editModal.notes || undefined });
        setMeasurements((prev) => prev.map((m) => m.id === updated.id ? updated : m));
      }
      setEditModal(EMPTY_MODAL);
    } catch { /* keep open */ } finally { setSavingMeasurement(false); }
  }

  async function deleteMeasurement(id: number) {
    if (!confirm('Delete this entry?')) return;
    await measurementsApi.delete(id).catch(() => {});
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }

  const workoutGroups = groupWorkoutsByDate(workouts);
  const loading = activeTab === 'workouts' ? workoutsLoading : activeTab === 'nutrition' ? nutritionLoading : activeTab === 'measurements' ? measurementsLoading : false;

  // Charts derived values
  const calGoal = chartGoals?.calories ?? 2000;
  const chartDays = CHART_RANGES.find((r) => r.value === chartRange)!.days;
  const filledDaily = (() => {
    const map = new Map(chartDaily.map((d) => [d.date, d]));
    const result: (DailyHistoryEntry & { display: string })[] = [];
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = chartDateStr(d);
      const entry = map.get(iso);
      result.push({
        date: iso,
        display: fmtChartDate(iso),
        calories: entry?.calories ?? 0,
        carbsG: entry?.carbsG ?? 0,
        proteinG: entry?.proteinG ?? 0,
        fatG: entry?.fatG ?? 0,
        entryCount: entry?.entryCount ?? 0,
      });
    }
    return result;
  })();
  const chartCutoff = (() => {
    const d = new Date();
    d.setDate(d.getDate() - chartDays + 1);
    return chartDateStr(d);
  })();
  const filteredWeekly = chartWeekly.filter((w) => w.endDate >= chartCutoff);
  const avgCal = chartDaily.length
    ? Math.round(chartDaily.reduce((s, d) => s + d.calories, 0) / chartDaily.length)
    : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dram-bg text-white">
      {/* Toolbar */}
      <div className="px-6 pt-5 pb-0 border-b border-dram-border flex-shrink-0">
        <h1 className="text-xl font-semibold text-slate-200">History</h1>
        <div className="flex gap-1 mt-3">
          {(['workouts', 'nutrition', 'measurements', 'charts'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                activeTab === tab
                  ? 'border-dram-accent text-dram-accent'
                  : 'border-transparent text-dram-muted hover:text-slate-200'
              }`}
            >
              {tab === 'measurements' ? 'Measurements' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'charts' ? (
          chartsLoading ? (
            <div className="flex justify-center mt-16"><Spinner size={10} /></div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Range selector */}
              <div className="flex justify-end">
                <div className="flex gap-1 bg-dram-card rounded-lg p-1">
                  {CHART_RANGES.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setChartRange(r.value)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        chartRange === r.value
                          ? 'bg-dram-accent text-black font-semibold'
                          : 'text-dram-muted hover:text-slate-200'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Days logged', value: chartDaily.length },
                  { label: 'Avg calories', value: avgCal },
                  { label: 'Calorie goal', value: calGoal },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-dram-card border border-dram-border rounded-xl p-4 text-center">
                    <div className="text-2xl font-semibold text-slate-100">{value.toLocaleString()}</div>
                    <div className="text-xs text-slate-500 mt-1">{label}</div>
                  </div>
                ))}
              </div>

              {/* Calorie line chart */}
              <div className="bg-dram-card border border-dram-border rounded-xl p-4">
                <h2 className="text-sm font-medium text-slate-300 mb-4">Calories</h2>
                {chartDaily.length === 0 ? (
                  <div className="text-center text-slate-600 text-sm py-8">No data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={filledDaily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="display" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} interval={Math.floor(chartDays / 6)} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                        labelStyle={{ color: '#cbd5e1', fontSize: 12 }}
                        itemStyle={{ color: '#10b981', fontSize: 12 }}
                        formatter={(v: number) => [v ? `${v} kcal` : '–', 'Calories']}
                      />
                      <ReferenceLine y={calGoal} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.6} />
                      <Line type="monotone" dataKey="calories" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#10b981' }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Macro bar chart */}
              <div className="bg-dram-card border border-dram-border rounded-xl p-4">
                <h2 className="text-sm font-medium text-slate-300 mb-4">Macros per day</h2>
                {chartDaily.length === 0 ? (
                  <div className="text-center text-slate-600 text-sm py-8">No data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={filledDaily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barSize={chartRange === '90d' ? 3 : 6}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="display" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} interval={Math.floor(chartDays / 6)} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
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
              <div className="bg-dram-card border border-dram-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dram-border">
                  <h2 className="text-sm font-medium text-slate-300">Weekly averages</h2>
                </div>
                {filteredWeekly.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-600">No data yet</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-dram-border">
                        <th className="px-4 py-2 text-left font-normal">Week of</th>
                        <th className="px-4 py-2 text-right font-normal">Calories</th>
                        <th className="px-4 py-2 text-right font-normal">Carbs</th>
                        <th className="px-4 py-2 text-right font-normal">Protein</th>
                        <th className="px-4 py-2 text-right font-normal">Fat</th>
                        <th className="px-4 py-2 text-right font-normal">Days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dram-border/50">
                      {filteredWeekly.map((w) => {
                        const over = w.avgCalories > calGoal * 1.1;
                        const under = w.avgCalories < calGoal * 0.9 && w.avgCalories > 0;
                        return (
                          <tr key={`${w.year}-${w.week}`} className="hover:bg-white/5">
                            <td className="px-4 py-2.5 text-slate-300">{fmtChartDate(w.startDate)}</td>
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
            </div>
          )
        ) : loading ? (
          <div className="flex justify-center mt-16"><Spinner size={10} /></div>
        ) : activeTab === 'workouts' ? (
          /* ── Workout history ─────────────────────────────────────── */
          workouts.length === 0 ? (
            <div className="flex flex-col items-center mt-20 text-gray-600">
              <span className="text-5xl mb-3">🏋️</span>
              <p className="text-lg">No workouts yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 max-w-2xl">
              {workoutGroups.map((group) => (
                <div key={group.label}>
                  <p className="text-sm text-gray-500 uppercase tracking-wide mb-2">{group.label}</p>
                  <div className="flex flex-col gap-2">
                    {group.workouts.map((w) => (
                      <div
                        key={w.id}
                        onClick={() => navigate(`/workouts/${w.id}`)}
                        className="bg-dram-card border border-dram-border hover:border-dram-accent/40 rounded-xl px-4 py-3 cursor-pointer group transition"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-medium text-white">
                              {w.name ?? w.routineName ?? fmtWorkoutDate(w.workoutDate)}
                            </p>
                            {(w.name ?? w.routineName) && (
                              <p className="text-sm text-gray-500">{fmtWorkoutDate(w.workoutDate)}</p>
                            )}
                            <p className="text-xs text-gray-500 mt-0.5">
                              {w.durationMinutes != null && `${w.durationMinutes} min · `}
                              {Math.round((w.totalVolumeKg ?? 0) * KG_TO_LBS).toLocaleString()} lbs volume
                            </p>
                          </div>
                          <button
                            onClick={(e) => handleDeleteWorkout(e, w.id)}
                            disabled={deletingId === w.id}
                            className="text-gray-600 hover:text-red-400 transition text-lg leading-none shrink-0 opacity-0 group-hover:opacity-100 disabled:opacity-50 mt-0.5"
                            title="Delete workout"
                          >
                            ×
                          </button>
                        </div>
                        {w.exercises.length > 0 && (
                          <div className="mt-2 space-y-0.5">
                            {w.exercises.map((ex) => (
                              <div key={ex.name} className="flex items-baseline gap-2 text-sm">
                                <span className="text-slate-300 truncate">{ex.name}</span>
                                <span className="text-slate-500 shrink-0">
                                  {ex.setCount} {ex.setCount === 1 ? 'set' : 'sets'}
                                  {ex.avgReps != null && ` × ${ex.avgReps} reps`}
                                  {ex.maxWeightKg != null && ` · ${Math.round(ex.maxWeightKg * KG_TO_LBS * 10) / 10} lbs`}
                                  {ex.totalDurationSeconds != null && ` · ${Math.floor(ex.totalDurationSeconds / 60)}:${String(ex.totalDurationSeconds % 60).padStart(2, '0')}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeTab === 'nutrition' ? (
          /* ── Nutrition log history ───────────────────────────────── */
          foodLogDays.length === 0 ? (
            <div className="flex flex-col items-center mt-20 text-gray-600">
              <span className="text-5xl mb-3">🥗</span>
              <p className="text-lg">No nutrition logs yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 max-w-2xl">
              {foodLogDays.map((day) => {
                const byMeal = day.entries.reduce<Record<string, FoodLogHistoryEntry[]>>((acc, e) => {
                  if (!acc[e.meal]) acc[e.meal] = [];
                  acc[e.meal].push(e);
                  return acc;
                }, {});
                return (
                  <div key={day.date}>
                    <p className="text-sm text-gray-500 uppercase tracking-wide mb-2">{dayLabel(day.date)}</p>
                    <div className="bg-dram-card border border-dram-border rounded-xl overflow-hidden">
                      {/* Day totals */}
                      <div className="px-4 py-3 border-b border-dram-border flex gap-6">
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Calories</p>
                          <p className="text-base font-semibold text-white">{day.calories.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Protein</p>
                          <p className="text-base font-semibold text-white">{day.protein}g</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Carbs</p>
                          <p className="text-base font-semibold text-white">{mealCarbs(day.entries)}g</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Fat</p>
                          <p className="text-base font-semibold text-white">{mealFat(day.entries)}g</p>
                        </div>
                      </div>

                      {/* Meals */}
                      {MEAL_ORDER.filter((m) => byMeal[m]?.length).map((meal, mIdx, arr) => (
                        <div key={meal} className={mIdx < arr.length - 1 ? 'border-b border-dram-border' : ''}>
                          {/* Meal header */}
                          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-300 capitalize">{meal}</p>
                            <p className="text-sm text-gray-500">
                              {mealCalories(byMeal[meal])} cal · {mealProtein(byMeal[meal])}g P · {mealCarbs(byMeal[meal])}g C · {mealFat(byMeal[meal])}g F
                            </p>
                          </div>
                          {/* Meal items */}
                          <div className="pb-2">
                            {byMeal[meal].map((e) => (
                              <button
                                key={e.id}
                                onClick={() => setFoodDetail(e)}
                                className="w-full flex items-baseline justify-between gap-2 px-4 py-1.5 hover:bg-white/5 transition text-left"
                              >
                                <div className="flex-1 min-w-0">
                                  <span className="text-base text-white">{e.foodName}</span>
                                  {e.brand && <span className="text-sm text-gray-500 ml-1.5">{e.brand}</span>}
                                  <span className="text-sm text-gray-500 ml-1.5">· {e.quantity} × {e.servingLabel}</span>
                                </div>
                                <span className="text-sm text-gray-400 shrink-0">{e.calories} cal</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* ── Body Measurements ───────────────────────────────────── */
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="flex justify-end gap-2">
              {METRICS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => openNewMeasurement(key)}
                  className="text-sm text-dram-accent hover:brightness-110 transition"
                >
                  + {label}
                </button>
              ))}
            </div>
            {measurements.length === 0 ? (
              <div className="bg-dram-card border border-dram-border rounded-xl px-4 py-8 text-sm text-gray-500 text-center">
                No measurements logged yet
              </div>
            ) : (
              <div className="bg-dram-card border border-dram-border rounded-xl overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[1fr_1fr_160px_60px] px-4 py-2 border-b border-dram-border">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Measurement</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Value</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Date</p>
                  <p />
                </div>
                {[...measurements]
                  .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt) || a.metric.localeCompare(b.metric))
                  .map((entry, idx, arr) => {
                    const meta = METRICS.find((m) => m.key === entry.metric);
                    return (
                      <div
                        key={entry.id}
                        className={`grid grid-cols-[1fr_1fr_160px_60px] items-center px-4 py-3 group ${idx < arr.length - 1 ? 'border-b border-dram-border' : ''}`}
                      >
                        <p className="text-base text-white capitalize">{meta?.label ?? entry.metric}</p>
                        <p className="text-base font-semibold text-white">{entry.value} {meta?.unit ?? entry.unit}</p>
                        <span className="text-sm text-gray-500">
                          {new Date(entry.measuredAt + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => openEditMeasurement(entry)}
                            className="text-gray-500 hover:text-dram-accent transition text-sm px-1.5 py-0.5 rounded"
                            title="Edit"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => deleteMeasurement(entry.id)}
                            className="text-gray-500 hover:text-red-400 transition text-lg px-1 leading-none"
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Food detail modal */}
      {foodDetail && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setFoodDetail(null)}
        >
          <div
            className="bg-dram-card border border-dram-border rounded-xl p-5 w-full max-w-sm mx-4 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="font-semibold text-white text-base">{foodDetail.foodName}</h2>
              {foodDetail.brand && <p className="text-sm text-gray-400 mt-0.5">{foodDetail.brand}</p>}
              <p className="text-sm text-gray-500 mt-0.5">{foodDetail.quantity} × {foodDetail.servingLabel}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Calories', value: `${foodDetail.calories}` },
                { label: 'Protein', value: `${foodDetail.proteinG}g` },
                { label: 'Carbs', value: `${foodDetail.carbsG}g` },
                { label: 'Fat', value: `${foodDetail.fatG}g` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                  <p className="text-base font-semibold text-white mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setFoodDetail(null)}
              className="self-end px-4 py-2 text-sm text-gray-400 hover:text-white transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Measurement edit/add modal */}
      {editModal.metric && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setEditModal(EMPTY_MODAL)}
        >
          <div
            className="bg-dram-card border border-dram-border rounded-xl p-5 w-full max-w-sm mx-4 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-white text-base">
              {editModal.isNew ? 'Add' : 'Edit'} {METRICS.find((m) => m.key === editModal.metric)?.label}
            </h2>

            <div className="flex gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-gray-400">Value ({METRICS.find((m) => m.key === editModal.metric)?.unit})</label>
                <input
                  type="number"
                  step="0.1"
                  value={editModal.value}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, value: e.target.value }))}
                  className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-gray-400">Date</label>
                <input
                  type="date"
                  value={editModal.date}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, date: e.target.value }))}
                  className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Notes (optional)</label>
              <input
                type="text"
                value={editModal.notes}
                onChange={(e) => setEditModal((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g. morning, post-workout"
                className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent placeholder:text-gray-600"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditModal(EMPTY_MODAL)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={saveMeasurement}
                disabled={savingMeasurement || !editModal.value || !editModal.date}
                className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition disabled:opacity-40"
              >
                {savingMeasurement ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
