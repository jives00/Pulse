import { useCallback, useEffect, useState } from 'react';
import { Alert, Dimensions, Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getRecipe, logRecipe, updateRecipe, getRecipeLog, deleteLogEntry, deleteAllLog, type RecipeDetail, type MakeLogEntry } from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { colors, fontSize } from '../../../src/theme';
import Spinner from '../../../src/components/Spinner';

const { width } = Dimensions.get('window');

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
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [servings, setServings] = useState(1);
  const [baseServings, setBaseServings] = useState(1);
  const [logSaving, setLogSaving] = useState(false);
  const [makeLog, setMakeLog] = useState<MakeLogEntry[]>([]);

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

  async function handleLogMade() {
    if (!recipe) return;
    setLogSaving(true);
    try {
      await logRecipe(token, recipe.id);
      const logData = await getRecipeLog(token, recipe.id);
      setMakeLog(logData.entries);
      Alert.alert('Logged!', `${recipe.name} recorded.`);
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

  if (loading) return <Spinner />;
  if (!recipe) return <SafeAreaView style={styles.container}><Text style={styles.muted}>Recipe not found</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>
        {recipe.photo_url ? (
          <Image source={{ uri: recipe.photo_url }} style={{ width, height: width * 0.6 }} resizeMode="cover" />
        ) : (
          <View style={[styles.photoPlaceholder, { width, height: width * 0.4 }]}>
            <Text style={{ fontSize: 60 }}>{recipe.type === 'cocktail' ? '🍸' : '🍽️'}</Text>
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.name}>{recipe.name}</Text>
            <View style={styles.titleActions}>
              <TouchableOpacity onPress={handleToggleFavorite}>
                <Text style={styles.star}>{recipe.is_favorite === 1 ? '★' : '☆'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push(`/(app)/recipe/edit?id=${recipe.id}`)}>
                <Text style={styles.editBtn}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>

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
              <Text style={[styles.muted, { fontSize: 12 }]}>From: <Text style={{ color: colors.accent, textDecorationLine: 'underline' }}>{recipe.source}</Text></Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  name: { color: colors.text, fontSize: fontSize['2xl'], fontWeight: 'bold', flex: 1, marginRight: 8 },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
  star: { color: colors.accent, fontSize: fontSize['2xl'] },
  editBtn: { color: colors.accent, fontSize: fontSize.sm, fontWeight: '600' },
  type: { color: colors.muted, fontSize: fontSize.xs, textTransform: 'capitalize', marginBottom: 10 },
  tagsRow: { marginBottom: 12 },
  tag: { borderWidth: 1, borderColor: colors.accent, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8 },
  tagText: { color: colors.accent, fontSize: fontSize.xs },
  description: { color: colors.muted, fontSize: fontSize.sm, marginBottom: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  meta: { color: colors.muted, fontSize: fontSize.sm },
  servingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionLabel: { color: colors.text, fontWeight: '600', fontSize: fontSize.base, marginBottom: 8, marginRight: 12 },
  stepBtn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: colors.text, fontWeight: 'bold', fontSize: fontSize.base },
  servingCount: { color: colors.text, fontSize: fontSize.base, fontWeight: 'bold', marginHorizontal: 16 },
  ingRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
  ingQty: { color: colors.accent, fontSize: fontSize.sm, width: 110, flexShrink: 0 },
  ingName: { color: colors.text, fontSize: fontSize.sm, flex: 1 },
  stepRow: { flexDirection: 'row', marginBottom: 12 },
  stepNum: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm, width: 24 },
  stepText: { color: colors.text, fontSize: fontSize.sm, flex: 1, lineHeight: 22 },
  nutritionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  nutritionCell: { backgroundColor: colors.card, borderRadius: 10, padding: 10, alignItems: 'center', minWidth: 80, flexGrow: 1 },
  nutritionValue: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  nutritionLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  muted: { color: colors.muted, fontSize: fontSize.sm },
  logBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  logBtnText: { color: colors.bg, fontWeight: 'bold', fontSize: fontSize.sm },
  logSection: { marginTop: 20, marginBottom: 32 },
  logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  clearAll: { color: colors.error, fontSize: fontSize.xs },
  logEntry: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  logDate: { color: colors.text, fontSize: fontSize.sm },
  logDelete: { color: colors.muted, fontSize: fontSize.xs, paddingHorizontal: 8 },
  backBtn: { position: 'absolute', top: 48, left: 16, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: colors.text, fontSize: fontSize.xl },
});
