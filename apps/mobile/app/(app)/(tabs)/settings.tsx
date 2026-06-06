import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const COL_GOLD = '#D4A843';
import {
  changeUsername, changePassword, deleteData, type DeleteScope,
  getTagDefinitions, saveTagDefinitions, type TagDefinitions,
  getProfile, updateProfile, type ActivityLevel, type UserProfile,
} from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { useSettingsStore, type SortOption, type ExerciseSortOption } from '../../../src/store/settings';
import { fontSize, type Colors, type ColorScheme, PALETTES } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';
import { useSwipeNav } from '../../../src/hooks/useSwipeNav';
import { useUpdateStore, BUILD_TAG } from '../../../src/store/update';

// ── Shared ────────────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  const c = useColors();
  const s = makeStyles(c);
  return <Text style={s.sectionLabel}>{title}</Text>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const c = useColors();
  const s = makeStyles(c);
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SaveBtn({ onPress, saving, label = 'Save' }: { onPress: () => void; saving: boolean; label?: string }) {
  const c = useColors();
  const s = makeStyles(c);
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

const EXERCISE_SORT_OPTIONS: { value: ExerciseSortOption; label: string }[] = [
  { value: 'name',       label: 'Name (A–Z)' },
  { value: 'created_at', label: 'Date added' },
];

const COLOR_SCHEMES: { value: ColorScheme; label: string; preview: string }[] = [
  { value: 'blue',     label: 'Deep Blue', preview: '#193549' },
  { value: 'slate',    label: 'Slate',     preview: '#0f172a' },
  { value: 'sand',     label: 'Sand',      preview: '#785a3c' },
  { value: 'midnight', label: 'Midnight',  preview: '#161c2e' },
  { value: 'tide',     label: 'Tide',      preview: '#162132' },
  { value: 'graphite', label: 'Graphite',  preview: '#1c1d22' },
];

function OptionsTab() {
  const c = useColors();
  const s = makeStyles(c);
  const { defaultSort, setDefaultSort, defaultExerciseSort, setDefaultExerciseSort, colorScheme, setColorScheme } = useSettingsStore();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setRefreshing(false);
  }, []);

  return (
    <ScrollView contentContainerStyle={s.tabScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COL_GOLD} />}>
      <SectionHeader title="Color Scheme" />
      <View style={[s.card, { paddingHorizontal: 0 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 12, paddingHorizontal: 14 }}>
          {COLOR_SCHEMES.map(({ value, label, preview }) => (
            <TouchableOpacity
              key={value}
              style={[s.schemeOption, colorScheme === value && { borderColor: c.accent, borderWidth: 2 }]}
              onPress={() => setColorScheme(value)}
            >
              <View style={[s.schemeSwatch, { backgroundColor: preview }]} />
              <Text style={[s.schemeLabel, colorScheme === value && { color: c.accent, fontWeight: '700' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

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

      <SectionHeader title="Default Sort (Exercises)" />
      <View style={s.card}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {EXERCISE_SORT_OPTIONS.map(({ value, label }) => (
            <TouchableOpacity
              key={value}
              style={[s.sortPill, defaultExerciseSort === value && s.sortPillActive]}
              onPress={() => setDefaultExerciseSort(value)}
            >
              <Text style={[s.sortPillText, defaultExerciseSort === value && s.sortPillTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
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
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setRefreshing(false);
  }, []);
  const c = useColors();
  const s = makeStyles(c);
  const ts = makeTagStyles(c);
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

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />;

  return (
    <ScrollView contentContainerStyle={s.tabScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COL_GOLD} />}>
      {TAG_CATEGORIES.map(({ key, label }) => (
        <View key={key}>
          <SectionHeader title={label} />
          <View style={s.card}>
            <View style={ts.tagWrap}>
              {defs[key].map((name) => (
                <TouchableOpacity key={name} style={ts.tag} onPress={() => removeTag(key, name)}>
                  <Text style={ts.tagText}>{name} ×</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={ts.addRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={newTag[key]}
                onChangeText={(v) => setNewTag((prev) => ({ ...prev, [key]: v }))}
                placeholder={`Add ${label.toLowerCase()} tag…`}
                placeholderTextColor={c.muted}
                returnKeyType="done"
                onSubmitEditing={() => addTag(key)}
              />
              <TouchableOpacity style={ts.addBtn} onPress={() => addTag(key)}>
                <Text style={ts.addBtnText}>Add</Text>
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

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; desc: string }[] = [
  { value: 'sedentary',         label: 'Sedentary',         desc: 'Little or no exercise' },
  { value: 'lightly_active',    label: 'Lightly Active',    desc: 'Light 1–3 days/wk' },
  { value: 'moderately_active', label: 'Moderately Active', desc: 'Moderate 3–5 days/wk' },
  { value: 'very_active',       label: 'Very Active',       desc: 'Hard 6–7 days/wk' },
];

function ProfileSection() {
  const c = useColors();
  const s = makeStyles(c);
  const token = useAuthStore((st) => st.token)!;

  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | ''>('');
  const [dob, setDob] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('sedentary');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getProfile(token).then((p: UserProfile) => {
      if (p.heightCm) {
        const totalIn = p.heightCm / 2.54;
        setHeightFt(String(Math.floor(totalIn / 12)));
        setHeightIn(String(Math.round(totalIn % 12)));
      }
      if (p.sex) setSex(p.sex);
      if (p.dob) setDob(p.dob);
      setActivityLevel(p.activityLevel);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      const totalInches = (Number(heightFt) * 12) + Number(heightIn);
      const heightCm = totalInches > 0 ? Math.round(totalInches * 2.54 * 10) / 10 : null;
      await updateProfile(token, { heightCm, sex: sex || null, dob: dob || null, activityLevel });
      setMsg('Profile saved.');
      setTimeout(() => setMsg(''), 3000);
    } catch {
      setMsg('Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <ActivityIndicator style={{ marginTop: 20 }} color={c.accent} />;

  return (
    <View style={s.card}>
      {/* Height */}
      <View style={{ gap: 4 }}>
        <Text style={s.fieldLabel}>Height</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput style={[s.input, { width: 60 }]} value={heightFt} onChangeText={setHeightFt} keyboardType="numeric" placeholder="ft" placeholderTextColor={c.muted} />
          <Text style={s.fieldLabel}>ft</Text>
          <TextInput style={[s.input, { width: 60 }]} value={heightIn} onChangeText={setHeightIn} keyboardType="numeric" placeholder="in" placeholderTextColor={c.muted} />
          <Text style={s.fieldLabel}>in</Text>
        </View>
      </View>

      {/* Sex */}
      <View style={{ gap: 4 }}>
        <Text style={s.fieldLabel}>Sex</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['male', 'female'] as const).map((v) => (
            <TouchableOpacity
              key={v}
              style={[s.sortPill, sex === v && s.sortPillActive]}
              onPress={() => setSex(v)}
            >
              <Text style={[s.sortPillText, sex === v && s.sortPillTextActive, { textTransform: 'capitalize' }]}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Date of birth */}
      <Field label="Date of birth (YYYY-MM-DD)">
        <TextInput
          style={s.input}
          value={dob}
          onChangeText={setDob}
          placeholder="1990-01-01"
          placeholderTextColor={c.muted}
          keyboardType="numbers-and-punctuation"
        />
      </Field>

      {/* Activity level */}
      <View style={{ gap: 6 }}>
        <Text style={s.fieldLabel}>Activity level</Text>
        {ACTIVITY_OPTIONS.map(({ value, label, desc }) => (
          <TouchableOpacity
            key={value}
            style={[s.sortPill, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }, activityLevel === value && s.sortPillActive]}
            onPress={() => setActivityLevel(value)}
          >
            <Text style={[s.sortPillText, activityLevel === value && s.sortPillTextActive, { fontWeight: '600' }]}>{label}</Text>
            <Text style={[s.sortPillText, activityLevel === value && s.sortPillTextActive, { fontSize: 13, opacity: 0.75 }]}>{desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {msg ? <Text style={msg.includes('saved') ? s.msgSuccess : s.msgError}>{msg}</Text> : null}
      <SaveBtn onPress={handleSave} saving={saving} label="Save Profile" />
    </View>
  );
}

function UserTab() {
  const c = useColors();
  const s = makeStyles(c);
  const token = useAuthStore((s) => s.token)!;
  const setToken = useAuthStore((s) => s.setToken);

  const [newUsername, setNewUsername] = useState('');
  const [unPwd, setUnPwd] = useState('');
  const [savingUn, setSavingUn] = useState(false);
  const [msgUn, setMsgUn] = useState('');

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setRefreshing(false);
  }, []);
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
    <ScrollView contentContainerStyle={s.tabScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COL_GOLD} />}>
      <SectionHeader title="Profile" />
      <ProfileSection />

      <SectionHeader title="Change Username" />
      <View style={s.card}>
        <Field label="New username">
          <TextInput style={s.input} value={newUsername} onChangeText={setNewUsername} autoCapitalize="none" autoCorrect={false} placeholderTextColor={c.muted} />
        </Field>
        <Field label="Current password">
          <TextInput style={s.input} value={unPwd} onChangeText={setUnPwd} secureTextEntry placeholderTextColor={c.muted} />
        </Field>
        {msgUn ? <Text style={msgUn.includes('updated') ? s.msgSuccess : s.msgError}>{msgUn}</Text> : null}
        <SaveBtn onPress={handleUpdateUsername} saving={savingUn} label="Update username" />
      </View>

      <SectionHeader title="Change Password" />
      <View style={s.card}>
        <Field label="Current password">
          <TextInput style={s.input} value={curPwd} onChangeText={setCurPwd} secureTextEntry placeholderTextColor={c.muted} />
        </Field>
        <Field label="New password">
          <TextInput style={s.input} value={newPwd} onChangeText={setNewPwd} secureTextEntry placeholderTextColor={c.muted} />
        </Field>
        <Field label="Confirm new password">
          <TextInput style={s.input} value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry placeholderTextColor={c.muted} />
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
  const c = useColors();
  const s = makeStyles(c);
  const token = useAuthStore((s) => s.token)!;
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setRefreshing(false);
  }, []);

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
    <ScrollView contentContainerStyle={s.tabScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COL_GOLD} />}>
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

// ── About tab ─────────────────────────────────────────────────────────────────

function AboutTab() {
  const c = useColors();
  const s = makeStyles(c);
  const { updateAvailable, latestTag, checking, downloading, progress, checkForUpdate, startUpdate } = useUpdateStore();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await checkForUpdate();
    setRefreshing(false);
  }, [checkForUpdate]);

  // Re-check on page load
  useEffect(() => { checkForUpdate(); }, []);

  const displayTag = BUILD_TAG || '(dev build)';

  return (
    <ScrollView
      contentContainerStyle={s.tabScroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COL_GOLD} />}
    >
      <SectionHeader title="App Version" />
      <View style={s.card}>
        <Text style={[s.fieldLabel, { marginBottom: 2 }]}>Installed build</Text>
        <Text style={[s.measureLabel, { fontFamily: 'monospace', fontSize: 13 }]}>{displayTag}</Text>
      </View>

      <SectionHeader title="Updates" />
      <View style={s.card}>
        {updateAvailable ? (
          <>
            <Text style={[s.fieldLabel, { marginBottom: 2 }]}>New version available</Text>
            <Text style={[s.measureLabel, { fontFamily: 'monospace', fontSize: 13, marginBottom: 8 }]}>{latestTag}</Text>
            <TouchableOpacity
              style={[s.saveBtn, downloading && s.saveBtnDim]}
              onPress={startUpdate}
              disabled={downloading}
            >
              <Text style={s.saveBtnText}>
                {downloading ? `Downloading… ${Math.round(progress * 100)}%` : 'Download & Install'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={s.msgSuccess}>{checking ? 'Checking…' : 'Up to date'}</Text>
        )}
        {!checking && (
          <TouchableOpacity onPress={checkForUpdate} style={{ marginTop: 4 }}>
            <Text style={[s.fieldLabel, { color: c.accent }]}>Check for updates</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

// ── Root screen ───────────────────────────────────────────────────────────────

type Tab = 'options' | 'tags' | 'user' | 'delete' | 'about';
const SETTINGS_TABS_ORDER = ['options', 'tags', 'user', 'delete', 'about'] as const;

export default function SettingsScreen() {
  const c = useColors();
  const s = makeStyles(c);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('options');
  const swipe = useSwipeNav(7, SETTINGS_TABS_ORDER, tab, setTab);

  return (
    <SafeAreaView style={s.container} {...swipe.panHandlers}>
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
          { id: 'user',    label: 'User'    },
          { id: 'delete',  label: 'Delete'  },
          { id: 'about',   label: 'About'   },
        ] as { id: Tab; label: string }[]).map(({ id, label }) => (
          <TouchableOpacity key={id} style={[s.tabBtn, tab === id && s.tabBtnActive]} onPress={() => setTab(id)}>
            <Text style={[s.tabLabel, tab === id && s.tabLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === 'options' && <OptionsTab />}
      {tab === 'tags'    && <TagsTab />}
      {tab === 'user'    && <UserTab />}
      {tab === 'delete'  && <DeleteTab />}
      {tab === 'about'   && <AboutTab />}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: '700', color: c.text },
  signOut: { fontSize: fontSize.sm, color: c.muted },
  tabBar: { borderBottomWidth: 1, borderBottomColor: c.border, flexGrow: 0, flexShrink: 0 },
  tabBarContent: { flexDirection: 'row', alignItems: 'stretch' },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: c.accent },
  tabLabel: { fontSize: fontSize.sm, color: c.muted, fontWeight: '500' },
  tabLabelActive: { color: c.accent, fontWeight: '700' },
  tabScroll: { padding: 16, gap: 8 },
  sectionLabel: { fontSize: fontSize.sm, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, gap: 12 },
  twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { flex: 1, minWidth: '40%', gap: 4 },
  fieldLabel: { fontSize: fontSize.sm, color: c.muted },
  input: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: fontSize.sm, color: c.text },
  saveBtn: { backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10, alignSelf: 'flex-start', marginTop: 4 },
  saveBtnDim: { opacity: 0.5 },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: c.bg },
  msgSuccess: { fontSize: fontSize.sm, color: '#34d399' },
  msgError: { fontSize: fontSize.sm, color: '#ef4444' },
  measureRow: { gap: 6 },
  measureLabel: { fontSize: fontSize.sm, fontWeight: '600', color: c.text },
  measureUnit: { fontWeight: '400', color: c.muted },
  divider: { height: 1, backgroundColor: c.border, marginVertical: 4 },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  deleteLabel: { fontSize: fontSize.sm, fontWeight: '600', color: c.text },
  deleteDesc: { fontSize: fontSize.sm, color: c.muted, marginTop: 2 },
  deleteBtn: { borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  deleteBtnText: { fontSize: fontSize.sm, color: '#ef4444' },
  sortPill: { borderRadius: 20, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 7 },
  sortPillActive: { backgroundColor: c.accent, borderColor: c.accent },
  sortPillText: { fontSize: fontSize.sm, color: c.muted },
  sortPillTextActive: { color: c.bg, fontWeight: '700' },
  schemeOption: { alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 10 },
  schemeSwatch: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: c.border },
  schemeLabel: { fontSize: fontSize.sm, color: c.muted },
  });
}

function makeTagStyles(c: Colors) {
  return StyleSheet.create({
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  tagText: { fontSize: fontSize.sm, color: c.text },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  addBtn: { backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center' },
  addBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: c.bg },
  });
}
