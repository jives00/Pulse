import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { getWorkouts, createWorkout, deleteWorkout, type WorkoutSummary } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { colors, fontSize } from '../../src/theme';

const KG_TO_LBS = 2.20462;

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtVolume(kg: number) {
  const lbs = kg * KG_TO_LBS;
  return lbs >= 1000 ? `${(lbs / 1000).toFixed(1)}k lbs` : `${Math.round(lbs)} lbs`;
}

export default function WorkoutsScreen() {
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWorkouts(token, { limit: 30, offset: 0 });
      setWorkouts(data);
    } catch {
      Alert.alert('Error', 'Could not load workouts.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleStart() {
    setStarting(true);
    try {
      const w = await createWorkout(token);
      router.push(`/workout/${w.id}` as any);
    } catch {
      Alert.alert('Error', 'Could not start workout.');
    } finally {
      setStarting(false);
    }
  }

  async function handleDelete(id: number) {
    Alert.alert('Delete', 'Delete this workout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await deleteWorkout(token, id); load(); }
          catch { Alert.alert('Error', 'Could not delete workout.'); }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Workouts</Text>
        <TouchableOpacity style={[s.startBtn, starting && s.startBtnDisabled]} onPress={handleStart} disabled={starting}>
          <Text style={s.startBtnText}>{starting ? 'Starting…' : '+ Start'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push(`/workout/${item.id}` as any)}
              onLongPress={() => handleDelete(item.id)}
            >
              <View style={s.cardTop}>
                <Text style={s.cardDate}>{fmtDate(item.workoutDate)}</Text>
                {item.durationMinutes != null && (
                  <Text style={s.cardDuration}>{item.durationMinutes} min</Text>
                )}
              </View>
              {item.name && <Text style={s.cardName}>{item.name}</Text>}
              <Text style={s.cardStats}>
                {item.exerciseCount} exercise{item.exerciseCount !== 1 ? 's' : ''} · {item.setCount} set{item.setCount !== 1 ? 's' : ''}
                {item.totalVolumeKg > 0 ? ` · ${fmtVolume(item.totalVolumeKg)}` : ''}
              </Text>
              {item.exercises.length > 0 && (
                <Text style={s.cardExercises} numberOfLines={1}>
                  {item.exercises.map((e) => e.name).join(', ')}
                </Text>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyText}>No workouts yet.</Text>
              <Text style={s.emptyHint}>Tap + Start to log your first workout.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  startBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.bg },
  list: { padding: 14, gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  cardDate: { flex: 1, fontSize: fontSize.xs, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardDuration: { fontSize: fontSize.xs, color: colors.muted },
  cardName: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  cardStats: { fontSize: fontSize.sm, color: colors.muted },
  cardExercises: { fontSize: fontSize.xs, color: colors.border, marginTop: 2 },
  empty: { alignItems: 'center', marginTop: 60, gap: 6 },
  emptyText: { fontSize: fontSize.base, color: colors.text },
  emptyHint: { fontSize: fontSize.sm, color: colors.muted },
});
