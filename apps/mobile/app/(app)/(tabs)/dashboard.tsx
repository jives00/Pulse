import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSwipeNav } from '../../../src/hooks/useSwipeNav';
import {
  getWorkouts, getNutritionSummary, getMeasurements,
  getFoodLogHistory, getDailyHistory, getRoutines, getNutritionTDEE,
  getRecovery, getUpcomingSchedule, getRoutine, getWaterDay, getSteps,
  getWaterHistory, getStepsHistory,
  type WorkoutSummary, type BodyMeasurement,
  type FoodLogHistoryDay, type DailyHistoryEntry, type RoutineSummary,
  type TDEEBreakdown, type UpcomingSession, type RoutineDetail, type WaterDay, type StepsEntry,
  type WaterHistoryDay,
} from '../../../src/api/client';
import { Share } from 'react-native';
import {
  KG_TO_LBS, localDateStr, getWeekStart,
  computeHighlights, buildWeeklyData, buildWorkoutLine,
  goalsV2Api, resolveLayout,
  type WeekBucket, type Goal, type NutritionSummary, type DashboardWidgetKey,
} from '../../../../../packages/api-client/src/index';
import { useAuthStore } from '../../../src/store/auth';
import { useStepsStore } from '../../../src/store/steps';
import { useFeaturesStore } from '../../../src/store/features';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';
import { MiniLineChart, CHART_H } from '../../../src/components/dashboard/MiniLineChart';
import { TAB_ORDER, TAB_LABELS, visibleTabs, widgetsForTab, type Tab } from '../../../src/components/dashboard/dashboardTabs';
import { DashboardGoalCard, sortPinnedGoals } from '../../../src/components/goals/DashboardGoalCard';

// ── Color constants ───────────────────────────────────────────────────────────
const COL_GOLD    = '#D4A843';
const COL_CAL     = '#fb923c';
const COL_TDEE    = '#94a3b8';
const COL_WEIGHT  = '#a78bfa';
const COL_GOOD    = '#7BB389';
const COL_WARN    = '#C9714F';


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

