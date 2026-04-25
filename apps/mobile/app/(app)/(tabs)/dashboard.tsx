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
  getRoutineGoals, addWater,
  type WorkoutSummary, type ExerciseGoals, type BodyMeasurement, type MeasurementGoal,
  type PersonalBests, type GoalsSummary, type WaterHistory, type FoodLogHistoryDay,
  type DailyHistoryEntry, type RoutineSummary, type TDEEBreakdown,
} from '../../../src/api/client';
import {
  KG_TO_LBS, SATURATION_DAYS,
  localDateStr, getWeekStart, shortDate,
  buildWeeklyData, computeGoalPace, computeCreatineSaturation,
  computeWeekDelta, computeWeekStreak, computeHighlights, WEEK_STREAK_MILESTONES,
  type WeekBucket, type PaceStatus,
} from '../../../../../packages/api-client/src/index';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';

const GLASS_OZ = 8;
const BOTTLE_OZ = 20;

// ── Color palette constants ───────────────────────────────────────────────────
const COL_GOLD    = '#D4A843';
const COL_PROTEIN = '#60a5fa';
const COL_CARBS   = '#34d399';
const COL_FAT     = '#facc15';
const COL_WATER   = '#38bdf8';
const COL_WEIGHT  = '#a78bfa';
const COL_CAL     = '#fb923c';
const COL_TDEE    = '#94a3b8';
const COL_VOL     = '#a78bfa';

// ── Metric configs ────────────────────────────────────────────────────────────
const METRIC_CONFIG: Record<string, { label: string; unit: string; color: string; dir: 'up' | 'down' }> = {
  weight:      { label: 'Weight',      unit: 'lbs', color: COL_WEIGHT, dir: 'down' },
  waist:       { label: 'Waist',       unit: 'in',  color: COL_PROTEIN, dir: 'down' },
  bicep:       { label: 'Bicep',       unit: 'in',  color: COL_CARBS,  dir: 'up'   },
  bmi:         { label: 'BMI',         unit: '',    color: COL_GOLD,   dir: 'down' },
  body_fat:    { label: 'Body Fat',    unit: '%',   color: COL_FAT,    dir: 'down' },
  muscle_mass: { label: 'Muscle Mass', unit: 'lbs', color: '#86AA80',  dir: 'up'   },
};
const NORTH_STAR_METRICS = ['weight', 'waist', 'bicep'];
const BODY_COMP_METRICS  = ['weight', 'bmi', 'body_fat', 'muscle_mass'];

const PACE_COLORS: Record<PaceStatus, string> = { green: '#34d399', yellow: '#facc15', red: '#f87171', done: '#34d399' };
const PACE_LABELS: Record<PaceStatus, string> = { green: 'On pace', yellow: 'Slightly behind', red: 'Behind', done: 'Done!' };

// ── Tab structure ─────────────────────────────────────────────────────────────
const DASHBOARD_TABS = ['nutrition', 'exercise', 'goals'] as const;
type DashboardTab = typeof DASHBOARD_TABS[number];

// ── Pure-RN calorie ring ──────────────────────────────────────────────────────
// Two rotating blades, each a r×size rectangle inside a half-width clip container.
// Each blade is inside a size×size pivot wrapper whose center aligns with the
// circle center. Rotating the pivot sweeps the blade's visible area as an arc.
//
// The rectangle corners that extend outside the circle are hidden by:
//   - The inner mask (covers the hollow center)
//   - A card-colored border ring layered on top (covers the outer corners)
//
// Right clipper (left:r, w:r): pivot at left:-r → pivot center at x=0 in clipper = circle center.
//   Blade inside pivot at left:r (right half of pivot). rot: -180→0 as pct 0→50%.
// Left clipper (left:0, w:r): pivot at left:0 → pivot center at x=r in clipper = circle center.
//   Blade inside pivot at left:0 (left half of pivot). rot: 0→-180 as pct 50→100%.
//   (Negative rotation so the blade sweeps counter-clockwise into the left side.)
function CalorieRing({ pct, color, size = 100, c }: { pct: number; color: string; size?: number; c: Colors }) {
  const clampedPct = Math.min(Math.max(pct, 0), 1);
  const degrees = clampedPct * 360;
  const sw = 10;
  const r = size / 2;

  // Classic RN pie technique:
  // Each half-clipper is overflow:hidden, width=r, height=size.
  // Inside it a full-size (size×size) pivot rotates around the circle center.
  // The pivot contains a solid-color rectangle covering its own right half — this is the "blade".
  // As the pivot rotates, the blade sweeps the arc. The outer ring + inner mask convert it to a ring.
  //
  // Right clipper (left=r): blade starts hidden (-180deg) and sweeps to 0deg at 50%.
  // Left clipper (left=0): blade starts hidden (0deg) and sweeps to -180deg from 50–100%.
  //
  // Pivot rotation is around its own center (r, r) which equals the circle center.
  // The blade is a rect: top:0, left:r (right half of pivot), width:r, height:size.

  const rot1 = degrees <= 180 ? degrees - 180 : 0;
  const rot2 = degrees > 180 ? -(360 - degrees) : 0;

  return (
    <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden' }}>
      {/* Track ring */}
      <View style={{
        position: 'absolute', width: size, height: size,
        borderRadius: r, borderWidth: sw, borderColor: 'rgba(255,255,255,0.08)',
      }} />

      {/* Right clipper: reveals 0–180° */}
      <View style={{ position: 'absolute', top: 0, left: r, width: r, height: size, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 0, left: -r, width: size, height: size, transform: [{ rotate: `${rot1}deg` }] }}>
          <View style={{ position: 'absolute', top: 0, left: r, width: r, height: size, backgroundColor: color }} />
        </View>
      </View>

      {/* Left clipper: reveals 180–360°, only mounted past 50% */}
      {degrees > 180 && (
        <View style={{ position: 'absolute', top: 0, left: 0, width: r, height: size, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, transform: [{ rotate: `${rot2}deg` }] }}>
            <View style={{ position: 'absolute', top: 0, left: 0, width: r, height: size, backgroundColor: color }} />
          </View>
        </View>
      )}

      {/* Inner mask: punches out center to create the ring stroke */}
      <View style={{
        position: 'absolute', top: sw + 1, left: sw + 1,
        width: size - sw * 2 - 2, height: size - sw * 2 - 2,
        borderRadius: (size - sw * 2 - 2) / 2,
        backgroundColor: c.card,
      }} />

      {/* Center label */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color, fontVariant: ['tabular-nums'] }}>
          {Math.round(clampedPct * 100)}%
        </Text>
      </View>
    </View>
  );
}

