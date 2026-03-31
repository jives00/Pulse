import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getDailyLog, addLogEntry, deleteNutritionLogEntry, addWater,
  searchFoods,
  type DailyLog, type NutritionLogEntry, type MealSlot, type Food, type ServingSize,
} from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { colors, fontSize } from '../../src/theme';

const MEALS: { slot: MealSlot; label: string }[] = [
  { slot: 'breakfast', label: 'Breakfast' },
  { slot: 'lunch', label: 'Lunch' },
  { slot: 'dinner', label: 'Dinner' },
  { slot: 'snack', label: 'Snack' },
];

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr: string) {
  const today = toDateStr(new Date());
  const yesterday = toDateStr(new Date(Date.now() - 86400000));
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function NutritionScreen() {
  const token = useAuthStore((s) => s.token)!;
  const [date, setDate] = useState(toDateStr(new Date()));
  const [log, setLog] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<MealSlot, boolean>>({ breakfast: true, lunch: true, dinner: true, snack: true });

  // Add food modal state
  const [addMeal, setAddMeal] = useState<MealSlot | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedServing, setSelectedServing] = useState<ServingSize | null>(null);
  const [quantity, setQuantity] = useState('1');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDailyLog(token, date);
      setLog(data);
    } catch {
      Alert.alert('Error', 'Could not load nutrition log.');
    } finally {
      setLoading(false);
    }
  }, [token, date]);

  useEffect(() => { load(); }, [load]);

  function shiftDate(days: number) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(toDateStr(d));
  }

  function handleSearch(text: string) {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const foods = await searchFoods(token, text.trim());
        setResults(foods);
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, 400);
  }

  function openAddFood(meal: MealSlot) {
    setAddMeal(meal);
    setQuery('');
    setResults([]);
    setSelectedFood(null);
    setSelectedServing(null);
    setQuantity('1');
  }

  function selectFood(food: Food) {
    setSelectedFood(food);
    const def = food.servingSizes.find((s) => s.isDefault) ?? food.servingSizes[0] ?? null;
    setSelectedServing(def);
    setQuantity('1');
  }

  async function confirmAdd() {
    if (!addMeal || !selectedFood || !selectedServing) return;
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) { Alert.alert('Invalid quantity'); return; }
    try {
      await addLogEntry(token, {
        logDate: date,
        meal: addMeal,
        foodId: selectedFood.id,
        servingSizeId: selectedServing.id,
        quantity: qty,
      });
      setAddMeal(null);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not add food.');
    }
  }

  async function handleDeleteEntry(entry: NutritionLogEntry) {
    Alert.alert('Remove', `Remove ${entry.food.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try { await deleteNutritionLogEntry(token, entry.id); load(); }
          catch { Alert.alert('Error', 'Could not remove entry.'); }
        },
      },
    ]);
  }

  async function handleAddWater(ml: number) {
    try { await addWater(token, date, ml); load(); }
    catch { Alert.alert('Error', 'Could not log water.'); }
  }

  const goals = log?.goals;
  const totals = log?.totals ?? { calories: 0, carbs: 0, protein: 0, fat: 0 };
  const calGoal = goals?.calories ?? 2000;
  const calPct = Math.min(totals.calories / calGoal, 1);
  const waterMl = log?.waterTotalMl ?? 0;
  const waterGoal = goals?.waterGoalMl ?? 2000;
  const waterPct = Math.min(waterMl / waterGoal, 1);

  return (
    <SafeAreaView style={s.container}>
      {/* Date nav */}
      <View style={s.dateNav}>
        <TouchableOpacity onPress={() => shiftDate(-1)} style={s.dateArrow}>
          <Text style={s.dateArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.dateLabel}>{formatDate(date)}</Text>
        <TouchableOpacity
          onPress={() => shiftDate(1)}
          style={s.dateArrow}
          disabled={date >= toDateStr(new Date())}
        >
          <Text style={[s.dateArrowText, date >= toDateStr(new Date()) && { opacity: 0.3 }]}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          {/* Summary card */}
          <View style={s.summaryCard}>
            <View style={s.calRow}>
              <Text style={s.calActual}>{Math.round(totals.calories)}</Text>
              <Text style={s.calSep}> / </Text>
              <Text style={s.calGoalText}>{calGoal} kcal</Text>
            </View>
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${calPct * 100}%` as any, backgroundColor: calPct >= 1 ? colors.error : colors.accent }]} />
            </View>
            <View style={s.macroRow}>
              {[
                { label: 'Protein', val: totals.protein, goal: goals?.proteinG, color: '#60a5fa' },
                { label: 'Carbs', val: totals.carbs, goal: goals?.carbsG, color: '#34d399' },
                { label: 'Fat', val: totals.fat, goal: goals?.fatG, color: '#fb923c' },
              ].map(({ label, val, goal, color }) => (
                <View key={label} style={s.macroItem}>
                  <Text style={[s.macroVal, { color }]}>{Math.round(val)}g</Text>
                  <Text style={s.macroLabel}>{label}</Text>
                  {goal != null && <Text style={s.macroGoal}>/ {goal}g</Text>}
                </View>
              ))}
            </View>
          </View>

          {/* Meal sections */}
          {MEALS.map(({ slot, label }) => {
            const entries = log?.meals[slot] ?? [];
            const mealCals = entries.reduce((sum, e) => sum + e.nutrition.calories, 0);
            const open = expanded[slot];
            return (
              <View key={slot} style={s.mealSection}>
                <TouchableOpacity
                  style={s.mealHeader}
                  onPress={() => setExpanded((prev) => ({ ...prev, [slot]: !prev[slot] }))}
                >
                  <Text style={s.mealLabel}>{label}</Text>
                  <Text style={s.mealCals}>{Math.round(mealCals)} kcal</Text>
                  <Text style={s.mealChevron}>{open ? '▾' : '▸'}</Text>
                </TouchableOpacity>
                {open && (
                  <>
                    {entries.map((entry) => (
                      <TouchableOpacity
                        key={entry.id}
                        style={s.foodRow}
                        onLongPress={() => handleDeleteEntry(entry)}
                      >
                        <View style={s.foodInfo}>
                          <Text style={s.foodName} numberOfLines={1}>{entry.food.name}</Text>
                          <Text style={s.foodServing}>
                            {entry.quantity} × {entry.servingSize.label}
                            {entry.food.brand ? ` · ${entry.food.brand}` : ''}
                          </Text>
                        </View>
                        <Text style={s.foodCals}>{Math.round(entry.nutrition.calories)}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={s.addFoodBtn} onPress={() => openAddFood(slot)}>
                      <Text style={s.addFoodBtnText}>+ Add food</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            );
          })}

          {/* Water */}
          <View style={s.waterSection}>
            <View style={s.waterHeader}>
              <Text style={s.mealLabel}>Water</Text>
              <Text style={s.mealCals}>{waterMl >= 1000 ? `${(waterMl / 1000).toFixed(1)}L` : `${waterMl}ml`} / {waterGoal >= 1000 ? `${(waterGoal / 1000).toFixed(1)}L` : `${waterGoal}ml`}</Text>
            </View>
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${waterPct * 100}%` as any, backgroundColor: '#60a5fa' }]} />
            </View>
            <View style={s.waterBtns}>
              {[250, 500, 750].map((ml) => (
                <TouchableOpacity key={ml} style={s.waterBtn} onPress={() => handleAddWater(ml)}>
                  <Text style={s.waterBtnText}>+{ml}ml</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Add Food Modal */}
      <Modal visible={addMeal !== null} animationType="slide" onRequestClose={() => setAddMeal(null)}>
        <SafeAreaView style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>
              Add to {MEALS.find((m) => m.slot === addMeal)?.label}
            </Text>
            <TouchableOpacity onPress={() => setAddMeal(null)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {selectedFood ? (
            /* Serving picker */
            <ScrollView style={s.modalBody}>
              <TouchableOpacity onPress={() => setSelectedFood(null)} style={s.backBtn}>
                <Text style={s.backBtnText}>← {selectedFood.name}</Text>
              </TouchableOpacity>
              <Text style={s.servingTitle}>Serving size</Text>
              {selectedFood.servingSizes.map((sv) => (
                <TouchableOpacity
                  key={sv.id}
                  style={[s.servingRow, selectedServing?.id === sv.id && s.servingRowActive]}
                  onPress={() => setSelectedServing(sv)}
                >
                  <Text style={[s.servingLabel, selectedServing?.id === sv.id && { color: colors.accent }]}>
                    {sv.label} ({sv.grams}g)
                  </Text>
                </TouchableOpacity>
              ))}
              <Text style={s.servingTitle}>Quantity</Text>
              <TextInput
                style={s.quantityInput}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
              {selectedServing && (
                <Text style={s.nutritionPreview}>
                  {Math.round(selectedFood.nutrition.calories * selectedServing.grams * parseFloat(quantity || '0') / 100)} kcal ·{' '}
                  P: {Math.round(selectedFood.nutrition.protein * selectedServing.grams * parseFloat(quantity || '0') / 100)}g ·{' '}
                  C: {Math.round(selectedFood.nutrition.carbs * selectedServing.grams * parseFloat(quantity || '0') / 100)}g ·{' '}
                  F: {Math.round(selectedFood.nutrition.fat * selectedServing.grams * parseFloat(quantity || '0') / 100)}g
                </Text>
              )}
              <TouchableOpacity style={s.confirmBtn} onPress={confirmAdd}>
                <Text style={s.confirmBtnText}>Add to log</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* Search */
            <>
              <View style={s.searchBox}>
                <TextInput
                  style={s.searchInput}
                  placeholder="Search foods…"
                  placeholderTextColor={colors.muted}
                  value={query}
                  onChangeText={handleSearch}
                  autoFocus
                  returnKeyType="search"
                />
                {searching && <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 8 }} />}
              </View>
              <FlatList
                data={results}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.resultRow} onPress={() => selectFood(item)}>
                    <View>
                      <Text style={s.resultName}>{item.name}</Text>
                      {item.brand && <Text style={s.resultBrand}>{item.brand}</Text>}
                    </View>
                    <Text style={s.resultCals}>{Math.round(item.nutrition.calories * (item.servingSizes.find((sv) => sv.isDefault)?.grams ?? 100) / 100)} kcal</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  query.length > 0 && !searching ? (
                    <Text style={s.emptyText}>No results for "{query}"</Text>
                  ) : null
                }
                keyboardShouldPersistTaps="handled"
              />
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  dateArrow: { paddingHorizontal: 20, paddingVertical: 6 },
  dateArrowText: { fontSize: 24, color: colors.muted },
  dateLabel: { fontSize: fontSize.base, fontWeight: '600', color: colors.text, minWidth: 90, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 14, gap: 12 },
  summaryCard: { backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 10 },
  calRow: { flexDirection: 'row', alignItems: 'baseline' },
  calActual: { fontSize: fontSize['2xl'], fontWeight: '700', color: colors.text },
  calSep: { fontSize: fontSize.base, color: colors.muted },
  calGoalText: { fontSize: fontSize.sm, color: colors.muted },
  progressBg: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around' },
  macroItem: { alignItems: 'center', gap: 1 },
  macroVal: { fontSize: fontSize.base, fontWeight: '600' },
  macroLabel: { fontSize: fontSize.xs, color: colors.muted },
  macroGoal: { fontSize: fontSize.xs, color: colors.border },
  mealSection: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  mealHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  mealLabel: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  mealCals: { fontSize: fontSize.xs, color: colors.muted, marginRight: 8 },
  mealChevron: { color: colors.muted, fontSize: 14 },
  foodRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  foodInfo: { flex: 1, marginRight: 8 },
  foodName: { fontSize: fontSize.sm, color: colors.text },
  foodServing: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },
  foodCals: { fontSize: fontSize.sm, color: colors.muted },
  addFoodBtn: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 12, paddingHorizontal: 14 },
  addFoodBtnText: { fontSize: fontSize.sm, color: colors.accent },
  waterSection: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  waterHeader: { flexDirection: 'row', alignItems: 'center' },
  waterBtns: { flexDirection: 'row', gap: 8 },
  waterBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  waterBtnText: { fontSize: fontSize.sm, color: colors.muted },
  // Modal
  modal: { flex: 1, backgroundColor: colors.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  modalClose: { fontSize: 20, color: colors.muted, paddingLeft: 12 },
  modalBody: { flex: 1, padding: 16 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 14 },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: fontSize.base, color: colors.text },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultName: { fontSize: fontSize.sm, color: colors.text },
  resultBrand: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },
  resultCals: { marginLeft: 'auto', fontSize: fontSize.sm, color: colors.muted },
  emptyText: { textAlign: 'center', marginTop: 40, color: colors.muted, fontSize: fontSize.sm },
  backBtn: { paddingVertical: 12 },
  backBtnText: { color: colors.accent, fontSize: fontSize.sm },
  servingTitle: { fontSize: fontSize.xs, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 16, marginBottom: 6 },
  servingRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  servingRowActive: { backgroundColor: 'rgba(212,168,67,0.08)' },
  servingLabel: { fontSize: fontSize.sm, color: colors.text },
  quantityInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, fontSize: fontSize.base, color: colors.text, backgroundColor: colors.card },
  nutritionPreview: { fontSize: fontSize.xs, color: colors.muted, marginTop: 12, textAlign: 'center' },
  confirmBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  confirmBtnText: { fontSize: fontSize.base, fontWeight: '700', color: colors.bg },
});
