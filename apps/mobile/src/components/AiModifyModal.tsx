import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useColors } from '../hooks/useColors';
import { fontSize, type Colors } from '../theme';
import { aiModifyRecipe, updateRecipe, logModifiedRecipe, getRecipe, getRecipeLog } from '../api/client';
import type { RecipeDetail, MakeLogEntry } from '../api/client';

function defaultMeal(): string {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 20) return 'dinner';
  return 'snack';
}

function normQty(v: number | string | null | undefined) {
  return Math.round((Number(v) || 0) * 1000);
}
function normUnit(v: string | null | undefined) {
  return (v || '').trim().toLowerCase();
}

interface Props {
  recipe: RecipeDetail;
  token: string;
  onClose: () => void;
  onSaved: (updated: RecipeDetail, logEntries: MakeLogEntry[]) => void;
}

export default function AiModifyModal({ recipe, token, onClose, onSaved }: Props) {
  const c = useColors();
  const styles = makeStyles(c);

  const [step, setStep] = useState<'prompt' | 'preview'>('prompt');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { modified } = await aiModifyRecipe(token, recipe.id, prompt.trim(), 'update');
      setResult(modified);
      setStep('preview');
    } catch {
      setError('Failed to modify recipe. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(andLog: boolean) {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      await updateRecipe(token, recipe.id, {
        type: recipe.type,
        name: result.name,
        description: result.description,
        ingredients: result.ingredients,
        steps: result.steps,
        calories: result.calories ?? recipe.calories ?? undefined,
        carbs_g: result.carbs_g ?? recipe.carbs_g ?? undefined,
        protein_g: result.protein_g ?? recipe.protein_g ?? undefined,
        fat_g: result.fat_g ?? recipe.fat_g ?? undefined,
        fiber_g: result.fiber_g ?? recipe.fiber_g ?? undefined,
        sodium_mg: result.sodium_mg ?? recipe.sodium_mg ?? undefined,
        notes: recipe.notes ?? undefined,
        source: recipe.source ?? undefined,
        prep_time: recipe.prep_time ?? undefined,
        cook_time: recipe.cook_time ?? undefined,
        servings: recipe.servings ?? undefined,
        glass_type: recipe.glass_type ?? undefined,
        abv_level: recipe.abv_level ?? undefined,
        subcategory: recipe.subcategory ?? undefined,
        tags: recipe.tags,
      });
      if (andLog) {
        const d = new Date();
        const logDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        await logModifiedRecipe(token, {
          recipeId: recipe.id,
          meal: defaultMeal(),
          logDate,
          name: result.name,
          calories: result.calories ?? recipe.calories ?? 0,
          carbs_g: result.carbs_g ?? recipe.carbs_g ?? 0,
          protein_g: result.protein_g ?? recipe.protein_g ?? 0,
          fat_g: result.fat_g ?? recipe.fat_g ?? 0,
          fiber_g: result.fiber_g ?? recipe.fiber_g ?? null,
          sodium_mg: result.sodium_mg ?? recipe.sodium_mg ?? null,
        });
      }
      const [updated, logData] = await Promise.all([
        getRecipe(token, recipe.id),
        getRecipeLog(token, recipe.id),
      ]);
      onSaved(updated, logData.entries);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Ingredient diff
  const origByName = new Map(recipe.ingredients.map((i) => [i.name.toLowerCase().trim(), i]));
  const newByName: Map<string, any> = result
    ? new Map(result.ingredients.map((i: any) => [i.name.toLowerCase().trim(), i]))
    : new Map();
  const removed = recipe.ingredients.filter((i) => !newByName.has(i.name.toLowerCase().trim()));
  const added: any[] = result
    ? result.ingredients.filter((i: any) => !origByName.has(i.name.toLowerCase().trim()))
    : [];
  const changed: any[] = result
    ? result.ingredients.filter((i: any) => {
        const orig = origByName.get(i.name.toLowerCase().trim());
        if (!orig) return false;
        return normQty(orig.quantity) !== normQty(i.quantity) || normUnit(orig.unit) !== normUnit(i.unit);
      })
    : [];

  const macroDiff = result
    ? [
        { label: 'Calories', orig: recipe.calories, next: result.calories, unit: 'kcal' },
        { label: 'Carbs', orig: recipe.carbs_g, next: result.carbs_g, unit: 'g' },
        { label: 'Protein', orig: recipe.protein_g, next: result.protein_g, unit: 'g' },
        { label: 'Fat', orig: recipe.fat_g, next: result.fat_g, unit: 'g' },
        { label: 'Fiber', orig: recipe.fiber_g, next: result.fiber_g, unit: 'g' },
        { label: 'Sodium', orig: recipe.sodium_mg, next: result.sodium_mg, unit: 'mg' },
      ].filter(({ next, orig }) => next != null && next !== orig)
    : [];

  const hasChanges =
    removed.length > 0 ||
    added.length > 0 ||
    changed.length > 0 ||
    macroDiff.length > 0 ||
    (result && result.name !== recipe.name);

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Modify this recipe</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {step === 'prompt' && (
            <View style={styles.body}>
              <Text style={styles.hint}>
                Describe what you'd like to change. The AI will update the ingredients, steps, and macros.
              </Text>
              <TextInput
                style={styles.input}
                value={prompt}
                onChangeText={setPrompt}
                placeholder='e.g. "replace butter with olive oil" or "make it dairy-free"'
                placeholderTextColor={c.muted}
                multiline
                numberOfLines={3}
                autoFocus
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, (!prompt.trim() || loading) && styles.disabled]}
                onPress={handleSubmit}
                disabled={loading || !prompt.trim()}
              >
                {loading ? (
                  <ActivityIndicator color={c.bg} />
                ) : (
                  <Text style={styles.primaryBtnText}>Preview changes</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === 'preview' && result && (
            <ScrollView style={styles.previewScroll} contentContainerStyle={styles.body}>
              {result.name !== recipe.name && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>NAME</Text>
                  <Text style={styles.strikethrough}>{recipe.name}</Text>
                  <Text style={styles.newValue}>{result.name}</Text>
                </View>
              )}

              {(removed.length > 0 || added.length > 0 || changed.length > 0) && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>INGREDIENTS</Text>
                  {removed.map((i) => (
                    <Text key={i.name} style={styles.diffRemoved}>− {i.name}</Text>
                  ))}
                  {added.map((i: any) => (
                    <Text key={i.name} style={styles.diffAdded}>
                      + {i.quantity ? `${i.quantity}${i.unit ? ` ${i.unit}` : ''} ` : ''}{i.name}
                    </Text>
                  ))}
                  {changed.map((i: any) => {
                    const orig = origByName.get(i.name.toLowerCase().trim())!;
                    return (
                      <Text key={i.name} style={styles.diffChanged}>
                        {i.name}:{' '}
                        <Text style={styles.strikethrough}>
                          {orig.quantity}{orig.unit ? ` ${orig.unit}` : ''}
                        </Text>
                        {' → '}
                        {i.quantity}{i.unit ? ` ${i.unit}` : ''}
                      </Text>
                    );
                  })}
                </View>
              )}

              {macroDiff.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>MACROS</Text>
                  {macroDiff.map(({ label, orig, next, unit }) => (
                    <View key={label} style={styles.macroRow}>
                      <Text style={styles.macroLabel}>{label}</Text>
                      <Text style={[styles.macroVal, styles.strikethrough]}>{orig ?? '—'}{unit}</Text>
                      <Text style={styles.macroArrow}>→</Text>
                      <Text style={styles.macroNext}>{next}{unit}</Text>
                    </View>
                  ))}
                </View>
              )}

              {!hasChanges && <Text style={styles.hint}>No changes detected.</Text>}
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, saving && styles.disabled]}
                  onPress={() => handleSave(false)}
                  disabled={saving}
                >
                  <Text style={styles.secondaryBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, { flex: 1 }, saving && styles.disabled]}
                  onPress={() => handleSave(true)}
                  disabled={saving}
                >
                  <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save & Log'}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => setStep('prompt')} style={styles.backLink}>
                <Text style={styles.backLinkText}>← Edit prompt</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '85%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: {
      color: c.text,
      fontSize: fontSize.base,
      fontWeight: '600',
    },
    closeBtn: { padding: 4 },
    closeBtnText: { color: c.muted, fontSize: fontSize.base },
    body: { padding: 16, gap: 12 },
    previewScroll: { flexGrow: 0 },
    hint: { color: c.muted, fontSize: fontSize.sm },
    input: {
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      color: c.text,
      fontSize: fontSize.sm,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    error: { color: '#f87171', fontSize: fontSize.xs },
    primaryBtn: {
      backgroundColor: c.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { color: c.bg, fontWeight: 'bold', fontSize: fontSize.sm },
    disabled: { opacity: 0.5 },
    section: { gap: 4 },
    sectionLabel: {
      color: c.muted,
      fontSize: fontSize.xs,
      fontWeight: '600',
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    strikethrough: { color: c.muted, textDecorationLine: 'line-through', fontSize: fontSize.sm },
    newValue: { color: c.text, fontSize: fontSize.sm },
    diffRemoved: { color: '#f87171', fontSize: fontSize.sm },
    diffAdded: { color: '#4ade80', fontSize: fontSize.sm },
    diffChanged: { color: '#facc15', fontSize: fontSize.sm },
    macroRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
    macroLabel: { color: c.muted, fontSize: fontSize.sm, width: 60 },
    macroVal: { color: c.muted, fontSize: fontSize.sm },
    macroArrow: { color: c.muted, fontSize: fontSize.sm },
    macroNext: { color: c.text, fontSize: fontSize.sm },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
    secondaryBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: { color: c.text, fontWeight: '600', fontSize: fontSize.sm },
    backLink: { alignItems: 'center', paddingVertical: 8 },
    backLinkText: { color: c.muted, fontSize: fontSize.sm },
  });
}
