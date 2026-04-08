import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  changeUsername, changePassword, deleteData, type DeleteScope,
  saveNutritionGoals, getExerciseGoals, saveExerciseGoals, type ExerciseGoals,
  getMeasurementGoals, setMeasurementGoal,
  getGoalsSummary,
  getTagDefinitions, saveTagDefinitions, type TagDefinitions,
} from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { useSettingsStore, type SortOption } from '../../../src/store/settings';
import { colors, fontSize } from '../../../src/theme';

// ── Shared ────────────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionLabel}>{title}</Text>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SaveBtn({ onPress, saving, label = 'Save' }: { onPress: () => void; saving: boolean; label?: string }) {
  return (
    <TouchableOpacity style={[s.saveBtn, saving && s.saveBtnDim]} onPress={onPress} disabled={saving}>
      <Text style={s.saveBtnText}>{saving ? 'Saving…' : label}</Text>
    </TouchableOpacity>
  );
}

// ── Options tab ───────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'created_at',    label: 'Date added' },
  { value: 'name',          label: 'Name (A–Z)' },
  { value: 'recently_made', label: 'Recently made' },
  { value: 'prep_time',     label: 'Prep time' },
  { value: 'random',        label: 'Random' },
];

function OptionsTab() {
  const { defaultSort, setDefaultSort } = useSettingsStore();

  return (
    <ScrollView contentContainerStyle={s.tabScroll}>
      <SectionHeader title="Default Sort (Recipes)" />
      <View style={s.card}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SORT_OPTIONS.map(({ value, label }) => (
            <TouchableOpacity
              key={value}
              style={[s.sortPill, defaultSort === value && s.sortPillActive]}
              onPress={() => setDefaultSort(value)}
            >
              <Text style={[s.sortPillText, defaultSort === value && s.sortPillTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

// ── Goals tab ─────────────────────────────────────────────────────────────────

const DISPLAYED_METRICS = [
  { key: 'weight', label: 'Weight', unit: 'lbs' },
  { key: 'waist',  label: 'Waist',  unit: 'in'  },
  { key: 'bicep',  label: 'Bicep',  unit: 'in'  },
] as const;

function GoalsTab() {
  const token = useAuthStore((s) => s.token)!;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Nutrition
  const [calories, setCalories] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [fatG, setFatG] = useState('');
  const [waterGlasses, setWaterGlasses] = useState('');

  // Exercise
  const [exGoals, setExGoals] = useState<ExerciseGoals | null>(null);
  const [workoutCount, setWorkoutCount] = useState('');
  const [volume, setVolume] = useState('');

  // Measurements
  const [mGoals, setMGoals] = useState<Record<string, { value: string; date: string }>>(() => {
    const init: Record<string, { value: string; date: string }> = {};
    for (const m of DISPLAYED_METRICS) init[m.key] = { value: '', date: '' };
    return init;
  });

  useEffect(() => {
    Promise.all([
      getGoalsSummary(token),
      getExerciseGoals(token),
      getMeasurementGoals(token),
    ]).then(([summary, ex, mGoalsData]) => {
      const n = summary.nutrition.goals;
      if (n) {
        setCalories(String(n.calories ?? ''));
        setCarbsG(String(n.carbsG ?? ''));
        setProteinG(String(n.proteinG ?? ''));
        setFatG(String(n.fatG ?? ''));
        setWaterGlasses(n.waterGoalOz != null ? String(Math.round(n.waterGoalOz / 8)) : '');
      }
      setExGoals(ex);
      setWorkoutCount(String(ex.workoutsPerWeek ?? ''));
      setVolume(String(ex.volumeLbsPerWeek ?? ''));
      setMGoals((prev) => {
        const updated = { ...prev };
        for (const { key } of DISPLAYED_METRICS) {
          const g = (mGoalsData as any)[key];
          updated[key] = { value: g ? String(g.targetValue) : '', date: g?.targetDate ?? '' };
        }
        return updated;
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      const tasks: Promise<any>[] = [];
      if (calories && carbsG && proteinG && fatG) {
        tasks.push(saveNutritionGoals(token, {
          calories: Number(calories), carbsG: Number(carbsG),
          proteinG: Number(proteinG), fatG: Number(fatG),
          waterGoalOz: waterGlasses !== '' ? Number(waterGlasses) * 8 : undefined,
        }));
      }
      tasks.push(saveExerciseGoals(token, {
        workoutsPerWeek: workoutCount !== '' ? Number(workoutCount) : null,
        minutesPerWeek: exGoals?.minutesPerWeek ?? null,
        volumeLbsPerWeek: volume !== '' ? Number(volume) : null,
      }));
      for (const { key, unit } of DISPLAYED_METRICS) {
        const { value, date } = mGoals[key];
        if (value) tasks.push(setMeasurementGoal(token, key, { targetValue: Number(value), unit, targetDate: date || null }));
      }
      await Promise.all(tasks);
      setMsg('Goals saved.');
      setTimeout(() => setMsg(''), 3000);
    } catch {
      setMsg('Failed to save goals.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />;

  return (
    <ScrollView contentContainerStyle={s.tabScroll}>
      <SectionHeader title="Nutrition (daily)" />
      <View style={s.card}>
        <View style={s.twoCol}>
          {([
            ['Calories (kcal)', calories, setCalories],
            ['Carbs (g)',       carbsG,   setCarbsG  ],
            ['Protein (g)',     proteinG, setProteinG],
            ['Fat (g)',         fatG,     setFatG    ],
            ['Water (glasses)', waterGlasses, setWaterGlasses],
          ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
            <Field key={label} label={label}>
              <TextInput
                style={s.input}
                value={val}
                onChangeText={setter}
                keyboardType="numeric"
                placeholderTextColor={colors.muted}
              />
            </Field>
          ))}
        </View>
      </View>

      <SectionHeader title="Workouts (per week)" />
      <View style={s.card}>
        <View style={s.twoCol}>
          <Field label="Workouts">
            <TextInput style={s.input} value={workoutCount} onChangeText={setWorkoutCount} keyboardType="numeric" placeholderTextColor={colors.muted} />
          </Field>
          <Field label="Volume (lbs)">
            <TextInput style={s.input} value={volume} onChangeText={setVolume} keyboardType="numeric" placeholder="e.g. 10000" placeholderTextColor={colors.muted} />
          </Field>
        </View>
      </View>

      <SectionHeader title="Body Measurements" />
      <View style={s.card}>
        {DISPLAYED_METRICS.map(({ key, label, unit }) => (
          <View key={key} style={s.measureRow}>
            <Text style={s.measureLabel}>{label} <Text style={s.measureUnit}>({unit})</Text></Text>
            <View style={s.twoCol}>
              <Field label="Target">
                <TextInput
                  style={s.input}
                  value={mGoals[key].value}
                  onChangeText={(v) => setMGoals((prev) => ({ ...prev, [key]: { ...prev[key], value: v } }))}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.muted}
                />
              </Field>
              <Field label="By date (YYYY-MM-DD)">
                <TextInput
                  style={s.input}
                  value={mGoals[key].date}
                  onChangeText={(v) => setMGoals((prev) => ({ ...prev, [key]: { ...prev[key], date: v } }))}
                  placeholder="2026-12-31"
                  placeholderTextColor={colors.muted}
                />
              </Field>
            </View>
          </View>
        ))}
      </View>

      {msg ? <Text style={msg.includes('saved') ? s.msgSuccess : s.msgError}>{msg}</Text> : null}
      <SaveBtn onPress={handleSave} saving={saving} label="Save Goals" />
    </ScrollView>
  );
}

// ── Tags tab ──────────────────────────────────────────────────────────────────

const TAG_CATEGORIES: { key: keyof TagDefinitions; label: string }[] = [
  { key: 'health',   label: 'Health'   },
  { key: 'cuisine',  label: 'Cuisine'  },
  { key: 'category', label: 'Category' },
];

function TagsTab() {
  const token = useAuthStore((s) => s.token)!;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defs, setDefs] = useState<TagDefinitions>({ health: [], cuisine: [], category: [] });
  const [newTag, setNewTag] = useState<Record<string, string>>({ health: '', cuisine: '', category: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getTagDefinitions(token)
      .then(setDefs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function addTag(cat: keyof TagDefinitions) {
    const val = newTag[cat].trim();
    if (!val || defs[cat].includes(val)) return;
    setDefs((prev) => ({ ...prev, [cat]: [...prev[cat], val] }));
    setNewTag((prev) => ({ ...prev, [cat]: '' }));
  }

  function removeTag(cat: keyof TagDefinitions, name: string) {
    setDefs((prev) => ({ ...prev, [cat]: prev[cat].filter((t) => t !== name) }));
  }

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      await saveTagDefinitions(token, defs);
      setMsg('Tags saved.');
      setTimeout(() => setMsg(''), 3000);
    } catch {
      setMsg('Failed to save tags.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />;

  return (
    <ScrollView contentContainerStyle={s.tabScroll}>
      {TAG_CATEGORIES.map(({ key, label }) => (
        <View key={key}>
          <SectionHeader title={label} />
          <View style={s.card}>
            <View style={t.tagWrap}>
              {defs[key].map((name) => (
                <TouchableOpacity key={name} style={t.tag} onPress={() => removeTag(key, name)}>
                  <Text style={t.tagText}>{name} ×</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={t.addRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={newTag[key]}
                onChangeText={(v) => setNewTag((prev) => ({ ...prev, [key]: v }))}
                placeholder={`Add ${label.toLowerCase()} tag…`}
                placeholderTextColor={colors.muted}
                returnKeyType="done"
                onSubmitEditing={() => addTag(key)}
              />
              <TouchableOpacity style={t.addBtn} onPress={() => addTag(key)}>
                <Text style={t.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}

      {msg ? <Text style={msg.includes('saved') ? s.msgSuccess : s.msgError}>{msg}</Text> : null}
      <SaveBtn onPress={handleSave} saving={saving} label="Save Tags" />
    </ScrollView>
  );
}

// ── User tab ──────────────────────────────────────────────────────────────────

function UserTab() {
  const token = useAuthStore((s) => s.token)!;
  const setToken = useAuthStore((s) => s.setToken);

  const [newUsername, setNewUsername] = useState('');
  const [unPwd, setUnPwd] = useState('');
  const [savingUn, setSavingUn] = useState(false);
  const [msgUn, setMsgUn] = useState('');

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [msgPwd, setMsgPwd] = useState('');

  async function handleUpdateUsername() {
    if (!newUsername.trim() || !unPwd) return;
    setSavingUn(true);
    setMsgUn('');
    try {
      const { token: newToken } = await changeUsername(token, { newUsername: newUsername.trim(), currentPassword: unPwd });
      setToken(newToken);
      setMsgUn('Username updated.');
      setNewUsername('');
      setUnPwd('');
      setTimeout(() => setMsgUn(''), 3000);
    } catch (err: any) {
      setMsgUn(err.message || 'Failed to update username.');
    } finally {
      setSavingUn(false);
    }
  }

  async function handleUpdatePassword() {
    if (!curPwd || !newPwd) return;
    if (newPwd !== confirmPwd) { setMsgPwd('Passwords do not match.'); return; }
    setSavingPwd(true);
    setMsgPwd('');
    try {
      const { token: newToken } = await changePassword(token, { currentPassword: curPwd, newPassword: newPwd });
      setToken(newToken);
      setMsgPwd('Password updated.');
      setCurPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setTimeout(() => setMsgPwd(''), 3000);
    } catch (err: any) {
      setMsgPwd(err.message || 'Failed to update password.');
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.tabScroll}>
      <SectionHeader title="Change Username" />
      <View style={s.card}>
        <Field label="New username">
          <TextInput style={s.input} value={newUsername} onChangeText={setNewUsername} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.muted} />
        </Field>
        <Field label="Current password">
          <TextInput style={s.input} value={unPwd} onChangeText={setUnPwd} secureTextEntry placeholderTextColor={colors.muted} />
        </Field>
        {msgUn ? <Text style={msgUn.includes('updated') ? s.msgSuccess : s.msgError}>{msgUn}</Text> : null}
        <SaveBtn onPress={handleUpdateUsername} saving={savingUn} label="Update username" />
      </View>

      <SectionHeader title="Change Password" />
      <View style={s.card}>
        <Field label="Current password">
          <TextInput style={s.input} value={curPwd} onChangeText={setCurPwd} secureTextEntry placeholderTextColor={colors.muted} />
        </Field>
        <Field label="New password">
          <TextInput style={s.input} value={newPwd} onChangeText={setNewPwd} secureTextEntry placeholderTextColor={colors.muted} />
        </Field>
        <Field label="Confirm new password">
          <TextInput style={s.input} value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry placeholderTextColor={colors.muted} />
        </Field>
        {msgPwd ? <Text style={msgPwd.includes('updated') ? s.msgSuccess : s.msgError}>{msgPwd}</Text> : null}
        <SaveBtn onPress={handleUpdatePassword} saving={savingPwd} label="Update password" />
      </View>
    </ScrollView>
  );
}

// ── Delete Data tab ───────────────────────────────────────────────────────────

const DELETE_OPTIONS: { scope: DeleteScope; label: string; description: string }[] = [
  { scope: 'recipes',  label: 'Delete all recipes',  description: 'Removes all food and drink recipes, including their cook history.' },
  { scope: 'history',  label: 'Delete all history',  description: 'Removes all food log entries, recipe cook log, and water log.' },
  { scope: 'workouts', label: 'Delete all workouts', description: 'Removes all workout sessions and logged sets.' },
  { scope: 'goals',    label: 'Delete all goals',    description: 'Removes all nutrition and exercise goals.' },
  { scope: 'links',    label: 'Delete all links',    description: 'Removes all saved links.' },
];

function DeleteTab() {
  const token = useAuthStore((s) => s.token)!;

  function handleDelete(scope: DeleteScope, label: string) {
    Alert.alert(`${label}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteData(token, scope);
            Alert.alert('Done', `${label} completed.`);
          } catch {
            Alert.alert('Error', 'Something went wrong.');
          }
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={s.tabScroll}>
      <SectionHeader title="Danger Zone" />
      <View style={s.card}>
        {DELETE_OPTIONS.map(({ scope, label, description }, i) => (
          <View key={scope}>
            {i > 0 && <View style={s.divider} />}
            <View style={s.deleteRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.deleteLabel}>{label}</Text>
                <Text style={s.deleteDesc}>{description}</Text>
              </View>
              <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(scope, label)}>
                <Text style={s.deleteBtnText}>Delete…</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ── Root screen ───────────────────────────────────────────────────────────────

type Tab = 'options' | 'tags' | 'goals' | 'user' | 'delete';

export default function SettingsScreen() {
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('options');

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Settings</Text>
        <TouchableOpacity onPress={() => { logout(); router.replace('/(auth)/login'); }}>
          <Text style={s.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
        {([
          { id: 'options', label: 'Options' },
          { id: 'tags',    label: 'Tags'    },
          { id: 'goals',   label: 'Goals'   },
          { id: 'user',    label: 'User'    },
          { id: 'delete',  label: 'Delete'  },
        ] as { id: Tab; label: string }[]).map(({ id, label }) => (
          <TouchableOpacity key={id} style={[s.tabBtn, tab === id && s.tabBtnActive]} onPress={() => setTab(id)}>
            <Text style={[s.tabLabel, tab === id && s.tabLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === 'options' && <OptionsTab />}
      {tab === 'tags'    && <TagsTab />}
      {tab === 'goals'   && <GoalsTab />}
      {tab === 'user'    && <UserTab />}
      {tab === 'delete'  && <DeleteTab />}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  signOut: { fontSize: fontSize.sm, color: colors.muted },
  tabBar: { borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0, flexShrink: 0 },
  tabBarContent: { flexDirection: 'row', alignItems: 'stretch' },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.accent },
  tabLabel: { fontSize: fontSize.sm, color: colors.muted, fontWeight: '500' },
  tabLabelActive: { color: colors.accent, fontWeight: '700' },
  tabScroll: { padding: 16, gap: 8 },
  sectionLabel: { fontSize: fontSize.xs, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 12 },
  twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { flex: 1, minWidth: '40%', gap: 4 },
  fieldLabel: { fontSize: fontSize.xs, color: colors.muted },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: fontSize.sm, color: colors.text },
  saveBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10, alignSelf: 'flex-start', marginTop: 4 },
  saveBtnDim: { opacity: 0.5 },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.bg },
  msgSuccess: { fontSize: fontSize.sm, color: '#34d399' },
  msgError: { fontSize: fontSize.sm, color: '#ef4444' },
  measureRow: { gap: 6 },
  measureLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  measureUnit: { fontWeight: '400', color: colors.muted },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  deleteLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  deleteDesc: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  deleteBtn: { borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  deleteBtnText: { fontSize: fontSize.sm, color: '#ef4444' },
  sortPill: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 7 },
  sortPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  sortPillText: { fontSize: fontSize.sm, color: colors.muted },
  sortPillTextActive: { color: colors.bg, fontWeight: '700' },
});

const t = StyleSheet.create({
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  tagText: { fontSize: fontSize.sm, color: colors.text },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  addBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center' },
  addBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.bg },
});
