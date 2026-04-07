import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { getGoalsSummary, type GoalsSummary } from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { colors, fontSize } from '../../../src/theme';

function pct(actual: number, goal: number | null | undefined) {
  if (!goal) return 0;
  return Math.min(actual / goal, 1);
}

function ProgressBar({ value, total, color }: { value: number; total: number | null | undefined; color: string }) {
  const p = pct(value, total) * 100;
  return (
    <View style={pb.bg}>
      <View style={[pb.fill, { width: `${p}%` as any, backgroundColor: color }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  bg: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});

export default function GoalsScreen() {
  const token = useAuthStore((s) => s.token)!;
  const [summary, setSummary] = useState<GoalsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    getGoalsSummary(token)
      .then((d) => { if (!cancelled) setSummary(d); })
      .catch(() => Alert.alert('Error', 'Could not load goals.'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]));

  const nut = summary?.nutrition;
  const wkt = summary?.workouts;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Goals</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          {/* Nutrition */}
          <Text style={s.sectionLabel}>Today's Nutrition</Text>
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.rowLabel}>Calories</Text>
              <Text style={s.rowValue}>
                {Math.round(nut?.actual.calories ?? 0)}
                {nut?.goals?.calories ? ` / ${nut.goals.calories}` : ''}
              </Text>
            </View>
            <ProgressBar value={nut?.actual.calories ?? 0} total={nut?.goals?.calories} color={colors.accent} />

            {[
              { label: 'Protein', actual: nut?.actual.proteinG, goal: nut?.goals?.proteinG, color: '#60a5fa' },
              { label: 'Carbs', actual: nut?.actual.carbsG, goal: nut?.goals?.carbsG, color: '#34d399' },
              { label: 'Fat', actual: nut?.actual.fatG, goal: nut?.goals?.fatG, color: '#fb923c' },
            ].map(({ label, actual, goal, color }) => (
              <View key={label} style={{ gap: 4 }}>
                <View style={s.row}>
                  <Text style={s.rowLabel}>{label}</Text>
                  <Text style={s.rowValue}>
                    {Math.round(actual ?? 0)}g{goal ? ` / ${goal}g` : ''}
                  </Text>
                </View>
                <ProgressBar value={actual ?? 0} total={goal} color={color} />
              </View>
            ))}
          </View>

          {/* Workouts */}
          <Text style={s.sectionLabel}>This Week's Workouts</Text>
          <View style={s.card}>
            {[
              {
                label: 'Workouts',
                actual: wkt?.actual.workoutCount ?? 0,
                goal: wkt?.goals?.workoutsPerWeek,
                unit: '',
                color: colors.accent,
              },
              {
                label: 'Minutes',
                actual: wkt?.actual.totalMinutes ?? 0,
                goal: wkt?.goals?.minutesPerWeek,
                unit: ' min',
                color: '#a78bfa',
              },
            ].map(({ label, actual, goal, unit, color }) => (
              <View key={label} style={{ gap: 4 }}>
                <View style={s.row}>
                  <Text style={s.rowLabel}>{label}</Text>
                  <Text style={s.rowValue}>
                    {actual}{unit}{goal ? ` / ${goal}${unit}` : ''}
                  </Text>
                </View>
                <ProgressBar value={actual} total={goal} color={color} />
              </View>
            ))}
            {!wkt?.goals && (
              <Text style={s.noGoals}>No workout goals set. Edit goals in the web app.</Text>
            )}
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  content: { padding: 14, gap: 10 },
  sectionLabel: { fontSize: fontSize.xs, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  rowValue: { fontSize: fontSize.sm, color: colors.muted },
  noGoals: { fontSize: fontSize.xs, color: colors.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 4 },
});
