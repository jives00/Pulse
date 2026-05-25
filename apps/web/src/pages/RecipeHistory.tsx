import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  workoutsApi, logApi, measurementsApi,
  type WorkoutSummary,
  type FoodLogHistoryDay, type FoodLogHistoryEntry,
  type BodyMeasurement,
  KG_TO_LBS,
} from '@pulse/api-client';
import Spinner from '../components/Spinner';

type Tab = 'workouts' | 'nutrition' | 'measurements';

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
  initialValue: string;
  initialDate: string;
  initialNotes: string;
  isNew: boolean;
}

function MeasurementModal({
  modal,
  onSave,
  onClose,
}: {
  modal: MeasurementEditModal;
  onSave: (value: string, date: string, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(modal.initialValue);
  const [date, setDate] = useState(modal.initialDate);
  const [notes, setNotes] = useState(modal.initialNotes);
  const [saving, setSaving] = useState(false);
  const metaUnit = METRICS.find((m) => m.key === modal.metric)?.unit ?? '';

  async function handleSave() {
    setSaving(true);
    try { await onSave(value, date, notes); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dram-card border border-dram-border rounded-xl p-5 w-full max-w-sm mx-4 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-white text-base">
          {modal.isNew ? 'Add' : 'Edit'} {METRICS.find((m) => m.key === modal.metric)?.label}
        </h2>
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-sm text-gray-400">Value ({metaUnit})</label>
            <input
              type="number"
              step="0.1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-sm text-gray-400">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent [color-scheme:dark]"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-400">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. morning, post-workout"
            className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent placeholder:text-gray-600"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !value || !date}
            className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function todayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const [editModal, setEditModal] = useState<MeasurementEditModal | null>(null);
  const [metricFilter, setMetricFilter] = useState<string>('all');

  useEffect(() => {
    workoutsApi.getAll({ limit: 200 }).then(setWorkouts).finally(() => setWorkoutsLoading(false));
    logApi.getHistory(90).then(setFoodLogDays).finally(() => setNutritionLoading(false));
    measurementsApi.getAll().then(setMeasurements).finally(() => setMeasurementsLoading(false));
  }, []);

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
    setEditModal({ entry: null, metric, initialValue: '', initialDate: todayStr(), initialNotes: '', isNew: true });
  }

  function openEditMeasurement(entry: BodyMeasurement) {
    setEditModal({ entry, metric: entry.metric, initialValue: String(entry.value), initialDate: entry.measuredAt, initialNotes: entry.notes ?? '', isNew: false });
  }

  async function saveMeasurement(value: string, date: string, notes: string) {
    if (!editModal) return;
    const val = parseFloat(value);
    if (isNaN(val) || !date) return;
    const metaUnit = METRICS.find((m) => m.key === editModal.metric)?.unit ?? 'lbs';
    if (editModal.isNew) {
      const created = await measurementsApi.add({ metric: editModal.metric, value: val, unit: metaUnit, measuredAt: date, notes: notes || undefined });
      setMeasurements((prev) => [created, ...prev].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)));
    } else if (editModal.entry) {
      const updated = await measurementsApi.update(editModal.entry.id, { value: val, measuredAt: date, notes: notes || undefined });
      setMeasurements((prev) => prev.map((m) => m.id === updated.id ? updated : m));
    }
    setEditModal(null);
  }

  async function deleteMeasurement(id: number) {
    if (!confirm('Delete this entry?')) return;
    await measurementsApi.delete(id).catch(() => {});
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }

  const workoutGroups = groupWorkoutsByDate(workouts);
  const loading = activeTab === 'workouts' ? workoutsLoading : activeTab === 'nutrition' ? nutritionLoading : measurementsLoading;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dram-bg text-white">
      {/* Toolbar */}
      <div className="px-6 pt-5 pb-0 border-b border-dram-border flex-shrink-0">
        <h1 className="text-xl font-semibold text-slate-200">History</h1>
        <div className="flex gap-1 mt-3">
          {(['workouts', 'nutrition', 'measurements'] as Tab[]).map((tab) => (
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
        {loading ? (
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
                        className="bg-dram-card border border-dram-border hover:border-dram-accent/40 px-4 py-3 cursor-pointer group transition"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-medium text-white">
                              {w.name ?? w.routineName ?? fmtWorkoutDate(w.workoutDate)}
                            </p>
                            {(w.name ?? w.routineName) && (
                              <p className="text-sm text-gray-500">{fmtWorkoutDate(w.workoutDate)}</p>
                            )}
                            <p className="text-sm text-gray-500 mt-0.5">
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
                    <div className="bg-dram-card border border-dram-border overflow-hidden">
                      {/* Day totals */}
                      <div className="px-4 py-3 border-b border-dram-border flex gap-6">
                        <div>
                          <p className="text-sm text-gray-500 uppercase tracking-wide">Calories</p>
                          <p className="text-base font-semibold text-white">{day.calories.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 uppercase tracking-wide">Protein</p>
                          <p className="text-base font-semibold text-white">{day.protein}g</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 uppercase tracking-wide">Carbs</p>
                          <p className="text-base font-semibold text-white">{mealCarbs(day.entries)}g</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 uppercase tracking-wide">Fat</p>
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
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-1 bg-dram-card rounded-lg p-1">
                <button
                  onClick={() => setMetricFilter('all')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${metricFilter === 'all' ? 'bg-dram-accent text-black font-semibold' : 'text-dram-muted hover:text-slate-200'}`}
                >
                  All
                </button>
                {METRICS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setMetricFilter(metricFilter === key ? 'all' : key)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${metricFilter === key ? 'bg-dram-accent text-black font-semibold' : 'text-dram-muted hover:text-slate-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
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
            </div>
            {measurements.filter((m) => metricFilter === 'all' || m.metric === metricFilter).length === 0 ? (
              <div className="bg-dram-card border border-dram-border px-4 py-8 text-sm text-gray-500 text-center">
                {metricFilter === 'all' ? 'No measurements logged yet' : `No ${METRICS.find((m) => m.key === metricFilter)?.label ?? metricFilter} measurements logged yet`}
              </div>
            ) : (
              <div className="bg-dram-card border border-dram-border overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[1fr_1fr_160px_60px] px-4 py-2 border-b border-dram-border">
                  <p className="text-sm text-gray-500 uppercase tracking-wide">Measurement</p>
                  <p className="text-sm text-gray-500 uppercase tracking-wide">Value</p>
                  <p className="text-sm text-gray-500 uppercase tracking-wide">Date</p>
                  <p />
                </div>
                {[...measurements]
                  .filter((m) => metricFilter === 'all' || m.metric === metricFilter)
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
                  <p className="text-sm text-gray-500 uppercase tracking-wide">{label}</p>
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
      {editModal && (
        <MeasurementModal
          modal={editModal}
          onSave={saveMeasurement}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  );
}