// ── Mini line chart (pure RN) ─────────────────────────────────────────────────
const CHART_H = 56;
const DOT_R = 2.5;

function MiniLineChart({ data, color, goalLine, maxOverride, minOverride }: {
  data: number[]; color: string; goalLine?: number | null; maxOverride?: number; minOverride?: number;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 56;
  const maxVal = maxOverride ?? Math.max(...data, goalLine ?? 0, 1);
  const minVal = minOverride ?? 0;
  const range = maxVal - minVal || 1;
  if (data.length < 2) return <View style={{ height: CHART_H }} />;

  const pts = data.map((val, i) => ({
    x: (i / (data.length - 1)) * chartWidth,
    y: CHART_H - DOT_R - Math.max(((val - minVal) / range) * (CHART_H - DOT_R * 2), 0),
    val,
  }));

  const goalY = goalLine != null
    ? CHART_H - DOT_R - Math.max(((goalLine - minVal) / range) * (CHART_H - DOT_R * 2), 0)
    : null;

  return (
    <View style={{ height: CHART_H, width: chartWidth, position: 'relative' }}>
      {goalY != null && (
        <View style={{ position: 'absolute', left: 0, top: goalY - 0.5, width: chartWidth, height: 1, borderStyle: 'dashed', borderTopWidth: 1, borderColor: `${color}44` }} />
      )}
      {pts.map((pt, i) => {
        if (i === pts.length - 1) return null;
        const next = pts[i + 1];
        const dx = next.x - pt.x; const dy = next.y - pt.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View key={i + '_l'} style={{
            position: 'absolute', left: pt.x, top: pt.y - 0.75, width: len, height: 1.5,
            backgroundColor: `${color}99`, transformOrigin: 'left center',
            transform: [{ rotate: `${angle}deg` }],
          }} />
        );
      })}
      {pts.map((pt, i) => {
        if (pt.val === 0 && i !== pts.length - 1) return null;
        return (
          <View key={i + '_d'} style={{
            position: 'absolute', left: pt.x - DOT_R, top: pt.y - DOT_R,
            width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R,
            backgroundColor: i === pts.length - 1 ? color : `${color}88`,
          }} />
        );
      })}
    </View>
  );
}

