import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, TouchableWithoutFeedback, View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSwipeNav } from '../../../src/hooks/useSwipeNav';
import SettingsPlanningTab from '../../../src/components/SettingsPlanningTab';
import {
  goalsV2Api, measurementsApi, goalsByCategory,
  CATALOG_BY_CATEGORY,
  type Goal, type GoalCategory,
  type CreateGoalPayload,
  type GoalProgressEntry, type GoalCatalogEntry,
} from '../../../../../packages/api-client/src/index';
import { getExercises, getRoutines } from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';

// ─── Constants ────────────────────────────────────────────────────────────────

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

const STATUS_CFG = {
  active:    { label: 'Active',    color: '#60a5fa' },
  achieved:  { label: 'Achieved',  color: '#7BB389' },
  missed:    { label: 'Missed',    color: '#C9714F' },
  abandoned: { label: 'Abandoned', color: '#6b7280' },
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isTargetCrossed(goal: Goal): boolean {
  if (goal.currentValue == null || goal.startValue == null) return false;
  return goal.targetValue < goal.startValue
    ? goal.currentValue <= goal.targetValue
    : goal.currentValue >= goal.targetValue;
}

function calcProgress(goal: Goal): number | null {
  if (goal.currentValue == null) return null;
  if (goal.startValue != null && goal.targetValue !== goal.startValue) {
    return Math.min(1, Math.max(0,
      (goal.currentValue - goal.startValue) / (goal.targetValue - goal.startValue)
    ));
  }
  if (goal.targetValue > 0) {
    return Math.min(1, Math.max(0, goal.currentValue / goal.targetValue));
  }
  return null;
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────

function GoalCard({ goal, onLog, onClose, onDelete, onToggleDashboard, onSyncScale, c }: {
  goal: Goal;
  onLog: (g: Goal) => void;
  onClose: (g: Goal) => void;
  onDelete: (id: number) => void;
  onToggleDashboard: (g: Goal) => void;
  onSyncScale?: () => void;
  c: Colors;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const catColor = CATEGORY_COLORS[goal.category];
  const days = goal.deadline
    ? Math.ceil((new Date(goal.deadline + 'T12:00:00').getTime() - Date.now()) / 86400000)
    : null;

  return (
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={[s.catBar, { backgroundColor: catColor }]} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }} numberOfLines={1}>
                {goal.name}
              </Text>
              {goal.sourceName && (
                <Text style={{ color: c.muted, fontSize: fontSize.xs }} numberOfLines={1}>{goal.sourceName}</Text>
              )}
            </View>
            <Text style={{ color: c.muted, fontSize: fontSize.xs, marginLeft: 8, flexShrink: 0 }}>
              {goal.currentValue != null
                ? goal.currentValue.toLocaleString(undefined, { maximumFractionDigits: 1 })
                : '—'
              }
              {' / '}{goal.targetValue.toLocaleString(undefined, { maximumFractionDigits: 1 })} {goal.unit}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {days != null && (
                <View style={[s.chip, { borderColor: days < 7 ? '#C9714F' : c.border }]}>
                  <Text style={{ color: days < 7 ? '#C9714F' : c.muted, fontSize: fontSize.xs }}>
                    {days > 0 ? `${days}d left` : days === 0 ? 'Due today' : `${Math.abs(days)}d overdue`}
                  </Text>
                </View>
              )}
              {goal.showOnDashboard && (
                <View style={[s.chip, { borderColor: c.border }]}>
                  <Ionicons name="pin" size={10} color={c.muted} />
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <TouchableOpacity onPress={() => onLog(goal)} style={[s.actionBtn, { borderColor: c.border }]}>
                <Text style={{ color: c.accent, fontSize: fontSize.xs, fontWeight: '600' }}>Log</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMenuOpen(true)} style={[s.actionBtn, { borderColor: c.border }]}>
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>···</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={s.overlay} onPress={() => setMenuOpen(false)} activeOpacity={1}>
          <View style={[s.menu, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={{ color: c.muted, fontSize: fontSize.xs, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {goal.name}
            </Text>
            {([
              { label: 'Log Progress',            icon: 'add-circle-outline',    action: () => { setMenuOpen(false); onLog(goal); } },
              { label: 'View Progress History',   icon: 'bar-chart-outline',     action: () => { setMenuOpen(false); router.push(`/(app)/goal/${goal.id}` as any); } },
              ...(onSyncScale ? [{ label: 'Sync from Scale', icon: 'sync-outline', action: () => { setMenuOpen(false); onSyncScale(); } }] : []),
              { label: goal.showOnDashboard ? 'Remove from Dashboard' : 'Pin to Dashboard', icon: 'pin-outline', action: () => { setMenuOpen(false); onToggleDashboard(goal); } },
              { label: 'Close Goal',              icon: 'checkmark-circle-outline', action: () => { setMenuOpen(false); onClose(goal); } },
              { label: 'Delete',                  icon: 'trash-outline',         action: () => { setMenuOpen(false); onDelete(goal.id); }, danger: true },
            ] as { label: string; icon: string; action: () => void; danger?: boolean }[]).map(item => (
              <TouchableOpacity key={item.label} onPress={item.action} style={[s.menuItem, { borderColor: c.border }]}>
                <Ionicons name={item.icon as any} size={18} color={item.danger ? '#ef4444' : c.text} />
                <Text style={{ color: item.danger ? '#ef4444' : c.text, fontSize: fontSize.sm }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ height: 8 }} />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── HistoryGoalRow ───────────────────────────────────────────────────────────

function HistoryGoalRow({ goal, c }: { goal: Goal; c: Colors }) {
  const catColor = CATEGORY_COLORS[goal.category];
  const statusCfg = STATUS_CFG[goal.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.abandoned;
  const closedDate = goal.closedAt
    ? new Date(goal.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <View style={[s.historyRow, { borderBottomColor: c.border }]}>
      <View style={[s.catBar, { backgroundColor: catColor, alignSelf: 'stretch' }]} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600', flex: 1 }} numberOfLines={1}>
            {goal.name}
          </Text>
          <View style={[s.statusChip, { backgroundColor: statusCfg.color + '22', borderColor: statusCfg.color + '44' }]}>
            <Text style={{ color: statusCfg.color, fontSize: fontSize.xs, fontWeight: '600' }}>{statusCfg.label}</Text>
          </View>
        </View>
        <Text style={{ color: c.muted, fontSize: fontSize.xs }}>
          Target: {goal.targetValue.toLocaleString()} {goal.unit}
          {goal.actualValueAtClose != null ? ` · Actual: ${goal.actualValueAtClose.toLocaleString()} ${goal.unit}` : ''}
        </Text>
        {closedDate && (
          <Text style={{ color: c.muted, fontSize: fontSize.xs }}>Closed {closedDate}</Text>
        )}
      </View>
    </View>
  );
}

// ─── LogProgressSheet ─────────────────────────────────────────────────────────

function LogProgressSheet({ goal, onClose, onLogged, c }: {
  goal: Goal;
  onClose: () => void;
  onLogged: (entry: GoalProgressEntry, updated: Goal) => void;
  c: Colors;
}) {
  const [value, setValue]   = useState(goal.currentValue?.toString() ?? '');
  const [notes, setNotes]   = useState('');
  const [logDate, setLogDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [showLogDatePicker, setShowLogDatePicker] = useState(false);

  async function handleSave() {
    if (!value) return;
    setSaving(true);
    try {
      const entry = await goalsV2Api.logProgress(goal.id, {
        value: Number(value),
        loggedAt: logDate ? logDate + 'T12:00:00' : undefined,
        notes: notes || null,
      });
      onLogged(entry, { ...goal, currentValue: Number(value) });
    } catch {
      Alert.alert('Error', 'Could not log progress.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
        </TouchableWithoutFeedback>
        <View style={[s.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={s.sheetHeader}>
              <View>
                <Text style={[s.sheetTitle, { color: c.text }]}>Log Progress</Text>
                <Text style={{ color: c.muted, fontSize: fontSize.xs, marginTop: 2 }}>{goal.name}</Text>
              </View>
              <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[s.fieldLabel, { color: c.muted }]}>Value</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TextInput
                      style={[s.input, { flex: 1, color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                      value={value}
                      onChangeText={setValue}
                      keyboardType="decimal-pad"
                      placeholder={goal.currentValue?.toString() ?? '0'}
                      placeholderTextColor={c.muted}
                      autoFocus
                    />
                    <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{goal.unit}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[s.fieldLabel, { color: c.muted }]}>Date</Text>
                  <TouchableOpacity
                    onPress={() => setShowLogDatePicker(true)}
                    style={[s.input, { justifyContent: 'center', borderColor: c.border, backgroundColor: c.bg }]}
                  >
                    <Text style={{ color: c.text, fontSize: fontSize.sm }}>{logDate}</Text>
                  </TouchableOpacity>
                  {showLogDatePicker && (
                    <DateTimePicker
                      value={new Date(logDate + 'T12:00:00')}
                      mode="date"
                      display="default"
                      onChange={(event, selected) => {
                        setShowLogDatePicker(false);
                        if (selected && event.type !== 'dismissed') {
                          setLogDate(selected.toISOString().slice(0, 10));
                        }
                      }}
                    />
                  )}
                </View>
              </View>

              <TextInput
                style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Notes (optional)"
                placeholderTextColor={c.muted}
              />
            </View>

            <View style={[s.actions, { marginTop: 16 }]}>
              <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || !value}
                style={[s.primaryBtn, { backgroundColor: c.accent, opacity: saving || !value ? 0.4 : 1 }]}
              >
                <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>{saving ? 'Saving…' : 'Log'}</Text>
              </TouchableOpacity>
            </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── CloseGoalSheet ───────────────────────────────────────────────────────────

function CloseGoalSheet({ goal, onClose, onClosed, c }: {
  goal: Goal;
  onClose: () => void;
  onClosed: (updated: Goal) => void;
  c: Colors;
}) {
  const [status, setStatus] = useState<'achieved' | 'missed' | 'abandoned'>('achieved');
  const [actual, setActual] = useState(goal.currentValue?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  const STATUS_OPTS = [
    { key: 'achieved'  as const, label: 'Achieved',  color: '#7BB389' },
    { key: 'missed'    as const, label: 'Missed',    color: '#C9714F' },
    { key: 'abandoned' as const, label: 'Abandoned', color: '#6b7280' },
  ] as const;

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await goalsV2Api.close(goal.id, {
        status,
        actualValueAtClose: actual !== '' ? Number(actual) : null,
      });
      onClosed(updated);
    } catch {
      Alert.alert('Error', 'Could not close goal.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
        </TouchableWithoutFeedback>
        <View style={[s.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={s.sheetHeader}>
              <View>
                <Text style={[s.sheetTitle, { color: c.text }]}>Close Goal</Text>
                <Text style={{ color: c.muted, fontSize: fontSize.xs, marginTop: 2 }}>{goal.name}</Text>
              </View>
              <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
            </View>

            <View style={{ gap: 14 }}>
              <View style={{ gap: 8 }}>
                <Text style={{ color: c.muted, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 0.6 }}>Outcome</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {STATUS_OPTS.map(opt => (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => setStatus(opt.key)}
                      style={[s.pill, {
                        flex: 1,
                        borderColor: status === opt.key ? opt.color : c.border,
                        backgroundColor: status === opt.key ? opt.color + '33' : 'transparent',
                      }]}
                    >
                      <Text style={{
                        color: status === opt.key ? opt.color : c.muted,
                        fontSize: fontSize.xs, fontWeight: '600', textAlign: 'center',
                      }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={[s.input, { flex: 1, color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                  value={actual}
                  onChangeText={setActual}
                  keyboardType="decimal-pad"
                  placeholder="Actual value (optional)"
                  placeholderTextColor={c.muted}
                />
                <Text style={{ color: c.muted, fontSize: fontSize.sm, minWidth: 36 }}>{goal.unit}</Text>
              </View>
            </View>

            <View style={[s.actions, { marginTop: 16 }]}>
              <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={[s.primaryBtn, { backgroundColor: c.accent, opacity: saving ? 0.4 : 1 }]}
              >
                <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>{saving ? 'Saving…' : 'Close Goal'}</Text>
              </TouchableOpacity>
            </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── AddGoalModal ─────────────────────────────────────────────────────────────

type AddStep = 1 | 2 | 3;

function AddGoalModal({ onClose, onCreated, c }: {
  onClose: () => void;
  onCreated: (goal: Goal) => void;
  c: Colors;
}) {
  const token = useAuthStore(st => st.token)!;
  const [step, setStep]         = useState<AddStep>(1);
  const [activeCategory, setActiveCategory] = useState<GoalCategory>('body');
  const [selected, setSelected] = useState<GoalCatalogEntry | null>(null);
  const [sourceId, setSourceId] = useState<number | ''>('');
  const [sourceName, setSourceName] = useState('');
  const [sources, setSources]   = useState<{ id: number; name: string }[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const [name, setName]               = useState('');
  const [startValue, setStartValue]   = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [deadline, setDeadline]       = useState('');
  const [saving, setSaving]           = useState(false);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);

  const CATEGORY_LABELS_SHORT: Record<GoalCategory, string> = {
    body: 'Body', nutrition: 'Nutrition', exercise: 'Exercise', activity: 'Activity',
  };

  useEffect(() => {
    if (step !== 2 || !selected) return;
    setLoadingSources(true);
    const fetchFn = selected.needsSource === 'exercise'
      ? getExercises(token).then(r => r.map((e: any) => ({ id: e.id, name: e.name })))
      : getRoutines(token).then(r => r.map((rt: any) => ({ id: rt.id, name: rt.name })));
    fetchFn
      .then(setSources)
      .catch(() => setSources([]))
      .finally(() => setLoadingSources(false));
  }, [step, selected]);

  function pickCatalogEntry(entry: GoalCatalogEntry) {
    setSelected(entry);
    setName(entry.label + ' Goal');
    setStep(entry.needsSource ? 2 : 3);
  }

  function confirmSource() {
    if (!sourceId) return;
    const src = sources.find(s => s.id === Number(sourceId));
    if (src) {
      setSourceName(src.name);
      setName(`${src.name} — ${selected!.label}`);
    }
    setStep(3);
  }

  function goBack() {
    if (step === 3 && selected?.needsSource) setStep(2);
    else setStep(1);
  }

  async function handleCreate() {
    if (!selected || !targetValue || !deadline) return;
    setSaving(true);
    try {
      const payload: CreateGoalPayload = {
        catalogKey:      selected.key,
        name:            name || (selected.label + ' Goal'),
        category:        selected.category,
        cardType:        selected.cardType,
        targetValue:     Number(targetValue),
        unit:            selected.defaultUnit,
        startedAt:       todayStr(),
        startValue:      startValue !== '' ? Number(startValue) : null,
        deadline:        deadline || null,
        sourceType:      selected.needsSource ? selected.needsSource : null,
        sourceId:        sourceId !== '' ? Number(sourceId) : null,
        sourceName:      sourceName || null,
        showOnDashboard: false,
      };
      const goal = await goalsV2Api.create(payload);
      onCreated(goal);
    } catch {
      Alert.alert('Error', 'Could not create goal.');
    } finally {
      setSaving(false);
    }
  }

  const stepTitles: Record<AddStep, string> = { 1: 'Choose Goal Type', 2: 'Select Source', 3: 'Set Target' };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[s.sheet, { backgroundColor: c.card, borderColor: c.border, maxHeight: '90%' }]}>
            <View style={s.sheetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {step > 1 && (
                  <TouchableOpacity onPress={goBack}>
                    <Ionicons name="chevron-back" size={20} color={c.muted} />
                  </TouchableOpacity>
                )}
                <Text style={[s.sheetTitle, { color: c.text }]}>{stepTitles[step]}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {([1, 2, 3] as AddStep[]).map(n => (
                    <View key={n} style={[s.dot, { backgroundColor: n === step ? c.accent : n < step ? c.accent + '66' : c.border }]} />
                  ))}
                </View>
                <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
              </View>
            </View>

            {/* Step 1 — Catalog */}
            {step === 1 && (
              <>
                <View style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, marginBottom: 10 }}>
                  {CATEGORY_ORDER.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setActiveCategory(cat)}
                      style={[s.catTab, activeCategory === cat && { borderBottomWidth: 2, borderBottomColor: CATEGORY_COLORS[cat] }]}
                    >
                      <Text style={{ color: activeCategory === cat ? c.text : c.muted, fontSize: fontSize.xs, fontWeight: activeCategory === cat ? '600' : '400' }}>
                        {CATEGORY_LABELS_SHORT[cat]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 }}>
                    {CATALOG_BY_CATEGORY[activeCategory].map(entry => (
                      <TouchableOpacity
                        key={entry.key}
                        onPress={() => pickCatalogEntry(entry)}
                        style={[s.catalogCard, { backgroundColor: c.bg, borderColor: c.border, width: '47%' }]}
                      >
                        <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600', marginBottom: 2 }}>{entry.label}</Text>
                        <Text style={{ color: c.muted, fontSize: fontSize.xs, lineHeight: 16 }} numberOfLines={2}>{entry.description}</Text>
                        <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                          <Text style={{ color: c.muted, fontSize: 11 }}>{entry.defaultUnit}</Text>
                          {entry.needsSource && <Text style={{ color: c.muted, fontSize: 11 }}>· needs source</Text>}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Step 2 — Source */}
            {step === 2 && selected && (
              <View style={{ gap: 12 }}>
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>
                  Select the {selected.needsSource === 'exercise' ? 'exercise' : 'routine'} this goal applies to.
                </Text>
                {loadingSources ? (
                  <ActivityIndicator color={c.accent} style={{ marginVertical: 20 }} />
                ) : (
                  <ScrollView style={{ maxHeight: 280 }}>
                    {sources.map(src => (
                      <TouchableOpacity
                        key={src.id}
                        onPress={() => setSourceId(src.id)}
                        style={[s.pickerRow, {
                          borderColor: c.border,
                          backgroundColor: sourceId === src.id ? c.accent + '22' : 'transparent',
                        }]}
                      >
                        <Text style={{ color: c.text, fontSize: fontSize.sm }}>{src.name}</Text>
                        {sourceId === src.id && <Ionicons name="checkmark" size={16} color={c.accent} />}
                      </TouchableOpacity>
                    ))}
                    {sources.length === 0 && (
                      <Text style={{ color: c.muted, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: 20 }}>
                        No {selected.needsSource === 'exercise' ? 'exercises' : 'routines'} found
                      </Text>
                    )}
                  </ScrollView>
                )}
                <TouchableOpacity
                  onPress={confirmSource}
                  disabled={!sourceId}
                  style={[s.primaryBtn, { backgroundColor: c.accent, opacity: !sourceId ? 0.4 : 1 }]}
                >
                  <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>Continue</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 3 — Target form */}
            {step === 3 && selected && (
              <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                <View style={{ gap: 12 }}>
                  <View style={{ gap: 4 }}>
                    <Text style={[s.fieldLabel, { color: c.muted }]}>Goal name</Text>
                    <TextInput
                      style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                      value={name}
                      onChangeText={setName}
                      placeholderTextColor={c.muted}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[s.fieldLabel, { color: c.muted }]}>Start value{' '}
                        <Text style={{ fontStyle: 'italic' }}>(opt)</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <TextInput
                          style={[s.input, { flex: 1, color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                          value={startValue}
                          onChangeText={setStartValue}
                          keyboardType="decimal-pad"
                          placeholder="Current"
                          placeholderTextColor={c.muted}
                        />
                        <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{selected.defaultUnit}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[s.fieldLabel, { color: c.muted }]}>Target value</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <TextInput
                          style={[s.input, { flex: 1, color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                          value={targetValue}
                          onChangeText={setTargetValue}
                          keyboardType="decimal-pad"
                          placeholderTextColor={c.muted}
                        />
                        <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{selected.defaultUnit}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ gap: 4 }}>
                    <Text style={[s.fieldLabel, { color: c.muted }]}>Deadline</Text>
                    <TouchableOpacity
                      onPress={() => setShowDeadlinePicker(true)}
                      style={[s.input, { justifyContent: 'center', borderColor: c.border, backgroundColor: c.bg }]}
                    >
                      <Text style={{ color: deadline ? c.text : c.muted, fontSize: fontSize.sm }}>
                        {deadline || 'Select deadline'}
                      </Text>
                    </TouchableOpacity>
                    {showDeadlinePicker && (
                      <DateTimePicker
                        value={deadline ? new Date(deadline + 'T12:00:00') : new Date()}
                        mode="date"
                        display="default"
                        onChange={(event, selected) => {
                          setShowDeadlinePicker(false);
                          if (selected && event.type !== 'dismissed') {
                            setDeadline(selected.toISOString().slice(0, 10));
                          }
                        }}
                      />
                    )}
                  </View>
                </View>

                <View style={[s.actions, { marginTop: 16, marginBottom: 8 }]}>
                  <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
                    <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreate}
                    disabled={saving || !name || !targetValue || !deadline}
                    style={[s.primaryBtn, { backgroundColor: c.accent, opacity: saving || !name || !targetValue || !deadline ? 0.4 : 1 }]}
                  >
                    <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>
                      {saving ? 'Creating…' : 'Create Goal'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const GOALS_NAV_TABS = ['goals', 'progress'] as const;
type GoalsNavTab = typeof GOALS_NAV_TABS[number];

export default function GoalsScreen() {
  const c = useColors();
  const [navTab, setNavTab] = useState<GoalsNavTab>('goals');
  const swipe = useSwipeNav('goals', GOALS_NAV_TABS, navTab, setNavTab);
  const [goals, setGoals]             = useState<Goal[]>([]);
  const [historyGoals, setHistoryGoals] = useState<Goal[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [viewMode, setViewMode]       = useState<'active' | 'history'>('active');
  const [collapsedCats, setCollapsedCats] = useState<Set<GoalCategory>>(new Set());
  const [logTarget, setLogTarget]         = useState<Goal | null>(null);
  const [closeTarget, setCloseTarget]     = useState<Goal | null>(null);
  const [addingGoal, setAddingGoal]       = useState(false);
  const [deadlineNudges, setDeadlineNudges] = useState<Goal[]>([]);

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [active, achieved, missed, abandoned] = await Promise.all([
        goalsV2Api.getAll('active'),
        goalsV2Api.getAll('achieved'),
        goalsV2Api.getAll('missed'),
        goalsV2Api.getAll('abandoned'),
      ]);
      setGoals(active);
      const history = [...achieved, ...missed, ...abandoned].sort((a, b) => {
        const ta = a.closedAt ? new Date(a.closedAt).getTime() : 0;
        const tb = b.closedAt ? new Date(b.closedAt).getTime() : 0;
        return tb - ta;
      });
      setHistoryGoals(history);
      goalsV2Api.getNudges().then(setDeadlineNudges).catch(() => {});
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  const onRefresh = useCallback(() => load(true), []);

  function toggleCat(cat: GoalCategory) {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  async function handleDelete(id: number) {
    Alert.alert('Delete goal?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await goalsV2Api.delete(id);
            setGoals(prev => prev.filter(g => g.id !== id));
          } catch { Alert.alert('Error', 'Could not delete goal.'); }
        },
      },
    ]);
  }

  async function handleToggleDashboard(goal: Goal) {
    try {
      const updated = await goalsV2Api.update(goal.id, { showOnDashboard: !goal.showOnDashboard });
      setGoals(prev => prev.map(g => g.id === updated.id ? updated : g));
    } catch { /* silent */ }
  }

  function handleLogged(_: GoalProgressEntry, updated: Goal) {
    setGoals(prev => prev.map(g => g.id === updated.id ? updated : g));
    setLogTarget(null);
  }

  function handleClosed(updated: Goal) {
    setGoals(prev => prev.filter(g => g.id !== updated.id));
    setHistoryGoals(prev => [updated, ...prev]);
    setDeadlineNudges(prev => prev.filter(n => n.id !== updated.id));
    setCloseTarget(null);
  }

  function handleCreated(goal: Goal) {
    setGoals(prev => [...prev, goal]);
    setAddingGoal(false);
  }

  async function handleSyncScale() {
    try {
      const result = await measurementsApi.sync();
      const msg = result.inserted > 0
        ? `Synced ${result.inserted} new reading${result.inserted !== 1 ? 's' : ''}`
        : 'Already up to date';
      Alert.alert('Sync Complete', msg);
    } catch {
      Alert.alert('Sync Failed', 'Could not sync from scale.');
    }
  }

  const byCategory = goalsByCategory(goals);

  const nudges = useMemo(() => {
    if (viewMode !== 'active') return [];
    const seen = new Set<number>();
    const result: { goal: Goal; reason: 'deadline' | 'target_crossed' }[] = [];
    for (const g of deadlineNudges) {
      seen.add(g.id);
      result.push({ goal: g, reason: 'deadline' });
    }
    for (const g of goals) {
      if (!seen.has(g.id) && g.status === 'active' && isTargetCrossed(g)) {
        seen.add(g.id);
        result.push({ goal: g, reason: 'target_crossed' });
      }
    }
    return result;
  }, [deadlineNudges, goals, viewMode]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ActivityIndicator style={{ marginTop: 60 }} color={c.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} {...swipe.panHandlers}>
      {/* Screen title + nav tabs */}
      <View style={[s.screenHeader, { borderBottomColor: c.border }]}>
        <Text style={[s.title, { color: c.text }]}>Goals</Text>
        <View style={[s.navTabBar, { borderColor: c.border }]}>
          {GOALS_NAV_TABS.map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setNavTab(t)}
              style={[s.navTab, navTab === t && { borderBottomWidth: 2, borderBottomColor: c.accent }]}
            >
              <Text style={{ color: navTab === t ? c.text : c.muted, fontSize: fontSize.sm, fontWeight: navTab === t ? '600' : '400', textTransform: 'capitalize' }}>
                {t === 'goals' ? 'Goals' : 'Planning'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Goals sub-tab ── */}
      {navTab === 'goals' && (<>
        {/* Goals header: Active/History toggle + Add */}
        <View style={[s.header, { borderBottomColor: c.border }]}>
          <View style={[s.toggle, { backgroundColor: c.card, borderColor: c.border }]}>
            {(['active', 'history'] as const).map(mode => (
              <TouchableOpacity
                key={mode}
                onPress={() => setViewMode(mode)}
                style={[s.toggleBtn, viewMode === mode && { backgroundColor: c.accent }]}
              >
                <Text style={{
                  color: viewMode === mode ? '#000' : c.muted,
                  fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize',
                }}>
                  {mode === 'active' ? `Active${goals.length > 0 ? ` (${goals.length})` : ''}` : 'History'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {viewMode === 'active' && (
            <TouchableOpacity onPress={() => setAddingGoal(true)} style={[s.addBtn, { backgroundColor: c.accent }]}>
              <Ionicons name="add" size={20} color="#000" />
            </TouchableOpacity>
          )}
        </View>

      {viewMode === 'active' ? (
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 100, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        >
          {/* Nudge banners */}
          {nudges.map(({ goal: n, reason }) => {
            const isTargetHit = reason === 'target_crossed';
            const days = n.deadline
              ? Math.ceil((new Date(n.deadline + 'T12:00:00').getTime() - Date.now()) / 86400000)
              : null;
            const subtext = isTargetHit
              ? `You've hit your target of ${n.targetValue} ${n.unit}!`
              : days != null && days < 0
                ? `${Math.abs(days)}d past deadline`
                : 'Deadline reached';
            return (
              <View key={n.id} style={[s.nudge, {
                backgroundColor: isTargetHit ? '#052e1688' : '#431a0388',
                borderColor: isTargetHit ? '#16653344' : '#92400e44',
              }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: isTargetHit ? '#6ee7b7' : '#fdba74', fontSize: fontSize.sm, fontWeight: '600' }} numberOfLines={1}>
                    {n.name}
                  </Text>
                  <Text style={{ color: isTargetHit ? '#6ee7b766' : '#fdba7466', fontSize: fontSize.xs }}>{subtext}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setCloseTarget(n)}
                  style={[s.nudgeBtn, { backgroundColor: isTargetHit ? '#16653366' : '#92400e55', borderColor: isTargetHit ? '#16653388' : '#92400e88' }]}
                >
                  <Text style={{ color: isTargetHit ? '#6ee7b7' : '#fdba74', fontSize: fontSize.xs, fontWeight: '600' }}>Close</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {CATEGORY_ORDER.map(cat => {
            const catGoals = byCategory[cat];
            if (catGoals.length === 0) return null;
            const collapsed = collapsedCats.has(cat);
            return (
              <View key={cat}>
                <TouchableOpacity
                  onPress={() => toggleCat(cat)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 2, marginBottom: 6 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLORS[cat] }} />
                    <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      {CATEGORY_LABELS[cat]}
                    </Text>
                    <View style={[s.chip, { borderColor: c.border }]}>
                      <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{catGoals.length}</Text>
                    </View>
                  </View>
                  <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={c.muted} />
                </TouchableOpacity>

                {!collapsed && catGoals.map(goal => (
                  <View key={goal.id} style={{ marginBottom: 8 }}>
                    <GoalCard
                      goal={goal}
                      onLog={setLogTarget}
                      onClose={setCloseTarget}
                      onDelete={handleDelete}
                      onToggleDashboard={handleToggleDashboard}
                      onSyncScale={goal.category === 'body' ? handleSyncScale : undefined}
                      c={c}
                    />
                  </View>
                ))}
              </View>
            );
          })}

          {goals.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <Ionicons name="trophy-outline" size={48} color={c.muted} />
              <Text style={{ color: c.muted, fontSize: fontSize.sm, textAlign: 'center' }}>No active goals</Text>
              <Text style={{ color: c.muted, fontSize: fontSize.xs, textAlign: 'center' }}>Tap + to set a new goal</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        >
          {historyGoals.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <Ionicons name="time-outline" size={48} color={c.muted} />
              <Text style={{ color: c.muted, fontSize: fontSize.sm, textAlign: 'center' }}>No closed goals yet</Text>
            </View>
          ) : (
            historyGoals.map(goal => (
              <HistoryGoalRow key={goal.id} goal={goal} c={c} />
            ))
          )}
        </ScrollView>
      )}

        {logTarget && (
          <LogProgressSheet goal={logTarget} onClose={() => setLogTarget(null)} onLogged={handleLogged} c={c} />
        )}
        {closeTarget && (
          <CloseGoalSheet goal={closeTarget} onClose={() => setCloseTarget(null)} onClosed={handleClosed} c={c} />
        )}
        {addingGoal && (
          <AddGoalModal onClose={() => setAddingGoal(false)} onCreated={handleCreated} c={c} />
        )}
      </>)}

      {/* ── Planning sub-tab ── */}
      {navTab === 'progress' && <SettingsPlanningTab />}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screenHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 0, borderBottomWidth: 1 },
  navTabBar:    { flexDirection: 'row', borderBottomWidth: 0 },
  navTab:       { flex: 1, alignItems: 'center', paddingVertical: 8 },
  header:       { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:        { fontSize: fontSize.xl, fontWeight: '700' },
  toggle:       { flexDirection: 'row', borderRadius: 20, borderWidth: 1, overflow: 'hidden', padding: 2, gap: 2 },
  toggleBtn:    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 18 },
  addBtn:       { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  card:         { borderRadius: 10, borderWidth: 1, padding: 12 },
  catBar:       { width: 3, borderRadius: 2, minHeight: 20 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  chip:         { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  nudge:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  nudgeBtn:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  actionBtn:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  statusChip:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  historyRow:   { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:        { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20 },
  sheetHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle:   { fontSize: fontSize.lg, fontWeight: '700' },
  input:        { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: fontSize.sm },
  fieldLabel:   { fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  actions:      { flexDirection: 'row', gap: 8 },
  cancelBtn:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  primaryBtn:   { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  pill:         { borderRadius: 8, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 10 },
  menu:         { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1 },
  menuItem:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  dot:          { width: 6, height: 6, borderRadius: 3 },
  catTab:       { flex: 1, alignItems: 'center', paddingVertical: 8 },
  catalogCard:  { borderRadius: 10, borderWidth: 1, padding: 10 },
  pickerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4 },
  fab:          { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
});
