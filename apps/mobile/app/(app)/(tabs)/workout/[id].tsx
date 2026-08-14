import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, DeviceEventEmitter, FlatList, KeyboardAvoidingView, Modal,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getWorkout, updateWorkout, deleteWorkout, startWorkoutTimer, pauseWorkout, resumeWorkout,
  estimateWorkoutCalories,
  addWorkoutExercise, removeWorkoutExercise, updateWorkoutExercise,
  addWorkoutSet, updateWorkoutSet, deleteWorkoutSet,
  getExercises, getExerciseCategories, createCustomExercise,
  getRoutine,
  getMeasurements,
  type WorkoutDetail, type WorkoutExercise, type ExerciseSet, type Exercise,
} from '../../../../src/api/client';
import { writeExerciseRecord, deleteExerciseRecord } from '../../../../src/services/healthConnectWriter';
import { KG_TO_LBS, secondsToMMSS as _secondsToMMSS } from '../../../../../../packages/api-client/src/index';
import { useAuthStore } from '../../../../src/store/auth';
import { fontSize, type Colors } from '../../../../src/theme';
import { useColors } from '../../../../src/hooks/useColors';
import { getNotifications } from '../../../../src/notifications';
import { useFeaturesStore } from '../../../../src/store/features';
import SelectAllInput from '../../../../src/components/SelectAllInput';

function lbsToKg(lbs: number) { return lbs / KG_TO_LBS; }
function kgToLbs(kg: number) { return kg * KG_TO_LBS; }
function formatTimer(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function secondsToMMSS(sec: number | null): string {
  if (sec == null) return '';
  return _secondsToMMSS(sec);
}

function mmssToSeconds(val: string): number | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  const n = parseInt(trimmed, 10);
  return isNaN(n) ? null : n;
}

const WORKOUT_NOTIF_ID = 'active-workout';
// The rest alarm needs its own identifier. Scheduling reuses an identifier by replacing
// whatever is already under it, and the ongoing workout notification re-posts every
// second — so while both shared 'active-workout', the next clock tick overwrote the
// rest-end alarm within a second of it being scheduled, leaving in-app haptics as the
// only thing that could fire.
const REST_NOTIF_ID = 'rest-end';
const SUCCESS = '#34d399';
const PAUSED = '#f59e0b';
const REST_SECONDS = 90;

function ProgressBar({
  progress,
  c,
  color,
  height = 4,
}: {
  progress: number;
  c: Colors;
  color?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ height, backgroundColor: c.border, borderRadius: height, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color ?? c.accent, borderRadius: height }} />
    </View>
  );
}