// ── 7-bar day-of-week chart for current week ──────────────────────────────────
function DayVolumeBars({ workouts, volumeGoal, routineGoals, c }: {
  workouts: WorkoutSummary[];
  volumeGoal: number | null;
  routineGoals: Record<number, number>;
  c: Colors;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const today = localDateStr();
  const weekStart = getWeekStart(today);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    days.push(localDateStr(d));
  }

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  // Normalize bar heights same as web: strength = volumeLbs/volumeGoal, non-strength = sessions/targetPerWeek
  const pctByDate: Record<string, number> = {};
  for (const d of days) {
    const dayWorkouts = workouts.filter((w) => w.workoutDate === d);
    if (dayWorkouts.length === 0) { pctByDate[d] = 0; continue; }
    const hasStrength = dayWorkouts.some((w) => !w.routineType || w.routineType === 'strength' || w.routineType === 'bodyweight');
    if (hasStrength) {
      const volLbs = dayWorkouts.reduce((s, w) => s + (w.totalVolumeKg ?? 0) * KG_TO_LBS, 0);
      pctByDate[d] = volumeGoal ? volLbs / volumeGoal : volLbs / 10000;
    } else {
      pctByDate[d] = dayWorkouts
        .filter((w) => w.routineType && w.routineType !== 'strength' && w.routineType !== 'bodyweight')
        .reduce((sum, w) => {
          const target = w.routineId ? (routineGoals[w.routineId] ?? null) : null;
          return sum + 1 / (target ?? 3);
        }, 0);
    }
  }

  const maxPct = Math.max(...days.map((d) => pctByDate[d]), 0.01);
  const BAR_H = 40;
  const availW = screenWidth - 56;
  const barW = Math.floor((availW - 6 * 4) / 7);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: BAR_H + 20 }}>
      {days.map((d, i) => {
        const pct = pctByDate[d];
        const isToday = d === today;
        const barH = pct > 0 ? Math.max((pct / maxPct) * BAR_H, 4) : 2;
        const barColor = isToday ? COL_GOLD : pct > 0 ? `${COL_GOLD}99` : 'rgba(255,255,255,0.08)';
        return (
          <View key={d} style={{ width: barW, alignItems: 'center', gap: 4 }}>
            <View style={{ height: BAR_H, justifyContent: 'flex-end' }}>
              <View style={{ width: barW, height: barH, borderRadius: 3, backgroundColor: barColor }} />
            </View>
            <Text style={{ fontSize: 9, color: isToday ? COL_GOLD : c.muted, fontWeight: isToday ? '700' : '400' }}>
              {DAY_LABELS[i]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Routine heatmap ───────────────────────────────────────────────────────────
function RoutineHeatmap({ workouts, routinesList, c }: {
  workouts: WorkoutSummary[]; routinesList: RoutineSummary[]; c: Colors;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const WEEKS = 13;
  const now = new Date();
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (WEEKS - 1 - i) * 7);
    return getWeekStart(localDateStr(d));
  });

  const routineById = Object.fromEntries(routinesList.map((r) => [r.id, r]));

  function getCellValue(w: WorkoutSummary, rid: number): number {
    const rt = routineById[rid]?.routineType ?? 'strength';
    if (rt === 'steps') return (w as any).totalSteps ?? 0;
    if (rt === 'cardio_distance') return ((w as any).totalDistanceMeters ?? 0) / 1609.34;
    if (rt === 'cardio_duration') return ((w as any).totalDurationSeconds ?? 0) / 60;
    return (w.totalVolumeKg ?? 0) * KG_TO_LBS;
  }

  const routineValues: Record<number, Record<string, number>> = {};
  for (const w of workouts) {
    if (!w.routineId) continue;
    const rid = w.routineId;
    const val = getCellValue(w, rid);
    if (val <= 0) continue;
    const ws = getWeekStart(w.workoutDate);
    if (!routineValues[rid]) routineValues[rid] = {};
    routineValues[rid][ws] = (routineValues[rid][ws] ?? 0) + val;
  }

  const relevantIds = Object.keys(routineValues)
    .map(Number)
    .filter((rid) => weeks.some((ws) => (routineValues[rid][ws] ?? 0) > 0));

  if (relevantIds.length === 0) {
    return <Text style={{ fontSize: fontSize.xs, color: c.muted, textAlign: 'center', paddingVertical: 8 }}>No routine data in last 13 weeks</Text>;
  }

  const globalMax = Math.max(...relevantIds.flatMap((rid) => Object.values(routineValues[rid])), 1);
  relevantIds.sort((a, b) => (routineById[a]?.name ?? '').localeCompare(routineById[b]?.name ?? ''));

  const nameColW = 90;
  const cellGap = 2;
  const totalCellSpace = screenWidth - 56 - nameColW - cellGap;
  const cellW = Math.max(Math.floor((totalCellSpace - (WEEKS - 1) * cellGap) / WEEKS), 14);
  const cellH = 16;

  function goldCell(vol: number) {
    if (vol <= 0) return 'rgba(255,255,255,0.05)';
    const opacity = 0.12 + (vol / globalMax) * 0.88;
    const r = Math.round(212 * opacity + 30 * (1 - opacity));
    const g = Math.round(168 * opacity + 30 * (1 - opacity));
    const b = Math.round(67  * opacity + 30 * (1 - opacity));
    return `rgb(${r},${g},${b})`;
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: nameColW }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: cellGap }}>
            {weeks.map((ws, i) => (
              i % 3 === 0 ? (
                <View key={ws} style={{ width: cellW, alignItems: 'center' }}>
                  <Text style={{ fontSize: 7, color: c.muted }}>{shortDate(ws)}</Text>
                </View>
              ) : <View key={ws} style={{ width: cellW }} />
            ))}
          </View>
        </ScrollView>
      </View>
      {relevantIds.map((rid) => (
        <View key={rid} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: nameColW }}>
            <Text style={{ fontSize: fontSize.xs, color: c.text }} numberOfLines={1}>{routineById[rid]?.name ?? `Routine ${rid}`}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', gap: cellGap }}>
              {weeks.map((ws) => {
                const val = routineValues[rid][ws] ?? 0;
                return <View key={ws} style={{ width: cellW, height: cellH, borderRadius: 3, backgroundColor: goldCell(val) }} />;
              })}
            </View>
          </ScrollView>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <Text style={{ fontSize: 9, color: c.muted }}>Less</Text>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {[0.12, 0.35, 0.55, 0.75, 1.0].map((t) => {
            const r = Math.round(212 * t + 30 * (1 - t));
            const g = Math.round(168 * t + 30 * (1 - t));
            const b = Math.round(67  * t + 30 * (1 - t));
            return <View key={t} style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: `rgb(${r},${g},${b})` }} />;
          })}
        </View>
        <Text style={{ fontSize: 9, color: c.muted }}>More activity</Text>
      </View>
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: fontSize.xs, color: c.muted }}>{label}</Text>
        <Text style={{ fontSize: fontSize.xs, fontWeight: '600', color, fontVariant: ['tabular-nums'] }}>
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

// ── Gold-accent card header ───────────────────────────────────────────────────
function CardHeader({ title, meta, c }: { title: string; meta?: string; c: Colors }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
      <View style={{ width: 2, height: 14, borderRadius: 1, backgroundColor: COL_GOLD }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>{title}</Text>
        {meta ? <Text style={{ fontSize: 9, color: c.muted, marginTop: 1 }}>{meta}</Text> : null}
      </View>
    </View>
  );
}

// ── Workout highlight ─────────────────────────────────────────────────────────
function computeHighlight(w: WorkoutSummary, allWorkouts: WorkoutSummary[]): string[] {
  return computeHighlights(w, allWorkouts);
}

