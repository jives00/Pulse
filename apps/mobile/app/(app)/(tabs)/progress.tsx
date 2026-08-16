import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  goalsV2Api, goalsByCategory,
  type Goal, type GoalCategory,
} from '../../../../../packages/api-client/src/index';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';
import { useSwipeNav } from '../../../src/hooks/useSwipeNav';

const CATEGORY_LABELS: Record<GoalCategory, string> = {
  body:      'Body Composition',
  nutrition: 'Nutrition',
  exercise:  'Exercise',
  activity:  'Activity',
};

const CATEGORY_COLORS: Record<GoalCategory, string> = {
  body:      '#7BB389',
  nutrition: '#60a5fa',
  exercise:  '#f97316',
  activity:  '#a78bfa',
};

const CATEGORY_ORDER: GoalCategory[] = ['body', 'nutrition', 'exercise', 'activity'];

function calcPct(goal: Goal): number | null {
  if (goal.currentValue == null) return null;
  if (goal.startValue != null && goal.targetValue !== goal.startValue) {
    return Math.min(1, Math.max(0,
      (goal.currentValue - goal.startValue) / (goal.targetValue - goal.startValue)
    ));
  }
  if (goal.targetValue > 0) return Math.min(1, Math.max(0, goal.currentValue / goal.targetValue));
  return null;
}

function GoalProgressRow({ goal, onPress, c }: { goal: Goal; onPress: () => void; c: Colors }) {
  const catColor = CATEGORY_COLORS[goal.category];
  const pct = calcPct(goal);
  const days = goal.deadline
    ? Math.ceil((new Date(goal.deadline + 'T12:00:00').getTime() - Date.now()) / 86400000)
    : null;

  return (
    <TouchableOpacity onPress={onPress} style={[s.row, { borderBottomColor: c.border }]}>
      <View style={[s.catBar, { backgroundColor: catColor }]} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }} numberOfLines={1}>
              {goal.name}
            </Text>
            {goal.sourceName && (
              <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{goal.sourceName}</Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
            <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }}>
              {goal.currentValue != null
                ? goal.currentValue.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : '—'
              }
              <Text style={{ color: c.muted, fontWeight: '400' }}> / {goal.targetValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} {goal.unit}</Text>
            </Text>
            {pct != null && (
              <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{Math.round(pct * 100)}%</Text>
            )}
          </View>
        </View>

        {/* Progress bar */}
        <View style={[s.track, { backgroundColor: c.border }]}>
          {pct != null && (
            <View style={[s.fill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: catColor }]} />
          )}
        </View>

        {/* Footer */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {days != null ? (
            <Text style={{ color: days < 0 ? '#C9714F' : days <= 7 ? '#f97316' : c.muted, fontSize: fontSize.xs }}>
              {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
            </Text>
          ) : <View />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: c.muted, fontSize: fontSize.xs }}>History</Text>
            <Ionicons name="chevron-forward" size={12} color={c.muted} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ProgressScreen() {
  const c = useColors();
  const router = useRouter();
  const swipe = useSwipeNav('goals');
  const [goals, setGoals]       = useState<Goal[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const active = await goalsV2Api.getAll('active');
      setGoals(active);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);
  const onRefresh = useCallback(() => load(true), []);

  const byCategory = goalsByCategory(goals);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} {...swipe.panHandlers}>
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <Text style={[s.title, { color: c.text }]}>Progress</Text>
        <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{goals.length} active</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        >
          {goals.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <Ionicons name="bar-chart-outline" size={48} color={c.muted} />
              <Text style={{ color: c.muted, fontSize: fontSize.sm }}>No active goals</Text>
              <Text style={{ color: c.muted, fontSize: fontSize.xs }}>Set goals in the Goals tab to track progress here</Text>
            </View>
          ) : (
            CATEGORY_ORDER.map(cat => {
              const catGoals = byCategory[cat];
              if (catGoals.length === 0) return null;
              return (
                <View key={cat}>
                  <View style={[s.catHeader, { borderBottomColor: c.border }]}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLORS[cat] }} />
                    <Text style={{ color: c.muted, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </View>
                  <View style={[s.table, { borderColor: c.border, backgroundColor: c.card }]}>
                    {catGoals.map(goal => (
                      <GoalProgressRow
                        key={goal.id}
                        goal={goal}
                        onPress={() => router.push(`/(app)/goal/${goal.id}` as any)}
                        c={c}
                      />
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header:    { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:     { fontSize: fontSize.xl, fontWeight: '700' },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  table:     { marginHorizontal: 16, marginTop: 8, marginBottom: 4, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  row:       { flexDirection: 'row', gap: 10, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  catBar:    { width: 3, borderRadius: 2 },
  track:     { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill:      { height: 4, borderRadius: 2 },
});
