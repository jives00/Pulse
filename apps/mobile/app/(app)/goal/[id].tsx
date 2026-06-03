import { useState, useEffect } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  goalsV2Api,
  type Goal, type GoalProgressEntry,
} from '../../../../../packages/api-client/src/index';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function isoToDateStr(iso: string) {
  return iso.slice(0, 10);
}

// ─── EditSheet ────────────────────────────────────────────────────────────────

function EditSheet({ entry, unit, goalId, onClose, onSaved, c }: {
  entry: GoalProgressEntry;
  unit: string;
  goalId: number;
  onClose: () => void;
  onSaved: (updated: GoalProgressEntry) => void;
  c: Colors;
}) {
  const [value, setValue]   = useState(String(entry.value));
  const [notes, setNotes]   = useState(entry.notes ?? '');
  const [logDate, setLogDate] = useState(isoToDateStr(entry.loggedAt));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!value) return;
    setSaving(true);
    try {
      await goalsV2Api.deleteProgress(goalId, entry.id);
      const created = await goalsV2Api.logProgress(goalId, {
        value: Number(value),
        loggedAt: logDate ? logDate + 'T12:00:00' : undefined,
        notes: notes || null,
      });
      onSaved(created);
    } catch {
      Alert.alert('Error', 'Could not save entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[es.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={es.sheetHeader}>
              <Text style={{ color: c.text, fontSize: fontSize.lg, fontWeight: '700' }}>Edit Entry</Text>
              <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
            </View>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={es.label}>Value</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TextInput
                      style={[es.input, { flex: 1, color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                      value={value}
                      onChangeText={setValue}
                      keyboardType="decimal-pad"
                      autoFocus
                    />
                    <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{unit}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={es.label}>Date</Text>
                  <TextInput
                    style={[es.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                    value={logDate}
                    onChangeText={setLogDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={c.muted}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
              <View style={{ gap: 4 }}>
                <Text style={es.label}>Notes</Text>
                <TextInput
                  style={[es.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Optional"
                  placeholderTextColor={c.muted}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity onPress={onClose} style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || !value}
                style={[es.saveBtn, { backgroundColor: c.accent, opacity: saving || !value ? 0.4 : 1 }]}
              >
                <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── ProgressRow ──────────────────────────────────────────────────────────────

function ProgressRow({ entry, unit, onEdit, onDelete, c }: {
  entry: GoalProgressEntry;
  unit: string;
  onEdit: () => void;
  onDelete: (id: number) => void;
  c: Colors;
}) {
  function handleDelete() {
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(entry.id) },
    ]);
  }

  return (
    <View style={[s.row, { borderBottomColor: c.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.muted, fontSize: fontSize.xs }}>
          {entry.source === 'auto' ? fmtDate(entry.loggedAt) : fmtDateTime(entry.loggedAt)}
        </Text>
        {entry.notes ? (
          <Text style={{ color: c.muted, fontSize: fontSize.xs }} numberOfLines={2}>{entry.notes}</Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }}>
          {entry.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          <Text style={{ color: c.muted, fontWeight: '400' }}> {unit}</Text>
        </Text>
        {entry.source === 'manual' && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Ionicons name="pencil-outline" size={15} color={c.muted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Ionicons name="trash-outline" size={15} color="#ef444466" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function GoalProgressScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const goalId = Number(id);

  const [goal, setGoal]           = useState<Goal | null>(null);
  const [entries, setEntries]     = useState<GoalProgressEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editEntry, setEditEntry] = useState<GoalProgressEntry | null>(null);

  useEffect(() => {
    Promise.all([
      goalsV2Api.getById(goalId).catch(() => null),
      goalsV2Api.getProgress(goalId, 200).catch(() => [] as GoalProgressEntry[]),
    ]).then(([goalDetail, prog]) => {
      setGoal(goalDetail as Goal | null);
      setEntries(prog as GoalProgressEntry[]);
    }).finally(() => setLoading(false));
  }, [goalId]);

  async function handleDelete(entryId: number) {
    try {
      await goalsV2Api.deleteProgress(goalId, entryId);
      setEntries(prev => prev.filter(e => e.id !== entryId));
    } catch {
      Alert.alert('Error', 'Could not delete entry.');
    }
  }

  function handleSaved(updated: GoalProgressEntry) {
    setEntries(prev =>
      [updated, ...prev.filter(e => e.id !== editEntry?.id)]
        .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
    );
    setEditEntry(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="chevron-back" size={20} color={c.accent} />
          <Text style={{ color: c.accent, fontSize: fontSize.sm }}>Back</Text>
        </TouchableOpacity>
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: c.text, fontSize: fontSize.lg, fontWeight: '700' }}>{goal?.name ?? 'Progress'}</Text>
          {goal && (
            <Text style={{ color: c.muted, fontSize: fontSize.xs, marginTop: 2 }}>
              Target: {goal.targetValue.toLocaleString()} {goal.unit}
              {goal.deadline ? ` · Due ${fmtDate(goal.deadline)}` : ''}
            </Text>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />
      ) : entries.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
          <Ionicons name="bar-chart-outline" size={48} color={c.muted} />
          <Text style={{ color: c.muted, fontSize: fontSize.sm }}>No progress logged yet</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <Text style={{ color: c.muted, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 0.8, paddingVertical: 10 }}>
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </Text>
          </View>
          <View style={[s.table, { borderColor: c.border, backgroundColor: c.card }]}>
            {entries.map(entry => (
              <ProgressRow
                key={entry.id}
                entry={entry}
                unit={goal?.unit ?? ''}
                onEdit={() => setEditEntry(entry)}
                onDelete={handleDelete}
                c={c}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {editEntry && (
        <EditSheet
          entry={editEntry}
          unit={goal?.unit ?? ''}
          goalId={goalId}
          onClose={() => setEditEntry(null)}
          onSaved={handleSaved}
          c={c}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header:  { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1 },
  table:   { marginHorizontal: 16, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  row:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
});

const es = StyleSheet.create({
  sheet:       { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  label:       { fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  input:       { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: fontSize.sm },
  saveBtn:     { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
});