// ── Weekly averages computation ───────────────────────────────────────────────
function buildWeeklyAverages(
  foodLogHistory: FoodLogHistoryDay[],
  workouts: WorkoutSummary[],
  todayTDEE: TDEEBreakdown | null,
  numWeeks = 8,
) {
  const now = new Date();
  const weeks: {
    weekStart: string; label: string;
    calories: number; protein: number; carbs: number; fat: number;
    tdee: number | null; net: number | null; isCurrentWeek: boolean; days: number;
  }[] = [];

  for (let i = numWeeks - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i * 7);
    const ws = getWeekStart(localDateStr(d));
    const weekDate = new Date(ws + 'T12:00:00');
    weeks.push({
      weekStart: ws,
      label: weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      calories: 0, protein: 0, carbs: 0, fat: 0, tdee: null, net: null,
      isCurrentWeek: ws === getWeekStart(localDateStr()),
      days: 0,
    });
  }

  const exerciseByDate: Record<string, number> = {};
  for (const w of workouts) {
    if (w.caloriesBurned) exerciseByDate[w.workoutDate] = (exerciseByDate[w.workoutDate] ?? 0) + w.caloriesBurned;
  }
  const baseline = todayTDEE ? todayTDEE.bmr + todayTDEE.neat : null;

  for (const day of foodLogHistory) {
    const ws = getWeekStart(day.date);
    const week = weeks.find((wk) => wk.weekStart === ws);
    if (!week) continue;
    week.calories += day.calories;
    week.protein  += day.protein;
    week.carbs    += day.entries.reduce((s, e) => s + e.carbsG, 0);
    week.fat      += day.entries.reduce((s, e) => s + e.fatG, 0);
    week.days++;
    if (baseline != null) {
      const dayTef = Math.round(day.calories * 0.1);
      const dayEx  = exerciseByDate[day.date] ?? 0;
      week.tdee = (week.tdee ?? 0) + baseline + dayTef + dayEx;
    }
  }

  for (const week of weeks) {
    if (week.days > 0) {
      week.calories = Math.round(week.calories / week.days);
      week.protein  = Math.round(week.protein  / week.days);
      week.carbs    = Math.round(week.carbs    / week.days);
      week.fat      = Math.round(week.fat      / week.days);
      if (week.tdee != null) {
        week.tdee = Math.round(week.tdee / week.days);
        week.net  = week.calories - week.tdee;
      }
    }
  }

  return [...weeks].reverse().filter((w) => w.days > 0 || w.isCurrentWeek);
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const token = useAuthStore((s) => s.token)!;
  const c = useColors();
  const s = makeStyles(c);
  const seg = makeSegStyles(c);
  const [activeTab, setActiveTab] = useState<DashboardTab>('nutrition');
  const swipe = useSwipeNav(0, DASHBOARD_TABS, activeTab, setActiveTab);

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
  const [routineGoals, setRoutineGoals] = useState<Record<number, number>>({});
  const [todayTDEE, setTodayTDEE] = useState<TDEEBreakdown | null>(null);
  const [waterBonusOz, setWaterBonusOz] = useState(0);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const end = localDateStr();
      const startD = new Date(); startD.setDate(startD.getDate() - 89);
      const start = localDateStr(startD);

      const [ws, eg, ms, mg, pb, ns, wh, fl, dh, rl, tdee, rg] = await Promise.all([
        getWorkouts(token, { limit: 200 }),
        getExerciseGoals(token).catch(() => null),
        getMeasurements(token).catch(() => []),
        getMeasurementGoals(token).catch(() => ({})),
        getPersonalBests(token).catch(() => null),
        getGoalsSummary(token).catch(() => null),
        getWaterHistory(token, start, end).catch(() => null),
        getFoodLogHistory(token, 90).catch(() => []),
        getDailyHistory(token, start, end).catch(() => []),
        getRoutines(token).catch(() => []),
        getTDEE(token).catch(() => null),
        getRoutineGoals(token).catch(() => []),
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
      setTodayTDEE(tdee && (tdee as any).available ? tdee : null);
      setRoutineGoals(Object.fromEntries((rg as { routineId: number; targetPerWeek: number }[]).map((g) => [g.routineId, g.targetPerWeek])));
      setWaterBonusOz(0);
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

  const caloriesGoal    = nutritionSummary?.nutrition.goals?.calories ?? null;
  const caloriesConsumed = Math.round(nutritionSummary?.nutrition.actual.calories ?? 0);
  const proteinGoal     = nutritionSummary?.nutrition.goals?.proteinG ?? null;
  const proteinConsumed = Math.round(nutritionSummary?.nutrition.actual.proteinG ?? 0);
  const carbsGoal       = nutritionSummary?.nutrition.goals?.carbsG ?? null;
  const carbsConsumed   = Math.round(nutritionSummary?.nutrition.actual.carbsG ?? 0);
  const fatGoal         = nutritionSummary?.nutrition.goals?.fatG ?? null;
  const fatConsumed     = Math.round(nutritionSummary?.nutrition.actual.fatG ?? 0);

  const workoutBurnedToday = workouts
    .filter((w) => w.workoutDate === todayStr)
    .reduce((sum, w) => sum + (w.caloriesBurned ?? 0), 0);
  const burnedToday = todayTDEE ? todayTDEE.total : workoutBurnedToday;

  const waterOzToday   = (waterHistory?.days.find((d) => d.date === todayStr)?.totalOz ?? 0) + waterBonusOz;
  const waterGoalOz    = waterHistory?.goalOz ?? 64;
  const waterGlasses   = Math.round(waterOzToday / GLASS_OZ * 10) / 10;
  const waterGoalGlasses = Math.round(waterGoalOz / GLASS_OZ);

  async function handleAddWater(oz: number) {
    setWaterBonusOz((prev) => prev + oz);
    try { await addWater(token, todayStr, oz); } catch { setWaterBonusOz((prev) => prev - oz); }
  }

  // ── Derived: this week ────────────────────────────────────────────────────
  const weeklyData = buildWeeklyData(workouts);
  const weekVolumeLbs = Math.round(weeklyData[weeklyData.length - 1]?.volumeLbs ?? 0);
  const volumeGoal = exGoals?.volumeLbsPerWeek ?? null;
  const weekWorkouts = workouts.filter((w) => getWeekStart(w.workoutDate) === currentWeekStart).length;
  const weekWorkoutGoal = exGoals?.workoutsPerWeek ?? null;
  const weekDelta = computeWeekDelta(weeklyData);
  const weekStreak = computeWeekStreak(workouts);
  const streakIsMilestone = WEEK_STREAK_MILESTONES.includes(weekStreak);

  // ── Derived: 30-day charts ────────────────────────────────────────────────
  const days30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    return localDateStr(d);
  });
  const historyByDate = Object.fromEntries(dailyHistory.map((d) => [d.date, d]));
  const waterByDate   = Object.fromEntries((waterHistory?.days ?? []).map((d) => [d.date, d.totalOz]));
  const burnedByDate: Record<string, number> = {};
  for (const w of workouts) {
    if (w.caloriesBurned) burnedByDate[w.workoutDate] = (burnedByDate[w.workoutDate] ?? 0) + w.caloriesBurned;
  }
  const calSeries     = days30.map((d) => historyByDate[d]?.calories ?? 0);
  const proteinSeries = days30.map((d) => historyByDate[d]?.proteinG ?? 0);
  const tdeeSeries    = todayTDEE
    ? days30.map((d) => {
        const cals = historyByDate[d]?.calories ?? 0;
        const exercise = burnedByDate[d] ?? 0;
        if (cals === 0 && exercise === 0) return 0;
        return (todayTDEE.bmr + todayTDEE.neat) + Math.round(cals * 0.1) + exercise;
      })
    : null;
  const burnedSeries = tdeeSeries ?? days30.map((d) => burnedByDate[d] ?? 0);
  const hasBurned    = burnedSeries.some((v) => v > 0);

  // Weight series
  const weightMeasurements = measurements
    .filter((m) => m.metric === 'weight')
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  const weightByDate: Record<string, number> = {};
  for (const m of weightMeasurements) {
    weightByDate[m.measuredAt] = m.unit === 'kg' ? m.value * KG_TO_LBS : m.value;
  }
  let lastWeightVal: number | null = null;
  const weightSeries: number[] = days30.map((d) => {
    if (weightByDate[d] != null) lastWeightVal = weightByDate[d];
    return lastWeightVal ?? 0;
  });
  const hasWeight = weightSeries.some((v) => v > 0);
  const weightGoalRaw = measGoals['weight'];
  const weightGoalLbs = weightGoalRaw
    ? (weightGoalRaw.unit === 'kg' ? weightGoalRaw.targetValue * KG_TO_LBS : weightGoalRaw.targetValue)
    : null;
  const allWeightVals = [...weightSeries.filter(Boolean), ...(weightGoalLbs != null ? [weightGoalLbs] : [])];
  const weightMin = allWeightVals.length ? Math.min(...allWeightVals) * 0.98 : 0;
  const weightMax = allWeightVals.length ? Math.max(...allWeightVals) * 1.02 : 1;

  // Body comp: 30-days-ago cutoff for deltas
  const thirtyDaysAgo = (() => {
    const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() - 30); return localDateStr(d);
  })();

  // Creatine
  const creatineData = computeCreatineSaturation(foodLogHistory);

  // Weekly averages
  const weeklyAverages = buildWeeklyAverages(foodLogHistory, workouts, todayTDEE);

  const routineById = Object.fromEntries(routinesList.map((r) => [r.id, r]));

  // Personal bests helpers
  const fmtPbDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Recent workouts (last 8)
  const recentWorkouts = [...workouts].sort((a, b) => b.workoutDate.localeCompare(a.workoutDate)).slice(0, 8);

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return <ActivityIndicator style={{ marginTop: 60 }} color={COL_GOLD} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']} {...swipe.panHandlers}>
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Dashboard</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={seg.scroll} contentContainerStyle={seg.row}>
        {DASHBOARD_TABS.map((t) => (
          <TouchableOpacity key={t} style={[seg.btn, activeTab === t && seg.btnActive]} onPress={() => setActiveTab(t)}>
            <Text style={[seg.label, activeTab === t && seg.labelActive]}>
              {t === 'nutrition' ? 'Nutrition' : t === 'exercise' ? 'Exercise' : 'Goals'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COL_GOLD} />}
      >

        {/* ══ Nutrition tab ══ */}
        {activeTab === 'nutrition' && (<>

        {/* ── Fuel Today ── */}
        <View style={s.card}>
          <CardHeader title="Fuel Today" c={c} />

          {/* Calorie ring + macros row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <CalorieRing pct={caloriesGoal ? caloriesConsumed / caloriesGoal : 0} color={COL_CAL} size={84} c={c} />
              <Text style={{ fontSize: fontSize.xs, color: c.muted, textAlign: 'center' }}>
                <Text style={{ fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] }}>{caloriesConsumed.toLocaleString()}</Text>
                {caloriesGoal ? <Text style={{ color: c.muted }}>/{caloriesGoal.toLocaleString()} kcal</Text> : ' kcal'}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <ProgressBar label="Protein" actual={proteinConsumed} goal={proteinGoal} unit="g" color={COL_PROTEIN} c={c} />
              <ProgressBar label="Carbs"   actual={carbsConsumed}   goal={carbsGoal}   unit="g" color={COL_CARBS}   c={c} />
              <ProgressBar label="Fat"     actual={fatConsumed}     goal={fatGoal}     unit="g" color={COL_FAT}     c={c} />
            </View>
          </View>

          {/* Net vs TDEE */}
          {burnedToday > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
              <Text style={{ fontSize: fontSize.xs, color: c.muted }}>Burned <Text style={{ color: '#f87171', fontWeight: '600' }}>{burnedToday.toLocaleString()} kcal</Text></Text>
              <Text style={{ fontSize: fontSize.xs, color: c.muted }}>
                Net <Text style={{ fontWeight: '600', color: caloriesGoal && (caloriesConsumed - burnedToday) > caloriesGoal ? '#f87171' : c.text, fontVariant: ['tabular-nums'] }}>
                  {(caloriesConsumed - burnedToday).toLocaleString()} kcal
                </Text>
                <Text style={{ color: c.muted }}>{caloriesConsumed < burnedToday ? '  In deficit' : '  In surplus'}</Text>
              </Text>
            </View>
          )}

          {/* Water glasses */}
          <View style={{ gap: 6, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: fontSize.xs, color: c.muted }}>
                Water <Text style={{ fontWeight: '700', color: COL_WATER, fontVariant: ['tabular-nums'] }}>{waterGlasses}</Text>/<Text style={{ fontVariant: ['tabular-nums'] }}>{waterGoalGlasses}</Text> glasses
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {Array.from({ length: waterGoalGlasses }, (_, i) => (
                <View key={i} style={{
                  width: 16, height: 22, borderRadius: 3,
                  backgroundColor: i < waterGlasses ? COL_WATER : 'rgba(255,255,255,0.08)',
                  borderWidth: 1,
                  borderColor: i < waterGlasses ? COL_WATER : 'rgba(255,255,255,0.15)',
                }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: COL_WATER, borderRadius: 8, paddingVertical: 6, alignItems: 'center' }}
                onPress={() => handleAddWater(GLASS_OZ)}
              >
                <Text style={{ fontSize: fontSize.xs, color: COL_WATER, fontWeight: '600' }}>+ 1 glass</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: COL_WATER + '88', borderRadius: 8, paddingVertical: 6, alignItems: 'center' }}
                onPress={() => handleAddWater(BOTTLE_OZ)}
              >
                <Text style={{ fontSize: fontSize.xs, color: COL_WATER + 'BB', fontWeight: '600' }}>+ Bottle (20 oz)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Calories vs TDEE / Protein (30-day charts) ── */}
        <View style={s.card}>
          <CardHeader title="Last 30 Days" c={c} />

          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: fontSize.xs, color: COL_CAL, fontWeight: '600' }}>Calories</Text>
              {hasBurned && <Text style={{ fontSize: 9, color: c.muted }}>— {tdeeSeries ? 'TDEE' : 'burned'}</Text>}
              {caloriesGoal && <Text style={{ fontSize: 9, color: c.muted }}>- - goal</Text>}
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

          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: fontSize.xs, color: COL_PROTEIN, fontWeight: '600' }}>Protein</Text>
              {proteinGoal && <Text style={{ fontSize: 9, color: c.muted }}>- - goal {proteinGoal}g</Text>}
            </View>
            <MiniLineChart data={proteinSeries} color={COL_PROTEIN} goalLine={proteinGoal} />
          </View>

          {hasWeight && (
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: fontSize.xs, color: COL_WEIGHT, fontWeight: '600' }}>Weight</Text>
                {weightGoalLbs != null && <Text style={{ fontSize: 9, color: c.muted }}>- - goal {weightGoalLbs.toFixed(1)} lbs</Text>}
              </View>
              <MiniLineChart data={weightSeries} color={COL_WEIGHT} goalLine={weightGoalLbs} maxOverride={weightMax} minOverride={weightMin} />
            </View>
          )}
        </View>

        {/* ── Weekly Averages ── */}
        {weeklyAverages.some((w) => w.days > 0) && (
          <View style={s.card}>
            <CardHeader title="Weekly Averages" meta="per-day avg · newest first" c={c} />
            {/* Header */}
            <View>
              <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
                {['Week', 'Cal', 'Prot', 'Carb', 'Fat', ...(todayTDEE ? ['Net'] : [])].map((h, i) => (
                  <Text key={h} style={[s.weeklyTh, i === 0 ? { width: 56, textAlign: 'left', flex: 0 } : { flex: 1 }]}>{h}</Text>
                ))}
              </View>
              {weeklyAverages.map((week) => {
                const netColor = week.net == null ? c.muted : week.net < -100 ? '#34d399' : week.net > 200 ? '#f87171' : c.muted;
                return (
                  <View key={week.weekStart} style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: c.border + '33' }}>
                    <Text style={[s.weeklyTd, { width: 56, flex: 0, textAlign: 'left', color: week.isCurrentWeek ? COL_GOLD : c.muted }]}>
                      {week.isCurrentWeek ? 'Now' : week.label}
                    </Text>
                    <Text style={[s.weeklyTd, { flex: 1, color: week.days > 0 ? c.text : c.muted }]}>{week.days > 0 ? week.calories.toLocaleString() : '—'}</Text>
                    <Text style={[s.weeklyTd, { flex: 1, color: week.days > 0 ? c.text : c.muted }]}>{week.days > 0 ? week.protein + 'g' : '—'}</Text>
                    <Text style={[s.weeklyTd, { flex: 1, color: week.days > 0 ? c.text : c.muted }]}>{week.days > 0 ? week.carbs + 'g' : '—'}</Text>
                    <Text style={[s.weeklyTd, { flex: 1, color: week.days > 0 ? c.text : c.muted }]}>{week.days > 0 ? week.fat + 'g' : '—'}</Text>
                    {todayTDEE && (
                      <Text style={[s.weeklyTd, { flex: 1, color: netColor, fontWeight: week.net != null ? '600' : '400' }]}>
                        {week.net == null ? '—' : (week.net > 0 ? '+' : '') + week.net.toLocaleString()}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Body Composition ── */}
        <View style={s.card}>
          <CardHeader title="Body Composition" meta="latest readings" c={c} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {BODY_COMP_METRICS.map((key) => {
              const cfg = METRIC_CONFIG[key];
              const forMetric = measurements
                .filter((m) => m.metric === key)
                .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
              const latest = forMetric[0];
              const monthAgo = forMetric.find((m) => m.measuredAt <= thirtyDaysAgo);

              const latestNum = latest
                ? (key === 'weight' && latest.unit === 'kg' ? latest.value * KG_TO_LBS : latest.value)
                : null;
              const prevNum = monthAgo
                ? (key === 'weight' && monthAgo.unit === 'kg' ? monthAgo.value * KG_TO_LBS : monthAgo.value)
                : null;
              const displayVal = latestNum != null ? latestNum.toFixed(1) : null;

              let deltaText: string | null = null;
              let deltaColor: string = c.muted;
              if (latestNum != null && prevNum != null && monthAgo?.id !== latest?.id) {
                const delta = latestNum - prevNum;
                const dir = cfg.dir === 'up' ? (delta >= 0 ? 'good' : 'bad') : (delta <= 0 ? 'good' : 'bad');
                const sign = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
                deltaText = `${sign} ${Math.abs(Math.round(delta * 10) / 10)}${cfg.unit}`;
                deltaColor = dir === 'good' ? '#86AA80' : Math.abs(delta / (prevNum || 1)) > 0.05 ? '#C5896E' : COL_GOLD;
              }

              return (
                <View key={key} style={{ width: '47%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cfg.color }} />
                    <Text style={{ fontSize: 9, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{cfg.label}</Text>
                  </View>
                  {displayVal != null ? (
                    <>
                      <Text style={{ fontSize: 22, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'], lineHeight: 26 }}>
                        {displayVal}{cfg.unit ? <Text style={{ fontSize: fontSize.xs, color: c.muted }}> {cfg.unit}</Text> : null}
                      </Text>
                      {deltaText && <Text style={{ fontSize: 9, color: deltaColor, fontWeight: '600' }}>{deltaText} / mo</Text>}
                    </>
                  ) : (
                    <Text style={{ fontSize: fontSize.xs, color: c.muted, marginTop: 4 }}>—{'\n'}Log it</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        </>)}

        {/* ══ Exercise tab ══ */}
        {activeTab === 'exercise' && (<>

        {/* ── This Week ── */}
        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <CardHeader title="This Week" c={c} />
            {weekStreak > 0 && (
              <View style={{ backgroundColor: streakIsMilestone ? COL_GOLD + '33' : 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: streakIsMilestone ? COL_GOLD : c.muted }}>
                  {weekStreak}-week streak
                </Text>
              </View>
            )}
          </View>
          <ProgressBar label="Workouts" actual={weekWorkouts} goal={weekWorkoutGoal} unit="" color={COL_GOLD} c={c} />
          <ProgressBar label="Volume"   actual={weekVolumeLbs} goal={volumeGoal}    unit=" lbs" color={COL_VOL} c={c} />
          {(weekDelta.volumePct != null || weekDelta.stepsPct != null) && (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
              {weekDelta.volumePct != null && (
                <Text style={{ fontSize: fontSize.xs, color: weekDelta.volumePct >= 0 ? '#34d399' : '#f87171', fontVariant: ['tabular-nums'] }}>
                  {weekDelta.volumePct >= 0 ? '↑' : '↓'} {Math.abs(weekDelta.volumePct)}% vol vs last wk
                </Text>
              )}
              {weekDelta.stepsPct != null && (
                <Text style={{ fontSize: fontSize.xs, color: weekDelta.stepsPct >= 0 ? '#34d399' : '#f87171', fontVariant: ['tabular-nums'] }}>
                  {weekDelta.stepsPct >= 0 ? '↑' : '↓'} {Math.abs(weekDelta.stepsPct)}% steps vs last wk
                </Text>
              )}
            </View>
          )}
          <DayVolumeBars workouts={workouts} volumeGoal={volumeGoal} routineGoals={routineGoals} c={c} />
        </View>

        {/* ── Volume Heatmap ── */}
        {workouts.some((w) => w.routineId) && (
          <View style={s.card}>
            <CardHeader title="Volume Heatmap" meta="by routine × week" c={c} />
            <RoutineHeatmap workouts={workouts} routinesList={routinesList} c={c} />
          </View>
        )}

        {/* ── Creatine ── */}
        {creatineData && (
          <View style={s.card}>
            <CardHeader title="Creatine" meta={creatineData.phase} c={c} />
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

        {/* ── Personal Bests ── */}
        <View style={s.card}>
          <CardHeader title="Personal Bests" meta="All time" c={c} />

          {/* Volume by strength routine — compact 3-col grid */}
          {(personalBests?.bestVolumeByRoutine?.length ?? 0) > 0 && (
            <View style={{ paddingBottom: 10 }}>
              <Text style={{ fontSize: 10, color: c.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Best Session Volume</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(personalBests!.bestVolumeByRoutine ?? []).map((r) => (
                  <View key={r.routineId} style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                      {Math.round(r.volumeKg * KG_TO_LBS).toLocaleString()}<Text style={{ fontSize: 10, fontWeight: '400', color: c.muted }}> lbs</Text>
                    </Text>
                    <Text style={{ fontSize: 10, color: c.muted, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{r.routineName}</Text>
                    {r.workoutDate && <Text style={{ fontSize: 10, color: c.muted, opacity: 0.6 }} numberOfLines={1}>{fmtPbDate(r.workoutDate)}</Text>}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Heaviest single lift */}
          {personalBests?.heaviestLift && (
            <View style={[s.pbRow, (personalBests.bestVolumeByRoutine?.length ?? 0) > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: c.text }}>{personalBests.heaviestLift.exerciseName}</Text>
                <Text style={{ fontSize: fontSize.xs, color: c.muted, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                  {personalBests.heaviestLift.reps != null ? `${personalBests.heaviestLift.reps} rep${personalBests.heaviestLift.reps !== 1 ? 's' : ''} · ` : ''}Heaviest set · {fmtPbDate(personalBests.heaviestLift.workoutDate)}
                </Text>
              </View>
              <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] }}>
                {Math.round(personalBests.heaviestLift.weightKg * KG_TO_LBS).toLocaleString()} lbs
              </Text>
            </View>
          )}

          {/* Most calories burned — always shown */}
          <View style={[s.pbRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: c.text }}>
                Most Calories Burned
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: c.muted, marginTop: 2 }}>
                {personalBests?.mostCaloriesBurned
                  ? `${personalBests.mostCaloriesBurned.workoutName} · ${fmtPbDate(personalBests.mostCaloriesBurned.workoutDate)}`
                  : 'No data yet'}
              </Text>
            </View>
            <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: personalBests?.mostCaloriesBurned ? c.text : c.muted, fontVariant: ['tabular-nums'] }}>
              {personalBests?.mostCaloriesBurned
                ? <>{personalBests.mostCaloriesBurned.calories.toLocaleString()}<Text style={{ fontSize: fontSize.xs, fontWeight: '400', color: c.muted }}> kcal</Text></>
                : '—'}
            </Text>
          </View>

          {/* Best stair pace — always shown */}
          <View style={[s.pbRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: c.text }}>
                {personalBests?.bestStairPace?.exerciseName ?? 'Best Stair Pace'}
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: c.muted, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                {personalBests?.bestStairPace ? `Best pace · ${fmtPbDate(personalBests.bestStairPace.workoutDate)}` : 'No data yet'}
              </Text>
            </View>
            <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: personalBests?.bestStairPace ? c.text : c.muted, fontVariant: ['tabular-nums'] }}>
              {personalBests?.bestStairPace
                ? <>{Math.round(personalBests.bestStairPace.pacePerMinute)}<Text style={{ fontSize: fontSize.xs, fontWeight: '400', color: c.muted }}> stairs/min</Text></>
                : '—'}
            </Text>
          </View>

        </View>

        {/* ── Recent Workouts ── */}
        {recentWorkouts.length > 0 && (
          <View style={s.card}>
            <CardHeader title="Recent Workouts" meta={`Last ${recentWorkouts.length} sessions`} c={c} />
            {recentWorkouts.map((w, i) => {
              const rt = (w as any).routineType as string | null | undefined;
              const rName = w.routineId ? (routineById[w.routineId]?.name ?? w.name ?? 'Workout') : (w.name ?? 'Free workout');
              let volDisplay: string;
              if (rt === 'steps') {
                const steps = (w as any).totalSteps as number | null;
                const dur = w.totalDurationSeconds;
                const pace = steps && dur ? Math.round(steps / (dur / 60)) : 0;
                volDisplay = pace > 0 ? `${pace} stairs/min` : '—';
              } else if (rt === 'cardio_distance') {
                const dm = (w as any).totalDistanceMeters as number | null;
                const dur = w.totalDurationSeconds;
                const pace = dm && dur ? (dm / 1609.34) / (dur / 60) : 0;
                volDisplay = pace > 0 ? `${pace.toFixed(2)} mi/min` : '—';
              } else if (rt === 'cardio_duration') {
                const ds = (w as any).totalDurationSeconds;
                volDisplay = ds ? `${Math.floor(ds / 60)} min` : '—';
              } else {
                const volLbs = Math.round((w.totalVolumeKg ?? 0) * KG_TO_LBS);
                volDisplay = volLbs > 0 ? `${volLbs.toLocaleString()} lbs` : '—';
              }
              const highlights = computeHighlight(w, workouts);
              return (
                <View key={w.id} style={[s.workoutRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.xs, color: c.muted }}>
                        {new Date(w.workoutDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {w.durationMinutes ? `  ·  ${w.durationMinutes} min` : ''}
                      </Text>
                      <Text style={{ fontSize: fontSize.sm, color: c.text, fontWeight: '500', marginTop: 1 }}>{rName}</Text>
                      {highlights.length > 0 && (
                        <View style={{ marginTop: 2, gap: 2 }}>
                          {highlights.map((h, idx) => (
                            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: COL_GOLD }} />
                              <Text style={{ fontSize: fontSize.xs, color: COL_GOLD }}>{h}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: fontSize.xs, color: c.muted, fontVariant: ['tabular-nums'] }}>{volDisplay}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        </>)}

        {/* ══ Goals tab ══ */}
        {activeTab === 'goals' && (<>

        {/* ── North Star Goals ── */}
        <View style={s.card}>
          <CardHeader title="North Star Goals" c={c} />
          {NORTH_STAR_METRICS.map((key) => {
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
              </View>
            );
          })}
        </View>

        </>)}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    pageHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    pageTitle:  { fontSize: fontSize.xl, fontWeight: '700', color: c.text },
    scroll:     { padding: 14, gap: 12 },
    card:       { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10 },

    metricRow:    { borderTopWidth: 1, paddingTop: 10, gap: 6 },
    metricLabel:  { fontSize: fontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    metricCurrent: { fontSize: fontSize.xl, fontWeight: '700', color: c.text },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
    progressFill:  { height: '100%', borderRadius: 2 },

    creatinePhaseBadge: { fontSize: 11, fontWeight: '700', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    creatineStat:       { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 8, alignItems: 'center' },
    creatineStatVal:    { fontSize: fontSize.base, fontWeight: '700', color: c.text },
    creatineStatLabel:  { fontSize: 10, color: c.muted, marginTop: 2 },

    pbRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10 },
    workoutRow: { gap: 2 },
    empty:    { fontSize: fontSize.sm, color: c.muted, textAlign: 'center', paddingVertical: 12 },

    weeklyTh: { fontSize: 10, color: c.muted, fontWeight: '600', textAlign: 'right', paddingHorizontal: 2 },
    weeklyTd: { fontSize: 11, color: c.text, textAlign: 'right', paddingHorizontal: 2, fontVariant: ['tabular-nums'] },
  });
}

function makeSegStyles(c: Colors) {
  return StyleSheet.create({
    scroll:    { flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: c.border },
    row:       { flexDirection: 'row', alignItems: 'stretch' },
    btn:       { paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
    btnActive: { borderBottomWidth: 2, borderBottomColor: COL_GOLD },
    label:     { fontSize: fontSize.sm, color: c.muted, fontWeight: '500' },
    labelActive: { color: COL_GOLD, fontWeight: '700' },
  });
}
