import { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { clearAllHistory, deleteAllRecipes } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { colors, fontSize } from '../../src/theme';

type Confirm = 'history' | 'recipes' | null;

export default function SettingsScreen() {
  const token = useAuthStore((s) => s.token)!;
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === 'history') {
        await clearAllHistory(token);
        Alert.alert('Done', 'All history cleared.');
      } else {
        await deleteAllRecipes(token);
        Alert.alert('Done', 'All recipes deleted.');
      }
      setConfirm(null);
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Data</Text>

        <View style={styles.card}>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Clear all history</Text>
            <Text style={styles.cardDesc}>Remove all "made" log entries. Recipes are kept.</Text>
          </View>
          <TouchableOpacity style={styles.clearBtn} onPress={() => setConfirm('history')}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Delete all recipes</Text>
            <Text style={styles.cardDesc}>Permanently removes every recipe and all history.</Text>
          </View>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => setConfirm('recipes')}>
            <Text style={styles.deleteBtnText}>Delete all</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutRow} onPress={() => { logout(); router.replace('/(auth)/login'); }}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Confirmation modal */}
      <Modal visible={confirm !== null} transparent animationType="fade" onRequestClose={() => !busy && setConfirm(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {confirm === 'history' ? 'Clear all history?' : 'Delete all recipes?'}
            </Text>
            <Text style={styles.modalDesc}>
              {confirm === 'history'
                ? 'All made log entries will be permanently deleted. Your recipes will not be affected.'
                : 'Every recipe and all history will be permanently deleted. This cannot be undone.'}
            </Text>
            {confirm === 'recipes' && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>This will delete everything with no way to recover it.</Text>
              </View>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setConfirm(null)}
                disabled={busy}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, busy && styles.confirmBtnDisabled]}
                onPress={handleConfirm}
                disabled={busy}
              >
                <Text style={styles.confirmBtnText}>
                  {busy ? 'Working…' : confirm === 'history' ? 'Clear history' : 'Delete all'}
                </Text>
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
  content: { padding: 16, gap: 10 },
  sectionLabel: {
    fontSize: fontSize.xs,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  cardDesc: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  clearBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  clearBtnText: { fontSize: fontSize.sm, color: colors.muted },
  deleteBtn: {
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  deleteBtnText: { fontSize: fontSize.sm, color: '#ef4444' },
  signOutRow: { marginTop: 8, paddingVertical: 10 },
  signOutText: { fontSize: fontSize.sm, color: colors.muted },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  modal: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    width: '88%',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  modalTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  modalDesc: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  warningBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 8,
    padding: 12,
  },
  warningText: { fontSize: fontSize.xs, color: '#ef4444' },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  cancelBtn: { paddingVertical: 9, paddingHorizontal: 14 },
  cancelBtnText: { fontSize: fontSize.sm, color: colors.muted },
  confirmBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
});
