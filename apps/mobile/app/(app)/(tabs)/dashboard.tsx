import { useCallback, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useSwipeNav } from '../../../src/hooks/useSwipeNav';
import {
  getWorkouts, getExerciseGoals, getMeasurements, getMeasurementGoals, getPersonalBests,
  getGoalsSummary, getWaterHistory, getFoodLogHistory, getDailyHistory, getRoutines, getTDEE,
  type WorkoutSummary, type ExerciseGoals, type BodyMeasurement, type MeasurementGoal,
  type PersonalBests, type GoalsSummary, type WaterHistory, type FoodLogHistoryDay,
  type DailyHistoryEntry, type RoutineSummary, type TDEEBreakdown,
} from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';

const KG_TO_LBS = 2.20462;
const SATURATION_DAYS = 28;
const GLASS_OZ = 8;

const METRIC_CONFIG: Record<string, { label: string; unit: string; color: string; dir: 'up' | 'down' }> = {
  weight: { label: 'Weight', unit: 'lbs', color: '#a78bfa', dir: 'down' },
  waist:  { label: 'Waist',  unit: 'in',  color: '#60a5fa', dir: 'down' },
  bicep:  { label: 'Bicep',  unit: 'in',  color: '#34d399', dir: 'up'   },
};
const DISPLAYED_METRICS = ['weight', 'waist', 'bicep'];

