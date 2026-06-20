import { useCallback, useEffect, useState } from 'react';
import { Alert, Dimensions, Image, KeyboardAvoidingView, Linking, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getRecipe, logRecipe, updateRecipe, getRecipeLog, deleteLogEntry, deleteAllLog, type RecipeDetail, type MakeLogEntry, type MealSlot } from '../../../src/api/client';
import { localDateStr } from '../../../../../packages/api-client/src/index';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';
import Spinner from '../../../src/components/Spinner';
import AiModifyModal from '../../../src/components/AiModifyModal';

const { width } = Dimensions.get('window');

function defaultMealByTime(): MealSlot {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return 'breakfast';
  if (h >= 11 && h < 14) return 'lunch';
  if (h >= 17 && h < 20) return 'dinner';
  return 'snack';
}

const MEAL_OPTIONS: { value: MealSlot; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

function formatTime(minutes?: number | null) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

function scaleQty(qty?: number | null, servings = 1, baseServings = 1) {
  if (!qty) return '';
  const scaled = qty * servings / baseServings;
  return scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1);
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const c = useColors();
  const styles = makeStyles(c);
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [servings, setServings] = useState(1);
  const [baseServings, setBaseServings] = useState(1);
  const [logSaving, setLogSaving] = useState(false);
  const [makeLog, setMakeLog] = useState<MakeLogEntry[]>([]);
  const [showModify, setShowModify] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logMeal, setLogMeal] = useState<MealSlot>(defaultMealByTime());
  const [logServings, setLogServings] = useState(1);

  const loadRecipe = useCallback(() => {
    return Promise.all([
      getRecipe(token, Number(id)).then((r) => {
        setRecipe(r);
        const s = (r as any).servings || 1;
        setServings(s);
        setBaseServings(s);
      }),
      getRecipeLog(token, Number(id)).then((data) => setMakeLog(data.entries)),
    ]).catch(() => {});
  }, [id, token]);

  useEffect(() => {
    loadRecipe().finally(() => setLoading(false));
  }, [loadRecipe]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRecipe();
    setRefreshing(false);
  }, [loadRecipe]);

  async function handleToggleFavorite() {
    if (!recipe) return;
    const newVal = recipe.is_favorite === 1 ? 0 : 1;
    setRecipe({ ...recipe, is_favorite: newVal });
    await updateRecipe(token, recipe.id, { type: recipe.type, name: recipe.name, is_favorite: newVal }).catch(() => {});
  }

  function handleLogMade() {
    if (!recipe) return;
    setLogMeal(defaultMealByTime());
    setLogServings(1);
    setShowLogModal(true);
  }

  async function handleConfirmLog() {
    if (!recipe) return;
    setShowLogModal(false);
    setLogSaving(true);
    try {
      const result = await logRecipe(token, recipe.id, { meal: logMeal, servings: logServings, logDate: localDateStr() });
      const logData = await getRecipeLog(token, recipe.id);
      setMakeLog(logData.entries);
      if (result.nutritionLogged) {
        Alert.alert('Logged!', `${recipe.name} added to ${logMeal}.`);
      } else {
        Alert.alert(
          'Marked as made',
          `${recipe.name} was added to your made history, but it has no nutrition data so it wasn't added to your food log. Edit the recipe to add nutrition first.`,
        );
      }
    } catch { Alert.alert('Error', 'Could not log recipe.'); }
    finally { setLogSaving(false); }
  }

  async function handleDeleteLogEntry(logId: number) {
    if (!recipe) return;
    await deleteLogEntry(token, recipe.id, logId).catch(() => {});
    setMakeLog((prev) => prev.filter((e) => e.id !== logId));
  }

  async function handleClearLog() {
    if (!recipe) return;
    Alert.alert('Clear all?', 'This will delete all made history for this recipe.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          await deleteAllLog(token, recipe.id).catch(() => {});
          setMakeLog([]);
        }
      },
    ]);
  }

  function handleShare() {
    if (!recipe) return;
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const lines: string[] = [];

    lines.push(recipe.name.toUpperCase());
    lines.push('━'.repeat(Math.min(recipe.name.length, 40)));
    lines.push('');

    const meta: string[] = [`${cap(recipe.type)}`];
    if (recipe.subcategory) meta.push(cap(recipe.subcategory));
    if (recipe.glass_type) meta.push(`Glass: ${recipe.glass_type}`);
    if (recipe.abv_level) meta.push(`ABV: ${recipe.abv_level}`);
    if (recipe.servings) meta.push(`Serves ${recipe.servings}`);
    lines.push(meta.join(' · '));

    if (recipe.tags && recipe.tags.length > 0) lines.push(`Tags: ${recipe.tags.join(', ')}`);

    if (recipe.description) { lines.push(''); lines.push(recipe.description); }

    const prepTime = recipe.prep_time ? formatTime(recipe.prep_time) : null;
    const cookTime = recipe.cook_time ? formatTime(recipe.cook_time) : null;
    const totalMins = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);
    const totalTime = totalMins > 0 ? formatTime(totalMins) : null;
    if (prepTime || cookTime) {
      lines.push('');
      const timeParts: string[] = [];
      if (prepTime) timeParts.push(`Prep: ${prepTime}`);
      if (cookTime) timeParts.push(`Cook: ${cookTime}`);
      if (totalTime && prepTime && cookTime) timeParts.push(`Total: ${totalTime}`);
      lines.push(timeParts.join('  ·  '));
    }

    if (recipe.ingredients && recipe.ingredients.length > 0) {
      lines.push('');
      lines.push('INGREDIENTS');
      lines.push('───────────');
      for (const ing of recipe.ingredients) {
        const qty = ing.quantity ? String(ing.quantity) : '';
        const unit = ing.unit ? ` ${ing.unit}` : '';
        lines.push(`  • ${qty}${unit} ${ing.name}`.trim().replace(/^•/, '  •'));
      }
    }

    if (recipe.steps && recipe.steps.length > 0) {
      lines.push('');
      lines.push('INSTRUCTIONS');
      lines.push('────────────');
      for (const step of recipe.steps) {
        lines.push('');
        lines.push(`${step.step_number}.  ${step.instruction}`);
      }
    }

    if (recipe.notes) {
      lines.push('');
      lines.push('NOTES');
      lines.push('─────');
      lines.push(recipe.notes);
    }

    if (recipe.source) { lines.push(''); lines.push(`Source: ${recipe.source}`); }

    const cal = recipe.calories;
    const carbs = recipe.carbs_g;
    const protein = recipe.protein_g;
    const fat = recipe.fat_g;
    const fiber = recipe.fiber_g;
    const sodium = recipe.sodium_mg;
    if (cal || carbs || protein || fat) {
      lines.push('');
      lines.push('NUTRITION  (per serving)');
      lines.push('────────────────────────');
      if (cal) lines.push(`  Calories  ${cal} kcal`);
      if (carbs) lines.push(`  Carbs     ${carbs} g`);
      if (protein) lines.push(`  Protein   ${protein} g`);
      if (fat) lines.push(`  Fat       ${fat} g`);
      if (fiber) lines.push(`  Fiber     ${fiber} g`);
      if (sodium) lines.push(`  Sodium    ${sodium} mg`);
    }

    lines.push('');
    lines.push('─────────────────────────');
    lines.push('Shared from Pulse');

    const subject = encodeURIComponent(`Recipe Shared - ${recipe.name}`);
    const body = encodeURIComponent(lines.join('\n'));
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`).catch(() => {
      Alert.alert('Error', 'Could not open email app.');
    });
  }

  if (loading) return <Spinner />;
  if (!recipe) return <SafeAreaView style={styles.container}><Text style={styles.muted}>Recipe not found</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
        {recipe.photo_url ? (
          <Image source={{ uri: recipe.photo_url }} style={{ width, height: width * 0.6 }} resizeMode="cover" />
        ) : (
          <View style={[styles.photoPlaceholder, { width, height: width * 0.4 }]}>
            <Text style={{ fontSize: 60 }}>{recipe.type === 'cocktail' ? '🍸' : '🍽️'}</Text>
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.titleActions}>
            <TouchableOpacity onPress={handleToggleFavorite}>
              <Text style={styles.star}>{recipe.is_favorite === 1 ? '★' : '☆'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare}>
              <Text style={styles.editBtn}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowModify(true)}>
              <Text style={styles.editBtn}>✦ Modify</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push(`/(app)/recipe/edit?id=${recipe.id}`)}>
              <Text style={styles.editBtn}>Edit</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>{recipe.name}</Text>

          <Text style={styles.type}>{recipe.type}</Text>

          {recipe.tags.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow}>
              {recipe.tags.map((tag) => (
                <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
              ))}
            </ScrollView>
          )}

          {recipe.description ? <Text style={styles.description}>{recipe.description}</Text> : null}

          <View style={styles.metaRow}>
            {recipe.prep_time ? <Text style={styles.meta}>⏱ {formatTime(recipe.prep_time)}</Text> : null}
            {recipe.glass_type ? <Text style={styles.meta}>🥃 {recipe.glass_type}</Text> : null}
            {recipe.abv_level ? <Text style={styles.meta}>ABV: {recipe.abv_level}</Text> : null}
          </View>

          <View style={styles.servingRow}>
            <Text style={styles.sectionLabel}>Servings</Text>
            <TouchableOpacity onPress={() => setServings((s) => Math.max(1, s - 1))} style={styles.stepBtn}>
              <Text style={styles.stepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.servingCount}>{servings}</Text>
            <TouchableOpacity onPress={() => setServings((s) => s + 1)} style={styles.stepBtn}>
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Ingredients</Text>
          {recipe.ingredients.map((ing, i) => (
            <View key={i} style={styles.ingRow}>
              <Text style={styles.ingQty} numberOfLines={1}>
                {ing.quantity ? `${scaleQty(ing.quantity, servings, baseServings)} ${ing.unit || ''}`.trim() : ing.unit || '—'}
              </Text>
              <Text style={styles.ingName}>{ing.name}</Text>
            </View>
          ))}

          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Steps</Text>
          {recipe.steps.map((step) => (
            <View key={step.step_number} style={styles.stepRow}>
              <Text style={styles.stepNum}>{step.step_number}.</Text>
              <Text style={styles.stepText}>{step.instruction}</Text>
            </View>
          ))}

          {(recipe.calories || recipe.carbs_g || recipe.protein_g || recipe.fat_g) ? (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionLabel}>Nutrition per serving</Text>
              <View style={styles.nutritionGrid}>
                {([
                  { label: 'Calories', value: recipe.calories, unit: 'kcal' },
                  { label: 'Carbs', value: recipe.carbs_g, unit: 'g' },
                  { label: 'Protein', value: recipe.protein_g, unit: 'g' },
                  { label: 'Fat', value: recipe.fat_g, unit: 'g' },
                  { label: 'Fiber', value: recipe.fiber_g, unit: 'g' },
                  { label: 'Sodium', value: recipe.sodium_mg, unit: 'mg' },
                ] as { label: string; value: number | null | undefined; unit: string }[])
                  .filter(({ value }) => value != null)
                  .map(({ label, value, unit }) => (
                    <View key={label} style={styles.nutritionCell}>
                      <Text style={styles.nutritionValue}>{value}{unit}</Text>
                      <Text style={styles.nutritionLabel}>{label}</Text>
                    </View>
                  ))}
              </View>
            </View>
          ) : null}

          {recipe.notes ? (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionLabel}>Notes</Text>
              <Text style={styles.muted}>{recipe.notes}</Text>
            </View>
          ) : null}

          {recipe.source ? (
            <TouchableOpacity onPress={() => Linking.openURL(recipe.source!)} style={{ marginTop: 12 }}>
              <Text style={styles.muted}>From: <Text style={{ color: c.accent, textDecorationLine: 'underline' }}>{recipe.source}</Text></Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={handleLogMade} disabled={logSaving} style={styles.logBtn}>
            <Text style={styles.logBtnText}>{logSaving ? 'Saving…' : '✔ I made this!'}</Text>
          </TouchableOpacity>

          {/* Made history */}
          <View style={styles.logSection}>
            <View style={styles.logHeader}>
              <Text style={styles.sectionLabel}>Made History ({makeLog.length})</Text>
              {makeLog.length > 0 && (
                <TouchableOpacity onPress={handleClearLog}>
                  <Text style={styles.clearAll}>Clear all</Text>
                </TouchableOpacity>
              )}
            </View>
            {makeLog.length === 0 ? (
              <Text style={styles.muted}>Not made yet.</Text>
            ) : (
              makeLog.map((entry) => (
                <View key={entry.id} style={styles.logEntry}>
                  <Text style={styles.logDate}>
                    {new Date(entry.made_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                  <TouchableOpacity onPress={() => handleDeleteLogEntry(entry.id)}>
                    <Text style={styles.logDelete}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>‹</Text>
      </TouchableOpacity>

      {showModify && (
        <AiModifyModal
          recipe={recipe}
          token={token}
          onClose={() => setShowModify(false)}
          onSaved={(updated, logEntries) => {
            setRecipe(updated);
            setMakeLog(logEntries);
            setShowModify(false);
          }}
        />
      )}

      <Modal transparent animationType="slide" visible={showLogModal} onRequestClose={() => setShowLogModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.logModal}>
              <Text style={styles.logModalTitle}>Log to Food Log</Text>

              <Text style={styles.logModalLabel}>Meal</Text>
              <View style={styles.mealRow}>
                {MEAL_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.mealBtn, logMeal === opt.value && styles.mealBtnActive]}
                    onPress={() => setLogMeal(opt.value)}
                  >
                    <Text style={[styles.mealBtnText, logMeal === opt.value && styles.mealBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.logModalLabel}>Servings</Text>
              <View style={styles.servingRowModal}>
                <TouchableOpacity onPress={() => setLogServings((s) => Math.max(0.5, parseFloat((s - 0.5).toFixed(1))))} style={styles.stepBtn}>
                  <Text style={styles.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.servingCount}>{logServings}</Text>
                <TouchableOpacity onPress={() => setLogServings((s) => parseFloat((s + 0.5).toFixed(1)))} style={styles.stepBtn}>
                  <Text style={styles.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {recipe.calories == null && (
                <Text style={{ color: c.error, fontSize: fontSize.sm, marginBottom: 12, textAlign: 'center' }}>
                  ⚠ This recipe has no nutrition data. It'll be added to your made history but not your food log. Edit the recipe to add nutrition first.
                </Text>
              )}

              <TouchableOpacity style={styles.logBtn} onPress={handleConfirmLog}>
                <Text style={styles.logBtnText}>Log to Food Log</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setShowLogModal(false)}>
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16 },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
  name: { color: c.text, fontSize: fontSize['2xl'], fontWeight: 'bold', marginBottom: 4 },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, justifyContent: 'flex-end' },
  star: { color: c.accent, fontSize: fontSize['2xl'] },
  editBtn: { color: c.accent, fontSize: fontSize.sm, fontWeight: '600' },
  type: { color: c.muted, fontSize: fontSize.sm, textTransform: 'capitalize', marginBottom: 10 },
  tagsRow: { marginBottom: 12 },
  tag: { borderWidth: 1, borderColor: c.accent, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8 },
  tagText: { color: c.accent, fontSize: fontSize.sm },
  description: { color: c.muted, fontSize: fontSize.sm, marginBottom: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  meta: { color: c.muted, fontSize: fontSize.sm },
  servingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionLabel: { color: c.text, fontWeight: '600', fontSize: fontSize.base, marginBottom: 8, marginRight: 12 },
  stepBtn: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: c.text, fontWeight: 'bold', fontSize: fontSize.base },
  servingCount: { color: c.text, fontSize: fontSize.base, fontWeight: 'bold', marginHorizontal: 16 },
  ingRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border, gap: 12 },
  ingQty: { color: c.accent, fontSize: fontSize.sm, width: 110, flexShrink: 0 },
  ingName: { color: c.text, fontSize: fontSize.sm, flex: 1 },
  stepRow: { flexDirection: 'row', marginBottom: 12 },
  stepNum: { color: c.accent, fontWeight: 'bold', fontSize: fontSize.sm, width: 24 },
  stepText: { color: c.text, fontSize: fontSize.sm, flex: 1, lineHeight: 22 },
  nutritionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  nutritionCell: { backgroundColor: c.card, borderRadius: 10, padding: 10, alignItems: 'center', minWidth: 80, flexGrow: 1 },
  nutritionValue: { color: c.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  nutritionLabel: { color: c.muted, fontSize: fontSize.sm, marginTop: 2 },
  muted: { color: c.muted, fontSize: fontSize.sm },
  logBtn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  logBtnText: { color: c.bg, fontWeight: 'bold', fontSize: fontSize.sm },
  logSection: { marginTop: 20, marginBottom: 32 },
  logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  clearAll: { color: c.error, fontSize: fontSize.sm },
  logEntry: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  logDate: { color: c.text, fontSize: fontSize.sm },
  logDelete: { color: c.muted, fontSize: fontSize.sm, paddingHorizontal: 8 },
  backBtn: { position: 'absolute', top: 48, left: 16, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: c.text, fontSize: fontSize.xl },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  logModal: { backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: c.border },
  logModalTitle: { color: c.text, fontSize: fontSize.lg, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  logModalLabel: { color: c.muted, fontSize: fontSize.sm, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  mealBtn: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  mealBtnActive: { backgroundColor: c.accent, borderColor: c.accent },
  mealBtnText: { color: c.muted, fontSize: fontSize.sm },
  mealBtnTextActive: { color: c.bg, fontWeight: '600' },
  servingRowModal: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  cancelModalBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelModalBtnText: { color: c.muted, fontSize: fontSize.sm },
  });
}