// MiniLineChart / CHART_H are now imported from src/components/dashboard/MiniLineChart
// (shared with the goal cards under src/components/goals/).

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ label, actual, goal, unit, c }: {
  label: string; actual: number; goal: number | null; unit: string; c: Colors;
}) {
  const pctRaw = goal && goal > 0 ? actual / goal : 0;
  const pct = Math.min(pctRaw, 1);
  const over = goal != null && goal > 0 && actual > goal;
  const nearGoal = goal != null && goal > 0 && pctRaw >= 0.95 && pctRaw <= 1.05;
  const barColor = nearGoal ? COL_GOOD : COL_GOLD;
  const valueColor = over ? COL_WARN : c.text;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: fontSize.sm, color: c.muted }}>{label}</Text>
        <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: valueColor, fontVariant: ['tabular-nums'] }}>
          {actual.toLocaleString()}{unit}
          {goal != null ? <Text style={{ color: c.muted, fontWeight: '400' }}> / {goal.toLocaleString()}{unit}</Text> : null}
        </Text>
      </View>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct * 100}%` as any, borderRadius: 3, backgroundColor: barColor }} />
      </View>
      {over && goal != null && (
        <Text style={{ fontSize: 11, color: COL_WARN }}>+{(actual - goal).toLocaleString()}{unit} over</Text>
      )}
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

// ── Weekly progress row ───────────────────────────────────────────────────────
function WeeklyProgressRow({ label, val, goal, fmtv, fmtg, daysElapsed, c }: {
  label: string; val: number; goal: number; fmtv: string; fmtg: string; daysElapsed: number; c: Colors;
}) {
  const pct = Math.min(val / goal, 1);
  const expected = goal * (daysElapsed / 7);
  const paceStatus: 'done' | 'ahead' | 'close' | 'behind' = pct >= 1 ? 'done' : val >= expected * 0.95 ? 'ahead' : val >= expected * 0.75 ? 'close' : 'behind';
  const paceColor = paceStatus === 'done' || paceStatus === 'ahead' ? COL_GOOD : paceStatus === 'close' ? COL_GOLD : COL_WARN;
  const paceLabel = paceStatus === 'done' ? 'Done' : paceStatus === 'ahead' ? 'On pace' : paceStatus === 'close' ? 'Close' : 'Behind';
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: fontSize.sm, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
        <View style={{ borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: paceColor + '28' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: paceColor }}>{paceLabel}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] }}>{fmtv}</Text>
        <Text style={{ fontSize: fontSize.sm, color: c.muted, fontVariant: ['tabular-nums'] }}>/ {fmtg}</Text>
      </View>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'visible' }}>
        <View style={{ height: '100%', width: `${pct * 100}%` as any, borderRadius: 3, backgroundColor: COL_GOLD, opacity: 0.85 }} />
        <View style={{ position: 'absolute', top: -4, bottom: -4, left: `${(daysElapsed / 7) * 100}%` as any, width: 2, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
      </View>
    </View>
  );
}

// Goal-card status/projection logic now lives entirely in src/components/goals/ +
// @pulse/api-client's goalCardLogic (shared with web) — see DashboardGoalCard.

// ── Weekly averages helper ────────────────────────────────────────────────────
function buildWeeklyAverages(foodLogHistory: FoodLogHistoryDay[], workouts: WorkoutSummary[], todayTDEE: TDEEBreakdown | null) {
  const now = new Date();
  const exerciseByDate: Record<string, number> = {};
  for (const w of workouts) {
    if (w.caloriesBurned) exerciseByDate[w.workoutDate] = (exerciseByDate[w.workoutDate] ?? 0) + w.caloriesBurned;
  }
  const baseline = todayTDEE ? todayTDEE.bmr + todayTDEE.neat + todayTDEE.stepsKcal : null;
  const weeks: { weekStart: string; label: string; calories: number; protein: number; carbs: number; fat: number; tdee: number | null; net: number | null; isCurrentWeek: boolean; days: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i * 7);
    const ws = getWeekStart(localDateStr(d));
    const weekDate = new Date(ws + 'T12:00:00');
    weeks.push({ weekStart: ws, label: weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), calories: 0, protein: 0, carbs: 0, fat: 0, tdee: null, net: null, isCurrentWeek: ws === getWeekStart(localDateStr()), days: 0 });
  }
  for (const day of foodLogHistory) {
    const ws = getWeekStart(day.date);
    const week = weeks.find((wk) => wk.weekStart === ws);
    if (!week) continue;
    week.calories += day.calories;
    week.protein += day.protein;
    week.carbs += day.entries.reduce((s, e) => s + e.carbsG, 0);
    week.fat += day.entries.reduce((s, e) => s + e.fatG, 0);
    week.days++;
    if (baseline != null) {
      const tef = Math.round(day.calories * 0.1);
      const ex = exerciseByDate[day.date] ?? 0;
      week.tdee = (week.tdee ?? 0) + baseline + tef + ex;
    }
  }
  for (const week of weeks) {
    if (week.days > 0) {
      week.calories = Math.round(week.calories / week.days);
      week.protein  = Math.round(week.protein  / week.days);
      week.carbs    = Math.round(week.carbs    / week.days);
      week.fat      = Math.round(week.fat      / week.days);
      if (week.tdee != null) { week.tdee = Math.round(week.tdee / week.days); week.net = week.calories - week.tdee; }
    }
  }
  return [...weeks].reverse().filter((w) => w.days > 0 || w.isCurrentWeek).slice(0, 5);
}

// ── Today Snapshot ────────────────────────────────────────────────────────────
function TodaySnapshot({ workouts, nutrition, water, steps }: {
  workouts: WorkoutSummary[];
  nutrition: NutritionSummary['nutrition']['actual'] | null;
  water: WaterDay | null;
  steps: StepsEntry | null;
}) {
  const [copied, setCopied] = useState(false);

  const glasses      = water ? Math.round(water.totalOz / 8) : 0;
  const hasNutrition = (nutrition?.calories ?? 0) > 0;

  const lines: string[] = ["Today's stats:"];
  for (const w of workouts) {
    if (w.exerciseCount > 0) lines.push(`- ${buildWorkoutLine(w)}`);
  }
  if (hasNutrition) {
    lines.push(`- Calories: ${nutrition!.calories.toLocaleString()}, Protein: ${Math.round(nutrition!.proteinG)}g, Carbs: ${Math.round(nutrition!.carbsG)}g, Fats: ${Math.round(nutrition!.fatG)}g`);
  }
  if (glasses > 0) lines.push(`- Water: ${glasses} glasses`);
  if ((steps?.steps ?? 0) > 0) lines.push(`- Steps: ${steps!.steps!.toLocaleString()}`);

  const text = lines.join('\n');

  function copy() {
    Share.share({ message: text }).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const c = useColors();
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10, position: 'relative' }}>
      <Text style={{ fontSize: 13, color: c.muted, fontFamily: 'monospace', lineHeight: 22 }}>{text}</Text>
      <TouchableOpacity onPress={copy} style={{ position: 'absolute', top: 12, right: 14 }}>
        <Text style={{ fontSize: 11, color: copied ? COL_GOOD : c.muted, fontFamily: 'monospace', fontWeight: '600' }}>
          {copied ? 'copied' : 'copy'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Weekly Snapshot ───────────────────────────────────────────────────────────
function WeeklySnapshot({ weekStart, today, workouts, foodLogHistory, stepsWeekHistory, waterWeekHistory, measurements }: {
  weekStart: string;
  today: string;
  workouts: WorkoutSummary[];
  foodLogHistory: FoodLogHistoryDay[];
  stepsWeekHistory: StepsEntry[];
  waterWeekHistory: WaterHistoryDay[];
  measurements: BodyMeasurement[];
}) {
  const [copied, setCopied] = useState(false);
  const c = useColors();

  const weekEndDate = new Date(weekStart + 'T12:00:00');
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);
  const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const header = `Weekly stats (${fmtDay(weekStart)} – ${fmtDay(weekEnd)}):`;

  const weekWorkouts = workouts.filter(w => getWeekStart(w.workoutDate) === weekStart && w.exerciseCount > 0);
  const grouped: Map<string, number> = new Map();
  for (const w of weekWorkouts) {
    const name = w.routineName ?? w.name ?? 'Free workout';
    grouped.set(name, (grouped.get(name) ?? 0) + (w.totalVolumeKg ?? 0) * KG_TO_LBS);
  }
  const totalVolumeLbs = [...grouped.values()].reduce((s, v) => s + v, 0);

  const weekFoodDays = foodLogHistory.filter(d => d.date >= weekStart && d.date <= today);
  const totalCal     = weekFoodDays.reduce((s, d) => s + d.calories, 0);
  const totalProtein = weekFoodDays.reduce((s, d) => s + d.protein, 0);
  const totalCarbs   = weekFoodDays.reduce((s, d) => s + d.entries.reduce((e, en) => e + en.carbsG, 0), 0);
  const totalFat     = weekFoodDays.reduce((s, d) => s + d.entries.reduce((e, en) => e + en.fatG, 0), 0);
  const daysWithData = weekFoodDays.filter(d => d.calories > 0).length;

  const totalOz      = waterWeekHistory.filter(d => d.date >= weekStart && d.date <= today).reduce((s, d) => s + d.totalOz, 0);
  const totalGlasses = Math.round(totalOz / 8);

  const weekSteps = stepsWeekHistory.filter(s => s.date >= weekStart && s.date <= today).reduce((s, d) => s + (d.steps ?? 0), 0);

  const priorWeekEndStr = (() => { const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
  function getLastStat(metric: string) {
    const sorted = measurements.filter(m => m.metric === metric).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
    const current = sorted[0] ?? null;
    const prior   = sorted.find(m => m.measuredAt <= priorWeekEndStr) ?? null;
    return { current, prior };
  }
  function fmtM(m: BodyMeasurement) {
    const val = m.metric === 'weight' && m.unit === 'kg' ? m.value * KG_TO_LBS : m.value;
    return `${val.toFixed(1)} ${m.metric === 'weight' ? 'lb' : 'in'}`;
  }

  const lines: string[] = [header];

  if (totalCal > 0) {
    lines.push(`- Macros: ${Math.round(totalCal).toLocaleString()} cal | ${Math.round(totalProtein)}g protein | ${Math.round(totalCarbs)}g carbs | ${Math.round(totalFat)}g fat`);
    if (daysWithData > 0) {
      lines.push(`- Daily avg: ${Math.round(totalCal / daysWithData).toLocaleString()} cal | ${Math.round(totalProtein / daysWithData)}g protein | ${Math.round(totalCarbs / daysWithData)}g carbs | ${Math.round(totalFat / daysWithData)}g fat`);
    }
  }
  for (const [name, volLbs] of grouped) {
    lines.push(volLbs > 0 ? `- ${name}: ${Math.round(volLbs).toLocaleString()} lbs` : `- ${name}`);
  }
  if (weekWorkouts.length > 0 && totalVolumeLbs > 0) {
    lines.push(`- Total volume: ${Math.round(totalVolumeLbs).toLocaleString()} lbs`);
  }
  if (totalGlasses > 0) lines.push(`- Water: ${totalGlasses} glasses`);
  if (weekSteps > 0) lines.push(`- Steps: ${weekSteps.toLocaleString()}`);

  for (const { metric, label } of [
    { metric: 'weight', label: 'Weight' },
    { metric: 'chest',  label: 'Chest'  },
    { metric: 'bicep',  label: 'Bicep'  },
    { metric: 'waist',  label: 'Waist'  },
  ]) {
    const { current, prior } = getLastStat(metric);
    if (current) {
      const priorStr = prior && prior.id !== current.id ? ` (prior: ${fmtM(prior)})` : '';
      lines.push(`- ${label}: ${fmtM(current)}${priorStr}`);
    }
  }

  const text = lines.join('\n');

  function share() {
    Share.share({ message: text }).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <View style={{ backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10, position: 'relative' }}>
      <Text style={{ fontSize: 13, color: c.muted, fontFamily: 'monospace', lineHeight: 22 }}>{text}</Text>
      <TouchableOpacity onPress={share} style={{ position: 'absolute', top: 12, right: 14 }}>
        <Text style={{ fontSize: 11, color: copied ? COL_GOOD : c.muted, fontFamily: 'monospace', fontWeight: '600' }}>
          {copied ? 'copied' : 'copy'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// TABS is the full catalog-defined tab order, kept as a plain alias so the
// useSwipeNav call site below (owned by a concurrent change) keeps compiling
// unchanged. Rendering uses `tabs` — the layout-driven, feature-filtered subset.
const TABS = TAB_ORDER;

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DashboardV4Screen() {
  const token = useAuthStore((s) => s.token)!;
  const liveSteps = useStepsStore((s) => s.liveSteps);
  const c = useColors();
  const s = makeStyles(c);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('today');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const features        = useFeaturesStore((st) => st.features);
  const dashboardLayout = useFeaturesStore((st) => st.dashboardLayout);
  // Resolved widget/tab layout for this platform: order, visibility, and which tab
  // each widget lives on, with feature-disabled widgets already filtered out.
  const layout = resolveLayout(dashboardLayout, 'mobile', features);
  const tabs   = visibleTabs(layout);
  // Order-driven rendering: widgetsForTab(layout, tab) below returns each tab's
  // visible widget keys in stored layout order (catalog default order until the
  // user customizes it in Settings › Dashboard); WIDGET_RENDERERS supplies the JSX.

  // Swipe navigation (between internal tabs and to next navbar section)
  const panResponder = useSwipeNav(
    'dashboard',
    TABS,
    activeTab,
    setActiveTab
  );

  // If the active tab was hidden out from under the user (a widget got hidden or a
  // feature toggled off), fall back to the first tab that's still visible.
  useEffect(() => {
    if (tabs.length && !tabs.includes(activeTab)) setActiveTab(tabs[0]);
  }, [tabs.join(','), activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Data state
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [nutritionSummary, setNutritionSummary] = useState<NutritionSummary | null>(null);
  const [activeGoals, setActiveGoals] = useState<Goal[]>([]);
  const [foodLogHistory, setFoodLogHistory] = useState<FoodLogHistoryDay[]>([]);
  const [dailyHistory, setDailyHistory] = useState<DailyHistoryEntry[]>([]);
  const [routinesList, setRoutinesList] = useState<RoutineSummary[]>([]);
  const [todayTDEE, setTodayTDEE] = useState<TDEEBreakdown | null>(null);
  const [recovery,  setRecovery]  = useState<RecoveryData | null>(null);
  const [upcoming,  setUpcoming]  = useState<UpcomingSession[]>([]);
  const [routineDetail, setRoutineDetail] = useState<RoutineDetail | null>(null);
  const [todayWater, setTodayWater] = useState<WaterDay | null>(null);
  const [todaySteps, setTodaySteps] = useState<StepsEntry | null>(null);
  const [stepsWeekHistory,   setStepsWeekHistory]   = useState<StepsEntry[]>([]);
  const [waterWeekHistory,   setWaterWeekHistory]   = useState<WaterHistoryDay[]>([]);
  const [pinnedGoals, setPinnedGoals] = useState<Goal[]>([]); // derived from activeGoals
  const [phase2Ready, setPhase2Ready] = useState(false);
  const [mountedTabs, setMountedTabs] = useState(new Set<Tab>(['today']));
  const scrollRef = useRef<ScrollView>(null);

  // Lazily mount each tab on first visit, then keep alive (avoids expensive chart remounts)
  useEffect(() => {
    setMountedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeTab]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setPhase2Ready(false); }
    const end = localDateStr();
    const startD = new Date(); startD.setDate(startD.getDate() - 89);
    const start = localDateStr(startD);

    // Fire all requests simultaneously — gated on FEATURES (a module the user turned
    // off never fetches), not on layout visibility (a widget merely hidden from the
    // dashboard must keep its data loaded, since other tabs/screens may still use it).
    const workoutsP     = features.exercise  ? getWorkouts(token, { limit: 200 }).catch(() => [] as WorkoutSummary[]) : Promise.resolve([] as WorkoutSummary[]);
    const measurementsP = features.body      ? getMeasurements(token).catch(() => [] as BodyMeasurement[]) : Promise.resolve([] as BodyMeasurement[]);
    const summaryP      = features.nutrition ? getNutritionSummary(token).catch(() => null) : Promise.resolve(null);
    const foodHistP     = features.nutrition ? getFoodLogHistory(token, { limit: 90 }).catch(() => [] as FoodLogHistoryDay[]) : Promise.resolve([] as FoodLogHistoryDay[]);
    const dailyHistP    = features.nutrition ? getDailyHistory(token, start, end).catch(() => [] as DailyHistoryEntry[]) : Promise.resolve([] as DailyHistoryEntry[]);
    const routinesP     = features.exercise && features.routines ? getRoutines(token).catch(() => [] as RoutineSummary[]) : Promise.resolve([] as RoutineSummary[]);
    const tdeeP         = features.nutrition ? getNutritionTDEE(token).catch(() => null) : Promise.resolve(null);
    const recoveryP     = features.exercise && features.recovery ? getRecovery(token).catch(() => null) : Promise.resolve(null);
    const upcomingP     = features.exercise && features.workoutSchedules ? getUpcomingSchedule(token, 7).catch(() => [] as UpcomingSession[]) : Promise.resolve([] as UpcomingSession[]);
    const waterP        = features.nutrition && features.water ? getWaterDay(token, localDateStr()).catch(() => null) : Promise.resolve(null);
    const stepsP        = features.activity  ? getSteps(token).catch(() => null) : Promise.resolve(null);
    const thisWeekStart = getWeekStart(localDateStr());
    const stepsHistP    = features.activity  ? getStepsHistory(token, 14).catch(() => [] as StepsEntry[]) : Promise.resolve([] as StepsEntry[]);
    const waterHistP    = features.nutrition && features.water ? getWaterHistory(token, thisWeekStart, localDateStr()).catch(() => ({ goalOz: 0, days: [] as WaterHistoryDay[] })) : Promise.resolve({ goalOz: 0, days: [] as WaterHistoryDay[] });
    const goalsP        = features.goals     ? goalsV2Api.getAll('active').catch(() => [] as Goal[]) : Promise.resolve([] as Goal[]);

    // Unblock the page as soon as essential above-the-fold data arrives
    try {
      const [ns, tdee, wd, sd, ag] = await Promise.all([summaryP, tdeeP, waterP, stepsP, goalsP]);
      setNutritionSummary(ns as NutritionSummary | null);
      setTodayTDEE(tdee && (tdee as any).available ? (tdee as TDEEBreakdown) : null);
      setTodayWater(wd as WaterDay | null);
      setTodaySteps(sd as StepsEntry | null);
      const goals = ag as Goal[];
      setActiveGoals(goals);
      setPinnedGoals(goals.filter(g => g.showOnDashboard));
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false); }

    // Background — fill in charts and history as they arrive
    try {
      const [ws, ms, fl, dh, rl, rec, upc, sh, wh] = await Promise.all([
        workoutsP, measurementsP, foodHistP, dailyHistP, routinesP, recoveryP, upcomingP, stepsHistP, waterHistP,
      ]);
      setWorkouts(ws);
      setMeasurements(ms as BodyMeasurement[]);
      setFoodLogHistory((fl as FoodLogHistoryDay[]).sort((a, b) => a.date.localeCompare(b.date)));
      setDailyHistory(dh as DailyHistoryEntry[]);
      setRoutinesList(rl as RoutineSummary[]);
      setRecovery(rec);
      setUpcoming(upc as UpcomingSession[]);
      setStepsWeekHistory(sh as StepsEntry[]);
      setWaterWeekHistory((wh as { goalOz: number; days: WaterHistoryDay[] }).days);
    } catch { /* ignore */ }
    setPhase2Ready(true);
  }, [token, features]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true).finally(() => setRefreshing(false));
  }, [loadData]);

  // Load routine detail when there's a scheduled session but no workout today
  const _todayStr = localDateStr();
  const _todayWorkoutId = workouts.find((w) => w.workoutDate === _todayStr)?.id ?? null;
  const _todayScheduledRoutineId = !_todayWorkoutId ? (upcoming.find((s) => s.date === _todayStr && s.status === 'scheduled' && !s.isRestDay)?.routineId ?? null) : null;
  useEffect(() => {
    if (_todayScheduledRoutineId) {
      setRoutineDetail(null);
      getRoutine(token, _todayScheduledRoutineId).then(setRoutineDetail).catch(() => {});
    } else {
      setRoutineDetail(null);
    }
  }, [_todayWorkoutId, _todayScheduledRoutineId, token]);

  // ── Derived: today ────────────────────────────────────────────────────────
  const todayStr = localDateStr();
  const currentWeekStart = getWeekStart(todayStr);

  const caloriesGoal     = nutritionSummary?.nutrition.goals?.calories ?? null;
  const caloriesConsumed = Math.round(nutritionSummary?.nutrition.actual.calories ?? 0);
  const caloriePctRaw    = caloriesGoal && caloriesGoal > 0 ? caloriesConsumed / caloriesGoal : 0;
  const calorieRingColor = caloriesGoal && caloriePctRaw >= 0.95 && caloriePctRaw <= 1.05 ? COL_GOOD : COL_GOLD;
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
  const weekWorkoutGoal = activeGoals.find(g => g.catalogKey === 'exercise_workouts_per_week')?.targetValue ?? null;
  const foodByDate = Object.fromEntries(foodLogHistory.map((d) => [d.date, d]));
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart + 'T12:00:00'); d.setDate(d.getDate() + i); return localDateStr(d);
  });
  const weekCalories = weekDays.reduce((s, d) => s + (foodByDate[d]?.calories ?? 0), 0);
  const weekProtein  = weekDays.reduce((s, d) => s + (foodByDate[d]?.protein ?? 0), 0);
  const weekCalGoal  = caloriesGoal ? caloriesGoal * 7 : null;
  const weekProtGoal = proteinGoal  ? proteinGoal  * 7 : null;
  const daysIn = weekDays.filter((d) => d <= todayStr && foodByDate[d]?.calories).length;
  const daysElapsed = Math.min(7, Math.max(1, Math.ceil((new Date(todayStr + 'T00:00:00').getTime() - new Date(currentWeekStart + 'T00:00:00').getTime()) / 86400000) + 1));
  const weekVolumeLbs = workouts.filter((w) => getWeekStart(w.workoutDate) === currentWeekStart).reduce((s, w) => s + (w.totalVolumeKg ?? 0) * KG_TO_LBS, 0);
  const todaySession = upcoming.find((s) => s.date === todayStr && s.status === 'scheduled' && !s.isRestDay) ?? null;
  const isTodayRestDay = !todaySession && upcoming.some((s) => s.date === todayStr && s.isRestDay);

  // Weekly averages & volume buckets
  const weeklyAverages = buildWeeklyAverages(foodLogHistory, workouts, todayTDEE);
  const weeklyData: WeekBucket[] = buildWeeklyData(workouts);

  if (loading) return <ActivityIndicator style={{ marginTop: 60 }} color={COL_GOLD} />;

  function workoutName(w: WorkoutSummary) {
    return w.routineId ? (routineById[w.routineId]?.name ?? w.name ?? 'Workout') : (w.name ?? 'Free workout');
  }
  function daysAgoLabel(dateStr: string) {
    const diff = Math.round((new Date(todayStr + 'T12:00:00').getTime() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000);
    return diff === 1 ? '1d ago' : `${diff}d ago`;
  }

  // ── Widget renderers, keyed by catalog key ────────────────────────────────────
  // Each entry returns the same card JSX the dashboard has always rendered; the
  // only thing that changed is WHERE in the tree it's called from — widgetsForTab
  // below picks the ordered, visible subset for the active tab and invokes these.
  const WIDGET_RENDERERS: Record<DashboardWidgetKey, () => ReactNode> = {
    fuelToday: () => (
      <View style={s.card}>
        <CardHeader title="Fuel Today" c={c} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <CalorieRing pct={caloriePctRaw} color={calorieRingColor} size={84} c={c} />
            <Text style={{ fontSize: fontSize.sm, color: c.muted, textAlign: 'center' }}>
              <Text style={{ fontWeight: '700', color: caloriesGoal && caloriesConsumed > caloriesGoal ? COL_WARN : c.text }}>{caloriesConsumed.toLocaleString()}</Text>
              {caloriesGoal ? `/${caloriesGoal.toLocaleString()} kcal` : ' kcal'}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <ProgressBar label="Protein" actual={proteinConsumed} goal={proteinGoal} unit="g" c={c} />
            <ProgressBar label="Carbs"   actual={carbsConsumed}   goal={carbsGoal}   unit="g" c={c} />
            <ProgressBar label="Fat"     actual={fatConsumed}     goal={fatGoal}     unit="g" c={c} />
          </View>
        </View>
        {burnedToday > 0 && (
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            <Text style={{ fontSize: fontSize.sm, color: c.muted }}>Burned <Text style={{ color: '#f87171', fontWeight: '600' }}>{burnedToday.toLocaleString()} kcal</Text></Text>
            <Text style={{ fontSize: fontSize.sm, color: c.muted }}>Net <Text style={{ fontWeight: '600', color: c.text }}>{(caloriesConsumed - burnedToday).toLocaleString()} kcal</Text></Text>
          </View>
        )}
      </View>
    ),

    exerciseToday: () => (
      <View style={s.card}>
        {/* Recovery strip */}
        {recovery && (
          <View style={{ paddingBottom: 10, marginBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: fontSize.sm, color: c.muted }}>Recovery</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: recovery.level === 'high' ? COL_GOOD : recovery.level === 'medium' ? COL_GOLD : COL_WARN }}>{recovery.score}</Text>
              <View style={{ borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: (recovery.level === 'high' ? COL_GOOD : recovery.level === 'medium' ? COL_GOLD : COL_WARN) + '22' }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: recovery.level === 'high' ? COL_GOOD : recovery.level === 'medium' ? COL_GOLD : COL_WARN, textTransform: 'uppercase' }}>{recovery.level}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, color: c.muted }}>{recovery.hint}</Text>
          </View>
        )}

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
        ) : isTodayRestDay ? (
          <>
            <CardHeader title="Exercise Today" c={c} />
            <Text style={{ fontSize: fontSize.base, color: c.muted }}>Rest day — take it easy.</Text>
          </>
        ) : todaySession ? (
          <>
            <CardHeader title="Exercise Today" c={c} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>Scheduled today</Text>
                <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: c.text }} numberOfLines={1} ellipsizeMode="tail">{todaySession.routineName ?? todaySession.exerciseName ?? 'Workout'}</Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: COL_GOLD, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 7 }}
                onPress={() => router.push('/(app)/(tabs)/workouts')}
              >
                <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: '#1a1206' }}>Start</Text>
              </TouchableOpacity>
            </View>
            {routineDetail && routineDetail.exercises.slice(0, 5).map((re, i) => {
              const last = re.lastPerformedSets;
              const maxWeightKg = last?.reduce((m, s) => Math.max(m, s.weightKg ?? 0), 0) ?? 0;
              const setCount = last?.length ?? re.templateSets.length;
              const topReps = last?.find((s) => s.weightKg === maxWeightKg)?.reps ?? null;
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
                  <Text style={{ fontSize: fontSize.sm, color: c.text, flex: 1, marginRight: 8 }} numberOfLines={1} ellipsizeMode="tail">{re.exercise.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                    <Text style={{ fontSize: 12, color: c.muted }}>{setCount} sets</Text>
                    {maxWeightKg > 0 && (
                      <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: c.muted, fontVariant: ['tabular-nums'] }}>
                        {Math.round(maxWeightKg * KG_TO_LBS)} lb{topReps ? ` × ${topReps}` : ''}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
            {routineDetail && routineDetail.exercises.length > 5 && (
              <Text style={{ fontSize: 11, color: c.muted }}>+{routineDetail.exercises.length - 5} more</Text>
            )}
          </>
        ) : lastWorkout ? (
          <>
            <CardHeader title="Exercise Today" meta="Not logged today" c={c} />
            <Text style={{ fontSize: fontSize.sm, color: c.muted }}>Last — {workoutName(lastWorkout)} ({daysAgoLabel(lastWorkout.workoutDate)})</Text>
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
        ) : !phase2Ready ? (
          <>
            <CardHeader title="Exercise Today" c={c} />
            <ActivityIndicator color={COL_GOLD} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
          </>
        ) : (
          <>
            <CardHeader title="Exercise Today" meta="Not logged today" c={c} />
            <Text style={{ fontSize: fontSize.sm, color: c.muted }}>No workouts yet. Head to Train to get started.</Text>
          </>
        )}
      </View>
    ),

    weeklyProgress: () => {
      const volGoal = activeGoals.find(g => g.catalogKey === 'exercise_volume_per_week')?.targetValue ?? 0;
      const items = [
        (weekCalGoal ?? 0) > 0   ? { label: 'Calories', val: weekCalories,  goal: weekCalGoal!,       fmtv: weekCalories.toLocaleString(),              fmtg: `${weekCalGoal!.toLocaleString()} kcal` }      : null,
        (weekProtGoal ?? 0) > 0  ? { label: 'Protein',  val: weekProtein,   goal: weekProtGoal!,      fmtv: `${Math.round(weekProtein)}g`,               fmtg: `${weekProtGoal!}g` }                          : null,
        weekWorkoutGoal          ? { label: 'Workouts', val: weekWorkouts,   goal: weekWorkoutGoal,    fmtv: String(weekWorkouts),                        fmtg: `of ${weekWorkoutGoal}` }                      : null,
        volGoal > 0              ? { label: 'Volume',   val: weekVolumeLbs,  goal: volGoal,            fmtv: Math.round(weekVolumeLbs).toLocaleString(),  fmtg: `${Math.round(volGoal).toLocaleString()} lb` } : null,
      ].filter(Boolean) as { label: string; val: number; goal: number; fmtv: string; fmtg: string }[];
      if (!items.length) return null;
      return (
        <View style={s.card}>
          <CardHeader title="Weekly Progress" meta={`day ${daysElapsed} of 7`} c={c} />
          <View style={{ gap: 18 }}>
            {items.map((m) => (
              <WeeklyProgressRow key={m.label} {...m} daysElapsed={daysElapsed} c={c} />
            ))}
          </View>
        </View>
      );
    },

    // Today's Blurb — sections itself by feature (see TodaySnapshot: each line is
    // only appended when its domain's data is non-empty, and a disabled feature's
    // fetch above returns [] before this ever renders).
    todayBlurb: () => (
      <TodaySnapshot
        workouts={todayWorkouts}
        nutrition={nutritionSummary?.nutrition.actual ?? null}
        water={todayWater}
        steps={liveSteps != null ? { ...(todaySteps ?? {}), steps: liveSteps } as any : todaySteps}
      />
    ),

    // Weekly Blurb — same per-feature sectioning as the Today blurb.
    weeklyBlurb: () => (
      <WeeklySnapshot
        weekStart={currentWeekStart}
        today={todayStr}
        workouts={workouts}
        foodLogHistory={foodLogHistory}
        stepsWeekHistory={stepsWeekHistory}
        waterWeekHistory={waterWeekHistory}
        measurements={measurements}
      />
    ),

    // One flat pass over showOnDashboard goals, sorted by sortOrder then id — no more
    // special-cased weight/waist/bicep/workout-frequency blocks that only fired for a
    // hardcoded set of catalog keys. Every pinned goal renders through DashboardGoalCard,
    // which always resolves to a real variant (an unmapped catalog key falls back to the
    // progress card) so nothing a user pinned ever silently disappears.
    goalProgress: () => {
      const dashboardGoals = sortPinnedGoals(pinnedGoals);
      if (!dashboardGoals.length) {
        return !phase2Ready ? (
          <View style={s.card}>
            <ActivityIndicator color={COL_GOLD} style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : null;
      }
      return (
        <View style={{ gap: 12 }}>
          {dashboardGoals.map((goal) => (
            <DashboardGoalCard
              key={goal.id}
              goal={goal}
              measurements={measurements}
              foodLogHistory={foodLogHistory}
              stepsHistory={stepsWeekHistory}
              weeklyData={weeklyData}
              workouts={workouts}
              routines={routinesList}
              tdee={todayTDEE}
              measurementsReady={phase2Ready}
              phase2Ready={phase2Ready}
              c={c}
            />
          ))}
        </View>
      );
    },

    calVsBurned: () => {
      const exByDate: Record<string, number> = {};
      for (const w of workouts) { if (w.caloriesBurned) exByDate[w.workoutDate] = (exByDate[w.workoutDate] ?? 0) + w.caloriesBurned; }
      const baseline = todayTDEE ? todayTDEE.bmr + todayTDEE.neat + todayTDEE.stepsKcal : null;
      const series = foodLogHistory.slice(-14).map((d) => {
        const tef = Math.round(d.calories * 0.1);
        const ex = exByDate[d.date] ?? 0;
        const tdee = baseline != null ? baseline + tef + ex : 0;
        return { cal: Math.round(d.calories), tdee, date: d.date };
      }).filter((d) => d.cal > 0 || d.tdee > 0);
      if (!series.length) return (
        <View style={s.card}>
          <CardHeader title="Calories · consumed vs burned" meta="14 days" c={c} />
          <Text style={{ fontSize: fontSize.sm, color: c.muted }}>No nutrition data in the last 30 days.</Text>
        </View>
      );
      const calVals  = series.map((d) => d.cal);
      const tdeeVals = series.map((d) => d.tdee);
      const hasTDEE  = tdeeVals.some(Boolean);
      const consumedAvg = Math.round(calVals.reduce((a, b) => a + b, 0) / calVals.length);
      const burnedFiltered = tdeeVals.filter(Boolean);
      const burnedAvg = burnedFiltered.length ? Math.round(burnedFiltered.reduce((a, b) => a + b, 0) / burnedFiltered.length) : 0;
      const deficit = consumedAvg - burnedAvg;
      const allVals = [...calVals, ...tdeeVals.filter(Boolean)].filter(Boolean);
      const chartMin = allVals.length ? Math.min(...allVals) * 0.92 : 0;
      const chartMax = allVals.length ? Math.max(...allVals) * 1.05 : 1;
      return (
        <View style={s.card}>
          <CardHeader title="Calories · consumed vs burned" meta="14 days" c={c} />
          <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
            <View>
              <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>Consumed avg</Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] }}>{consumedAvg.toLocaleString()}<Text style={{ fontSize: 11, color: c.muted, fontWeight: '400' }}> kcal</Text></Text>
            </View>
            {burnedAvg > 0 && (
              <View>
                <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>Burned avg (TDEE)</Text>
                <Text style={{ fontSize: 22, fontWeight: '700', color: c.muted, fontVariant: ['tabular-nums'] }}>{burnedAvg.toLocaleString()}<Text style={{ fontSize: 11, color: c.muted, fontWeight: '400' }}> kcal</Text></Text>
              </View>
            )}
            {burnedAvg > 0 && (
              <View>
                <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>Avg daily net</Text>
                <Text style={{ fontSize: 22, fontWeight: '700', color: deficit < 0 ? COL_GOOD : COL_WARN, fontVariant: ['tabular-nums'] }}>{deficit > 0 ? '+' : ''}{deficit.toLocaleString()}</Text>
              </View>
            )}
          </View>
          <View style={{ height: CHART_H + 4, position: 'relative' }}>
            <MiniLineChart data={calVals} color={COL_GOLD} minOverride={chartMin} maxOverride={chartMax} />
            {hasTDEE && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.65 }}>
                <MiniLineChart data={tdeeVals} color={COL_TDEE} minOverride={chartMin} maxOverride={chartMax} />
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Text style={{ fontSize: 11, color: COL_GOLD }}>── consumed</Text>
            {hasTDEE && <Text style={{ fontSize: 11, color: COL_TDEE }}>╌╌ TDEE</Text>}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 11, color: c.muted }}>14 days ago</Text>
            <Text style={{ fontSize: 11, color: c.muted }}>today</Text>
          </View>
        </View>
      );
    },

    volumeByWeek: () => {
      const weeks12 = weeklyData.slice(-12);
      const hasVol  = weeks12.some((w) => w.volumeLbs > 0);
      if (!hasVol) return (
        <View style={s.card}>
          <CardHeader title="Exercise volume · week over week" meta="12 weeks" c={c} />
          <Text style={{ fontSize: fontSize.sm, color: c.muted }}>No workout volume data yet.</Text>
        </View>
      );
      const maxVol  = Math.max(...weeks12.map((w) => w.volumeLbs), 1);
      const currWk  = weeks12[weeks12.length - 1];
      const prevWks = weeks12.slice(0, -1).filter((w) => w.volumeLbs > 0);
      const avgVol  = prevWks.length ? Math.round(prevWks.reduce((s, w) => s + w.volumeLbs, 0) / prevWks.length) : 0;
      const bestVol = Math.max(...weeks12.map((w) => w.volumeLbs));
      const delta   = avgVol > 0 ? Math.round(currWk.volumeLbs - avgVol) : null;
      const BAR_H   = 80;
      return (
        <View style={s.card}>
          <CardHeader title="Exercise volume · week over week" meta="12 weeks" c={c} />
          <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
            <View>
              <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>This week</Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] }}>{Math.round(currWk.volumeLbs).toLocaleString()}<Text style={{ fontSize: 11, color: c.muted, fontWeight: '400' }}> lb</Text></Text>
            </View>
            {avgVol > 0 && (
              <View>
                <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>Avg / week</Text>
                <Text style={{ fontSize: 22, fontWeight: '700', color: c.muted, fontVariant: ['tabular-nums'] }}>{avgVol.toLocaleString()}<Text style={{ fontSize: 11, color: c.muted, fontWeight: '400' }}> lb</Text></Text>
              </View>
            )}
            {delta !== null && (
              <View>
                <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>vs avg</Text>
                <Text style={{ fontSize: 22, fontWeight: '700', color: delta >= 0 ? COL_GOOD : COL_WARN, fontVariant: ['tabular-nums'] }}>{delta > 0 ? '+' : ''}{delta.toLocaleString()}</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: BAR_H + 4 }}>
            {weeks12.map((wk, i) => {
              const barH = wk.volumeLbs > 0 ? Math.max(3, (wk.volumeLbs / maxVol) * BAR_H) : 0;
              const isCurr = i === weeks12.length - 1;
              const isBest = wk.volumeLbs === bestVol && wk.volumeLbs > 0;
              const bg = isCurr ? COL_GOLD : isBest ? `${COL_GOLD}8C` : `${COL_GOLD}47`;
              return (
                <View key={i} style={{ flex: 1, height: BAR_H, justifyContent: 'flex-end' }}>
                  <View style={{ height: barH, backgroundColor: bg, borderRadius: 2 }} />
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 11, color: c.muted }}>12 weeks ago</Text>
            <Text style={{ fontSize: 11, color: c.muted }}>this week</Text>
          </View>
        </View>
      );
    },

    heatmap: () => {
      const mon = new Date(todayStr + 'T12:00:00');
      mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
      type HeatCell = { date: string; vol: number };
      const heatWeeks: HeatCell[][] = [];
      for (let w = 11; w >= 0; w--) {
        const row: HeatCell[] = [];
        for (let d = 0; d < 7; d++) {
          const cell = new Date(mon); cell.setDate(mon.getDate() - w * 7 + d);
          row.push({ date: localDateStr(cell), vol: 0 });
        }
        heatWeeks.push(row);
      }
      for (const w of workouts) {
        for (const wk of heatWeeks) {
          const cell = wk.find((c) => c.date === w.workoutDate);
          if (cell) cell.vol += w.totalVolumeKg * KG_TO_LBS;
        }
      }
      const maxVol = Math.max(...heatWeeks.flatMap((wk) => wk.map((c) => c.vol)), 1);
      function heatColor(vol: number) {
        if (!vol) return 'rgba(255,255,255,0.04)';
        const op = Math.round((0.2 + (vol / maxVol) * 0.72) * 255);
        return COL_GOLD + op.toString(16).padStart(2, '0');
      }
      const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      return (
        <View style={s.card}>
          <CardHeader title="Exercise volume · 12-week heatmap" c={c} />
          <View style={{ flexDirection: 'row', gap: 5 }}>
            <View style={{ gap: 4, paddingTop: 1 }}>
              {dayLabels.map((d, i) => (
                <View key={i} style={{ height: 16, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: c.muted, width: 10 }}>{d}</Text>
                </View>
              ))}
            </View>
            <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
              {heatWeeks.map((wk, wi) => (
                <View key={wi} style={{ flex: 1, gap: 4 }}>
                  {wk.map((cell, di) => (
                    <View key={di} style={{ height: 16, backgroundColor: heatColor(cell.vol), borderRadius: 2 }} />
                  ))}
                </View>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 11, color: c.muted }}>12 weeks ago</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: 11, color: c.muted }}>less</Text>
              {[0.2, 0.4, 0.6, 0.85].map((op, i) => (
                <View key={i} style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: COL_GOLD + Math.round(op * 255).toString(16).padStart(2, '0') }} />
              ))}
              <Text style={{ fontSize: 11, color: c.muted }}>more</Text>
            </View>
            <Text style={{ fontSize: 11, color: c.muted }}>today</Text>
          </View>
        </View>
      );
    },

    weeklyAverages: () => {
      if (!weeklyAverages.some((w) => w.days > 0)) return null;
      return (
        <View style={s.card}>
          <CardHeader title="Weekly averages" meta="per-day avg · newest first" c={c} />
          {/* Header row */}
          <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
            {(['Week', 'Cal', 'Prot', 'Carbs', 'Fat', ...(todayTDEE ? ['Net'] : [])] as string[]).map((h, i) => (
              <Text key={h} style={{ flex: i === 0 ? 1.3 : 1, fontSize: 11, color: c.muted, fontWeight: '600', textAlign: i === 0 ? 'left' : 'right' }}>{h}</Text>
            ))}
          </View>
          {weeklyAverages.map((week) => (
            <View key={week.weekStart} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border + '33', backgroundColor: week.isCurrentWeek ? `${COL_GOLD}0A` : undefined, borderRadius: week.isCurrentWeek ? 4 : 0 }}>
              <Text style={{ flex: 1.3, fontSize: 13, color: week.isCurrentWeek ? c.text : c.muted, fontVariant: ['tabular-nums'] }}>
                {week.label}{week.isCurrentWeek ? <Text style={{ color: COL_GOLD, fontWeight: '600' }}> now</Text> : null}
              </Text>
              <Text style={{ flex: 1, fontSize: 13, color: week.days > 0 ? c.text : c.muted, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{week.days > 0 ? week.calories.toLocaleString() : '—'}</Text>
              <Text style={{ flex: 1, fontSize: 13, color: week.days > 0 ? COL_GOLD : c.muted, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{week.days > 0 ? week.protein : '—'}</Text>
              <Text style={{ flex: 1, fontSize: 13, color: week.days > 0 ? '#7C9ECB' : c.muted, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{week.days > 0 ? week.carbs : '—'}</Text>
              <Text style={{ flex: 1, fontSize: 13, color: week.days > 0 ? '#C5896E' : c.muted, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{week.days > 0 ? week.fat : '—'}</Text>
              {todayTDEE && (
                <Text style={{ flex: 1, fontSize: 13, textAlign: 'right', fontVariant: ['tabular-nums'], fontWeight: '600', color: week.net == null || !week.days ? c.muted : week.net < 0 ? '#86AA80' : week.net > 300 ? COL_WARN : c.muted }}>
                  {week.net != null && week.days > 0 ? `${week.net > 0 ? '+' : ''}${week.net.toLocaleString()}` : '—'}
                </Text>
              )}
            </View>
          ))}
        </View>
      );
    },

    recentSessions: () => {
      const completed = [...workouts].sort((a, b) => b.workoutDate.localeCompare(a.workoutDate));
      const rows = completed.slice(0, 10);
      if (!rows.length) return (
        <View style={s.card}>
          <Text style={{ fontSize: fontSize.sm, color: c.muted }}>{!phase2Ready ? 'Loading…' : 'No sessions yet.'}</Text>
        </View>
      );
      const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));
      return (
        <View style={s.card}>
          <CardHeader title="Recent sessions" meta="last 10" c={c} />
          {rows.map((session, idx) => {
            const highlights = computeHighlights(session, completed);
            const volLbs = Math.round((session.totalVolumeKg ?? 0) * KG_TO_LBS);
            const rt = session.routineType ?? (volLbs > 0 ? 'strength' : session.totalSteps ? 'steps' : 'cardio_duration');
            const totalSecs = session.totalDurationSeconds ?? session.exercises.reduce((acc, e) => acc + (e.totalDurationSeconds ?? 0), 0);

            let primaryVal: number | null = null;
            let primaryUnit = 'lbs';
            if (rt === 'steps') {
              primaryVal = session.totalSteps != null && totalSecs > 0 ? Math.round(session.totalSteps / (totalSecs / 60)) : null;
              primaryUnit = 'stairs/min';
            } else if (rt === 'cardio_distance') {
              const distMiles = session.totalDistanceMeters ? session.totalDistanceMeters / 1609.34 : null;
              primaryVal = distMiles && session.durationMinutes ? Number((distMiles / session.durationMinutes).toFixed(2)) : null;
              primaryUnit = 'mi/min';
            } else if (rt === 'cardio_duration') {
              primaryVal = totalSecs ? Math.round(totalSecs / 60) : (session.durationMinutes ?? null);
              primaryUnit = 'min';
            } else {
              primaryVal = volLbs > 0 ? volLbs : null;
            }

            const prior = completed.find((x) => x.id !== session.id && x.routineId != null && x.routineId === session.routineId && x.workoutDate < session.workoutDate);
            let priorVal: number | null = null;
            if (prior) {
              const priorVolLbs = Math.round((prior.totalVolumeKg ?? 0) * KG_TO_LBS);
              const priorSecs = prior.totalDurationSeconds ?? prior.exercises.reduce((acc, e) => acc + (e.totalDurationSeconds ?? 0), 0);
              if (rt === 'steps') {
                priorVal = prior.totalSteps != null && priorSecs > 0 ? Math.round(prior.totalSteps / (priorSecs / 60)) : null;
              } else if (rt === 'cardio_distance') {
                const priorMiles = prior.totalDistanceMeters ? prior.totalDistanceMeters / 1609.34 : null;
                priorVal = priorMiles && prior.durationMinutes ? Number((priorMiles / prior.durationMinutes).toFixed(2)) : null;
              } else if (rt === 'cardio_duration') {
                priorVal = priorSecs ? Math.round(priorSecs / 60) : (prior.durationMinutes ?? null);
              } else {
                priorVal = priorVolLbs > 0 ? priorVolLbs : null;
              }
            }

            const delta = priorVal != null && primaryVal != null ? primaryVal - priorVal : null;
            const deltaPct = delta != null && priorVal && priorVal > 0 ? (delta / priorVal * 100) : null;
            const sessionName = session.routineName ?? session.name ?? (session.exercises.length > 0 ? session.exercises.map((e) => e.name).join(', ') : 'Workout');
            const dateLabel = new Date(session.workoutDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            const secondaryParts: string[] = [];
            if (primaryVal != null) secondaryParts.push(primaryUnit === 'lbs' ? `${fmtNum(primaryVal)} lb` : `${primaryVal} ${primaryUnit}`);
            if (session.caloriesBurned) secondaryParts.push(`${fmtNum(session.caloriesBurned)} kcal`);

            return (
              <View key={session.id} style={{ paddingVertical: 10, borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: c.border }}>
                {/* Line 1: date · name · vs prior */}
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text style={{ fontSize: 11, color: c.muted, fontVariant: ['tabular-nums'], width: 42 }}>{dateLabel}</Text>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: c.text }} numberOfLines={1}>{sessionName}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: deltaPct != null ? (delta! >= 0 ? '#86AA80' : '#C5896E') : c.muted }}>
                    {deltaPct != null
                      ? `${delta! >= 0 ? '▲' : '▼'}${Math.abs(Math.round(deltaPct))}%`
                      : prior === undefined && session.routineId ? 'first' : '—'}
                  </Text>
                </View>
                {/* Line 2: metric · calories · highlights */}
                <View style={{ flexDirection: 'row', marginTop: 3, marginLeft: 48, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {secondaryParts.length > 0 && (
                    <Text style={{ fontSize: 12, color: c.muted, fontVariant: ['tabular-nums'] }}>{secondaryParts.join(' · ')}</Text>
                  )}
                  {highlights.map((h, i) => (
                    <Text key={i} style={{ fontSize: 12, color: COL_GOLD }}>★ {h}</Text>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      );
    },
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']} {...panResponder.panHandlers}>
      {/* Header */}
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Dashboard</Text>
      </View>

      {/* Tab bar — layout-driven: a tab whose every widget is hidden or feature-disabled
          drops out of the segmented control rather than rendering empty. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.segScroll} contentContainerStyle={s.segRow}>
        {tabs.map((t) => (
          <TouchableOpacity key={t} style={[s.segBtn, activeTab === t && s.segBtnActive]} onPress={() => setActiveTab(t)}>
            <Text style={[s.segLabel, activeTab === t && s.segLabelActive]}>
              {TAB_LABELS[t]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COL_GOLD} />}
      >

        {/* ══ TODAY tab ══ */}
        {mountedTabs.has('today') && (<View style={activeTab !== 'today' ? { display: 'none' } : undefined}>
          {widgetsForTab(layout, 'today').map((key) => (
            <Fragment key={key}>{WIDGET_RENDERERS[key]()}</Fragment>
          ))}
        </View>)}

        {/* ══ GOALS tab ══ */}
        {mountedTabs.has('goals') && (<View style={activeTab !== 'goals' ? { display: 'none' } : undefined}>
          {widgetsForTab(layout, 'goals').map((key) => (
            <Fragment key={key}>{WIDGET_RENDERERS[key]()}</Fragment>
          ))}
        </View>)}

        {/* ══ TRENDS tab ══ */}
        {mountedTabs.has('trends') && (<View style={activeTab !== 'trends' ? { display: 'none' } : undefined}>
          {widgetsForTab(layout, 'trends').map((key) => (
            <Fragment key={key}>{WIDGET_RENDERERS[key]()}</Fragment>
          ))}
        </View>)}

        {/* ══ SESSIONS tab ══ */}
        {mountedTabs.has('sessions') && (
          <View style={activeTab !== 'sessions' ? { display: 'none' } : undefined}>
            {widgetsForTab(layout, 'sessions').map((key) => (
              <Fragment key={key}>{WIDGET_RENDERERS[key]()}</Fragment>
            ))}
          </View>
        )}

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