function localDateStr(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekStart(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return localDateStr(d);
}

function shortDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

// ── Pace computation ──────────────────────────────────────────────────────────

type PaceStatus = 'green' | 'yellow' | 'red' | 'done';
const PACE_COLORS: Record<PaceStatus, string> = { green: '#34d399', yellow: '#facc15', red: '#f87171', done: '#34d399' };
const PACE_LABELS: Record<PaceStatus, string> = { green: 'On pace', yellow: 'Slightly behind', red: 'Behind', done: 'Done!' };

function computeGoalPace(
  measurements: BodyMeasurement[], key: string,
  goal: MeasurementGoal, dir: 'up' | 'down'
): { status: PaceStatus; pct: number; projectedDate: string | null } {
  const sorted = measurements
    .filter((m) => m.metric === key)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  if (sorted.length === 0) return { status: 'red', pct: 0, projectedDate: null };

  const oldest = sorted[0];
  const latest = sorted[sorted.length - 1];
  let rawVal = (m: BodyMeasurement) => m.value;
  if (key === 'weight' && latest.unit === 'kg') rawVal = (m) => m.value * KG_TO_LBS;

  const oldestVal = rawVal(oldest);
  const latestVal = rawVal(latest);
  const target = goal.targetValue;
  const totalChange = dir === 'down' ? oldestVal - target : target - oldestVal;
  const actualChange = dir === 'down' ? oldestVal - latestVal : latestVal - oldestVal;
  if (totalChange <= 0) return { status: 'done', pct: 1, projectedDate: null };
  const pct = Math.min(Math.max(actualChange / totalChange, 0), 1);
  if (pct >= 1) return { status: 'done', pct: 1, projectedDate: null };
  if (!goal.targetDate || sorted.length < 2) return { status: 'yellow', pct, projectedDate: null };

  const firstMs = new Date(oldest.measuredAt + 'T12:00:00').getTime();
  const latestMs = new Date(latest.measuredAt + 'T12:00:00').getTime();
  const targetMs = new Date(goal.targetDate + 'T12:00:00').getTime();
  const elapsed = latestMs - firstMs;
  if (elapsed <= 0) return { status: 'yellow', pct, projectedDate: null };

  const actualRate = actualChange / elapsed;
  const neededRate = totalChange / Math.max(targetMs - firstMs, 1);
  const ratio = neededRate > 0 ? actualRate / neededRate : 0;
  const status: PaceStatus = ratio >= 1 ? 'green' : ratio >= 0.8 ? 'yellow' : 'red';
  const remaining = totalChange - actualChange;
  const projMs = actualRate > 0 ? Date.now() + (remaining / actualRate) : null;
  const projectedDate = projMs
    ? new Date(projMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  return { status, pct, projectedDate };
}

// ── Creatine ──────────────────────────────────────────────────────────────────

function computeCreatineSaturation(foodLogHistory: FoodLogHistoryDay[]) {
  const creatineDays = foodLogHistory
    .filter((day) => day.entries.some((e) => e.foodName.toLowerCase().includes('creatine')))
    .map((day) => day.date)
    .sort();
  if (creatineDays.length === 0) return null;
  const firstDate = creatineDays[0];
  const firstMs = new Date(firstDate + 'T12:00:00').getTime();
  const daysSinceStart = Math.max(1, Math.floor((Date.now() - firstMs) / (24 * 3600 * 1000)));
  const loggedDays = creatineDays.length;
  const compliancePct = Math.min(loggedDays / daysSinceStart, 1);
  const timePct = Math.min(daysSinceStart / SATURATION_DAYS, 1);
  const satPct = timePct * compliancePct;
  const daysToFull = satPct >= 1 ? 0 : compliancePct > 0
    ? Math.max(0, Math.ceil((SATURATION_DAYS - daysSinceStart / compliancePct) / compliancePct))
    : SATURATION_DAYS - daysSinceStart;
  const phase = daysSinceStart <= 7 ? 'Initial Uptake'
    : satPct >= 1 ? 'Full Saturation'
    : daysSinceStart <= 21 ? 'The Build'
    : 'Peak Performance';
  return { satPct, daysSinceStart, loggedDays, firstDate, daysToFull, phase, compliancePct };
}

// ── Weekly bucketing ──────────────────────────────────────────────────────────

type WeekBucket = { weekStart: string; volumeLbs: number; workoutCount: number };

function buildWeeklyData(workouts: WorkoutSummary[]): WeekBucket[] {
  const now = new Date();
  const weeks: WeekBucket[] = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const ws = getWeekStart(localDateStr(d));
    weeks.push({ weekStart: ws, volumeLbs: 0, workoutCount: 0 });
  }
  for (const w of workouts) {
    const ws = getWeekStart(w.workoutDate);
    const week = weeks.find((wk) => wk.weekStart === ws);
    if (week) {
      week.workoutCount++;
      week.volumeLbs += (w.totalVolumeKg ?? 0) * KG_TO_LBS;
    }
  }
  return weeks;
}

// ── Mini line chart (pure RN, no SVG lib) ────────────────────────────────────

const CHART_H = 56;
const DOT_R = 2.5;

function MiniLineChart({ data, color, goalLine, maxOverride }: {
  data: number[];
  color: string;
  goalLine?: number | null;
  maxOverride?: number;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 56;
  const maxVal = maxOverride ?? Math.max(...data, goalLine ?? 0, 1);
  if (data.length < 2) return <View style={{ height: CHART_H }} />;

  const pts = data.map((val, i) => ({
    x: (i / (data.length - 1)) * chartWidth,
    y: CHART_H - DOT_R - Math.max((val / maxVal) * (CHART_H - DOT_R * 2), 0),
    val,
  }));

  const goalY = goalLine != null
    ? CHART_H - DOT_R - Math.max((goalLine / maxVal) * (CHART_H - DOT_R * 2), 0)
    : null;

  return (
    <View style={{ height: CHART_H, width: chartWidth, position: 'relative' }}>
      {/* Goal dashed line */}
      {goalY != null && (
        <View style={{ position: 'absolute', left: 0, top: goalY - 0.5, width: chartWidth, height: 1, borderStyle: 'dashed', borderTopWidth: 1, borderColor: `${color}44` }} />
      )}
      {/* Lines */}
      {pts.map((pt, i) => {
        if (i === pts.length - 1) return null;
        const next = pts[i + 1];
        const dx = next.x - pt.x;
        const dy = next.y - pt.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View
            key={i + '_l'}
            style={{
              position: 'absolute',
              left: pt.x,
              top: pt.y - 0.75,
              width: len,
              height: 1.5,
              backgroundColor: `${color}99`,
              transformOrigin: 'left center',
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })}
      {/* Dots — only at non-zero points to reduce noise; always show last */}
      {pts.map((pt, i) => {
        if (pt.val === 0 && i !== pts.length - 1) return null;
        return (
          <View
            key={i + '_d'}
            style={{
              position: 'absolute',
              left: pt.x - DOT_R,
              top: pt.y - DOT_R,
              width: DOT_R * 2,
              height: DOT_R * 2,
              borderRadius: DOT_R,
              backgroundColor: i === pts.length - 1 ? color : `${color}88`,
            }}
          />
        );
      })}
    </View>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar2({ label, actual, goal, unit, color, c }: {
  label: string; actual: number; goal: number | null; unit: string; color: string; c: Colors;
}) {
  const pct = goal && goal > 0 ? Math.min(actual / goal, 1) : 0;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: fontSize.xs, color: c.muted }}>{label}</Text>
        <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color }}>
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

// ── Routine heatmap ───────────────────────────────────────────────────────────

function RoutineHeatmap({ workouts, routinesList, c }: {
  workouts: WorkoutSummary[];
  routinesList: RoutineSummary[];
  c: Colors;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const WEEKS = 13;
  const now = new Date();
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (WEEKS - 1 - i) * 7);
    return getWeekStart(localDateStr(d));
  });

  // Build routineId → weekStart → volumeLbs
  const routineVolumes: Record<number, Record<string, number>> = {};
  for (const w of workouts) {
    if (!w.routineId || (w.totalVolumeKg ?? 0) <= 0) continue;
    const ws = getWeekStart(w.workoutDate);
    if (!routineVolumes[w.routineId]) routineVolumes[w.routineId] = {};
    routineVolumes[w.routineId][ws] = (routineVolumes[w.routineId][ws] ?? 0) + (w.totalVolumeKg ?? 0) * KG_TO_LBS;
  }

  const relevantIds = Object.keys(routineVolumes)
    .map(Number)
    .filter((rid) => weeks.some((ws) => (routineVolumes[rid][ws] ?? 0) > 0));

  if (relevantIds.length === 0) {
    return <Text style={{ fontSize: fontSize.xs, color: c.muted, textAlign: 'center', paddingVertical: 8 }}>No routine data in last 13 weeks</Text>;
  }

  const globalMax = Math.max(...relevantIds.flatMap((rid) => Object.values(routineVolumes[rid])), 1);
  const routineNameById = Object.fromEntries(routinesList.map((r) => [r.id, r.name]));

  // Cell sizing: available width minus name column
  const nameColW = 90;
  const cellGap = 2;
  const totalCellSpace = screenWidth - 56 - nameColW - cellGap;
  const cellW = Math.max(Math.floor((totalCellSpace - (WEEKS - 1) * cellGap) / WEEKS), 14);
  const cellH = 16;

  return (
    <View style={{ gap: 8 }}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: nameColW }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: cellGap }}>
            {weeks.map((ws, i) => (
              i % 3 === 0 ? (
                <View key={ws} style={{ width: cellW, alignItems: 'center' }}>
                  <Text style={{ fontSize: 7, color: c.muted }}>{shortDate(ws)}</Text>
                </View>
              ) : (
                <View key={ws} style={{ width: cellW }} />
              )
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Data rows */}
      {relevantIds.map((rid) => (
        <View key={rid} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: nameColW }}>
            <Text style={{ fontSize: fontSize.xs, color: c.text }} numberOfLines={1}>
              {routineNameById[rid] ?? `Routine ${rid}`}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', gap: cellGap }}>
              {weeks.map((ws) => {
                const vol = routineVolumes[rid][ws] ?? 0;
                const intensity = vol > 0 ? vol / globalMax : 0;
                const r = Math.round(167 - intensity * (167 - 80));
                const g = Math.round(139 - intensity * (139 - 60));
                const b = Math.round(250 - intensity * (250 - 160));
                const bg = vol > 0 ? `rgb(${r},${g},${b})` : 'rgba(255,255,255,0.05)';
                return (
                  <View key={ws} style={{ width: cellW, height: cellH, borderRadius: 3, backgroundColor: bg }} />
                );
              })}
            </View>
          </ScrollView>
        </View>
      ))}

      {/* Legend */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <Text style={{ fontSize: 9, color: c.muted }}>Lower</Text>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {[0.1, 0.3, 0.55, 0.75, 1.0].map((t) => {
            const r = Math.round(167 - t * (167 - 80));
            const g = Math.round(139 - t * (139 - 60));
            const b = Math.round(250 - t * (250 - 160));
            return <View key={t} style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: `rgb(${r},${g},${b})` }} />;
          })}
        </View>
        <Text style={{ fontSize: 9, color: c.muted }}>Higher volume</Text>
      </View>
    </View>
  );
}

