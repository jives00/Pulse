import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getHistory, updateLogEntry, deleteLogEntry, type HistoryEntry } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { colors, fontSize } from '../../src/theme';

type Section = { title: string; data: HistoryEntry[] };

function toDateKey(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function toDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const key = toDateKey(iso);
  const todayKey = toDateKey(today.toISOString());
  const yKey = toDateKey(yesterday.toISOString());
  return key === todayKey ? 'Today' : key === yKey ? 'Yesterday' : key;
}

function toTimeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function toEditDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toEditTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function groupEntries(entries: HistoryEntry[]): Section[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const label = toDateLabel(e.made_at);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(e);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

export default function HistoryScreen() {
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState<HistoryEntry | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    getHistory(token).then(setEntries).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await getHistory(token).then(setEntries).catch(() => {});
    setRefreshing(false);
  }, [token]);

  function openEdit(entry: HistoryEntry) {
    setEditTarget(entry);
    setEditDate(toEditDate(entry.made_at));
    setEditTime(toEditTime(entry.made_at));
  }

  async function commitEdit() {
    if (!editTarget) return;
    const combined = `${editDate}T${editTime}:00`;
    const iso = new Date(combined).toISOString();
    if (isNaN(new Date(combined).getTime())) {
      Alert.alert('Invalid date', 'Please enter a valid date (YYYY-MM-DD) and time (HH:MM).');
      return;
    }
    setSaving(true);
    try {
      await updateLogEntry(token, editTarget.recipe_id, editTarget.log_id, iso);
      setEntries((prev) =>
        prev
          .map((e) => e.log_id === editTarget.log_id ? { ...e, made_at: iso } : e)
          .sort((a, b) => new Date(b.made_at).getTime() - new Date(a.made_at).getTime())
      );
      setEditTarget(null);
    } catch {
      Alert.alert('Error', 'Failed to update entry.');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(entry: HistoryEntry) {
    Alert.alert('Delete Entry', `Remove this log entry for "${entry.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLogEntry(token, entry.recipe_id, entry.log_id).catch(() => {});
          setEntries((prev) => prev.filter((e) => e.log_id !== entry.log_id));
        },
      },
    ]);
  }

  const sections = groupEntries(entries);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
      </View>

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No history yet</Text>
          <Text style={styles.emptySubtext}>Log a recipe as made to see it here</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.log_id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardMain}
                onPress={() => router.push(`/(app)/recipe/${item.recipe_id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.thumb}>
                  {item.photo_url ? (
                    <Image source={{ uri: item.photo_url }} style={styles.thumbImg} />
                  ) : (
                    <Text style={styles.thumbIcon}>{item.type === 'cocktail' ? '🍸' : '🍴'}</Text>
                  )}
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.cardTime}>{toTimeStr(item.made_at)}</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => openEdit(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.actionBtn}
                >
                  <Text style={styles.editIcon}>✎</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.actionBtn}
                >
                  <Text style={styles.deleteIcon}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Edit modal */}
      <Modal visible={editTarget !== null} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <View style={styles.overlay}>
          <View style={styles.editModal}>
            <Text style={styles.editModalTitle}>Edit Entry</Text>
            {editTarget && <Text style={styles.editModalSubtitle} numberOfLines={1}>{editTarget.name}</Text>}

            <Text style={styles.editLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.editInput}
              value={editDate}
              onChangeText={setEditDate}
              placeholder="2026-03-26"
              placeholderTextColor={colors.muted}
              autoFocus
              keyboardType="numbers-and-punctuation"
              returnKeyType="next"
            />

            <Text style={styles.editLabel}>Time (HH:MM)</Text>
            <TextInput
              style={styles.editInput}
              value={editTime}
              onChangeText={setEditTime}
              placeholder="14:30"
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              onSubmitEditing={commitEdit}
            />

            <View style={styles.editButtons}>
              <TouchableOpacity onPress={() => setEditTarget(null)} style={styles.editCancelBtn}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={commitEdit} disabled={saving} style={[styles.editSaveBtn, saving && styles.editSaveBtnDisabled]}>
                <Text style={styles.editSaveText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  list: { padding: 16, paddingBottom: 32 },
  sectionHeader: {
    fontSize: fontSize.xs,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingRight: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingLeft: 10, minWidth: 0 },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
    flexShrink: 0,
  },
  thumbImg: { width: 40, height: 40 },
  thumbIcon: { fontSize: 18, opacity: 0.4 },
  cardText: { flex: 1, minWidth: 0 },
  cardName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  cardTime: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 4 },
  actionBtn: { padding: 6 },
  editIcon: { fontSize: 18, color: colors.muted },
  deleteIcon: { fontSize: 22, color: colors.muted, lineHeight: 24 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: fontSize.lg, color: colors.muted },
  emptySubtext: { fontSize: fontSize.sm, color: colors.muted, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  editModal: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 20,
    width: '85%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  editModalTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.text, marginBottom: 2 },
  editModalSubtitle: { fontSize: fontSize.sm, color: colors.muted, marginBottom: 16 },
  editLabel: { fontSize: fontSize.xs, color: colors.muted, marginBottom: 4 },
  editInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: 12,
  },
  editButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  editCancelBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  editCancelText: { color: colors.muted, fontSize: fontSize.sm },
  editSaveBtn: { backgroundColor: colors.accent, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8 },
  editSaveBtnDisabled: { opacity: 0.5 },
  editSaveText: { color: colors.bg, fontWeight: '700', fontSize: fontSize.sm },
});
