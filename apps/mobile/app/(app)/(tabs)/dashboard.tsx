import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, RefreshControl, useWindowDimensions,
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
  goalsV2Api,
  type WeekBucket, type Goal, type NutritionSummary,
} from '../../../../../packages/api-client/src/index';
import { useAuthStore } from '../../../src/store/auth';
import { useStepsStore } from '../../../src/store/steps';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';

// ── Color constants ───────────────────────────────────────────────────────────
const COL_GOLD    = '#D4A843';
const COL_CAL     = '#fb923c';
const COL_TDEE    = '#94a3b8';
const COL_WEIGHT  = '#a78bfa';
const COL_GOOD    = '#7BB389';
const COL_WARN    = '#C9714F';


const TABS = ['today', 'goals', 'trends', 'sessions'] as const;
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

function MiniLineChart({ data, projection, projection2, color, projectionColor, projection2Color, goalLine, maxOverride, minOverride }: {
  data: number[]; projection?: number[]; projection2?: number[]; color: string; projectionColor?: string; projection2Color?: string; goalLine?: number | null; maxOverride?: number; minOverride?: number;
}) {
  const projColor = projectionColor ?? '#818cf8';
  const proj2Color = projection2Color ?? '#f97316';
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 56;
  const allVals = [...data, ...(projection ?? []), ...(projection2 ?? [])];
  const maxVal = maxOverride ?? Math.max(...allVals, goalLine ?? 0, 1);
  const minVal = minOverride ?? 0;
  const range = maxVal - minVal || 1;
  const total = data.length + Math.max((projection?.length ?? 0), (projection2?.length ?? 0));
  if (data.length < 2) return <View style={{ height: CHART_H }} />;

  const X = (i: number) => (i / (total - 1)) * chartWidth;
  const Y = (v: number) => CHART_H - DOT_R - Math.max(((v - minVal) / range) * (CHART_H - DOT_R * 2), 0);

  const actualPts = data.map((v, i) => ({ x: X(i), y: Y(v), v }));
  const projPts  = (projection  ?? []).map((v, i) => ({ x: X(data.length - 1 + i + 1), y: Y(v), v }));
  const proj2Pts = (projection2 ?? []).map((v, i) => ({ x: X(data.length - 1 + i + 1), y: Y(v), v }));

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
      {projPts.length > 0 && renderSegments([actualPts.at(-1)!, ...projPts], `${projColor}99`)}
      {actualPts.map((pt, i) => (
        <View key={i} style={{ position: 'absolute', left: pt.x - DOT_R, top: pt.y - DOT_R, width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: i === actualPts.length - 1 ? color : `${color}88` }} />
      ))}
      {projPts.map((pt, i) => (
        <View key={`p${i}`} style={{ position: 'absolute', left: pt.x - DOT_R, top: pt.y - DOT_R, width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: `${projColor}66` }} />
      ))}
      {proj2Pts.length > 0 && renderSegments([actualPts.at(-1)!, ...proj2Pts], `${proj2Color}99`)}
      {proj2Pts.map((pt, i) => (
        <View key={`p2${i}`} style={{ position: 'absolute', left: pt.x - DOT_R, top: pt.y - DOT_R, width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: `${proj2Color}66` }} />
      ))}
    </View>
  );
}

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