// ── Segmented tab bar (matches workouts style) ────────────────────────────────

const DASHBOARD_TABS = ['nutrition', 'exercise', 'other'] as const;
type DashboardTab = typeof DASHBOARD_TABS[number];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const token = useAuthStore((s) => s.token)!;
  const c = useColors();
  const s = makeStyles(c);
  const seg = makeSegStyles(c);
  const [activeTab, setActiveTab] = useState<DashboardTab>('nutrition');
  const swipe = useSwipeNav(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [exGoals, setExGoals] = useState<ExerciseGoals | null>(null);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [measGoals, setMeasGoals] = useState<Record<string, MeasurementGoal>>({});
  const [personalBests, setPersonalBests] = useState<PersonalBests | null>(null);
  const [nutritionSummary, setNutritionSummary] = useState<GoalsSummary | null>(null);
  const [waterHistory, setWaterHistory] = useState<WaterHistory | null>(null);
  const [foodLogHistory, setFoodLogHistory] = useState<FoodLogHistoryDay[]>([]);
  const [dailyHistory, setDailyHistory] = useState<DailyHistoryEntry[]>([]);
  const [routinesList, setRoutinesList] = useState<RoutineSummary[]>([]);
  const [todayTDEE, setTodayTDEE] = useState<TDEEBreakdown | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const end = localDateStr();
      const startD = new Date(); startD.setDate(startD.getDate() - 29);
      const start = localDateStr(startD);

      const [ws, eg, ms, mg, pb, ns, wh, fl, dh, rl, tdee] = await Promise.all([
        getWorkouts(token, { limit: 200 }),
        getExerciseGoals(token).catch(() => null),
        getMeasurements(token).catch(() => []),
        getMeasurementGoals(token).catch(() => ({})),
        getPersonalBests(token).catch(() => null),
        getGoalsSummary(token).catch(() => null),
        getWaterHistory(token, start, end).catch(() => null),
        getFoodLogHistory(token, 30).catch(() => []),
        getDailyHistory(token, start, end).catch(() => []),
        getRoutines(token).catch(() => []),
        getTDEE(token).catch(() => null),
      ]);
      setWorkouts(ws);
      setExGoals(eg);
      setMeasurements(ms as BodyMeasurement[]);
      setMeasGoals(mg as Record<string, MeasurementGoal>);
      setPersonalBests(pb);
      setNutritionSummary(ns);
      setWaterHistory(wh);
      setFoodLogHistory(fl as FoodLogHistoryDay[]);
      setDailyHistory(dh as DailyHistoryEntry[]);
      setRoutinesList(rl as RoutineSummary[]);
      setTodayTDEE(tdee && tdee.available ? tdee : null);
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true).finally(() => setRefreshing(false));
  }, [loadData]);

  // ── Derived values ────────────────────────────────────────────────────────

  const todayStr = localDateStr();
  const currentWeekStart = getWeekStart(todayStr);

  // Fuel today
  const caloriesGoal = nutritionSummary?.nutrition.goals?.calories ?? null;
  const caloriesConsumed = Math.round(nutritionSummary?.nutrition.actual.calories ?? 0);
  const proteinGoal = nutritionSummary?.nutrition.goals?.proteinG ?? null;
  const proteinConsumed = Math.round(nutritionSummary?.nutrition.actual.proteinG ?? 0);
  const workoutBurnedToday = workouts
    .filter((w) => w.workoutDate === todayStr)
    .reduce((sum, w) => sum + (w.caloriesBurned ?? 0), 0);
  const burnedToday = todayTDEE ? todayTDEE.total : workoutBurnedToday;
  const waterOzToday = waterHistory?.days.find((d) => d.date === todayStr)?.totalOz ?? 0;
  const waterGoalOz = waterHistory?.goalOz ?? 64;
  const waterGlasses = Math.round(waterOzToday / GLASS_OZ * 10) / 10;
  const waterGoalGlasses = Math.round(waterGoalOz / GLASS_OZ);

  // This week
  const weeklyData = buildWeeklyData(workouts);
  const weekVolumeLbs = Math.round(weeklyData[weeklyData.length - 1]?.volumeLbs ?? 0);
  const volumeGoal = exGoals?.volumeLbsPerWeek ?? null;

  // 30-day nutrition chart arrays (fill gaps)
  const days30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    return localDateStr(d);
  });
  const historyByDate = Object.fromEntries(dailyHistory.map((d) => [d.date, d]));
  const waterByDate = Object.fromEntries((waterHistory?.days ?? []).map((d) => [d.date, d.totalOz]));
  const burnedByDate: Record<string, number> = {};
  for (const w of workouts) {
    if (w.caloriesBurned) burnedByDate[w.workoutDate] = (burnedByDate[w.workoutDate] ?? 0) + w.caloriesBurned;
  }
  const calSeries    = days30.map((d) => historyByDate[d]?.calories ?? 0);
  const proteinSeries = days30.map((d) => historyByDate[d]?.proteinG ?? 0);
  const waterSeries  = days30.map((d) => Math.round((waterByDate[d] ?? 0) / GLASS_OZ * 10) / 10);
  // Use BMR+NEAT baseline + per-day TEF + exercise for all 30 days when TDEE is available
  const tdeeSeries = todayTDEE
    ? days30.map((d) => {
        const cals = historyByDate[d]?.calories ?? 0;
        const exercise = burnedByDate[d] ?? 0;
        if (cals === 0 && exercise === 0) return 0;
        const tef = Math.round(cals * 0.1);
        return (todayTDEE.bmr + todayTDEE.neat) + tef + exercise;
      })
    : null;
  const burnedSeries = tdeeSeries ?? days30.map((d) => burnedByDate[d] ?? 0);
  const hasBurned    = burnedSeries.some((v) => v > 0);

  const creatineData = computeCreatineSaturation(foodLogHistory);

  // Recent workouts (last 5 completed)
  const recentWorkouts = workouts.slice(0, 5);

  // 30-day TDEE table rows (newest first)
  const tdeeTableRows = todayTDEE ? days30.map((date) => {
    const caloriesIn = historyByDate[date]?.calories ?? 0;
    const exercise = burnedByDate[date] ?? 0;
    const tef = Math.round(caloriesIn * 0.1);
    const tdee = (todayTDEE.bmr + todayTDEE.neat) + tef + exercise;
    const net = caloriesIn > 0 || exercise > 0 ? caloriesIn - tdee : null;
    const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    return { date, label, caloriesIn, tef, exercise, tdee, net };
  }).reverse() : [];

  if (loading) return <ActivityIndicator style={{ marginTop: 60 }} color={c.accent} />;

  // Carbs and fat derived values
  const carbsGoal = nutritionSummary?.nutrition.goals?.carbsG ?? null;
  const carbsConsumed = Math.round(nutritionSummary?.nutrition.actual.carbsG ?? 0);
  const fatGoal = nutritionSummary?.nutrition.goals?.fatG ?? null;
  const fatConsumed = Math.round(nutritionSummary?.nutrition.actual.fatG ?? 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']} {...swipe.panHandlers}>
      {/* Fixed header — matches other tabs */}
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Dashboard</Text>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={seg.scroll} contentContainerStyle={seg.row}>
        {DASHBOARD_TABS.map((t) => (
          <TouchableOpacity key={t} style={[seg.btn, activeTab === t && seg.btnActive]} onPress={() => setActiveTab(t)}>
            <Text style={[seg.label, activeTab === t && seg.labelActive]}>
              {t === 'nutrition' ? 'Nutrition' : t === 'exercise' ? 'Exercise' : 'Other'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >

        {/* ══ Nutrition tab ══ */}
        {activeTab === 'nutrition' && (<>

        {/* ── Fuel Today ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Fuel — Today</Text>
          <ProgressBar2 label="Calories" actual={caloriesConsumed} goal={caloriesGoal} unit=" kcal" color="#fb923c" c={c} />
          {burnedToday > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: fontSize.xs, color: c.muted }}>Burned</Text>
              <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color: '#f87171' }}>{burnedToday.toLocaleString()} kcal</Text>
              <Text style={{ fontSize: fontSize.xs, color: c.muted }}>Net</Text>
              <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color: caloriesGoal && (caloriesConsumed - burnedToday) > caloriesGoal ? '#f87171' : c.text }}>
                {(caloriesConsumed - burnedToday).toLocaleString()} kcal
              </Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <View style={{ width: '47%' }}>
              <ProgressBar2 label="Protein" actual={proteinConsumed} goal={proteinGoal} unit="g" color="#60a5fa" c={c} />
            </View>
            <View style={{ width: '47%' }}>
              <ProgressBar2 label="Carbs" actual={carbsConsumed} goal={carbsGoal} unit="g" color="#34d399" c={c} />
            </View>
            <View style={{ width: '47%' }}>
              <ProgressBar2 label="Fat" actual={fatConsumed} goal={fatGoal} unit="g" color="#facc15" c={c} />
            </View>
            <View style={{ width: '47%' }}>
              <ProgressBar2
                label="Water"
                actual={waterGlasses}
                goal={waterGoalGlasses}
                unit=" gl"
                color="#38bdf8"
                c={c}
              />
            </View>
          </View>
        </View>

        {/* ── Nutrition Charts (30 days) ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Last 30 Days</Text>

          {/* Calories */}
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: fontSize.xs, color: '#fb923c', fontWeight: '600' }}>Calories</Text>
              {hasBurned && <Text style={{ fontSize: 9, color: c.muted }}>— {tdeeSeries ? 'TDEE' : 'burned'}</Text>}
              {caloriesGoal && <Text style={{ fontSize: 9, color: c.muted }}>- - goal</Text>}
            </View>
            {/* Calories area + burned overlay — shared scale so burned is proportional to consumed */}
            {(() => {
              const calMax = Math.max(...calSeries, ...burnedSeries, caloriesGoal ?? 0, 1);
              return (
                <View style={{ height: CHART_H + 4, position: 'relative' }}>
                  <MiniLineChart data={calSeries} color="#fb923c" goalLine={caloriesGoal} maxOverride={calMax} />
                  {hasBurned && (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.7 }}>
                      <MiniLineChart data={burnedSeries} color="#f87171" maxOverride={calMax} />
                    </View>
                  )}
                </View>
              );
            })()}
          </View>

          {/* Protein */}
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: fontSize.xs, color: '#60a5fa', fontWeight: '600' }}>Protein</Text>
              {proteinGoal && <Text style={{ fontSize: 9, color: c.muted }}>- - goal {proteinGoal}g</Text>}
            </View>
            <MiniLineChart data={proteinSeries} color="#60a5fa" goalLine={proteinGoal} />
          </View>

          {/* Water */}
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: fontSize.xs, color: '#38bdf8', fontWeight: '600' }}>Water</Text>
              <Text style={{ fontSize: 9, color: c.muted }}>- - goal {waterGoalGlasses} glasses</Text>
            </View>
            <MiniLineChart data={waterSeries} color="#38bdf8" goalLine={waterGoalGlasses} />
          </View>
        </View>

        {/* ── Creatine ── */}
        {creatineData && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Creatine</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[s.creatinePhaseBadge, {
                color: creatineData.satPct >= 0.9 ? '#34d399' : creatineData.satPct >= 0.5 ? '#facc15' : '#f87171',
                backgroundColor: (creatineData.satPct >= 0.9 ? '#34d399' : creatineData.satPct >= 0.5 ? '#facc15' : '#f87171') + '22',
              }]}>
                {creatineData.phase}
              </Text>
              <Text style={{ fontSize: fontSize.sm, color: c.muted }}>{Math.round(creatineData.satPct * 100)}% saturated</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, {
                width: `${creatineData.satPct * 100}%` as any,
                backgroundColor: creatineData.satPct >= 0.9 ? '#34d399' : creatineData.satPct >= 0.5 ? '#facc15' : '#f87171',
              }]} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <View style={s.creatineStat}>
                <Text style={s.creatineStatVal}>{creatineData.daysSinceStart}d</Text>
                <Text style={s.creatineStatLabel}>since start</Text>
              </View>
              <View style={s.creatineStat}>
                <Text style={[s.creatineStatVal, { color: creatineData.compliancePct >= 0.9 ? '#34d399' : creatineData.compliancePct >= 0.7 ? '#facc15' : '#f87171' }]}>
                  {Math.round(creatineData.compliancePct * 100)}%
                </Text>
                <Text style={s.creatineStatLabel}>{creatineData.loggedDays}/{creatineData.daysSinceStart} days</Text>
              </View>
              {creatineData.satPct < 1 && creatineData.daysToFull > 0 && (
                <View style={s.creatineStat}>
                  <Text style={s.creatineStatVal}>{creatineData.daysToFull}d</Text>
                  <Text style={s.creatineStatLabel}>to peak</Text>
                </View>
              )}
            </View>
          </View>
        )}

        </>)}

        {/* ══ Exercise tab ══ */}
        {activeTab === 'exercise' && (<>

        {/* ── This Week Volume ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>This Week</Text>
          <ProgressBar2 label="Volume" actual={weekVolumeLbs} goal={volumeGoal} unit=" lbs" color="#a78bfa" c={c} />
          {weeklyData.some((w) => w.volumeLbs > 0) && (
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: fontSize.xs, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Volume / wk (13 wks)</Text>
                {volumeGoal != null && <Text style={{ fontSize: fontSize.xs, color: c.muted }}>Goal: {volumeGoal >= 1000 ? `${(volumeGoal / 1000).toFixed(0)}k` : volumeGoal} lbs</Text>}
              </View>
              <MiniLineChart data={weeklyData.map((w) => w.volumeLbs)} color="#a78bfa" goalLine={volumeGoal} />
            </View>
          )}
        </View>

        {/* ── Volume Heatmap ── */}
        {workouts.some((w) => w.routineId) && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Volume Heatmap</Text>
            <RoutineHeatmap workouts={workouts} routinesList={routinesList} c={c} />
          </View>
        )}

        {/* ── Personal Bests ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Personal Bests</Text>
          {personalBests?.heaviestLift ? (
            <View style={s.recordRow}>
              <Text style={s.recordIcon}>🏋️</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.recordLabel}>Heaviest Lift</Text>
                <Text style={s.recordVal}>{Math.round(personalBests.heaviestLift.weightKg * KG_TO_LBS * 10) / 10} lbs</Text>
                <Text style={s.recordSub}>{personalBests.heaviestLift.exerciseName}</Text>
              </View>
            </View>
          ) : null}
          {personalBests?.bestSessionVolume ? (
            <View style={s.recordRow}>
              <Text style={s.recordIcon}>📈</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.recordLabel}>Best Session Volume</Text>
                <Text style={s.recordVal}>{Math.round(personalBests.bestSessionVolume.volumeKg * KG_TO_LBS).toLocaleString()} lbs</Text>
                <Text style={s.recordSub}>{personalBests.bestSessionVolume.workoutDate}</Text>
              </View>
            </View>
          ) : null}
          {personalBests?.longestSession ? (
            <View style={s.recordRow}>
              <Text style={s.recordIcon}>⏱️</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.recordLabel}>Longest Session</Text>
                <Text style={s.recordVal}>{personalBests.longestSession.durationMinutes} min</Text>
                <Text style={s.recordSub}>{personalBests.longestSession.workoutDate}</Text>
              </View>
            </View>
          ) : null}
          {!personalBests?.heaviestLift && !personalBests?.bestSessionVolume && !personalBests?.longestSession && (
            <Text style={s.empty}>Complete workouts to see records.</Text>
          )}
        </View>

        {/* ── Recent Workouts ── */}
        {recentWorkouts.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Recent Workouts</Text>
            {recentWorkouts.map((w, i) => (
              <View key={w.id} style={[s.workoutRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.xs, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {new Date(w.workoutDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {w.durationMinutes != null ? `  ·  ${w.durationMinutes} min` : ''}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: c.muted, marginTop: 1 }}>
                    {w.routineId ? (routinesList.find((r) => r.id === w.routineId)?.name ?? w.name ?? 'Workout Session') : (w.name ?? 'Workout Session')}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: c.muted, marginTop: 1 }}>
                    {w.exerciseCount} exercise{w.exerciseCount !== 1 ? 's' : ''}
                    {(w.totalVolumeKg ?? 0) > 0 ? `  ·  ${Math.round((w.totalVolumeKg ?? 0) * KG_TO_LBS).toLocaleString()} lbs` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        </>)}

        {/* ══ Other tab ══ */}
        {activeTab === 'other' && (<>

        {/* ── North Star Goals ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>North Star Goals</Text>
          {DISPLAYED_METRICS.map((key) => {
            const cfg = METRIC_CONFIG[key];
            const sorted = measurements
              .filter((m) => m.metric === key)
              .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
            const latest = sorted[0];
            const goal = measGoals[key];
            const displayVal = latest
              ? (key === 'weight' && latest.unit === 'kg' ? (latest.value * KG_TO_LBS).toFixed(1) : String(latest.value))
              : null;
            const { status, pct, projectedDate } = goal
              ? computeGoalPace(measurements, key, goal, cfg.dir)
              : { status: 'red' as PaceStatus, pct: 0, projectedDate: null };
            const paceColor = PACE_COLORS[status];
            const delta = goal && displayVal != null ? (goal.targetValue - Number(displayVal)).toFixed(1) : null;
            const deltaNum = delta != null ? Number(delta) : null;
            return (
              <View key={key} style={[s.metricRow, { borderTopColor: c.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[s.metricLabel, { color: cfg.color }]}>{cfg.label}</Text>
                  <View style={{ borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: paceColor + '22' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: paceColor }}>{PACE_LABELS[status]}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text style={s.metricCurrent}>
                    {displayVal ?? '—'} <Text style={{ fontSize: fontSize.xs, color: c.muted, fontWeight: '400' }}>{cfg.unit}</Text>
                  </Text>
                  {goal && (
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'baseline' }}>
                      <Text style={{ fontSize: fontSize.sm, color: c.muted }}>{goal.targetValue} {cfg.unit}</Text>
                      {deltaNum != null && deltaNum !== 0 && (
                        <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: paceColor }}>
                          {deltaNum > 0 ? '+' : ''}{delta} {cfg.unit}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${pct * 100}%` as any, backgroundColor: paceColor }]} />
                </View>
                {projectedDate && (
                  <Text style={{ fontSize: fontSize.xs, fontWeight: '600', textAlign: 'center', color: paceColor }}>Proj: {projectedDate}</Text>
                )}
                {key === 'weight' && creatineData && creatineData.satPct > 0 && creatineData.satPct < 1 && (
                  <View style={{ backgroundColor: 'rgba(56,189,248,0.10)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(56,189,248,0.25)', padding: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#38bdf8', marginBottom: 2 }}>💧 Water Weight Loading</Text>
                    <Text style={{ fontSize: 10, color: '#94a3b8', lineHeight: 14 }}>Creatine may add 1–3 lbs of water weight. Scale bump is expected.</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── 30-Day TDEE Table ── */}
        {todayTDEE && tdeeTableRows.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Last 30 Days — Calories vs. TDEE</Text>
            <Text style={{ fontSize: 10, color: c.muted }}>
              BMR {todayTDEE.bmr} + NEAT {todayTDEE.neat} + TEF (10% of intake) + exercise per day
            </Text>
            {/* Header row */}
            <View style={[s.tdeeRow, { borderBottomColor: c.border, borderBottomWidth: 1, paddingBottom: 4 }]}>
              <Text style={[s.tdeeDateCol, { color: c.muted, fontWeight: '600' }]}>Date</Text>
              <Text style={[s.tdeeNumCol, { color: c.muted, fontWeight: '600' }]}>Cal In</Text>
              <Text style={[s.tdeeNumCol, { color: c.muted, fontWeight: '600' }]}>TDEE</Text>
              <Text style={[s.tdeeNumColLast, { color: c.muted, fontWeight: '600' }]}>Net</Text>
            </View>
            {tdeeTableRows.map((row) => {
              const hasActivity = row.caloriesIn > 0 || row.exercise > 0;
              const netColor = !hasActivity ? c.muted : row.net === null ? c.muted : row.net < 0 ? '#34d399' : row.net > 0 ? '#f87171' : c.muted;
              return (
                <View key={row.date} style={[s.tdeeRow, { borderBottomColor: c.border + '44', borderBottomWidth: 1 }]}>
                  <Text style={[s.tdeeDateCol, { color: c.muted }]}>{row.label}</Text>
                  <Text style={[s.tdeeNumCol, { color: hasActivity ? c.text : c.muted }]}>
                    {hasActivity ? row.caloriesIn.toLocaleString() : '—'}
                  </Text>
                  <Text style={[s.tdeeNumCol, { color: hasActivity ? c.text : c.muted }]}>
                    {hasActivity ? row.tdee.toLocaleString() : '—'}
                  </Text>
                  <Text style={[s.tdeeNumColLast, { color: netColor, fontWeight: hasActivity ? '600' : '400' }]}>
                    {row.net === null || !hasActivity ? '—' : (row.net > 0 ? '+' : '') + row.net.toLocaleString()}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        {!todayTDEE && (
          <View style={s.card}>
            <Text style={{ fontSize: fontSize.sm, color: c.muted, textAlign: 'center', paddingVertical: 8 }}>
              Set your body measurements to enable TDEE tracking.
            </Text>
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
    pageHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    pageTitle: { fontSize: fontSize.xl, fontWeight: '700', color: c.text },
    scroll: { padding: 14, gap: 12 },
    sectionHeader: { fontSize: fontSize.xs, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 4 },
    card: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10 },
    cardTitle: { fontSize: fontSize.xs, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8 },

    // North star goals
    metricRow: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
    metricLabel: { fontSize: fontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    metricCurrent: { fontSize: fontSize.xl, fontWeight: '700', color: c.text },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 2 },

    // Creatine
    creatinePhaseBadge: { fontSize: 11, fontWeight: '700', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    creatineStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 8, alignItems: 'center' },
    creatineStatVal: { fontSize: fontSize.base, fontWeight: '700', color: c.text },
    creatineStatLabel: { fontSize: 10, color: c.muted, marginTop: 2 },

    // Personal bests
    recordRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
    recordIcon: { fontSize: 22, lineHeight: 26 },
    recordLabel: { fontSize: fontSize.xs, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    recordVal: { fontSize: fontSize.lg, fontWeight: '700', color: c.text },
    recordSub: { fontSize: fontSize.xs, color: c.muted, marginTop: 2 },
    empty: { fontSize: fontSize.sm, color: c.muted, textAlign: 'center', paddingVertical: 12 },

    // Recent workouts
    workoutRow: { gap: 2 },

    // TDEE table
    tdeeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
    tdeeDateCol: { fontSize: 11, width: 42 },
    tdeeNumCol: { fontSize: 11, flex: 1, textAlign: 'right' },
    tdeeNumColLast: { fontSize: 11, width: 56, textAlign: 'right' },
  });
}

function makeSegStyles(c: Colors) {
  return StyleSheet.create({
    scroll: { flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: c.border },
    row: { flexDirection: 'row', alignItems: 'stretch' },
    btn: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
    btnActive: { borderBottomWidth: 2, borderBottomColor: c.accent },
    label: { fontSize: fontSize.sm, color: c.muted, fontWeight: '500' },
    labelActive: { color: c.accent, fontWeight: '700' },
  });
}
