import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLinks, addLink, updateLink, deleteLink, type LinkItem } from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';
import { useSwipeNav } from '../../../src/hooks/useSwipeNav';
import FilterChip from '../../../src/components/FilterChip';

export default function LinksScreen() {
  const token = useAuthStore((s) => s.token)!;
  const c = useColors();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [filterCat, setFilterCat] = useState<string>('');

  // Edit modal
  const [editTarget, setEditTarget] = useState<LinkItem | null>(null);
  const [editValue, setEditValue] = useState('');

  const load = useCallback(() => {
    getLinks(token).then(setLinks).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await getLinks(token).then(setLinks).catch(() => {});
    setRefreshing(false);
  }, [token]);

  async function handleAdd() {
    const url = input.trim();
    if (!url) return;
    setAdding(true);
    try {
      const link = await addLink(token, url);
      setLinks((prev) => [link, ...prev]);
      setInput('');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add link.');
    } finally {
      setAdding(false);
    }
  }

  function openEdit(item: LinkItem) {
    setEditTarget(item);
    setEditValue(item.title);
  }

  async function commitEdit() {
    if (!editTarget) return;
    const title = editValue.trim();
    if (!title) { setEditTarget(null); return; }
    setEditTarget(null);
    await updateLink(token, editTarget.id, title).catch(() => {});
    setLinks((prev) => prev.map((l) => l.id === editTarget.id ? { ...l, title } : l));
  }

  function handleDelete(item: LinkItem) {
    Alert.alert('Delete Link', `Remove "${item.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLink(token, item.id).catch(() => {});
          setLinks((prev) => prev.filter((l) => l.id !== item.id));
        },
      },
    ]);
  }

  const styles = makeStyles(c);
  const swipe = useSwipeNav(3);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} {...swipe.panHandlers}>
        <ActivityIndicator color={c.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} {...swipe.panHandlers}>
      <View style={styles.header}>
        <Text style={styles.title}>Links</Text>
      </View>

      {/* Add input */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="https://…"
          placeholderTextColor={c.muted}
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addBtn, (!input.trim() || adding) && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={!input.trim() || adding}
        >
          {adding ? (
            <ActivityIndicator size="small" color={c.bg} />
          ) : (
            <Text style={styles.addBtnText}>Add</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Category filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        <FilterChip label="All" active={!filterCat} onPress={() => setFilterCat('')} />
        {(['food', 'drinks', 'nutrition', 'exercise', 'other'] as const).map((cat) => (
          <FilterChip key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)} active={filterCat === cat} onPress={() => setFilterCat(filterCat === cat ? '' : cat)} />
        ))}
      </ScrollView>

      {(() => {
        const filtered = filterCat ? links.filter((l) => l.category === filterCat) : links;
        return filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔗</Text>
            <Text style={styles.emptyText}>{links.length === 0 ? 'No links yet' : 'No links in this category'}</Text>
            {links.length === 0 && <Text style={styles.emptySubtext}>Paste a URL above to save a site</Text>}
          </View>
        ) : (
          <FlatList
            data={[...filtered].sort((a, b) => a.title.localeCompare(b.title))}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.cardText}
                  onPress={() => Linking.openURL(item.url)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.cardUrl} numberOfLines={1}>{item.url}</Text>
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
        );
      })()}

      {/* Edit modal */}
      <Modal visible={editTarget !== null} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.editModal}>
            <Text style={styles.editModalTitle}>Rename</Text>
            <TextInput
              style={styles.editInput}
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={commitEdit}
            />
            <View style={styles.editButtons}>
              <TouchableOpacity onPress={() => setEditTarget(null)} style={styles.editCancelBtn}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={commitEdit} style={styles.editSaveBtn}>
                <Text style={styles.editSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    title: { fontSize: fontSize.xl, fontWeight: '700', color: c.text },
    addRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    input: { flex: 1, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: fontSize.sm, color: c.text },
    addBtn: { backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', minWidth: 60 },
    addBtnDisabled: { opacity: 0.4 },
    addBtnText: { color: c.bg, fontWeight: '700', fontSize: fontSize.sm },
    filterScroll: { borderBottomWidth: 1, borderBottomColor: c.border },
    filterRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
    list: { padding: 16 },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
    cardText: { flex: 1, minWidth: 0 },
    cardTitle: { fontSize: fontSize.sm, fontWeight: '600', color: c.text },
    cardUrl: { fontSize: fontSize.xs, color: c.muted, marginTop: 2 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8 },
    actionBtn: { padding: 4 },
    editIcon: { fontSize: 18, color: c.muted },
    deleteIcon: { fontSize: 22, color: c.muted, lineHeight: 24 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: fontSize.lg, color: c.muted },
    emptySubtext: { fontSize: fontSize.sm, color: c.muted, marginTop: 4 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    editModal: { backgroundColor: c.card, borderRadius: 14, padding: 20, width: '85%', borderWidth: 1, borderColor: c.border },
    editModalTitle: { fontSize: fontSize.base, fontWeight: '700', color: c.text, marginBottom: 12 },
    editInput: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fontSize.sm, color: c.text, marginBottom: 16 },
    editButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    editCancelBtn: { paddingVertical: 8, paddingHorizontal: 14 },
    editCancelText: { color: c.muted, fontSize: fontSize.sm },
    editSaveBtn: { backgroundColor: c.accent, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8 },
    editSaveText: { color: c.bg, fontWeight: '700', fontSize: fontSize.sm },
  });
}