// ── Goal progress helpers ─────────────────────────────────────────────────────
type GoalStatus = 'achieved' | 'ahead' | 'on_track' | 'behind' | 'no_data';
const GOAL_STATUS_CFG: Record<GoalStatus, { color: string; label: string }> = {
  achieved: { color: COL_GOOD,   label: 'Achieved' },
  ahead:    { color: COL_GOOD,   label: 'Ahead'    },
  on_track: { color: COL_GOLD,   label: 'On track' },
  behind:   { color: COL_WARN,   label: 'Behind'   },
  no_data:  { color: '#94a3b8',  label: '—'        },
};
function deadlineStatus(etaDays: number | null, deadlineStr: string | null, achieved: boolean): GoalStatus {
  if (achieved) return 'achieved';
  if (etaDays == null || !deadlineStr) return 'no_data';
  const deadlineDays = Math.ceil((new Date(deadlineStr + 'T12:00:00').getTime() - Date.now()) / 86400000);
  if (etaDays <= deadlineDays - 21) return 'ahead';
  if (etaDays <= deadlineDays + 14) return 'on_track';
  return 'behind';
}
function fmtETA(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function linReg(xs: number[], ys: number[]): number {
  const n = xs.length; if (n < 2) return 0;
  const xM = xs.reduce((a, b) => a + b, 0) / n;
  const yM = ys.reduce((a, b) => a + b, 0) / n;
  const den = xs.reduce((s, x) => s + (x - xM) ** 2, 0);
  return den > 0 ? xs.reduce((s, x, i) => s + (x - xM) * (ys[i] - yM), 0) / den : 0;
}
function GoalStatusChip({ status }: { status: GoalStatus }) {
  const { color, label } = GOAL_STATUS_CFG[status];
  return (
    <View style={{ flexShrink: 0, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: color + '28' }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

// ── Routine heatmap ───────────────────────────────────────────────────────────
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

  // Swipe navigation (between internal tabs and to next navbar section)
  const panResponder = useSwipeNav(
    0, // dashboard is at index 0 in BOTTOM_TABS
    TABS,
    activeTab,
    setActiveTab
  );

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

    // Fire all requests simultaneously
    const workoutsP     = getWorkouts(token, { limit: 200 }).catch(() => [] as WorkoutSummary[]);
    const measurementsP = getMeasurements(token).catch(() => []);
    const summaryP      = getNutritionSummary(token).catch(() => null);
    const foodHistP     = getFoodLogHistory(token, { limit: 90 }).catch(() => []);
    const dailyHistP    = getDailyHistory(token, start, end).catch(() => []);
    const routinesP     = getRoutines(token).catch(() => []);
    const tdeeP         = getNutritionTDEE(token).catch(() => null);
    const recoveryP     = getRecovery(token).catch(() => null);
    const upcomingP     = getUpcomingSchedule(token, 7).catch(() => []);
    const waterP        = getWaterDay(token, localDateStr()).catch(() => null);
    const stepsP        = getSteps(token).catch(() => null);
    const thisWeekStart = getWeekStart(localDateStr());
    const stepsHistP    = getStepsHistory(token, 14).catch(() => [] as StepsEntry[]);
    const waterHistP    = getWaterHistory(token, thisWeekStart, localDateStr()).catch(() => ({ goalOz: 0, days: [] as WaterHistoryDay[] }));
    const goalsP        = goalsV2Api.getAll('active').catch(() => []);

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
  }, [token]);

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
  const weightGoalLbs = activeGoals.find(g => g.catalogKey === 'body_weight')?.targetValue ?? null;
  const allW = [...weightSeries.filter(Boolean), ...(weightGoalLbs != null ? [weightGoalLbs] : [])];
  const weightMin = allW.length ? Math.min(...allW) * 0.98 : 0;
  const weightMax = allW.length ? Math.max(...allW) * 1.02 : 1;

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']} {...panResponder.panHandlers}>
      {/* Header */}
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Dashboard</Text>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.segScroll} contentContainerStyle={s.segRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} style={[s.segBtn, activeTab === t && s.segBtnActive]} onPress={() => setActiveTab(t)}>
            <Text style={[s.segLabel, activeTab === t && s.segLabelActive]}>
              {t === 'today' ? 'Today' : t === 'goals' ? 'Goals' : t === 'trends' ? 'Trends' : 'Sessions'}
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

          {/* Fuel Today */}
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

          {/* Exercise Today */}
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

          {/* Weekly Goal Progress */}
          {(() => {
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
          })()}

          {/* Today's Blurb */}
          <TodaySnapshot
            workouts={todayWorkouts}
            nutrition={nutritionSummary?.nutrition.actual ?? null}
            water={todayWater}
            steps={liveSteps != null ? { ...(todaySteps ?? {}), steps: liveSteps } as any : todaySteps}
          />

          {/* Weekly Blurb */}
          <WeeklySnapshot
            weekStart={currentWeekStart}
            today={todayStr}
            workouts={workouts}
            foodLogHistory={foodLogHistory}
            stepsWeekHistory={stepsWeekHistory}
            waterWeekHistory={waterWeekHistory}
            measurements={measurements}
          />

        </View>)}

        {/* ══ GOALS tab ══ */}
        {mountedTabs.has('goals') && (<View style={activeTab !== 'goals' ? { display: 'none' } : undefined}>

          {/* ── Weight ── */}
          {(() => {
            const todayMs = new Date(todayStr + 'T12:00:00').getTime();
            const sorted = measurements
              .filter((m) => m.metric === 'weight')
              .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
              .map((m) => ({ date: m.measuredAt, val: m.unit === 'kg' ? m.value * KG_TO_LBS : m.value }));
            const weightGoalEntry = activeGoals.find(g => g.catalogKey === 'body_weight');
            const target = weightGoalEntry?.targetValue ?? null;
            const deadline = weightGoalEntry?.deadline ?? null;

            if (!sorted.length) {
              return (
                <View style={s.card}>
                  {!phase2Ready ? (
                    <>
                      <CardHeader title="Weight goal" meta={target ? `target ${target.toFixed(1)} lb` : undefined} c={c} />
                      <ActivityIndicator color={COL_GOLD} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
                    </>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <View style={{ flex: 1 }}><CardHeader title="Weight goal" meta={target ? `target ${target.toFixed(1)} lb` : undefined} c={c} /></View>
                        <GoalStatusChip status="no_data" />
                      </View>
                      <Text style={{ fontSize: fontSize.sm, color: c.muted }}>No weight entries yet.</Text>
                    </>
                  )}
                </View>
              );
            }

            const current = sorted[sorted.length - 1].val;

            // 28-day linear regression for trend slope (lbs/day)
            const cutoff28Ms = todayMs - 28 * 86400000;
            const recent28 = sorted.filter((m) => new Date(m.date + 'T12:00:00').getTime() >= cutoff28Ms);
            const trendData = recent28.length >= 2 ? recent28 : sorted;
            const trendT0 = new Date(trendData[0].date + 'T12:00:00').getTime();
            const trendSlope = linReg(
              trendData.map((m) => (new Date(m.date + 'T12:00:00').getTime() - trendT0) / 86400000),
              trendData.map((m) => m.val)
            );

            // TDEE-based slope: (avgCal - tdeeAtAvg) / 3500
            let tdeeSlope: number | null = null;
            if (todayTDEE) {
              const recentFood = foodLogHistory.slice(-30).filter((d) => d.calories > 0);
              if (recentFood.length > 0) {
                const avgCal = recentFood.reduce((s, d) => s + d.calories, 0) / recentFood.length;
                const tdeeAtAvg = todayTDEE.bmr + todayTDEE.neat + todayTDEE.exercise + avgCal * 0.1;
                tdeeSlope = (avgCal - tdeeAtAvg) / 3500;
              }
            }

            function etaDays(slope: number): number | null {
              if (!target || Math.abs(slope) < 0.001) return null;
              const d = (target - current) / slope;
              return d > 0 ? Math.round(d) : null;
            }

            const trendEta = etaDays(trendSlope);
            const tdeeEta  = tdeeSlope != null ? etaDays(tdeeSlope) : null;
            const isAchieved = target != null && current <= target;
            const status = deadlineStatus(trendEta, deadline, isAchieved);

            // Chart: 90-day window + 28-day projection
            const chart = sorted.filter((m) => new Date(m.date + 'T12:00:00').getTime() >= todayMs - 90 * 86400000);
            const chartData = chart.length > 0 ? chart : sorted.slice(-30);
            const chartT0Ms = new Date(chartData[0].date + 'T12:00:00').getTime();
            const totalSpanDays = (todayMs - chartT0Ms) / 86400000 + 28;
            // Build daily series (forward-fill) for chart
            const numDays = Math.round(totalSpanDays) + 1;
            let last: number | null = null;
            const byDate: Record<string, number> = {};
            for (const m of chartData) byDate[m.date] = m.val;
            const actualSeries: number[] = [];
            const projStart = chartData.length;
            for (let i = 0; i < numDays; i++) {
              const d = new Date(chartT0Ms + i * 86400000);
              const ds = localDateStr(d);
              if (byDate[ds] != null) last = byDate[ds];
              if (new Date(ds + 'T12:00:00').getTime() <= todayMs) {
                actualSeries.push(last ?? 0);
              }
            }
            const proj28 = Array.from({ length: 29 }, (_, i) => +(current + trendSlope * i).toFixed(2));
            const tdeeProj28 = tdeeSlope != null
              ? Array.from({ length: 29 }, (_, i) => +(current + tdeeSlope! * i).toFixed(2))
              : undefined;

            const allVals = [...actualSeries.filter(Boolean), ...proj28, ...(tdeeProj28 ?? []), target ?? 0].filter((v) => v > 0);
            const chartMin = allVals.length ? Math.min(...allVals) * 0.994 : 0;
            const chartMax = allVals.length ? Math.max(...allVals) * 1.006 : 1;

            return (
              <View style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}><CardHeader title="Weight goal" meta={weightGoalEntry ? `${target!.toFixed(1)} lb${deadline ? ` by ${new Date(deadline + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}` : undefined} c={c} /></View>
                  <GoalStatusChip status={status} />
                </View>
                <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
                  <View>
                    <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>Current</Text>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] }}>{current.toFixed(1)}<Text style={{ fontSize: 11, color: c.muted, fontWeight: '400' }}> lb</Text></Text>
                  </View>
                  {target != null && (
                    <View>
                      <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>Target</Text>
                      <Text style={{ fontSize: 22, fontWeight: '700', color: c.muted, fontVariant: ['tabular-nums'] }}>{target.toFixed(1)}<Text style={{ fontSize: 11, color: c.muted, fontWeight: '400' }}> lb</Text></Text>
                    </View>
                  )}
                  {trendEta != null && (
                    <View>
                      <Text style={{ fontSize: 11, color: '#818cf8', marginBottom: 2 }}>ETA · trend</Text>
                      <Text style={{ fontSize: 13, color: '#818cf8', fontWeight: '600' }}>{fmtETA(trendEta)}</Text>
                    </View>
                  )}
                  {tdeeEta != null && (
                    <View>
                      <Text style={{ fontSize: 11, color: '#f97316', marginBottom: 2 }}>ETA · TDEE</Text>
                      <Text style={{ fontSize: 13, color: '#f97316', fontWeight: '600' }}>{fmtETA(tdeeEta)}</Text>
                    </View>
                  )}
                </View>
                <MiniLineChart data={actualSeries} projection={proj28} projection2={tdeeProj28} color={COL_GOLD} goalLine={target} maxOverride={chartMax} minOverride={chartMin} />
                <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 11, color: COL_GOLD }}>── actual</Text>
                  <Text style={{ fontSize: 11, color: '#818cf8' }}>╌╌ trend proj</Text>
                  {tdeeProj28 && <Text style={{ fontSize: 11, color: '#f97316' }}>╌╌ TDEE proj</Text>}
                  {target != null && <Text style={{ fontSize: 11, color: c.muted }}>╌╌ target {target.toFixed(1)} lb</Text>}
                </View>
              </View>
            );
          })()}

          {/* ── Waist ── */}
          {(() => {
            const metric = 'waist'; const unit = 'in'; const dir: 'up' | 'down' = 'down';
            const todayMs = new Date(todayStr + 'T12:00:00').getTime();
            const sorted = measurements
              .filter((m) => m.metric === metric)
              .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
              .map((m) => ({ date: m.measuredAt, val: m.value }));
            const waistGoalEntry = activeGoals.find(g => g.catalogKey === 'body_waist');
            const target = waistGoalEntry?.targetValue ?? null;
            const deadline = waistGoalEntry?.deadline ?? null;

            if (!sorted.length) return null;

            const current = sorted[sorted.length - 1].val;
            const cutoff90Ms = todayMs - 90 * 86400000;
            const recentForSlope = sorted.filter((m) => new Date(m.date + 'T12:00:00').getTime() >= cutoff90Ms);
            const regrData = recentForSlope.length >= 2 ? recentForSlope : sorted;
            const rT0 = new Date(regrData[0].date + 'T12:00:00').getTime();
            const slopePerDay = linReg(
              regrData.map((m) => (new Date(m.date + 'T12:00:00').getTime() - rT0) / 86400000),
              regrData.map((m) => m.val)
            );

            let etaDaysVal: number | null = null;
            if (target != null && Math.abs(slopePerDay) > 0.0001) {
              const d = (target - current) / slopePerDay;
              etaDaysVal = d > 0 ? Math.round(d) : null;
            }
            const isAchieved = target != null && (dir === 'down' ? current <= target : current >= target);
            const status = deadlineStatus(etaDaysVal, deadline, isAchieved);

            const t0Ms = new Date(sorted[0].date + 'T12:00:00').getTime();
            const byDate: Record<string, number> = {};
            for (const m of sorted) byDate[m.date] = m.val;
            let last: number | null = null;
            const actualSeries: number[] = [];
            const totalActualDays = Math.round((todayMs - t0Ms) / 86400000) + 1;
            for (let i = 0; i < totalActualDays; i++) {
              const d = localDateStr(new Date(t0Ms + i * 86400000));
              if (byDate[d] != null) last = byDate[d];
              actualSeries.push(last ?? 0);
            }
            const proj30 = Array.from({ length: 31 }, (_, i) => +(current + slopePerDay * i).toFixed(2));
            const allVals = [...actualSeries.filter(Boolean), ...proj30, target ?? 0].filter((v) => v > 0);
            const chartMin = allVals.length ? Math.min(...allVals) * 0.994 : 0;
            const chartMax = allVals.length ? Math.max(...allVals) * 1.006 : 1;

            return (
              <View style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}><CardHeader title="Waist goal" meta={waistGoalEntry ? `${target!.toFixed(1)} ${unit}${deadline ? ` by ${new Date(deadline + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}` : undefined} c={c} /></View>
                  <GoalStatusChip status={status} />
                </View>
                <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
                  <View>
                    <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>Current</Text>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] }}>{current.toFixed(1)}<Text style={{ fontSize: 11, color: c.muted, fontWeight: '400' }}> {unit}</Text></Text>
                  </View>
                  {target != null && (
                    <View>
                      <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>Target</Text>
                      <Text style={{ fontSize: 22, fontWeight: '700', color: c.muted, fontVariant: ['tabular-nums'] }}>{target.toFixed(1)}<Text style={{ fontSize: 11, color: c.muted, fontWeight: '400' }}> {unit}</Text></Text>
                    </View>
                  )}
                  {etaDaysVal != null && (
                    <View>
                      <Text style={{ fontSize: 11, color: COL_GOLD, marginBottom: 2 }}>ETA · trend</Text>
                      <Text style={{ fontSize: 13, color: COL_GOLD, fontWeight: '600' }}>{fmtETA(etaDaysVal)}</Text>
                    </View>
                  )}
                </View>
                <MiniLineChart data={actualSeries} projection={proj30} color={COL_GOLD} goalLine={target} maxOverride={chartMax} minOverride={chartMin} />
                <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 11, color: COL_GOLD }}>── actual</Text>
                  <Text style={{ fontSize: 11, color: '#818cf8' }}>╌╌ trend proj</Text>
                  {target != null && <Text style={{ fontSize: 11, color: c.muted }}>╌╌ target {target.toFixed(1)} {unit}</Text>}
                </View>
              </View>
            );
          })()}

          {/* ── Bicep ── */}
          {(() => {
            const metric = 'bicep'; const unit = 'in';
            const todayMs = new Date(todayStr + 'T12:00:00').getTime();
            const sorted = measurements
              .filter((m) => m.metric === metric)
              .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
              .map((m) => ({ date: m.measuredAt, val: m.value }));
            const bicepGoalEntry = activeGoals.find(g => g.catalogKey === 'body_bicep');
            const target = bicepGoalEntry?.targetValue ?? null;
            const deadline = bicepGoalEntry?.deadline ?? null;

            if (!sorted.length) return null;

            const current = sorted[sorted.length - 1].val;
            const cutoff90Ms = todayMs - 90 * 86400000;
            const recentForSlope = sorted.filter((m) => new Date(m.date + 'T12:00:00').getTime() >= cutoff90Ms);
            const regrData = recentForSlope.length >= 2 ? recentForSlope : sorted;
            const rT0 = new Date(regrData[0].date + 'T12:00:00').getTime();
            const slopePerDay = linReg(
              regrData.map((m) => (new Date(m.date + 'T12:00:00').getTime() - rT0) / 86400000),
              regrData.map((m) => m.val)
            );

            let etaDaysVal: number | null = null;
            if (target != null && Math.abs(slopePerDay) > 0.0001) {
              const d = (target - current) / slopePerDay;
              etaDaysVal = d > 0 ? Math.round(d) : null;
            }
            const isAchieved = target != null && current >= target;
            const status = deadlineStatus(etaDaysVal, deadline, isAchieved);

            const t0Ms = new Date(sorted[0].date + 'T12:00:00').getTime();
            const byDate: Record<string, number> = {};
            for (const m of sorted) byDate[m.date] = m.val;
            let last: number | null = null;
            const actualSeries: number[] = [];
            const totalActualDays = Math.round((todayMs - t0Ms) / 86400000) + 1;
            for (let i = 0; i < totalActualDays; i++) {
              const d = localDateStr(new Date(t0Ms + i * 86400000));
              if (byDate[d] != null) last = byDate[d];
              actualSeries.push(last ?? 0);
            }
            const proj30 = Array.from({ length: 31 }, (_, i) => +(current + slopePerDay * i).toFixed(2));
            const allVals = [...actualSeries.filter(Boolean), ...proj30, target ?? 0].filter((v) => v > 0);
            const chartMin = allVals.length ? Math.min(...allVals) * 0.994 : 0;
            const chartMax = allVals.length ? Math.max(...allVals) * 1.006 : 1;

            return (
              <View style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}><CardHeader title="Bicep goal" meta={bicepGoalEntry ? `${target!.toFixed(1)} ${unit}${deadline ? ` by ${new Date(deadline + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}` : undefined} c={c} /></View>
                  <GoalStatusChip status={status} />
                </View>
                <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
                  <View>
                    <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>Current</Text>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] }}>{current.toFixed(1)}<Text style={{ fontSize: 11, color: c.muted, fontWeight: '400' }}> {unit}</Text></Text>
                  </View>
                  {target != null && (
                    <View>
                      <Text style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>Target</Text>
                      <Text style={{ fontSize: 22, fontWeight: '700', color: c.muted, fontVariant: ['tabular-nums'] }}>{target.toFixed(1)}<Text style={{ fontSize: 11, color: c.muted, fontWeight: '400' }}> {unit}</Text></Text>
                    </View>
                  )}
                  {etaDaysVal != null && (
                    <View>
                      <Text style={{ fontSize: 11, color: COL_GOLD, marginBottom: 2 }}>ETA · trend</Text>
                      <Text style={{ fontSize: 13, color: COL_GOLD, fontWeight: '600' }}>{fmtETA(etaDaysVal)}</Text>
                    </View>
                  )}
                </View>
                <MiniLineChart data={actualSeries} projection={proj30} color={COL_GOLD} goalLine={target} maxOverride={chartMax} minOverride={chartMin} />
                <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 11, color: COL_GOLD }}>── actual</Text>
                  <Text style={{ fontSize: 11, color: '#818cf8' }}>╌╌ trend proj</Text>
                  {target != null && <Text style={{ fontSize: 11, color: c.muted }}>╌╌ target {target.toFixed(1)} {unit}</Text>}
                </View>
              </View>
            );
          })()}

          {/* ── Workout frequency ── */}
          {(() => {
            const routineGoalsList = activeGoals
              .filter(g => g.catalogKey === 'exercise_routine_sessions' && g.sourceId != null)
              .map(g => ({ routineId: g.sourceId!, targetPerWeek: g.targetValue }))
              .filter(rg => rg.targetPerWeek > 0 && rg.targetPerWeek <= 7);
            if (!routineGoalsList.length) {
              return (
                <View style={s.card}>
                  <CardHeader title="Workout frequency" c={c} />
                  <Text style={{ fontSize: fontSize.sm, color: c.muted }}>No per-routine frequency goals set.</Text>
                </View>
              );
            }
            const weeks: string[] = [];
            for (let i = 7; i >= 0; i--) {
              const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() - i * 7);
              weeks.push(getWeekStart(localDateStr(d)));
            }
            const thisWeek = weeks[weeks.length - 1];
            function weekEnd(ws: string): string {
              const d = new Date(ws + 'T12:00:00'); d.setDate(d.getDate() + 6); return localDateStr(d);
            }
            function countForWeek(routineId: number, ws: string): number {
              const we = weekEnd(ws);
              return workouts.filter((w) => w.routineId === routineId && w.workoutDate >= ws && w.workoutDate <= we).length;
            }
            const allDone = routineGoalsList.every((rg) => countForWeek(rg.routineId, thisWeek) >= rg.targetPerWeek);
            return (
              <View style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}><CardHeader title="Workout frequency" meta={`${routineGoalsList.length} routine${routineGoalsList.length !== 1 ? 's' : ''} · weekly`} c={c} /></View>
                  <GoalStatusChip status={allDone ? 'achieved' : 'on_track'} />
                </View>
                <View style={{ gap: 14 }}>
                  {routineGoalsList.map((rg) => {
                    const name = routineById[rg.routineId]?.name ?? `Routine ${rg.routineId}`;
                    const thisCount = countForWeek(rg.routineId, thisWeek);
                    const hit = thisCount >= rg.targetPerWeek;
                    return (
                      <View key={rg.routineId}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={{ fontSize: fontSize.sm, color: c.text, fontWeight: '500' }} numberOfLines={1}>{name}</Text>
                          <Text style={{ fontSize: 11, color: hit ? COL_GOOD : c.muted }}>{thisCount}/{rg.targetPerWeek} this week</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 3 }}>
                          {weeks.map((ws) => {
                            const count  = countForWeek(rg.routineId, ws);
                            const isHit  = count >= rg.targetPerWeek;
                            const isThis = ws === thisWeek;
                            return (
                              <View
                                key={ws}
                                style={{
                                  flex: 1, height: 22, borderRadius: 3,
                                  backgroundColor: isHit
                                    ? isThis ? COL_GOLD : COL_GOOD + 'aa'
                                    : 'rgba(255,255,255,0.06)',
                                  borderWidth: isThis ? 1 : 0,
                                  borderColor: COL_GOLD + '55',
                                  alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                {isHit && <Text style={{ fontSize: 8, color: isThis ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.6)' }}>✓</Text>}
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: c.muted }}>8 weeks ago</Text>
                  <Text style={{ fontSize: 11, color: c.muted }}>this week</Text>
                </View>
              </View>
            );
          })()}

          {/* ── Pinned goals (new system) ── */}
          {(() => {
            // Goals with dedicated cards above — always skip to avoid duplicates.
            const LEGACY_EXERCISE_COVERED = new Set([
              'exercise_workouts_per_week', 'exercise_minutes_per_week',
              'exercise_volume_per_week', 'exercise_routine_sessions',
            ]);
            // weight/waist/bicep have their own detailed cards rendered above.
            // Other body keys (chest, hips, body_fat_pct, etc.) don't, so they show here.
            const DEDICATED_BODY_CARDS = new Set(['body_weight', 'body_waist', 'body_bicep']);
            const BODY_TO_METRIC: Record<string, string> = {
              body_weight: 'weight', body_waist: 'waist', body_bicep: 'bicep',
              body_chest: 'chest', body_hips: 'hips', body_fat_pct: 'body_fat',
              body_muscle_mass: 'muscle_mass', body_water_pct: 'water_pct',
            };
            const CATEGORY_COLORS: Record<string, string> = {
              body: '#7BB389', nutrition: '#60a5fa', exercise: '#f97316', activity: '#a78bfa',
            };
            const NUTRITION_FIELD: Record<string, keyof DailyHistoryEntry> = {
              nutrition_calories_daily_avg: 'calories',
              nutrition_protein_daily_avg:  'proteinG',
              nutrition_carbs_daily_avg:    'carbsG',
              nutrition_fat_daily_avg:      'fatG',
            };

            const visibleGoals = pinnedGoals.filter(g => {
              if (LEGACY_EXERCISE_COVERED.has(g.catalogKey)) return false;
              if (DEDICATED_BODY_CARDS.has(g.catalogKey)) return false;
              return true;
            });
            if (!visibleGoals.length) return null;

            return visibleGoals.map(goal => {
              const catColor = CATEGORY_COLORS[goal.category] ?? COL_GOLD;
              const days = goal.deadline
                ? Math.ceil((new Date(goal.deadline + 'T12:00:00').getTime() - Date.now()) / 86400000)
                : null;
              const pct = goal.startValue != null && goal.targetValue !== goal.startValue && goal.currentValue != null
                ? Math.min(1, Math.max(0, (goal.currentValue - goal.startValue) / (goal.targetValue - goal.startValue)))
                : goal.currentValue != null && goal.targetValue > 0
                  ? Math.min(1, Math.max(0, goal.currentValue / goal.targetValue))
                  : null;

              // Body measurement goals (no legacy goal) — mini line chart of 90-day measurements
              const bodyMetric = BODY_TO_METRIC[goal.catalogKey];
              if (bodyMetric) {
                const series = measurements
                  .filter(m => m.metric === bodyMetric)
                  .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
                  .slice(-90)
                  .map(m => m.unit === 'kg' ? m.value * KG_TO_LBS : m.value);
                const current = series.length > 0 ? series[series.length - 1] : null;
                return (
                  <View key={goal.id} style={s.card}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <CardHeader
                        title={goal.name}
                        meta={current != null ? `${current.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${goal.unit}` : undefined}
                        c={c}
                      />
                      {days != null && (
                        <Text style={{ color: days < 0 ? COL_WARN : days <= 7 ? '#f97316' : c.muted, fontSize: fontSize.xs }}>
                          {days < 0 ? `${Math.abs(days)}d over` : `${days}d`}
                        </Text>
                      )}
                    </View>
                    <MiniLineChart data={series} goalLine={goal.targetValue} color={catColor} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text style={{ color: c.muted, fontSize: fontSize.xs }}>
                        {current != null ? `current ${current.toLocaleString(undefined, { maximumFractionDigits: 1 })}` : 'no data'}
                      </Text>
                      <Text style={{ color: c.muted, fontSize: fontSize.xs }}>
                        target {goal.targetValue.toLocaleString()} {goal.unit}
                      </Text>
                    </View>
                  </View>
                );
              }

              // Nutrition goals — mini line chart of 30-day daily values
              const nutritionField = NUTRITION_FIELD[goal.catalogKey];
              if (nutritionField) {
                const last30 = dailyHistory.slice(-30);
                const series = last30.map(d => Number(d[nutritionField] ?? 0));
                const avg = series.length > 0 ? series.reduce((s, v) => s + v, 0) / series.length : null;
                return (
                  <View key={goal.id} style={s.card}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <CardHeader title={goal.name} meta={avg != null ? `${avg.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${goal.unit} avg` : undefined} c={c} />
                      {days != null && (
                        <Text style={{ color: days < 0 ? COL_WARN : days <= 7 ? '#f97316' : c.muted, fontSize: fontSize.xs }}>
                          {days < 0 ? `${Math.abs(days)}d over` : `${days}d`}
                        </Text>
                      )}
                    </View>
                    <MiniLineChart data={series} goalLine={goal.targetValue} color={catColor} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text style={{ color: c.muted, fontSize: fontSize.xs }}>30-day avg</Text>
                      <Text style={{ color: c.muted, fontSize: fontSize.xs }}>
                        target {goal.targetValue.toLocaleString()} {goal.unit}
                      </Text>
                    </View>
                  </View>
                );
              }

              // All other goals — progress bar card
              return (
                <View key={goal.id} style={s.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <CardHeader title={goal.name} meta={goal.sourceName ?? undefined} c={c} />
                    {days != null && (
                      <Text style={{ color: days < 0 ? COL_WARN : days <= 7 ? '#f97316' : c.muted, fontSize: fontSize.xs }}>
                        {days < 0 ? `${Math.abs(days)}d over` : `${days}d`}
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: c.text, fontSize: fontSize.base, fontWeight: '700' }}>
                      {goal.currentValue != null ? goal.currentValue.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
                      <Text style={{ color: c.muted, fontSize: fontSize.sm, fontWeight: '400' }}> {goal.unit}</Text>
                    </Text>
                    <Text style={{ color: c.muted, fontSize: fontSize.xs }}>
                      target {goal.targetValue.toLocaleString()} {goal.unit}
                    </Text>
                  </View>
                  {pct != null && (
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: c.border, overflow: 'hidden' }}>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: catColor, width: `${Math.round(pct * 100)}%` as any }} />
                    </View>
                  )}
                  {pct != null && (
                    <Text style={{ color: c.muted, fontSize: fontSize.xs, marginTop: 4, textAlign: 'right' }}>
                      {Math.round(pct * 100)}%
                    </Text>
                  )}
                </View>
              );
            });
          })()}

        </View>)}

        {/* ══ HISTORY tab ══ */}
        {/* ══ TRENDS tab ══ */}
        {mountedTabs.has('trends') && (<View style={activeTab !== 'trends' ? { display: 'none' } : undefined}>

          {/* ── Calories consumed vs burned ── */}
          {(() => {
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
          })()}

          {/* ── Exercise volume week-over-week ── */}
          {(() => {
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
          })()}

          {/* ── Exercise volume 12-week heatmap ── */}
          {(() => {
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
          })()}

          {/* ── Weekly averages ── */}
          {weeklyAverages.some((w) => w.days > 0) && (
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
          )}

        </View>)}

        {/* ══ SESSIONS tab ══ */}
        {/* ══ SESSIONS tab ══ */}
        {mountedTabs.has('sessions') && (
          <View style={activeTab !== 'sessions' ? { display: 'none' } : undefined}>
          {(() => {
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
        })()}
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