function StatChip({ value, label, c }: { value: string; label: string; c: Colors }) {
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 54, alignItems: 'center' }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: c.text }}>{value}</Text>
      <Text style={{ fontSize: 13, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}

function RestTimer({
  seconds,
  duration,
  c,
  onAdd,
  onSkip,
}: {
  seconds: number;
  duration: number;
  c: Colors;
  onAdd: () => void;
  onSkip: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
      <View style={{ backgroundColor: `${c.accent}14`, borderColor: `${c.accent}55`, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: c.accent, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Rest</Text>
            <Text style={{ fontSize: fontSize.xl, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'], lineHeight: 28 }}>{seconds}s</Text>
          </View>
          <TouchableOpacity onPress={onAdd} style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Text style={{ color: c.muted, fontSize: fontSize.sm }}>+30s</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onSkip} style={{ backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Text style={{ color: c.bg, fontSize: fontSize.sm, fontWeight: '700' }}>Skip</Text>
          </TouchableOpacity>
        </View>
        <ProgressBar progress={seconds / duration} c={c} color={c.accent} height={3} />
      </View>
    </View>
  );
}

async function showWorkoutNotification(
  workout: WorkoutDetail,
  elapsed: number,
  isPaused: boolean,
  bodyWeightKg?: number,
  restRemaining?: number | null,
) {
  const title = workout.routineName ?? 'Workout';
  const vol = workout.exercises.reduce((total, we) => {
    return total + we.sets.reduce((sum, set) => {
      if (!set.completed || set.reps == null) return sum;
      if (set.weightKg != null) {
        return sum + set.weightKg * KG_TO_LBS * set.reps;
      }
      if (we.exercise.exerciseType === 'bodyweight' && bodyWeightKg) {
        return sum + bodyWeightKg * KG_TO_LBS * set.reps;
      }
      return sum;
    }, 0);
  }, 0);

  let body: string;
  if (isPaused) {
    body = `PAUSED · ${formatTimer(elapsed)}`;
  } else if (restRemaining != null && restRemaining > 0) {
    const endTime = new Date(Date.now() + restRemaining * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    body = `Rest · ready at ${endTime}`;
  } else if (vol > 0) {
    body = `${Math.round(vol).toLocaleString()} lbs · ${formatTimer(elapsed)}`;
  } else {
    body = formatTimer(elapsed);
  }

  const Notifications = await getNotifications();
  if (!Notifications) return;

  await Notifications.scheduleNotificationAsync({
    identifier: WORKOUT_NOTIF_ID,
    content: {
      title,
      body,
      data: { url: `/(app)/(tabs)/workout/${workout.id}` },
      sticky: true,
      autoDismiss: false,
      categoryIdentifier: isPaused ? 'workout-paused' : 'workout-running',
    },
    trigger: null,
  });
}

async function dismissWorkoutNotification() {
  try {
    const Notifications = await getNotifications();
    await Notifications?.dismissNotificationAsync(WORKOUT_NOTIF_ID);
  } catch { /* notification may not exist */ }
}

// Every arm/cancel of the rest alarm runs through this queue. Callers fire these off
// without awaiting (a set completing, a workout finishing), and each one is several
// awaits long, so unserialized they can interleave: finishing a workout could run its
// cancel to completion while a set's schedule was still mid-flight, and the schedule
// would then arm an alarm nothing was left to cancel. FIFO ordering means the last call
// wins, which is the intent every caller has.
let restNotifQueue: Promise<unknown> = Promise.resolve();
function queueRestNotifOp<T>(op: () => Promise<T>): Promise<T> {
  const next = restNotifQueue.then(op, op);
  restNotifQueue = next.catch(() => {});
  return next;
}

function scheduleRestEndNotification(secondsFromNow: number, workoutId: number, workoutTitle: string) {
  return queueRestNotifOp(async () => {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    // Clears the previous set's alarm, pending or already delivered, before arming this one.
    await Notifications.cancelScheduledNotificationAsync(REST_NOTIF_ID).catch(() => {});
    await Notifications.dismissNotificationAsync(REST_NOTIF_ID).catch(() => {});
    if (secondsFromNow <= 0) return;
    await Notifications.scheduleNotificationAsync({
      identifier: REST_NOTIF_ID,
      content: {
        title: workoutTitle,
        body: 'Ready for your next set!',
        data: { url: `/(app)/(tabs)/workout/${workoutId}` },
        // Unlike the ongoing workout notification this is a one-shot alert, so it stays
        // swipeable and clears when tapped. It also drops the 'workout-running' category:
        // that category carries a Pause button, which made sense on the persistent
        // notification but would be a confusing thing to offer on "rest is over".
        sticky: false,
        autoDismiss: true,
      },
      // channelId belongs on the trigger, not on content. BaseNotificationBuilder resolves
      // the channel via trigger.getNotificationChannel() and falls back to expo's own
      // channel when that is absent — so the previous content.android.channelId was never
      // read, and this would have posted to the fallback channel instead of 'rest-complete'
      // (losing the alarm vibration pattern, the ALARM audio usage, and the DND bypass).
      trigger: {
        type: 'timeInterval',
        seconds: secondsFromNow,
        repeats: false,
        channelId: 'rest-complete',
      } as any,
    });
  });
}

// Cancels a pending alarm and clears an already-delivered one. Both are needed now that
// the alarm actually fires: cancelScheduledNotificationAsync only drops it while it is
// still pending, so without the dismiss a rest notification that already fired would sit
// in the tray next to the ongoing workout one.
function cancelRestEndNotification() {
  return queueRestNotifOp(async () => {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    await Notifications.cancelScheduledNotificationAsync(REST_NOTIF_ID).catch(() => {});
    await Notifications.dismissNotificationAsync(REST_NOTIF_ID).catch(() => {});
  });
}

async function playRestDing() {
  try {
    const Haptics = await import('expo-haptics');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch { /* not available in Expo Go */ }
}

function defaultTrackedFields(exerciseType: string): string[] {
  switch (exerciseType) {
    case 'cardio':     return ['duration', 'distance'];
    case 'duration':   return ['duration'];
    case 'bodyweight': return ['reps'];
    default:           return ['reps', 'weight'];
  }
}

type SetEditField = 'weight' | 'reps' | 'duration' | 'distance' | 'steps';
type SetEditValues = { weight: string; reps: string; duration: string; distance: string; steps: string };
type SetEditState = Record<number, SetEditValues>;

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workoutId = Number(id);
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const c = useColors();
  const s = makeStyles(c);
  const healthConnectEnabled = useFeaturesStore((st) => st.features.activity && st.features.healthConnect);

  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [lastSetsByExercise, setLastSetsByExercise] = useState<Record<number, Array<{ setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null; steps: number | null }>>>({});
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [restSeconds, setRestSeconds] = useState(0);
  const [restDuration, setRestDuration] = useState(REST_SECONDS);
  const restDurationRef = useRef(REST_SECONDS);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const pausedAtRef = useRef<string | null>(null);
  const totalPausedSecondsRef = useRef<number>(0);
  const workoutRef = useRef<WorkoutDetail | null>(null);
  const isPausedRef = useRef(false);
  const restSecondsRef = useRef(0);

  // Exercise picker state
  const [showPicker, setShowPicker] = useState(false);
  const [exSearch, setExSearch] = useState('');
  const [exCategory, setExCategory] = useState<string | null>(null);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [exLoading, setExLoading] = useState(false);
  const [showCreateEx, setShowCreateEx] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExCategory, setNewExCategory] = useState('');
  const [newExType, setNewExType] = useState('weight');

  // Date editing
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState('');

  // Set input state: { [weId]: { weight: string; reps: string; duration: string; distance: string; steps: string } }
  const [setInputs, setSetInputs] = useState<Record<number, { weight: string; reps: string; duration: string; distance: string; steps: string }>>({});

  // Per-exercise notes
  const [exerciseNotes, setExerciseNotes] = useState<Record<number, string>>({});

  // Inline set editing: { [setId]: { weight: string; reps: string; duration: string; distance: string; steps: string } }
  const [setEdits, setSetEditsState] = useState<SetEditState>({});
  const setEditsRef = useRef<SetEditState>({});
  function setSetEdits(nextOrUpdater: SetEditState | ((prev: SetEditState) => SetEditState)) {
    const next = typeof nextOrUpdater === 'function'
      ? (nextOrUpdater as (prev: SetEditState) => SetEditState)(setEditsRef.current)
      : nextOrUpdater;
    setEditsRef.current = next;
    setSetEditsState(next);
  }
  // Which field was tapped to start editing (for autoFocus)
  const [setEditFocus, setSetEditFocus] = useState<Record<number, SetEditField>>({});
  // Tracks the set currently being edited so onBlur can tell if focus stayed in the same row
  const activeEditSetIdRef = useRef<number | null>(null);
  const focusedEditFieldRef = useRef<Record<number, SetEditField | undefined>>({});
  const setSaveSeqRef = useRef<Record<number, number>>({});

  function computeElapsed() {
    if (!startedAtRef.current) return 0;
    const raw = Math.floor((Date.now() - new Date(startedAtRef.current).getTime()) / 1000);
    return Math.max(0, raw - totalPausedSecondsRef.current);
  }

  const load = useCallback(async () => {
    try {
      const [data, measurements] = await Promise.all([
        getWorkout(token, workoutId),
        getMeasurements(token),
      ]);
      setWorkout(data);
      workoutRef.current = data;

      // Get most recent body weight for bodyweight volume calculation
      const weightMeasurement = measurements
        .filter((m) => m.metric === 'weight')
        .sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime())[0];
      if (weightMeasurement) {
        const kg = weightMeasurement.unit === 'lbs'
          ? weightMeasurement.value / 2.20462
          : weightMeasurement.value;
        setBodyWeightKg(kg);
      }
      // Fetch routine to get lastPerformedSets for "beat your last" display
      if (data.routineId && !data.completed) {
        getRoutine(token, data.routineId).then((routine) => {
          const map: Record<number, Array<{ setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null; steps: number | null }>> = {};
          for (const re of routine.exercises) {
            if (re.lastPerformedSets && re.lastPerformedSets.length > 0) {
              map[re.exercise.id] = re.lastPerformedSets;
            }
          }
          setLastSetsByExercise(map);
        }).catch(() => {});
      }
      // Seed per-exercise notes from loaded data
      const notes: Record<number, string> = {};
      for (const we of data.exercises) {
        notes[we.id] = we.notes ?? '';
      }
      setExerciseNotes(notes);

      // Start timer via API (idempotent) — only for active (incomplete) workouts
      let sa = data.startedAt;
      if (!data.completed) {
        let paused = data.pausedAt ?? null;
        let totalPaused = data.totalPausedSeconds ?? 0;
        if (!sa) {
          try {
            const r = await startWorkoutTimer(token, workoutId);
            sa = r.startedAt;
            paused = r.pausedAt ?? null;
            totalPaused = r.totalPausedSeconds ?? 0;
          } catch { /* ignore */ }
        }
        pausedAtRef.current = paused;
        totalPausedSecondsRef.current = totalPaused;
        startedAtRef.current = sa;
        const isCurrentlyPaused = !!paused;
        setIsPaused(isCurrentlyPaused);

        // Show persistent notification for active workout
        if (sa) {
          const raw = Math.floor((Date.now() - new Date(sa).getTime()) / 1000);
          const el = Math.max(0, raw - totalPaused);
          setElapsed(el);
          showWorkoutNotification(data, el, isCurrentlyPaused, bodyWeightKg ?? undefined).catch(() => {});
        }
      }
    } catch {
      Alert.alert('Error', 'Could not load workout.');
    } finally {
      setLoading(false);
    }
  }, [token, workoutId]);

  useEffect(() => {
    load();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  useEffect(() => {
    if (restStartedAt === null) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - restStartedAt) / 1000);
      const remaining = Math.max(0, restDurationRef.current - elapsed);
      restSecondsRef.current = remaining;
      setRestSeconds(remaining);
      if (remaining === 0) {
        restSecondsRef.current = 0;
        setRestStartedAt(null);
        // Who announces the end of rest depends on where we are when the clock runs out.
        // Android often keeps this interval running after the app is backgrounded, and
        // the old code unconditionally cancelled the scheduled notification and buzzed
        // via expo-haptics — which the user never feels from the background. So whether
        // the JS thread happened to survive decided whether rest vibrated at all.
        const endedMsAgo = Date.now() - (restStartedAt + restDurationRef.current * 1000);
        if (endedMsAgo >= 2000) {
          // A late catch-up tick: we were frozen and the notification has already fired.
          // Clear it from the tray, but don't buzz again for a rest that already ended.
          cancelRestEndNotification().catch(() => {});
        } else if (AppState.currentState === 'active') {
          // Live, and the user is looking at the app — haptics land, so drop the alarm.
          cancelRestEndNotification().catch(() => {});
          playRestDing();
        }
        // Live but backgrounded: leave the alarm alone. It is about to fire, and it is
        // the only thing that can actually reach the user.
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [restStartedAt]);

  // Handle pause/resume triggered from notification action button
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('workoutAction', (event: { type: string; workoutId: number }) => {
      if (event.workoutId !== workoutId) return;
      if (event.type === 'PAUSE') handlePause();
      else if (event.type === 'RESUME') handleResume();
    });
    return () => sub.remove();
  }, [workoutId]);

  // Start clock tick once startedAt is known; stop while paused
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!startedAtRef.current || isPaused) return;
    const tick = () => {
      const raw = Math.floor((Date.now() - new Date(startedAtRef.current!).getTime()) / 1000);
      const newElapsed = Math.max(0, raw - totalPausedSecondsRef.current);
      setElapsed(newElapsed);
      if (workoutRef.current && !isPausedRef.current) {
        const restRem = restSecondsRef.current > 0 ? restSecondsRef.current : null;
        showWorkoutNotification(workoutRef.current, newElapsed, false, bodyWeightKg ?? undefined, restRem).catch(() => {});
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [workout?.startedAt, isPaused]);

  function handleCancel() {
    Alert.alert('Cancel Workout', 'This will delete the session. Are you sure?', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'Cancel Session', style: 'destructive', onPress: async () => {
          try {
            await deleteWorkout(token, workoutId);
            await deleteExerciseRecord(String(workoutId));
            // Same as finishing: the rest period dies with the session, countdown included.
            setRestStartedAt(null);
            setRestSeconds(0);
            restSecondsRef.current = 0;
            dismissWorkoutNotification();
            await cancelRestEndNotification().catch(() => {});
            router.back();
          } catch {
            Alert.alert('Error', 'Could not cancel workout.');
          }
        },
      },
    ]);
  }

  async function handlePause() {
    isPausedRef.current = true;
    pausedAtRef.current = new Date().toISOString();
    setIsPaused(true);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    pauseWorkout(token, workoutId).catch(() => { /* best-effort; local pause still active */ });
    if (workoutRef.current) {
      const el = computeElapsed();
      await new Promise(r => setTimeout(r, 300));
      const Notifications = await getNotifications();
      await Notifications?.dismissNotificationAsync(WORKOUT_NOTIF_ID).catch(() => {});
      showWorkoutNotification(workoutRef.current, el, true, bodyWeightKg ?? undefined).catch(() => {});
    }
  }

  async function handleResume() {
    isPausedRef.current = false;
    const pausedAt = pausedAtRef.current;
    const addedPause = pausedAt ? Math.floor((Date.now() - new Date(pausedAt).getTime()) / 1000) : 0;
    totalPausedSecondsRef.current += addedPause;
    pausedAtRef.current = null;
    setIsPaused(false);
    resumeWorkout(token, workoutId).catch(() => { /* best-effort; local resume still active */ });
    if (workoutRef.current) {
      const Notifications = await getNotifications();
      await Notifications?.dismissNotificationAsync(WORKOUT_NOTIF_ID).catch(() => {});
      showWorkoutNotification(workoutRef.current, computeElapsed(), false, bodyWeightKg ?? undefined).catch(() => {});
    }
  }

  async function handleFinish() {
    setFinishing(true);
    // Stop the timer before touching notifications so in-flight ticks can't re-create the notification
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Ending the workout ends the rest period with it. Clearing restStartedAt tears down
    // the countdown effect, so no surviving tick can fire haptics on the way out, and the
    // awaited cancel (queued behind any in-flight arm) guarantees the alarm is gone before
    // we navigate away — otherwise it would still go off later, with no workout to return to.
    setRestStartedAt(null);
    setRestSeconds(0);
    restSecondsRef.current = 0;
    dismissWorkoutNotification();
    await cancelRestEndNotification().catch(() => {});
    try {
      const durationMinutes = Math.ceil(elapsed / 60) || 1;
      const updated = await updateWorkout(token, workoutId, { durationMinutes, completed: true });
      if (healthConnectEnabled) await writeExerciseRecord(updated, String(updated.id));
      // Non-blocking: estimate calories burned in the background (mirrors web behavior)
      estimateWorkoutCalories(token, workoutId).catch(() => { /* non-fatal */ });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not finish workout. Your session is still active — please try again.');
    } finally {
      setFinishing(false);
    }
  }

  async function openExPicker() {
    setShowPicker(true);
    setExSearch('');
    setExCategory(null);
    setExLoading(true);
    try {
      const [exs, cats] = await Promise.all([
        getExercises(token),
        getExerciseCategories(token),
      ]);
      setAllExercises(exs);
      setCategories(cats);
    } catch { /* ignore */ }
    finally { setExLoading(false); }
  }

  async function handleAddExercise(exercise: Exercise) {
    setShowPicker(false);
    try {
      const we = await addWorkoutExercise(token, workoutId, exercise.id);
      setWorkout((prev) => prev ? {
        ...prev,
        exercises: [...prev.exercises, { ...we, exercise, sets: [] }],
      } : prev);
      setExerciseNotes((prev) => ({ ...prev, [we.id]: we.notes ?? '' }));
    } catch { Alert.alert('Error', 'Could not add exercise.'); }
  }

  async function handleCreateCustomEx() {
    if (!newExName.trim() || !newExCategory.trim()) return;
    try {
      const ex = await createCustomExercise(token, { name: newExName.trim(), category: newExCategory.trim(), exerciseType: newExType });
      setAllExercises((prev) => [...prev, ex]);
      setShowCreateEx(false);
      setNewExName(''); setNewExCategory(''); setNewExType('weight');
      handleAddExercise(ex);
    } catch { Alert.alert('Error', 'Could not create exercise.'); }
  }

  async function handleRemoveExercise(weId: number) {
    Alert.alert('Remove', 'Remove this exercise?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await removeWorkoutExercise(token, workoutId, weId);
            setWorkout((prev) => prev ? { ...prev, exercises: prev.exercises.filter((e) => e.id !== weId) } : prev);
          } catch { Alert.alert('Error', 'Could not remove exercise.'); }
        },
      },
    ]);
  }

  async function handleAddSet(we: WorkoutExercise) {
    const inp = setInputs[we.id] ?? { weight: '', reps: '', duration: '', distance: '', steps: '' };
    const tf = we.exercise.trackedFields ?? defaultTrackedFields(we.exercise.exerciseType);
    const weightLbs = parseFloat(inp.weight);
    const reps = parseInt(inp.reps, 10);
    const durSeconds = mmssToSeconds(inp.duration ?? '');
    const distMeters = parseFloat(inp.distance ?? '');
    const stepsVal = parseInt(inp.steps ?? '', 10);
    const payload: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number; steps?: number } = {};
    if (tf.includes('weight') && !isNaN(weightLbs) && weightLbs >= 0) payload.weightKg = parseFloat(lbsToKg(weightLbs).toFixed(4));
    if (tf.includes('reps') && !isNaN(reps) && reps > 0) payload.reps = reps;
    if (tf.includes('duration') && durSeconds != null) payload.durationSeconds = durSeconds;
    if (tf.includes('distance') && !isNaN(distMeters) && distMeters >= 0) payload.distanceMeters = distMeters;
    if (tf.includes('steps') && !isNaN(stepsVal) && stepsVal > 0) payload.steps = stepsVal;
    try {
      const set = await addWorkoutSet(token, workoutId, we.id, payload);
      setWorkout((prev) => {
        const next = prev ? {
          ...prev,
          exercises: prev.exercises.map((e) =>
            e.id === we.id ? { ...e, sets: [...e.sets, set] } : e
          ),
        } : prev;
        if (next) showWorkoutNotification(next, computeElapsed(), isPaused, bodyWeightKg ?? undefined).catch(() => {});
        return next;
      });
      restDurationRef.current = REST_SECONDS;
      setRestDuration(REST_SECONDS);
      setRestSeconds(REST_SECONDS);
      setRestStartedAt(Date.now());
      scheduleRestEndNotification(REST_SECONDS, workoutId, workoutRef.current?.routineName ?? 'Workout').catch(() => {});
    } catch { Alert.alert('Error', 'Could not add set.'); }
  }

  async function handleDeleteSet(we: WorkoutExercise, set: ExerciseSet) {
    try {
      await deleteWorkoutSet(token, workoutId, we.id, set.id);
      setWorkout((prev) => prev ? {
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.id === we.id ? {
            ...e,
            sets: e.sets.filter((s) => s.id !== set.id).map((s, i) => ({ ...s, setNumber: i + 1 })),
          } : e
        ),
      } : prev);
    } catch { Alert.alert('Error', 'Could not delete set.'); }
  }

  function initSetEdit(set: ExerciseSet, focusField: SetEditField) {
    activeEditSetIdRef.current = set.id;
    focusedEditFieldRef.current[set.id] = focusField;
    setSetEdits((prev) => {
      if (prev[set.id]) {
        // Row already editing — just switch focus field, don't reset values
        return prev;
      }
      // New row: add this set's edits while preserving other pending saves
      return {
        ...prev,
        [set.id]: {
          weight: set.weightKg != null ? String(Math.round(kgToLbs(set.weightKg) * 10) / 10) : '',
          reps: set.reps != null ? String(set.reps) : '',
          duration: set.durationSeconds != null ? secondsToMMSS(set.durationSeconds) : '',
          distance: set.distanceMeters != null ? String(set.distanceMeters) : '',
          steps: (set as any).steps != null ? String((set as any).steps) : '',
        },
      };
    });
    setSetEditFocus((prev) => ({ ...prev, [set.id]: focusField }));
  }

  async function handleSaveSetEdit(
    we: WorkoutExercise,
    set: ExerciseSet,
    finalField?: SetEditField,
    finalValue?: string,
  ) {
    const currentEdit = setEditsRef.current[set.id];
    const focusedField = focusedEditFieldRef.current[set.id];
    const edit = currentEdit && finalField && focusedField === finalField
      ? { ...currentEdit, [finalField]: finalValue ?? '' }
      : currentEdit;
    if (!edit) return;
    if (finalField && focusedField === finalField) {
      setSetEdits((prev) => ({ ...prev, [set.id]: edit }));
    }
    // Mark that this field is no longer focused. If the user tapped another field
    // in the same set, that field's onFocus will immediately restore focusedEditFieldRef[set.id].
    delete focusedEditFieldRef.current[set.id];
    await new Promise((r) => setTimeout(r, 50));
    // If another field in this same set is now focused, don't save yet
    if (focusedEditFieldRef.current[set.id] !== undefined) return;
    const tf = we.exercise.trackedFields ?? defaultTrackedFields(we.exercise.exerciseType);
    const weightLbs = parseFloat(edit.weight);
    const reps = parseInt(edit.reps, 10);
    const durSeconds = mmssToSeconds(edit.duration);
    const distMeters = parseFloat(edit.distance);
    const stepsVal = parseInt(edit.steps ?? '', 10);
    const payload: { reps?: number | null; weightKg?: number | null; durationSeconds?: number | null; distanceMeters?: number | null; steps?: number | null } = {};
    if (tf.includes('weight')) payload.weightKg = !isNaN(weightLbs) && weightLbs >= 0 ? parseFloat(lbsToKg(weightLbs).toFixed(4)) : null;
    if (tf.includes('reps')) payload.reps = !isNaN(reps) && reps > 0 ? reps : null;
    if (tf.includes('duration')) payload.durationSeconds = durSeconds;
    if (tf.includes('distance')) payload.distanceMeters = !isNaN(distMeters) && distMeters >= 0 ? distMeters : null;
    if (tf.includes('steps')) payload.steps = !isNaN(stepsVal) && stepsVal > 0 ? stepsVal : null;
    const saveSeq = (setSaveSeqRef.current[set.id] ?? 0) + 1;
    setSaveSeqRef.current[set.id] = saveSeq;
    setWorkout((prev) => {
      if (!prev) return prev;
      const nextSet = {
        ...set,
        weightKg: payload.weightKg ?? null,
        reps: payload.reps ?? null,
        durationSeconds: payload.durationSeconds ?? null,
        distanceMeters: payload.distanceMeters ?? null,
        steps: payload.steps ?? null,
      };
      const nextWorkout = {
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.id === we.id ? {
            ...e,
            sets: e.sets.map((s) => s.id === set.id ? nextSet : s),
          } : e
        ),
      };
      workoutRef.current = nextWorkout;
      return nextWorkout;
    });
    activeEditSetIdRef.current = null;
    try {
      await updateWorkoutSet(token, workoutId, we.id, set.id, { ...payload, completed: set.completed });
      if (setSaveSeqRef.current[set.id] !== saveSeq) return;
      setWorkout((prev) => prev ? {
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.id === we.id ? {
            ...e,
            sets: e.sets.map((s) => s.id === set.id ? {
              ...s,
              weightKg: payload.weightKg ?? null,
              reps: payload.reps ?? null,
              durationSeconds: payload.durationSeconds ?? null,
              distanceMeters: payload.distanceMeters ?? null,
              steps: payload.steps ?? null,
            } : s),
          } : e
        ),
      } : prev);
    } catch { /* ignore — revert handled by re-init on focus */ }
    delete focusedEditFieldRef.current[set.id];
    setSetEdits((prev) => { const n = { ...prev }; delete n[set.id]; return n; });
    setSetEditFocus((prev) => { const n = { ...prev }; delete n[set.id]; return n; });
  }

  async function handleSaveNotes(we: WorkoutExercise) {
    const notes = exerciseNotes[we.id] ?? '';
    const trimmed = notes.trim();
    const current = we.notes ?? '';
    if (trimmed === current) return;
    try {
      await updateWorkoutExercise(token, workoutId, we.id, { notes: trimmed || null });
      setWorkout((prev) => prev ? {
        ...prev,
        exercises: prev.exercises.map((e) => e.id === we.id ? { ...e, notes: trimmed || null } : e),
      } : prev);
    } catch { /* ignore — notes are non-critical */ }
  }

  async function handleToggleSet(we: WorkoutExercise, set: ExerciseSet) {
    const newCompleted = !set.completed;
    if (newCompleted) {
      restDurationRef.current = REST_SECONDS;
      setRestDuration(REST_SECONDS);
      setRestSeconds(REST_SECONDS);
      setRestStartedAt(Date.now());
      scheduleRestEndNotification(REST_SECONDS, workoutId, workoutRef.current?.routineName ?? 'Workout').catch(() => {});
    }
    // Optimistic update
    setWorkout((prev) => {
      const next = prev ? {
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.id === we.id ? { ...e, sets: e.sets.map((s) => s.id === set.id ? { ...s, completed: newCompleted } : s) } : e
        ),
      } : prev;
      if (next) showWorkoutNotification(next, computeElapsed(), isPaused, bodyWeightKg ?? undefined).catch(() => {});
      return next;
    });
    try {
      await updateWorkoutSet(token, workoutId, we.id, set.id, { completed: newCompleted });
    } catch {
      // Revert on failure
      setWorkout((prev) => prev ? {
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.id === we.id ? { ...e, sets: e.sets.map((s) => s.id === set.id ? { ...s, completed: set.completed } : s) } : e
        ),
      } : prev);
    }
  }

  // Running volume: sum of weight_lbs × reps for completed sets (including bodyweight)
  const runningVolumeLbs = workout?.exercises.reduce((total, we) => {
    return total + we.sets.reduce((sum, set) => {
      if (!set.completed || set.reps == null) return sum;
      if (set.weightKg != null) {
        return sum + kgToLbs(set.weightKg) * set.reps;
      }
      if (we.exercise.exerciseType === 'bodyweight' && bodyWeightKg) {
        return sum + kgToLbs(bodyWeightKg) * set.reps;
      }
      return sum;
    }, 0);
  }, 0) ?? 0;
  const allSets = workout?.exercises.flatMap((we) => we.sets) ?? [];
  const completedSets = allSets.filter((set) => set.completed).length;
  const totalSets = allSets.length;
  const overallPct = totalSets > 0 ? completedSets / totalSets : 0;
  const routineTitle = workout?.routineName ?? 'Workout';
  const subtitle = workout?.exercises
    .map((we) => we.exercise.category)
    .filter((category, index, arr): category is string => !!category && arr.indexOf(category) === index)
    .slice(0, 3)
    .join(' · ');
  const volumeShort = runningVolumeLbs > 0
    ? runningVolumeLbs >= 1000
      ? `${Math.round(runningVolumeLbs / 100) / 10}k`
      : `${Math.round(runningVolumeLbs)}`
    : '—';

  const lastSessionVolumeLbs = Object.values(lastSetsByExercise).reduce((total, sets) => {
    return total + sets.reduce((sum, s) => {
      if (s.weightKg != null && s.reps != null) return sum + kgToLbs(s.weightKg) * s.reps;
      return sum;
    }, 0);
  }, 0);
  const vsLastDelta = lastSessionVolumeLbs > 0 ? runningVolumeLbs - lastSessionVolumeLbs : null;
  const vsLastPct = vsLastDelta != null ? (vsLastDelta / lastSessionVolumeLbs) * 100 : null;

  const filteredEx = allExercises.filter((e) => {
    const matchSearch = !exSearch || e.name.toLowerCase().includes(exSearch.toLowerCase());
    const matchCat = !exCategory || e.category === exCategory;
    return matchSearch && matchCat;
  });

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator style={{ marginTop: 60 }} color={c.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={s.headerTitleWrap}>
            <Text style={s.headerTitle} numberOfLines={1}>{routineTitle}</Text>
            <Text style={s.headerSubtitle} numberOfLines={1}>{subtitle || 'Active workout'}</Text>
          </View>
          <TouchableOpacity
            style={[s.finishBtn, finishing && s.finishBtnDisabled]}
            onPress={handleFinish}
            disabled={finishing}
          >
            <Text style={s.finishBtnText}>{finishing ? '…' : 'Finish'}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.headerMetrics}>
          <TouchableOpacity
            style={[s.timerControl, isPaused && s.timerControlPaused]}
            onPress={isPaused ? handleResume : handlePause}
          >
            <Text style={[s.pauseBtnText, isPaused && { color: PAUSED }]}>{isPaused ? '▶' : '⏸'}</Text>
          </TouchableOpacity>
          <View style={s.timerWrap}>
            <Text style={[s.timer, isPaused && { color: PAUSED }]}>{formatTimer(elapsed)}</Text>
            {isPaused && <Text style={s.pausedLabel}>PAUSED</Text>}
          </View>
          <View style={s.headerStats}>
            <StatChip value={`${completedSets}/${totalSets}`} label="sets" c={c} />
            <StatChip value={volumeShort} label="lbs" c={c} />
          </View>
        </View>

        <ProgressBar progress={overallPct} c={c} color={c.accent} height={3} />
      </View>

      {!workout?.completed && lastSessionVolumeLbs > 0 && (
        <View style={s.lastSessionBar}>
          <Text style={s.lastSessionBarLabel}>Last session</Text>
          <Text style={s.lastSessionBarValue}>{Math.round(lastSessionVolumeLbs).toLocaleString()} lbs</Text>
          {vsLastPct != null && (
            <Text style={[s.lastSessionBarDelta, { color: vsLastDelta! >= 0 ? SUCCESS : '#f87171' }]}>
              {vsLastDelta! >= 0 ? '▲' : '▼'} {Math.abs(vsLastPct).toFixed(0)}%
            </Text>
          )}
        </View>
      )}

      {restSeconds > 0 && (
        <RestTimer
          seconds={restSeconds}
          duration={restDuration}
          c={c}
          onAdd={() => {
            const newRemaining = restSecondsRef.current + 30;
            restDurationRef.current += 30;
            setRestDuration((d) => d + 30);
            setRestSeconds(newRemaining);
            scheduleRestEndNotification(newRemaining, workoutId, workoutRef.current?.routineName ?? 'Workout').catch(() => {});
          }}
          onSkip={() => {
            setRestStartedAt(null);
            setRestSeconds(0);
            restSecondsRef.current = 0;
            cancelRestEndNotification().catch(() => {});
          }}
        />
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Date row */}
          {editingDate ? (
            <View style={s.dateRow}>
              <TextInput
                style={s.dateInput}
                value={dateInput}
                onChangeText={setDateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={c.muted}
                autoFocus
                onBlur={() => {
                  setEditingDate(false);
                  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput) && workout && dateInput !== workout.workoutDate) {
                    updateWorkout(token, workoutId, { workoutDate: dateInput })
                      .then(() => setWorkout((prev) => prev ? { ...prev, workoutDate: dateInput } : prev))
                      .catch(() => Alert.alert('Error', 'Could not update date.'));
                  }
                }}
                onSubmitEditing={() => {
                  setEditingDate(false);
                  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput) && workout && dateInput !== workout.workoutDate) {
                    updateWorkout(token, workoutId, { workoutDate: dateInput })
                      .then(() => setWorkout((prev) => prev ? { ...prev, workoutDate: dateInput } : prev))
                      .catch(() => Alert.alert('Error', 'Could not update date.'));
                  }
                }}
              />
            </View>
          ) : (
            <TouchableOpacity style={s.dateRow} onPress={() => { setDateInput(workout?.workoutDate ?? ''); setEditingDate(true); }}>
              <Text style={s.dateText}>
                {workout ? new Date(workout.workoutDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''}
              </Text>
              <Text style={s.dateEdit}>Edit</Text>
            </TouchableOpacity>
          )}

          {workout?.exercises.map((we) => {
            const tf = we.exercise.trackedFields ?? defaultTrackedFields(we.exercise.exerciseType);
            const trackWeight   = tf.includes('weight');
            const trackReps     = tf.includes('reps');
            const trackDuration = tf.includes('duration');
            const trackDistance = tf.includes('distance');
            const trackSteps    = tf.includes('steps');
            const exerciseDone = we.sets.filter((set) => set.completed).length;
            const exerciseTotal = we.sets.length;
            const exercisePct = exerciseTotal > 0 ? exerciseDone / exerciseTotal : 0;
            const exerciseComplete = exerciseTotal > 0 && exerciseDone === exerciseTotal;
            const lastSets = lastSetsByExercise[we.exercise.id] ?? null;
            const lastLabel = (() => {
              if (!lastSets || lastSets.length === 0) return null;
              const s0 = lastSets[0];
              if (trackWeight && s0.weightKg != null) {
                const lbs = Math.round(s0.weightKg * KG_TO_LBS * 10) / 10;
                const repsStr = s0.reps != null ? ` × ${s0.reps} reps` : '';
                return `Last: ${lbs % 1 === 0 ? lbs : lbs.toFixed(1)} lbs${repsStr}`;
              }
              if (trackSteps && s0.steps != null) {
                const dur = s0.durationSeconds;
                const paceStr = dur ? ` (${Math.round(s0.steps / (dur / 60))} stairs/min)` : '';
                return `Last: ${s0.steps.toLocaleString()} steps${paceStr}`;
              }
              if (trackDuration && s0.durationSeconds != null) {
                const m = Math.floor(s0.durationSeconds / 60);
                const sec = s0.durationSeconds % 60;
                return `Last: ${m}:${String(sec).padStart(2, '0')}`;
              }
              return null;
            })();
            return (
            <View key={we.id} style={[s.exerciseBlock, exerciseComplete && s.exerciseBlockDone]}>
              <View style={s.exerciseHeader}>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity onPress={() => router.push(`/(app)/exercise/${we.exercise.id}`)}>
                    <Text style={[s.exerciseName, exerciseComplete && s.exerciseNameDone]}>{we.exercise.name}</Text>
                  </TouchableOpacity>
                  {lastLabel && (
                    <View style={s.lastSetPill}>
                      <Text style={s.lastSetLead}>Beat last</Text>
                      <Text style={s.lastSetText}>{lastLabel.replace(/^Last:\s*/, '')}</Text>
                    </View>
                  )}
                  <Text style={s.exerciseCategory}>{we.exercise.category}</Text>
                </View>
                <View style={s.exerciseProgress}>
                  {exerciseComplete && <Text style={s.donePill}>Done</Text>}
                  <Text style={[s.exerciseProgressText, exerciseComplete && { color: SUCCESS }]}>{exerciseDone}/{exerciseTotal}</Text>
                  <ProgressBar progress={exercisePct} c={c} color={exerciseComplete ? SUCCESS : c.accent} height={3} />
                </View>
                <TouchableOpacity onLongPress={() => handleRemoveExercise(we.id)} onPress={() => handleRemoveExercise(we.id)} style={s.exerciseRemoveBtn}>
                  <Text style={s.exerciseRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Notes */}
              <TextInput
                style={s.exerciseNotes}
                value={exerciseNotes[we.id] ?? ''}
                onChangeText={(v) => setExerciseNotes((prev) => ({ ...prev, [we.id]: v }))}
                onBlur={() => handleSaveNotes(we)}
                placeholder="Notes…"
                placeholderTextColor={c.muted}
                multiline
                scrollEnabled={false}
              />

              {/* Set header */}
              <View style={s.setHeader}>
                <Text style={[s.setCol, s.setColNum]}>#</Text>
                {trackWeight   && <Text style={[s.setCol, s.setColData]}>lbs</Text>}
                {trackReps     && <Text style={[s.setCol, s.setColData]}>reps</Text>}
                {trackDuration && <Text style={[s.setCol, s.setColData]}>time</Text>}
                {trackDistance && <Text style={[s.setCol, s.setColData]}>dist</Text>}
                {trackSteps    && <Text style={[s.setCol, s.setColData]}>steps</Text>}
                <View style={s.setColCheck} />
                <View style={s.setColDel} />
              </View>

              {/* Set rows */}
              {we.sets.map((set) => {
                const editing = !!setEdits[set.id];
                const edit = setEdits[set.id];
                const focusField = setEditFocus[set.id];
                return (
                <View key={editing ? `${set.id}-${focusField}` : set.id} style={[s.setRow, set.completed && s.setRowDone]}>
                  <Text style={[s.setCol, s.setColNum, { color: c.muted }]}>{set.setNumber}</Text>
                  {trackWeight && (
                    editing ? (
                      <SelectAllInput
                        style={[s.setInlineInput, s.setColData]}
                        value={edit.weight}
                        onChangeText={(v) => setSetEdits((prev) => ({ ...prev, [set.id]: { ...prev[set.id], weight: v } }))}
                        onFocus={() => { activeEditSetIdRef.current = set.id; focusedEditFieldRef.current[set.id] = 'weight'; }}
                        onEndEditing={(e) => handleSaveSetEdit(we, set, 'weight', e.nativeEvent.text)}
                        keyboardType="decimal-pad"
                        autoFocus={focusField === 'weight'}
                      />
                    ) : (
                      <TouchableOpacity style={[s.setColData, s.setColDataTouch]} onPress={() => initSetEdit(set, 'weight')}>
                        <Text style={[s.setCol, set.completed && s.setTextDone]}>
                          {set.weightKg != null ? Math.round(kgToLbs(set.weightKg) * 10) / 10 : '—'}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                  {trackReps && (
                    editing ? (
                      <SelectAllInput
                        style={[s.setInlineInput, s.setColData]}
                        value={edit?.reps ?? ''}
                        onChangeText={(v) => setSetEdits((prev) => ({ ...prev, [set.id]: { ...prev[set.id], reps: v } }))}
                        onFocus={() => { activeEditSetIdRef.current = set.id; focusedEditFieldRef.current[set.id] = 'reps'; }}
                        onEndEditing={(e) => handleSaveSetEdit(we, set, 'reps', e.nativeEvent.text)}
                        keyboardType="number-pad"
                        autoFocus={focusField === 'reps'}
                      />
                    ) : (
                      <TouchableOpacity style={[s.setColData, s.setColDataTouch]} onPress={() => initSetEdit(set, 'reps')}>
                        <Text style={[s.setCol, set.completed && s.setTextDone]}>{set.reps ?? '—'}</Text>
                      </TouchableOpacity>
                    )
                  )}
                  {trackDuration && (
                    editing ? (
                      <SelectAllInput
                        style={[s.setInlineInput, s.setColData]}
                        value={edit?.duration ?? ''}
                        onChangeText={(v) => setSetEdits((prev) => ({ ...prev, [set.id]: { ...prev[set.id], duration: v } }))}
                        onFocus={() => { activeEditSetIdRef.current = set.id; focusedEditFieldRef.current[set.id] = 'duration'; }}
                        onEndEditing={(e) => handleSaveSetEdit(we, set, 'duration', e.nativeEvent.text)}
                        keyboardType="numbers-and-punctuation"
                        autoFocus={focusField === 'duration'}
                      />
                    ) : (
                      <TouchableOpacity style={[s.setColData, s.setColDataTouch]} onPress={() => initSetEdit(set, 'duration')}>
                        <Text style={[s.setCol, set.completed && s.setTextDone]}>
                          {set.durationSeconds != null ? secondsToMMSS(set.durationSeconds) : '—'}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                  {trackDistance && (
                    editing ? (
                      <SelectAllInput
                        style={[s.setInlineInput, s.setColData]}
                        value={edit?.distance ?? ''}
                        onChangeText={(v) => setSetEdits((prev) => ({ ...prev, [set.id]: { ...prev[set.id], distance: v } }))}
                        onFocus={() => { activeEditSetIdRef.current = set.id; focusedEditFieldRef.current[set.id] = 'distance'; }}
                        onEndEditing={(e) => handleSaveSetEdit(we, set, 'distance', e.nativeEvent.text)}
                        keyboardType="decimal-pad"
                        autoFocus={focusField === 'distance'}
                      />
                    ) : (
                      <TouchableOpacity style={[s.setColData, s.setColDataTouch]} onPress={() => initSetEdit(set, 'distance')}>
                        <Text style={[s.setCol, set.completed && s.setTextDone]}>
                          {set.distanceMeters != null ? set.distanceMeters : '—'}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                  {trackSteps && (
                    editing ? (
                      <SelectAllInput
                        style={[s.setInlineInput, s.setColData]}
                        value={edit?.steps ?? ''}
                        onChangeText={(v) => setSetEdits((prev) => ({ ...prev, [set.id]: { ...prev[set.id], steps: v } }))}
                        onFocus={() => { activeEditSetIdRef.current = set.id; focusedEditFieldRef.current[set.id] = 'steps'; }}
                        onEndEditing={(e) => handleSaveSetEdit(we, set, 'steps', e.nativeEvent.text)}
                        keyboardType="number-pad"
                        autoFocus={focusField === 'steps'}
                      />
                    ) : (
                      <TouchableOpacity style={[s.setColData, s.setColDataTouch]} onPress={() => initSetEdit(set, 'steps')}>
                        <Text style={[s.setCol, set.completed && s.setTextDone]}>
                          {(set as any).steps != null ? (set as any).steps : '—'}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                  <TouchableOpacity style={s.setColCheck} onPress={() => handleToggleSet(we, set)}>
                    <View style={[s.checkBox, set.completed && s.checkBoxDone]}>
                      {set.completed && <Text style={s.checkMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.setColDel} onPress={() => handleDeleteSet(we, set)}>
                    <Text style={s.setDelText}>✕</Text>
                  </TouchableOpacity>
                </View>
                );
              })}

              {/* Add set input row */}
              <View style={s.addSetRow}>
                <View style={s.setColNum} />
                {trackWeight && (
                  <TextInput
                    style={[s.setInput, s.setColData]}
                    placeholder="lbs"
                    placeholderTextColor={c.muted}
                    keyboardType="decimal-pad"
                    value={setInputs[we.id]?.weight ?? ''}
                    onChangeText={(v) => setSetInputs((prev) => ({ ...prev, [we.id]: { ...prev[we.id], weight: v, reps: prev[we.id]?.reps ?? '', duration: prev[we.id]?.duration ?? '', distance: prev[we.id]?.distance ?? '', steps: prev[we.id]?.steps ?? '' } }))}
                  />
                )}
                {trackReps && (
                  <TextInput
                    style={[s.setInput, s.setColData]}
                    placeholder="reps"
                    placeholderTextColor={c.muted}
                    keyboardType="number-pad"
                    value={setInputs[we.id]?.reps ?? ''}
                    onChangeText={(v) => setSetInputs((prev) => ({ ...prev, [we.id]: { ...prev[we.id], reps: v, weight: prev[we.id]?.weight ?? '', duration: prev[we.id]?.duration ?? '', distance: prev[we.id]?.distance ?? '', steps: prev[we.id]?.steps ?? '' } }))}
                  />
                )}
                {trackDuration && (
                  <TextInput
                    style={[s.setInput, s.setColData]}
                    placeholder="m:ss"
                    placeholderTextColor={c.muted}
                    keyboardType="numbers-and-punctuation"
                    value={setInputs[we.id]?.duration ?? ''}
                    onChangeText={(v) => setSetInputs((prev) => ({ ...prev, [we.id]: { ...prev[we.id], duration: v, weight: prev[we.id]?.weight ?? '', reps: prev[we.id]?.reps ?? '', distance: prev[we.id]?.distance ?? '', steps: prev[we.id]?.steps ?? '' } }))}
                  />
                )}
                {trackDistance && (
                  <TextInput
                    style={[s.setInput, s.setColData]}
                    placeholder="dist"
                    placeholderTextColor={c.muted}
                    keyboardType="decimal-pad"
                    value={setInputs[we.id]?.distance ?? ''}
                    onChangeText={(v) => setSetInputs((prev) => ({ ...prev, [we.id]: { ...prev[we.id], distance: v, weight: prev[we.id]?.weight ?? '', reps: prev[we.id]?.reps ?? '', duration: prev[we.id]?.duration ?? '', steps: prev[we.id]?.steps ?? '' } }))}
                  />
                )}
                {trackSteps && (
                  <TextInput
                    style={[s.setInput, s.setColData]}
                    placeholder="steps"
                    placeholderTextColor={c.muted}
                    keyboardType="number-pad"
                    value={setInputs[we.id]?.steps ?? ''}
                    onChangeText={(v) => setSetInputs((prev) => ({ ...prev, [we.id]: { ...prev[we.id], steps: v, weight: prev[we.id]?.weight ?? '', reps: prev[we.id]?.reps ?? '', duration: prev[we.id]?.duration ?? '', distance: prev[we.id]?.distance ?? '' } }))}
                  />
                )}
                <TouchableOpacity style={[s.setColDel, s.addSetBtn]} onPress={() => handleAddSet(we)}>
                  <Text style={s.addSetBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            );
          })}

          <TouchableOpacity style={s.addExBtn} onPress={openExPicker}>
            <Text style={s.addExBtnText}>+ Add Exercise</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.finishBtnBottom, finishing && s.finishBtnDisabled]}
            onPress={handleFinish}
            disabled={finishing}
          >
            <Text style={s.finishBtnText}>{finishing ? 'Finishing…' : 'Finish Workout'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.cancelSessionBtn} onPress={handleCancel}>
            <Text style={s.cancelSessionText}>Cancel Session</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Exercise picker modal */}
      <Modal visible={showPicker} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Add Exercise</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {showCreateEx ? (
            <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={s.createLabel}>Exercise name</Text>
              <TextInput style={s.createInput} value={newExName} onChangeText={setNewExName} placeholder="e.g. Bulgarian Split Squat" placeholderTextColor={c.muted} />
              <Text style={s.createLabel}>Category</Text>
              <TextInput style={s.createInput} value={newExCategory} onChangeText={setNewExCategory} placeholder="e.g. Legs" placeholderTextColor={c.muted} />
              <Text style={s.createLabel}>Type</Text>
              <View style={s.typeRow}>
                {['weight', 'bodyweight', 'cardio', 'duration', 'resistance'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.typeBtn, newExType === t && s.typeBtnActive]}
                    onPress={() => setNewExType(t)}
                  >
                    <Text style={[s.typeBtnText, newExType === t && { color: c.bg }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={s.confirmBtn} onPress={handleCreateCustomEx}>
                <Text style={s.confirmBtnText}>Create & Add</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelLink} onPress={() => setShowCreateEx(false)}>
                <Text style={s.cancelLinkText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <>
              <View style={s.exSearchBox}>
                <TextInput
                  style={s.exSearchInput}
                  placeholder="Search exercises…"
                  placeholderTextColor={c.muted}
                  value={exSearch}
                  onChangeText={setExSearch}
                  autoFocus
                />
              </View>
              {/* Category chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={s.catScrollContent}>
                <TouchableOpacity style={[s.catChip, !exCategory && s.catChipActive]} onPress={() => setExCategory(null)}>
                  <Text style={[s.catChipText, !exCategory && { color: c.bg }]}>All</Text>
                </TouchableOpacity>
                {categories.map((cat) => (
                  <TouchableOpacity key={cat} style={[s.catChip, exCategory === cat && s.catChipActive]} onPress={() => setExCategory(cat === exCategory ? null : cat)}>
                    <Text style={[s.catChipText, exCategory === cat && { color: c.bg }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {exLoading ? (
                <ActivityIndicator style={{ marginTop: 30 }} color={c.accent} />
              ) : (
                <FlatList
                  data={filteredEx}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={s.exRow} onPress={() => handleAddExercise(item)}>
                      <View>
                        <Text style={s.exName}>{item.name}</Text>
                        <Text style={s.exMeta}>{item.category} · {item.exerciseType}</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  ListFooterComponent={
                    <TouchableOpacity style={s.createExLink} onPress={() => setShowCreateEx(true)}>
                      <Text style={s.createExLinkText}>+ Create custom exercise</Text>
                    </TouchableOpacity>
                  }
                  keyboardShouldPersistTaps="handled"
                />
              )}
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.border, gap: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: fontSize.sm, fontWeight: '700', color: c.text, lineHeight: 18 },
  headerSubtitle: { fontSize: 13, color: c.muted, marginTop: 2 },
  headerMetrics: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerStats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  backBtnText: { color: c.accent, fontSize: fontSize.sm },
  timerWrap: { flex: 1, alignItems: 'flex-start' },
  timer: { fontSize: fontSize['2xl'], fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'], lineHeight: 31 },
  pausedLabel: { fontSize: 13, color: PAUSED, marginTop: 1, fontWeight: '700', letterSpacing: 1 },
  timerControl: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: c.accent, alignItems: 'center', justifyContent: 'center', backgroundColor: `${c.accent}12` },
  timerControlPaused: { borderColor: PAUSED, backgroundColor: `${PAUSED}12` },
  pauseBtnText: { fontSize: 14, color: c.text },
  finishBtn: { backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  finishBtnBottom: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelSessionBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelSessionText: { fontSize: fontSize.sm, color: c.muted },
  finishBtnDisabled: { opacity: 0.5 },
  finishBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: c.bg },
  lastSessionBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.card },
  lastSessionBarLabel: { fontSize: 13, color: c.muted },
  lastSessionBarValue: { fontSize: 13, fontWeight: '700', color: c.text, flex: 1 },
  lastSessionBarDelta: { fontSize: 13, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, gap: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 4 },
  dateText: { fontSize: fontSize.sm, color: c.muted },
  dateEdit: { fontSize: fontSize.sm, color: c.accent },
  dateInput: { flex: 1, fontSize: fontSize.sm, color: c.text, backgroundColor: c.card, borderRadius: 8, borderWidth: 1, borderColor: c.accent, paddingHorizontal: 10, paddingVertical: 6 },
  exerciseBlock: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  exerciseBlockDone: { borderColor: `${SUCCESS}66` },
  exerciseHeader: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  exerciseName: { fontSize: fontSize.base, fontWeight: '700', color: c.text },
  exerciseNameDone: { color: SUCCESS },
  exerciseCategory: { fontSize: 13, color: c.muted, marginTop: 2 },
  exerciseProgress: { width: 52, gap: 3, alignItems: 'stretch' },
  exerciseProgressText: { fontSize: 13, color: c.text, fontWeight: '700', textAlign: 'center' },
  donePill: { fontSize: 13, color: SUCCESS, backgroundColor: `${SUCCESS}20`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontWeight: '600', overflow: 'hidden', textAlign: 'center' },
  lastSetPill: { marginTop: 6, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${c.accent}14`, borderColor: `${c.accent}40`, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  lastSetLead: { fontSize: 13, color: c.accent, fontWeight: '600' },
  lastSetText: { fontSize: 13, color: c.muted },
  exerciseRemoveBtn: { paddingLeft: 4, paddingVertical: 4 },
  exerciseRemoveText: { color: c.border, fontSize: 13 },
  exerciseNotes: { paddingHorizontal: 14, paddingVertical: 8, fontSize: fontSize.sm, color: c.muted, borderBottomWidth: 1, borderBottomColor: c.border, minHeight: 32 },
  setHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.025)', borderTopWidth: 1, borderTopColor: c.border },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 48, borderTopWidth: 1, borderTopColor: c.border },
  addSetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border, gap: 0 },
  setCol: { fontSize: fontSize.sm, color: c.text, textAlign: 'center' },
  setColNum: { width: 28, textAlign: 'center', fontSize: fontSize.sm },
  setColData: { flex: 1, textAlign: 'center' },
  setColWeight: { flex: 1, textAlign: 'center' },
  setColReps: { flex: 1, textAlign: 'center' },
  setColCheck: { width: 32, alignItems: 'center' },
  setColDel: { width: 32, alignItems: 'center' },
  setDelText: { color: c.border, fontSize: 13 },
  setRowDone: { backgroundColor: `${SUCCESS}10` },
  setTextDone: { color: c.muted, textDecorationLine: 'line-through', textDecorationColor: `${c.muted}66` },
  checkBox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxDone: { backgroundColor: SUCCESS, borderColor: SUCCESS },
  checkMark: { fontSize: 12, color: c.bg, fontWeight: '700', lineHeight: 14 },
  setInput: { borderWidth: 1, borderColor: c.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 6, fontSize: fontSize.sm, color: c.text, backgroundColor: c.bg, textAlign: 'center', marginHorizontal: 2 },
  setInlineInput: { borderWidth: 1, borderColor: c.accent, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 4, fontSize: fontSize.sm, color: c.text, backgroundColor: c.bg, textAlign: 'center' },
  setColDataTouch: { alignItems: 'center', justifyContent: 'center', minHeight: 32 },
  addSetBtn: { backgroundColor: c.accent, borderRadius: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  addSetBtnText: { color: c.bg, fontWeight: '700', fontSize: 18, lineHeight: 20 },
  addExBtn: { borderWidth: 1, borderColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addExBtnText: { fontSize: fontSize.sm, color: c.accent, fontWeight: '600' },
  // Modal
  modal: { flex: 1, backgroundColor: c.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  modalTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: '700', color: c.text },
  modalClose: { fontSize: 20, color: c.muted, paddingLeft: 12 },
  modalBody: { flex: 1, padding: 16 },
  exSearchBox: { borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 16 },
  exSearchInput: { paddingVertical: 14, fontSize: fontSize.base, color: c.text },
  catScroll: { maxHeight: 48 },
  catScrollContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  catChip: { borderWidth: 1, borderColor: c.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  catChipActive: { backgroundColor: c.accent, borderColor: c.accent },
  catChipText: { fontSize: fontSize.sm, color: c.muted },
  exRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  exName: { fontSize: fontSize.sm, color: c.text, fontWeight: '500' },
  exMeta: { fontSize: fontSize.sm, color: c.muted, marginTop: 1 },
  createExLink: { paddingHorizontal: 16, paddingVertical: 16 },
  createExLinkText: { fontSize: fontSize.sm, color: c.accent },
  createLabel: { fontSize: fontSize.sm, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 16, marginBottom: 6 },
  createInput: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, fontSize: fontSize.base, color: c.text, backgroundColor: c.card },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  typeBtn: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  typeBtnActive: { backgroundColor: c.accent, borderColor: c.accent },
  typeBtnText: { fontSize: fontSize.sm, color: c.muted },
  confirmBtn: { backgroundColor: c.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  confirmBtnText: { fontSize: fontSize.base, fontWeight: '700', color: c.bg },
  cancelLink: { paddingVertical: 14, alignItems: 'center' },
  cancelLinkText: { fontSize: fontSize.sm, color: c.muted },
  });
}
