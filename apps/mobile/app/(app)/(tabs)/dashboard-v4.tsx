import { useCallback, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, RefreshControl, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getWorkouts, getGoalsSummary, getMeasurements, getMeasurementGoals,
  getFoodLogHistory, getDailyHistory, getRoutines, getTDEE,
  getRoutineGoals, getExerciseGoals, getAiInsight, getRecovery,
  type WorkoutSummary, type GoalsSummary, type BodyMeasurement, type MeasurementGoal,
  type FoodLogHistoryDay, type DailyHistoryEntry, type RoutineSummary,
  type TDEEBreakdown, type ExerciseGoals,
} from '../../../src/api/client';
import {
  KG_TO_LBS, localDateStr, getWeekStart, shortDate,
  computeGoalPace, computeHighlights,
  type PaceStatus,
} from '../../../../../packages/api-client/src/index';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';

// ── Color constants ───────────────────────────────────────────────────────────
const COL_GOLD    = '#D4A843';
const COL_PROTEIN = '#60a5fa';
const COL_CARBS   = '#34d399';
const COL_FAT     = '#facc15';
const COL_CAL     = '#fb923c';
const COL_TDEE    = '#94a3b8';
const COL_WEIGHT  = '#a78bfa';
const COL_GOOD    = '#7BB389';
const COL_WARN    = '#C9714F';

const PACE_COLORS: Record<PaceStatus, string> = { green: '#34d399', yellow: '#facc15', red: '#f87171', done: '#34d399' };
const PACE_LABELS: Record<PaceStatus, string> = { green: 'On pace', yellow: 'Slightly behind', red: 'Behind', done: 'Done!' };

const TABS = ['now', 'goals', 'history'] as const;
type Tab = typeof TABS[number];

type RecoveryData = { level: 'high' | 'medium' | 'low'; score: number; hint: string };

// ── Calorie ring (pure RN pie technique) ─────────────────────────────────────
function CalorieRing({ pct, color, size = 100, c }: { pct: number; color: string; size?: number; c: Colors }) {
  const clamped = Math.min(Math.max(pct, 0), 1);
  const deg = clamped * 360;
  const sw = 10; const r = size / 2;
  const rot1 = deg <= 180 ? deg - 180 : 0;
  const rot2 = deg > 180 ? -(360 - deg) : 0;
  return (
    <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: r, borderWidth: sw, borderColor: 'rgba(255,255,255,0.08)' }} />
      <View style={{ position: 'absolute', top: 0, left: r, width: r, height: size, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 0, left: -r, width: size, height: size, transform: [{ rotate: `${rot1}deg` }] }}>
          <View style={{ position: 'absolute', top: 0, left: r, width: r, height: size, backgroundColor: color }} />
        </View>
      </View>
      {deg > 180 && (
        <View style={{ position: 'absolute', top: 0, left: 0, width: r, height: size, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, transform: [{ rotate: `${rot2}deg` }] }}>
            <View style={{ position: 'absolute', top: 0, left: 0, width: r, height: size, backgroundColor: color }} />
          </View>
        </View>
      )}
      <View style={{ position: 'absolute', top: sw + 1, left: sw + 1, width: size - sw * 2 - 2, height: size - sw * 2 - 2, borderRadius: (size - sw * 2 - 2) / 2, backgroundColor: c.card }} />
      <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color, fontVariant: ['tabular-nums'] }}>{Math.round(clamped * 100)}%</Text>
      </View>
    </View>
  );
}

// ── Mini line chart with optional projection tail ─────────────────────────────
const CHART_H = 56;
const DOT_R = 2.5;

