import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  getWorkouts, getExerciseGoals, getMeasurements, getMeasurementGoals, getPersonalBests,
  getGoalsSummary, getWaterHistory, getFoodLogHistory,
  type WorkoutSummary, type ExerciseGoals, type BodyMeasurement, type MeasurementGoal,
  type PersonalBests, type GoalsSummary, type WaterHistory, type FoodLogHistoryDay,
} from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';

const KG_TO_LBS = 2.20462;
const SATURATION_DAYS = 28;

const METRIC_CONFIG: Record<string, { label: string; unit: string; color: string; dir: 'up' | 'down' }> = {
  weight: { label: 'Weight',  unit: 'lbs', color: '#a78bfa', dir: 'down' },
  waist:  { label: 'Waist',   unit: 'in',  color: '#60a5fa', dir: 'down' },
  bicep:  { label: 'Bicep',   unit: 'in',  color: '#34d399', dir: 'up'   },
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
  const now = Date.now();

  const elapsed = latestMs - firstMs;
  if (elapsed <= 0) return { status: 'yellow', pct, projectedDate: null };

  const actualRate = actualChange / elapsed;
  const neededRate = totalChange / Math.max(targetMs - firstMs, 1);
  const ratio = neededRate > 0 ? actualRate / neededRate : 0;

  const status: PaceStatus = ratio >= 1 ? 'green' : ratio >= 0.8 ? 'yellow' : 'red';

  const remaining = totalChange - actualChange;
  const projMs = actualRate > 0 ? now + (remaining / actualRate) : null;
  const projectedDate = projMs
    ? new Date(projMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return { status, pct, projectedDate };
}

// ── Creatine saturation ───────────────────────────────────────────────────────

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

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar2({ label, actual, goal, unit, color, c }: {
  label: string; actual: number; goal: number | null; unit: string; color: string; c: Colors;
}) {
  const pct = goal && goal > 0 ? Math.min(actual / goal, 1) : 0;
  const s = makeProgressBarStyles(c);
  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <Text style={s.label}>{label}</Text>
        <Text style={[s.val, { color }]}>
          {actual.toLocaleString()}{unit}
          {goal != null ? <Text style={s.goal}> / {goal.toLocaleString()}{unit}</Text> : null}
        </Text>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function makeProgressBarStyles(c: Colors) {
  return StyleSheet.create({
    wrap: { gap: 4 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    label: { fontSize: fontSize.xs, color: c.muted },
    val: { fontSize: fontSize.xs, fontWeight: '600' },
    goal: { color: c.muted, fontWeight: '400' },
    track: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 3 },
  });
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const token = useAuthStore((s) => s.token)!;
  const c = useColors();
  const s = makeStyles(c);

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

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const end = localDateStr();
      const startD = new Date(); startD.setDate(startD.getDate() - 29);
      const start = localDateStr(startD);

      const [ws, eg, ms, mg, pb, ns, wh, fl] = await Promise.all([
        getWorkouts(token, { limit: 200 }),
        getExerciseGoals(token).catch(() => null),
        getMeasurements(token).catch(() => []),
        getMeasurementGoals(token).catch(() => ({})),
        getPersonalBests(token).catch(() => null),
        getGoalsSummary(token).catch(() => null),
        getWaterHistory(token, start, end).catch(() => null),
        getFoodLogHistory(token, 30).catch(() => []),
      ]);
      setWorkouts(ws);
      setExGoals(eg);
      setMeasurements(ms as BodyMeasurement[]);
      setMeasGoals(mg as Record<string, MeasurementGoal>);
      setPersonalBests(pb);
      setNutritionSummary(ns);
      setWaterHistory(wh);
      setFoodLogHistory(fl as FoodLogHistoryDay[]);
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true).finally(() => setRefreshing(false));
  }, [loadData]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const currentWeekStart = getWeekStart(localDateStr());
  const weekWorkouts = workouts.filter((w) => getWeekStart(w.workoutDate) === currentWeekStart).length;
  const weekVolumeLbs = Math.round(
    workouts
      .filter((w) => getWeekStart(w.workoutDate) === currentWeekStart)
      .reduce((sum, w) => sum + (w.totalVolumeKg ?? 0) * KG_TO_LBS, 0)
  );
  const volumeGoal = exGoals?.volumeLbsPerWeek ?? null;
  const workoutGoal = exGoals?.workoutsPerWeek ?? null;

  const caloriesGoal = nutritionSummary?.nutrition.goals?.calories ?? null;
  const caloriesConsumed = Math.round(nutritionSummary?.nutrition.actual.calories ?? 0);
  const proteinGoal = nutritionSummary?.nutrition.goals?.proteinG ?? null;
  const proteinConsumed = Math.round(nutritionSummary?.nutrition.actual.proteinG ?? 0);

  const todayStr = localDateStr();
  const burnedToday = workouts
    .filter((w) => w.workoutDate === todayStr)
    .reduce((sum, w) => sum + (w.caloriesBurned ?? 0), 0);

  const creatineData = computeCreatineSaturation(foodLogHistory);

  if (loading) return <ActivityIndicator style={{ marginTop: 60 }} color={c.accent} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >
        <Text style={s.pageTitle}>Dashboard</Text>

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
            const delta = goal && displayVal != null
              ? (goal.targetValue - Number(displayVal)).toFixed(1)
              : null;
            const deltaNum = delta != null ? Number(delta) : null;

            return (
              <View key={key} style={[s.metricRow, { borderTopColor: c.border }]}>
                <View style={s.metricHeader}>
                  <Text style={[s.metricLabel, { color: cfg.color }]}>{cfg.label}</Text>
                  <View style={[s.paceBadge, { backgroundColor: paceColor + '22' }]}>
                    <Text style={[s.paceBadgeText, { color: paceColor }]}>{PACE_LABELS[status]}</Text>
                  </View>
                </View>
                <View style={s.metricValues}>
                  <Text style={s.metricCurrent}>
                    {displayVal ?? '—'} <Text style={s.metricUnit}>{cfg.unit}</Text>
                  </Text>
                  {goal && (
                    <View style={s.metricGoalRow}>
                      <Text style={s.metricGoalText}>{goal.targetValue} {cfg.unit}</Text>
                      {deltaNum != null && deltaNum !== 0 && (
                        <Text style={[s.metricDelta, { color: paceColor }]}>
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
                  <Text style={[s.projDate, { color: paceColor }]}>Proj: {projectedDate}</Text>
                )}
                {key === 'weight' && creatineData && creatineData.satPct > 0 && creatineData.satPct < 1 && (
                  <View style={s.waterCallout}>
                    <Text style={s.waterCalloutTitle}>💧 Water Weight Loading</Text>
                    <Text style={s.waterCalloutBody}>
                      Creatine may add 1–3 lbs of water weight. Scale bump is expected.
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── This Week ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>This Week</Text>
          <ProgressBar2 label="Volume" actual={weekVolumeLbs} goal={volumeGoal} unit=" lbs" color="#a78bfa" c={c} />
          <ProgressBar2 label="Workouts" actual={weekWorkouts} goal={workoutGoal} unit="" color="#34d399" c={c} />
        </View>

        {/* ── Fuel — Today ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Fuel — Today</Text>
          <ProgressBar2 label="Calories" actual={caloriesConsumed} goal={caloriesGoal} unit=" kcal" color="#fb923c" c={c} />
          {burnedToday > 0 && (
            <View style={s.burnedRow}>
              <Text style={s.burnedLabel}>Burned</Text>
              <Text style={[s.burnedVal, { color: '#f87171' }]}>{burnedToday.toLocaleString()} kcal</Text>
              <Text style={s.burnedLabel}>  Net</Text>
              <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: caloriesGoal && (caloriesConsumed - burnedToday) > caloriesGoal ? '#f87171' : c.text }}>
                {(caloriesConsumed - burnedToday).toLocaleString()} kcal
              </Text>
            </View>
          )}
          <ProgressBar2 label="Protein" actual={proteinConsumed} goal={proteinGoal} unit="g" color="#60a5fa" c={c} />
          {waterHistory && (
            <ProgressBar2
              label={`Water (goal: ${Math.round(waterHistory.goalOz / 8)} glasses)`}
              actual={Math.round((waterHistory.days.find((d) => d.date === todayStr)?.totalOz ?? 0) / 8 * 10) / 10}
              goal={waterHistory.goalOz / 8}
              unit=" gl"
              color="#38bdf8"
              c={c}
            />
          )}
        </View>

        {/* ── Creatine ── */}
        {creatineData && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Creatine</Text>
            <View style={s.creatinePhase}>
              <Text style={[s.creatinePhaseBadge, { color: creatineData.satPct >= 0.9 ? '#34d399' : creatineData.satPct >= 0.5 ? '#facc15' : '#f87171',
                backgroundColor: (creatineData.satPct >= 0.9 ? '#34d399' : creatineData.satPct >= 0.5 ? '#facc15' : '#f87171') + '22' }]}>
                {creatineData.phase}
              </Text>
              <Text style={s.creatinePct}>{Math.round(creatineData.satPct * 100)}% saturated</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, {
                width: `${creatineData.satPct * 100}%` as any,
                backgroundColor: creatineData.satPct >= 0.9 ? '#34d399' : creatineData.satPct >= 0.5 ? '#facc15' : '#f87171',
              }]} />
            </View>
            <View style={s.creatineStats}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    scroll: { padding: 14, gap: 12, paddingBottom: 32 },
    pageTitle: { fontSize: fontSize.xl, fontWeight: '700', color: c.text, marginBottom: 4 },
    card: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10 },
    cardTitle: { fontSize: fontSize.xs, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8 },

    // North star goals
    metricRow: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
    metricHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    metricLabel: { fontSize: fontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    paceBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
    paceBadgeText: { fontSize: 10, fontWeight: '700' },
    metricValues: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    metricCurrent: { fontSize: fontSize.xl, fontWeight: '700', color: c.text },
    metricUnit: { fontSize: fontSize.xs, color: c.muted, fontWeight: '400' },
    metricGoalRow: { flexDirection: 'row', gap: 6, alignItems: 'baseline' },
    metricGoalText: { fontSize: fontSize.sm, color: c.muted },
    metricDelta: { fontSize: fontSize.sm, fontWeight: '600' },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 2 },
    projDate: { fontSize: fontSize.xs, fontWeight: '600', textAlign: 'center' },

    // Water weight callout
    waterCallout: { backgroundColor: 'rgba(56,189,248,0.10)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(56,189,248,0.25)', padding: 8 },
    waterCalloutTitle: { fontSize: 11, fontWeight: '700', color: '#38bdf8', marginBottom: 2 },
    waterCalloutBody: { fontSize: 10, color: '#94a3b8', lineHeight: 14 },

    // Fuel
    burnedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    burnedLabel: { fontSize: fontSize.xs, color: c.muted },
    burnedVal: { fontSize: fontSize.sm, fontWeight: '600' },

    // Creatine
    creatinePhase: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    creatinePhaseBadge: { fontSize: 11, fontWeight: '700', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    creatinePct: { fontSize: fontSize.sm, color: c.muted },
    creatineStats: { flexDirection: 'row', gap: 8, marginTop: 4 },
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
  });
}