function MiniLineChart({ data, projection, color, goalLine, maxOverride, minOverride }: {
  data: number[]; projection?: number[]; color: string; goalLine?: number | null; maxOverride?: number; minOverride?: number;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 56;
  const allVals = [...data, ...(projection ?? [])];
  const maxVal = maxOverride ?? Math.max(...allVals, goalLine ?? 0, 1);
  const minVal = minOverride ?? 0;
  const range = maxVal - minVal || 1;
  const total = data.length + (projection?.length ?? 0);
  if (data.length < 2) return <View style={{ height: CHART_H }} />;

  const X = (i: number) => (i / (total - 1)) * chartWidth;
  const Y = (v: number) => CHART_H - DOT_R - Math.max(((v - minVal) / range) * (CHART_H - DOT_R * 2), 0);

  const actualPts = data.map((v, i) => ({ x: X(i), y: Y(v), v }));
  const projPts = (projection ?? []).map((v, i) => ({ x: X(data.length - 1 + i + 1), y: Y(v), v }));

  const goalY = goalLine != null ? Y(goalLine) : null;

  function renderSegments(pts: { x: number; y: number }[], col: string) {
    return pts.map((pt, i) => {
      if (i === pts.length - 1) return null;
      const next = pts[i + 1];
      const dx = next.x - pt.x; const dy = next.y - pt.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      return (
        <View key={i} style={{ position: 'absolute', left: pt.x, top: pt.y - 0.75, width: len, height: 1.5, backgroundColor: col, transformOrigin: 'left center', transform: [{ rotate: `${angle}deg` }] }} />
      );
    });
  }

  return (
    <View style={{ height: CHART_H, width: chartWidth, position: 'relative' }}>
      {goalY != null && <View style={{ position: 'absolute', left: 0, top: goalY - 0.5, width: chartWidth, height: 1, borderStyle: 'dashed', borderTopWidth: 1, borderColor: `${color}44` }} />}
      {renderSegments(actualPts, `${color}99`)}
      {projPts.length > 0 && renderSegments([actualPts.at(-1)!, ...projPts], `${color}44`)}
      {actualPts.map((pt, i) => (
        <View key={i} style={{ position: 'absolute', left: pt.x - DOT_R, top: pt.y - DOT_R, width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: i === actualPts.length - 1 ? color : `${color}88` }} />
      ))}
      {projPts.map((pt, i) => (
        <View key={`p${i}`} style={{ position: 'absolute', left: pt.x - DOT_R, top: pt.y - DOT_R, width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: `${color}44` }} />
      ))}
    </View>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ label, actual, goal, unit, color, c }: {
  label: string; actual: number; goal: number | null; unit: string; color: string; c: Colors;
}) {
  const pct = goal && goal > 0 ? Math.min(actual / goal, 1) : 0;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: fontSize.sm, color: c.muted }}>{label}</Text>
        <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color, fontVariant: ['tabular-nums'] }}>
          {actual.toLocaleString()}{unit}
          {goal != null ? <Text style={{ color: c.muted, fontWeight: '400' }}> / {goal.toLocaleString()}{unit}</Text> : null}
        </Text>
      </View>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct * 100}%` as any, borderRadius: 3, backgroundColor: color }} />
      </View>
    </View>
  );
}

// ── Card header ───────────────────────────────────────────────────────────────
function CardHeader({ title, meta, c }: { title: string; meta?: string; c: Colors }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
      <View style={{ width: 2, height: 14, borderRadius: 1, backgroundColor: COL_GOLD }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>{title}</Text>
        {meta ? <Text style={{ fontSize: 11, color: c.muted, marginTop: 1 }}>{meta}</Text> : null}
      </View>
    </View>
  );
}

// ── Routine heatmap ───────────────────────────────────────────────────────────
function RoutineHeatmap({ workouts, routinesList, c }: { workouts: WorkoutSummary[]; routinesList: RoutineSummary[]; c: Colors }) {
  const { width: screenWidth } = useWindowDimensions();
  const WEEKS = 8;
  const now = new Date();
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (WEEKS - 1 - i) * 7);
    return getWeekStart(localDateStr(d));
  });
  const routineById = Object.fromEntries(routinesList.map((r) => [r.id, r]));
  const routineVol: Record<number, Record<string, number>> = {};
  for (const w of workouts) {
    if (!w.routineId) continue;
    const volLbs = (w.totalVolumeKg ?? 0) * KG_TO_LBS;
    if (volLbs <= 0) continue;
    const ws = getWeekStart(w.workoutDate);
    if (!routineVol[w.routineId]) routineVol[w.routineId] = {};
    routineVol[w.routineId][ws] = (routineVol[w.routineId][ws] ?? 0) + volLbs;
  }
  const ids = Object.keys(routineVol).map(Number).filter((id) => weeks.some((ws) => (routineVol[id][ws] ?? 0) > 0));
  if (ids.length === 0) return <Text style={{ fontSize: fontSize.sm, color: c.muted, textAlign: 'center', paddingVertical: 8 }}>No data yet</Text>;
  const globalMax = Math.max(...ids.flatMap((id) => Object.values(routineVol[id])), 1);
  ids.sort((a, b) => (routineById[a]?.name ?? '').localeCompare(routineById[b]?.name ?? ''));
  const nameColW = 88; const cellGap = 2;
  const cellW = Math.max(Math.floor((screenWidth - 56 - nameColW - (WEEKS - 1) * cellGap) / WEEKS), 14);
  const cellH = 16;
  function cellColor(vol: number) {
    if (vol <= 0) return 'rgba(255,255,255,0.05)';
    const t = 0.12 + (vol / globalMax) * 0.88;
    return `rgb(${Math.round(212 * t + 30 * (1 - t))},${Math.round(168 * t + 30 * (1 - t))},${Math.round(67 * t + 30 * (1 - t))})`;
  }
  return (
    <View style={{ gap: 8 }}>
      {ids.map((id) => (
        <View key={id} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: nameColW }}><Text style={{ fontSize: fontSize.sm, color: c.text }} numberOfLines={1}>{routineById[id]?.name ?? `#${id}`}</Text></View>
          <View style={{ flexDirection: 'row', gap: cellGap }}>
            {weeks.map((ws) => (
              <View key={ws} style={{ width: cellW, height: cellH, borderRadius: 3, backgroundColor: cellColor(routineVol[id][ws] ?? 0) }} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Weekly averages helper ────────────────────────────────────────────────────
function buildWeeklyAverages(foodLogHistory: FoodLogHistoryDay[], workouts: WorkoutSummary[], todayTDEE: TDEEBreakdown | null, numWeeks = 5) {
  const now = new Date();
  const weeks: { weekStart: string; label: string; calories: number; protein: number; workoutDays: number; weight: number; days: number; isCurrentWeek: boolean }[] = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i * 7);
    const ws = getWeekStart(localDateStr(d));
    const weekDate = new Date(ws + 'T12:00:00');
    weeks.push({ weekStart: ws, label: weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), calories: 0, protein: 0, workoutDays: 0, weight: 0, days: 0, isCurrentWeek: ws === getWeekStart(localDateStr()) });
  }
  for (const day of foodLogHistory) {
    const week = weeks.find((w) => w.weekStart === getWeekStart(day.date));
    if (!week) continue;
    week.calories += day.calories; week.protein += day.protein; week.days++;
  }
  const workoutsByWeek: Record<string, Set<string>> = {};
  for (const w of workouts) {
    const ws = getWeekStart(w.workoutDate);
    if (!workoutsByWeek[ws]) workoutsByWeek[ws] = new Set();
    workoutsByWeek[ws].add(w.workoutDate);
  }
  for (const week of weeks) {
    if (week.days > 0) { week.calories = Math.round(week.calories / week.days); week.protein = Math.round(week.protein / week.days); }
    week.workoutDays = workoutsByWeek[week.weekStart]?.size ?? 0;
  }
  return [...weeks].reverse().filter((w) => w.days > 0 || w.isCurrentWeek);
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DashboardV4Screen() {
  const token = useAuthStore((s) => s.token)!;
  const c = useColors();
  const s = makeStyles(c);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('now');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data state
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [exGoals, setExGoals] = useState<ExerciseGoals | null>(null);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [measGoals, setMeasGoals] = useState<Record<string, MeasurementGoal>>({});
  const [nutritionSummary, setNutritionSummary] = useState<GoalsSummary | null>(null);
  const [foodLogHistory, setFoodLogHistory] = useState<FoodLogHistoryDay[]>([]);
  const [dailyHistory, setDailyHistory] = useState<DailyHistoryEntry[]>([]);
  const [routinesList, setRoutinesList] = useState<RoutineSummary[]>([]);
  const [todayTDEE, setTodayTDEE] = useState<TDEEBreakdown | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<RecoveryData | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const end = localDateStr();
      const startD = new Date(); startD.setDate(startD.getDate() - 89);
      const start = localDateStr(startD);
      const [ws, eg, ms, mg, ns, fl, dh, rl, tdee, insight, rec] = await Promise.all([
        getWorkouts(token, { limit: 200 }),
        getExerciseGoals(token).catch(() => null),
        getMeasurements(token).catch(() => []),
        getMeasurementGoals(token).catch(() => ({})),
        getGoalsSummary(token).catch(() => null),
        getFoodLogHistory(token, { limit: 90 }).catch(() => []),
        getDailyHistory(token, start, end).catch(() => []),
        getRoutines(token).catch(() => []),
        getTDEE(token).catch(() => null),
        getAiInsight(token).catch(() => null),
        getRecovery(token).catch(() => null),
      ]);
      setWorkouts(ws);
      setExGoals(eg);
      setMeasurements(ms as BodyMeasurement[]);
      setMeasGoals(mg as Record<string, MeasurementGoal>);
      setNutritionSummary(ns);
      setFoodLogHistory(fl as FoodLogHistoryDay[]);
      setDailyHistory(dh as DailyHistoryEntry[]);
      setRoutinesList(rl as RoutineSummary[]);
      setTodayTDEE(tdee && (tdee as any).available ? (tdee as TDEEBreakdown) : null);
      setAiInsight(insight?.text ?? null);
      setRecovery(rec);
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true).finally(() => setRefreshing(false));
  }, [loadData]);

  // ── Derived: today ────────────────────────────────────────────────────────
  const todayStr = localDateStr();
  const currentWeekStart = getWeekStart(todayStr);

  const caloriesGoal     = nutritionSummary?.nutrition.goals?.calories ?? null;
  const caloriesConsumed = Math.round(nutritionSummary?.nutrition.actual.calories ?? 0);
  const proteinGoal      = nutritionSummary?.nutrition.goals?.proteinG ?? null;
  const proteinConsumed  = Math.round(nutritionSummary?.nutrition.actual.proteinG ?? 0);
  const carbsGoal        = nutritionSummary?.nutrition.goals?.carbsG ?? null;
  const carbsConsumed    = Math.round(nutritionSummary?.nutrition.actual.carbsG ?? 0);
  const fatGoal          = nutritionSummary?.nutrition.goals?.fatG ?? null;
  const fatConsumed      = Math.round(nutritionSummary?.nutrition.actual.fatG ?? 0);

  const workoutBurnedToday = workouts.filter((w) => w.workoutDate === todayStr).reduce((s, w) => s + (w.caloriesBurned ?? 0), 0);
  const burnedToday = todayTDEE ? todayTDEE.total : workoutBurnedToday;

  // Exercise Today
  const todayWorkouts = workouts.filter((w) => w.workoutDate === todayStr);
  const todayWorkout = todayWorkouts[0] ?? null;
  const lastWorkout = workouts.filter((w) => w.workoutDate < todayStr).sort((a, b) => b.workoutDate.localeCompare(a.workoutDate))[0] ?? null;
  const routineById = Object.fromEntries(routinesList.map((r) => [r.id, r]));

  // This week
  const weekWorkouts = workouts.filter((w) => getWeekStart(w.workoutDate) === currentWeekStart).length;
  const weekWorkoutGoal = exGoals?.workoutsPerWeek ?? null;
  const foodByDate = Object.fromEntries(foodLogHistory.map((d) => [d.date, d]));
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart + 'T12:00:00'); d.setDate(d.getDate() + i); return localDateStr(d);
  });
  const weekCalories = weekDays.reduce((s, d) => s + (foodByDate[d]?.calories ?? 0), 0);
  const weekProtein  = weekDays.reduce((s, d) => s + (foodByDate[d]?.protein ?? 0), 0);
  const weekCalGoal  = caloriesGoal ? caloriesGoal * 7 : null;
  const weekProtGoal = proteinGoal  ? proteinGoal  * 7 : null;
  const daysIn = weekDays.filter((d) => d <= todayStr && foodByDate[d]?.calories).length;

  // ── Derived: 30-day charts ────────────────────────────────────────────────
  const days30 = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); return localDateStr(d); });
  const historyByDate = Object.fromEntries(dailyHistory.map((d) => [d.date, d]));
  const burnedByDate: Record<string, number> = {};
  for (const w of workouts) { if (w.caloriesBurned) burnedByDate[w.workoutDate] = (burnedByDate[w.workoutDate] ?? 0) + w.caloriesBurned; }
  const calSeries  = days30.map((d) => historyByDate[d]?.calories ?? 0);
  const tdeeSeries = todayTDEE ? days30.map((d) => { const cal = historyByDate[d]?.calories ?? 0; const ex = burnedByDate[d] ?? 0; if (!cal && !ex) return 0; return (todayTDEE.bmr + todayTDEE.neat) + Math.round(cal * 0.1) + ex; }) : null;
  const burnedSeries = tdeeSeries ?? days30.map((d) => burnedByDate[d] ?? 0);
  const hasBurned = burnedSeries.some((v) => v > 0);

  // Weight + projection
  const weightByDate: Record<string, number> = {};
  for (const m of measurements.filter((m) => m.metric === 'weight')) weightByDate[m.measuredAt] = m.unit === 'kg' ? m.value * KG_TO_LBS : m.value;
  let last: number | null = null;
  const weightSeries = days30.map((d) => { if (weightByDate[d] != null) last = weightByDate[d]; return last ?? 0; });
  const hasWeight = weightSeries.some((v) => v > 0);
  const weightGoalRaw = measGoals['weight'];
  const weightGoalLbs = weightGoalRaw ? (weightGoalRaw.unit === 'kg' ? weightGoalRaw.targetValue * KG_TO_LBS : weightGoalRaw.targetValue) : null;
  const allW = [...weightSeries.filter(Boolean), ...(weightGoalLbs != null ? [weightGoalLbs] : [])];
  const weightMin = allW.length ? Math.min(...allW) * 0.98 : 0;
  const weightMax = allW.length ? Math.max(...allW) * 1.02 : 1;

  // Weight projection (14-day slope)
  const last14w = weightSeries.slice(-14).filter((v) => v > 0);
  const weightProjection = last14w.length >= 2 ? (() => {
    const slope = (last14w.at(-1)! - last14w[0]) / (last14w.length - 1);
    return Array.from({ length: 14 }, (_, i) => +(last14w.at(-1)! + slope * (i + 1)).toFixed(1));
  })() : undefined;

  // Primary goal (weight)
  const weightMeasurements = measurements.filter((m) => m.metric === 'weight').sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  const latestWeight = weightMeasurements[0];
  const latestWeightLbs = latestWeight ? (latestWeight.unit === 'kg' ? latestWeight.value * KG_TO_LBS : latestWeight.value) : null;
  const weightGoalPace = weightGoalRaw && latestWeightLbs != null
    ? computeGoalPace(measurements, 'weight', weightGoalRaw, 'down')
    : null;

  // Other goals (waist + bicep)
  const GOAL_METRICS = [
    { key: 'waist', label: 'Waist', unit: 'in', dir: 'down' as const },
    { key: 'bicep', label: 'Bicep', unit: 'in', dir: 'up' as const },
  ];

  // Weekly averages
  const weeklyAverages = buildWeeklyAverages(foodLogHistory, workouts, todayTDEE);

  if (loading) return <ActivityIndicator style={{ marginTop: 60 }} color={COL_GOLD} />;

  function workoutName(w: WorkoutSummary) {
    return w.routineId ? (routineById[w.routineId]?.name ?? w.name ?? 'Workout') : (w.name ?? 'Free workout');
  }
  function daysAgoLabel(dateStr: string) {
    const diff = Math.round((new Date(todayStr + 'T12:00:00').getTime() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000);
    return diff === 1 ? '1d ago' : `${diff}d ago`;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      {/* Header */}
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Dashboard</Text>
        <View style={{ backgroundColor: COL_GOLD + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: COL_GOLD, letterSpacing: 0.8 }}>V4 PREVIEW</Text>
        </View>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.segScroll} contentContainerStyle={s.segRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} style={[s.segBtn, activeTab === t && s.segBtnActive]} onPress={() => setActiveTab(t)}>
            <Text style={[s.segLabel, activeTab === t && s.segLabelActive]}>
              {t === 'now' ? 'Now' : t === 'goals' ? 'Goal Progress' : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COL_GOLD} />}
      >

        {/* ══ NOW tab ══ */}
        {activeTab === 'now' && (<>

          {/* AI Insight */}
          {aiInsight ? (
            <View style={s.card}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 13, color: COL_GOLD }}>✦</Text>
                <Text style={{ flex: 1, fontSize: fontSize.sm, color: c.text, lineHeight: 20 }}>{aiInsight}</Text>
              </View>
            </View>
          ) : null}

          {/* Fuel Today */}
          <View style={s.card}>
            <CardHeader title="Fuel Today" c={c} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <CalorieRing pct={caloriesGoal ? caloriesConsumed / caloriesGoal : 0} color={COL_CAL} size={84} c={c} />
                <Text style={{ fontSize: fontSize.sm, color: c.muted, textAlign: 'center' }}>
                  <Text style={{ fontWeight: '700', color: c.text }}>{caloriesConsumed.toLocaleString()}</Text>
                  {caloriesGoal ? `/${caloriesGoal.toLocaleString()} kcal` : ' kcal'}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <ProgressBar label="Protein" actual={proteinConsumed} goal={proteinGoal} unit="g" color={COL_PROTEIN} c={c} />
                <ProgressBar label="Carbs"   actual={carbsConsumed}   goal={carbsGoal}   unit="g" color={COL_CARBS}   c={c} />
                <ProgressBar label="Fat"     actual={fatConsumed}     goal={fatGoal}     unit="g" color={COL_FAT}     c={c} />
              </View>
            </View>
            {burnedToday > 0 && (
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                <Text style={{ fontSize: fontSize.sm, color: c.muted }}>Burned <Text style={{ color: '#f87171', fontWeight: '600' }}>{burnedToday.toLocaleString()} kcal</Text></Text>
                <Text style={{ fontSize: fontSize.sm, color: c.muted }}>Net <Text style={{ fontWeight: '600', color: c.text }}>{(caloriesConsumed - burnedToday).toLocaleString()} kcal</Text></Text>
              </View>
            )}
          </View>

          {/* Exercise Today */}
          <View style={s.card}>
            {todayWorkout ? (
              <>
                <CardHeader title="Exercise Today" meta={`${todayWorkout.durationMinutes ?? '—'} min · logged`} c={c} />
                <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: c.text }}>{workoutName(todayWorkout)}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
                  {todayWorkout.totalVolumeKg != null && <Text style={{ fontSize: fontSize.sm, color: c.muted }}>{Math.round(todayWorkout.totalVolumeKg * KG_TO_LBS).toLocaleString()} lbs</Text>}
                  {todayWorkout.caloriesBurned != null && <Text style={{ fontSize: fontSize.sm, color: c.muted }}>{todayWorkout.caloriesBurned} kcal</Text>}
                </View>
                {computeHighlights(todayWorkout, workouts).map((h, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: COL_GOLD }} />
                    <Text style={{ fontSize: fontSize.sm, color: COL_GOLD }}>{h}</Text>
                  </View>
                ))}
              </>
            ) : lastWorkout ? (
              <>
                <CardHeader title="Exercise Today" meta="Not logged today" c={c} />
                <Text style={{ fontSize: fontSize.sm, color: c.muted }}>Last time — {workoutName(lastWorkout)} ({daysAgoLabel(lastWorkout.workoutDate)})</Text>
                <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: c.text, marginTop: 4 }}>
                  {lastWorkout.durationMinutes ? `${lastWorkout.durationMinutes} min  ·  ` : ''}
                  {lastWorkout.totalVolumeKg != null ? `${Math.round(lastWorkout.totalVolumeKg * KG_TO_LBS).toLocaleString()} lbs` : ''}
                </Text>
                <TouchableOpacity
                  style={{ marginTop: 10, borderWidth: 1, borderColor: COL_GOLD, borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
                  onPress={() => router.push('/(app)/(tabs)/workouts')}
                >
                  <Text style={{ fontSize: fontSize.sm, color: COL_GOLD, fontWeight: '600' }}>Start today's session →</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <CardHeader title="Exercise Today" meta="Not logged today" c={c} />
                <Text style={{ fontSize: fontSize.sm, color: c.muted }}>No workouts yet. Head to Train to get started.</Text>
              </>
            )}
          </View>

          {/* This Week */}
          <View style={s.card}>
            <CardHeader title="This Week" meta={`day ${Math.max(daysIn, 1)} of 7`} c={c} />
            <ProgressBar label="Calories"  actual={weekCalories}  goal={weekCalGoal}   unit=" kcal" color={COL_CAL}     c={c} />
            <ProgressBar label="Protein"   actual={weekProtein}   goal={weekProtGoal}  unit="g"     color={COL_PROTEIN} c={c} />
            <ProgressBar label="Workouts"  actual={weekWorkouts}  goal={weekWorkoutGoal} unit=""    color={COL_GOLD}    c={c} />
          </View>

          {/* Recovery */}
          <View style={s.card}>
            <CardHeader title="Recovery" meta="load + rest signal" c={c} />
            {recovery ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
                    backgroundColor: (recovery.level === 'high' ? COL_GOOD : recovery.level === 'medium' ? COL_GOLD : COL_WARN) + '22',
                  }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: recovery.level === 'high' ? COL_GOOD : recovery.level === 'medium' ? COL_GOLD : COL_WARN, textTransform: 'uppercase' }}>
                      {recovery.level}
                    </Text>
                  </View>
                  <Text style={{ fontSize: fontSize.sm, color: c.muted }}>{recovery.score} / 100</Text>
                </View>
                <Text style={{ fontSize: fontSize.sm, color: c.muted, marginTop: 4 }}>{recovery.hint}</Text>
              </>
            ) : (
              <Text style={{ fontSize: fontSize.sm, color: c.muted }}>—</Text>
            )}
          </View>

        </>)}

        {/* ══ GOAL PROGRESS tab ══ */}
        {activeTab === 'goals' && (<>

          {/* Primary Goal (weight) */}
          <View style={s.card}>
            <CardHeader title="Primary Goal" c={c} />
            {weightGoalRaw && latestWeightLbs != null && weightGoalPace ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: COL_WEIGHT, textTransform: 'uppercase', letterSpacing: 0.5 }}>Weight</Text>
                  <View style={{ borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: PACE_COLORS[weightGoalPace.status] + '22' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: PACE_COLORS[weightGoalPace.status] }}>{PACE_LABELS[weightGoalPace.status]}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 28, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] }}>
                  {latestWeightLbs.toFixed(1)} <Text style={{ fontSize: fontSize.sm, color: c.muted, fontWeight: '400' }}>lbs</Text>
                </Text>
                <Text style={{ fontSize: fontSize.sm, color: c.muted }}>Target: {weightGoalRaw.targetValue} lbs · {(latestWeightLbs - weightGoalRaw.targetValue).toFixed(1)} lbs to go</Text>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 6 }}>
                  <View style={{ height: '100%', width: `${weightGoalPace.pct * 100}%` as any, borderRadius: 3, backgroundColor: PACE_COLORS[weightGoalPace.status] }} />
                </View>
                {weightGoalPace.projectedDate && (
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: PACE_COLORS[weightGoalPace.status], marginTop: 4 }}>
                    Projected: {weightGoalPace.projectedDate}
                  </Text>
                )}
              </>
            ) : (
              <Text style={{ fontSize: fontSize.sm, color: c.muted }}>No weight goal set — add one in Planning.</Text>
            )}
          </View>

          {/* Projected Weight */}
          {hasWeight && (
            <View style={s.card}>
              <CardHeader title="Projected Weight" meta="14-day trend × 30d" c={c} />
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Text style={{ fontSize: fontSize.sm, color: COL_WEIGHT, fontWeight: '600' }}>Actual</Text>
                  {weightProjection && <Text style={{ fontSize: fontSize.sm, color: `${COL_WEIGHT}66` }}>··· Projected</Text>}
                  {weightGoalLbs != null && <Text style={{ fontSize: 11, color: c.muted }}>- - goal</Text>}
                </View>
                <MiniLineChart data={weightSeries} projection={weightProjection} color={COL_WEIGHT} goalLine={weightGoalLbs} maxOverride={weightMax} minOverride={weightMin} />
              </View>
            </View>
          )}

          {/* Other goals — waist + bicep */}
          {GOAL_METRICS.filter(({ key }) => measGoals[key]).map(({ key, label, unit, dir }) => {
            const goal = measGoals[key];
            const sorted = measurements.filter((m) => m.metric === key).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
            const latest = sorted[0];
            if (!goal || !latest) return null;
            const pace = computeGoalPace(measurements, key, goal, dir);
            const delta = (latest.value - goal.targetValue).toFixed(1);
            return (
              <View key={key} style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <CardHeader title={label} c={c} />
                  <View style={{ borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: PACE_COLORS[pace.status] + '22' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: PACE_COLORS[pace.status] }}>{PACE_LABELS[pace.status]}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 24, fontWeight: '700', color: c.text }}>
                  {latest.value} <Text style={{ fontSize: fontSize.sm, color: c.muted, fontWeight: '400' }}>{unit}</Text>
                </Text>
                <Text style={{ fontSize: fontSize.sm, color: c.muted }}>Target: {goal.targetValue} {unit} · {Math.abs(Number(delta))} {unit} to go</Text>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 6 }}>
                  <View style={{ height: '100%', width: `${pace.pct * 100}%` as any, borderRadius: 3, backgroundColor: PACE_COLORS[pace.status] }} />
                </View>
                {pace.projectedDate && (
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: PACE_COLORS[pace.status], marginTop: 4 }}>Projected: {pace.projectedDate}</Text>
                )}
              </View>
            );
          })}

        </>)}

        {/* ══ HISTORY tab ══ */}
        {activeTab === 'history' && (<>

          {/* Weekly averages */}
          {weeklyAverages.some((w) => w.days > 0) && (
            <View style={s.card}>
              <CardHeader title="Weekly Averages" meta="per-day avg · newest first" c={c} />
              <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
                {['Week', 'Cal/d', 'Prot', 'Wkts'].map((h, i) => (
                  <Text key={h} style={[s.th, i === 0 ? { flex: 1.4, textAlign: 'left' } : { flex: 1 }]}>{h}</Text>
                ))}
              </View>
              {weeklyAverages.map((week) => (
                <View key={week.weekStart} style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: c.border + '33' }}>
                  <Text style={[s.td, { flex: 1.4, textAlign: 'left', color: week.isCurrentWeek ? COL_GOLD : c.muted }]}>{week.isCurrentWeek ? 'Now' : week.label}</Text>
                  <Text style={[s.td, { flex: 1, color: week.days > 0 ? c.text : c.muted }]}>{week.days > 0 ? week.calories.toLocaleString() : '—'}</Text>
                  <Text style={[s.td, { flex: 1, color: week.days > 0 ? c.text : c.muted }]}>{week.days > 0 ? `${week.protein}g` : '—'}</Text>
                  <Text style={[s.td, { flex: 1, color: week.days > 0 ? c.text : c.muted }]}>{week.workoutDays}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Volume heatmap */}
          {workouts.some((w) => w.routineId) && (
            <View style={s.card}>
              <CardHeader title="Exercise Volume" meta="8 weeks · by routine" c={c} />
              <RoutineHeatmap workouts={workouts} routinesList={routinesList} c={c} />
            </View>
          )}

          {/* Calories chart */}
          <View style={s.card}>
            <CardHeader title="Calories · Consumed vs Burned" meta="30 days" c={c} />
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
              <Text style={{ fontSize: fontSize.sm, color: COL_CAL, fontWeight: '600' }}>Consumed</Text>
              {hasBurned && <Text style={{ fontSize: fontSize.sm, color: COL_TDEE }}>{tdeeSeries ? 'TDEE' : 'Burned'}</Text>}
              {caloriesGoal && <Text style={{ fontSize: 11, color: c.muted }}>- - goal</Text>}
            </View>
            {(() => {
              const calMax = Math.max(...calSeries, ...burnedSeries, caloriesGoal ?? 0, 1);
              return (
                <View style={{ height: CHART_H + 4, position: 'relative' }}>
                  <MiniLineChart data={calSeries} color={COL_CAL} goalLine={caloriesGoal} maxOverride={calMax} />
                  {hasBurned && (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.7 }}>
                      <MiniLineChart data={burnedSeries} color={COL_TDEE} maxOverride={calMax} />
                    </View>
                  )}
                </View>
              );
            })()}
          </View>

          {/* Weight chart */}
          {hasWeight && (
            <View style={s.card}>
              <CardHeader title="Weight" meta="30 days" c={c} />
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
                <Text style={{ fontSize: fontSize.sm, color: COL_WEIGHT, fontWeight: '600' }}>Weight</Text>
                {weightGoalLbs != null && <Text style={{ fontSize: 11, color: c.muted }}>- - goal {weightGoalLbs.toFixed(1)} lbs</Text>}
              </View>
              <MiniLineChart data={weightSeries} color={COL_WEIGHT} goalLine={weightGoalLbs} maxOverride={weightMax} minOverride={weightMin} />
            </View>
          )}

        </>)}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    pageHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    pageTitle:   { fontSize: fontSize.xl, fontWeight: '700', color: c.text },
    segScroll:   { flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: c.border },
    segRow:      { flexDirection: 'row', alignItems: 'stretch' },
    segBtn:      { paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
    segBtnActive: { borderBottomWidth: 2, borderBottomColor: COL_GOLD },
    segLabel:    { fontSize: fontSize.sm, color: c.muted, fontWeight: '500' },
    segLabelActive: { color: COL_GOLD, fontWeight: '700' },
    scroll:      { padding: 14, gap: 12 },
    card:        { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10 },
    th:          { fontSize: 11, color: c.muted, fontWeight: '600', textAlign: 'right', paddingHorizontal: 2 },
    td:          { fontSize: 13, color: c.text, textAlign: 'right', paddingHorizontal: 2, fontVariant: ['tabular-nums'] },
  });
}
