import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import {
  getDailyLog, addLogEntry, deleteNutritionLogEntry, moveLogEntry, copyLogEntry, addWater,
  searchFoods, searchRecipes, getRecipeByBarcode, getFoodByBarcode, logRecipeToNutrition,
  getDailyHistory, createRecipeFromBarcode,
  type DailyLog, type NutritionLogEntry, type MealSlot, type Food, type ServingSize,
  type RecipeSearchResult, type DailyHistoryEntry,
} from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';
import { useSwipeNav } from '../../../src/hooks/useSwipeNav';

const MEALS: { slot: MealSlot; label: string }[] = [
  { slot: 'breakfast', label: 'Breakfast' },
  { slot: 'lunch', label: 'Lunch' },
  { slot: 'dinner', label: 'Dinner' },
  { slot: 'snack', label: 'Snack' },
];

type ModalView = 'search' | 'food-pick' | 'recipe-pick' | 'scanning';

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(dateStr: string) {
  const today = toDateStr(new Date());
  const yesterday = toDateStr(new Date(Date.now() - 86400000));
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Nutrition bar charts ─────────────────────────────────────────────────────

function MiniBarChart({ data, dataKey, label, icon, color, goal, cardW, ch }: {
  data: DailyHistoryEntry[];
  dataKey: 'calories' | 'proteinG';
  label: string;
  icon: string;
  color: string;
  goal?: number | null;
  cardW: number;
  ch: ReturnType<typeof makeChStyles>;
}) {
  const BAR_W = 5;
  const GAP = 2;
  const chartH = 60;
  const maxVal = Math.max(...data.map((d) => d[dataKey] ?? 0), goal ?? 0, 1);
  const scrollRef = useRef<ScrollView>(null);

  return (
    <View style={[ch.card, { width: cardW }]}>
      <View style={ch.header}>
        <Text style={ch.icon}>{icon}</Text>
        <Text style={[ch.label, { color }]}>{label}</Text>
        {goal != null && <Text style={ch.goal}>/{goal}</Text>}
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ height: chartH }}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'flex-end', height: chartH, gap: GAP, paddingBottom: 2 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {data.map((entry) => {
          const val = entry[dataKey] ?? 0;
          if (val === 0) {
            return <View key={entry.date} style={{ width: BAR_W, height: 2, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 }} />;
          }
          const pct = Math.min(val / maxVal, 1);
          const barH = Math.max(pct * (chartH - 2), 4);
          const over = goal ? val > goal : false;
          const dim = goal ? val / goal < 0.85 : false;
          const barColor = over ? '#f87171' : dim ? `${color}55` : color;
          return (
            <View
              key={entry.date}
              style={{ width: BAR_W, height: barH, backgroundColor: barColor, borderRadius: 2 }}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function NutritionHistoryCharts({ calorieGoal, proteinGoal, token }: {
  calorieGoal?: number | null;
  proteinGoal?: number | null;
  token: string;
}) {
  const c = useColors();
  const ch = makeChStyles(c);
  const [data, setData] = useState<DailyHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    getDailyHistory(token, fmt(start), fmt(end))
      .then((raw) => {
        const byDate = new Map(raw.map((d) => [d.date, d]));
        const filled: DailyHistoryEntry[] = [];
        for (let i = 0; i < 30; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const key = fmt(d);
          filled.push(byDate.get(key) ?? { date: key, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, entryCount: 0 });
        }
        setData(filled);
      })
      .catch(() => setError(true))
      .finally(() => setLoaded(true));
  }, [token]);

  if (!loaded) return (
    <View style={ch.row}>
      {['Calories', 'Protein'].map((l) => (
        <View key={l} style={ch.card}><Text style={{ fontSize: fontSize.xs, color: c.muted }}>Loading…</Text></View>
      ))}
    </View>
  );

  if (error) return (
    <View style={ch.row}>
      {['Calories', 'Protein'].map((l) => (
        <View key={l} style={[ch.card, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: fontSize.xs, color: c.muted }}>No data</Text>
        </View>
      ))}
    </View>
  );

  return (
    <NutritionChartRow calorieGoal={calorieGoal} proteinGoal={proteinGoal} data={data} ch={ch} />
  );
}

function NutritionChartRow({ calorieGoal, proteinGoal, data, ch }: { calorieGoal?: number | null; proteinGoal?: number | null; data: DailyHistoryEntry[]; ch: ReturnType<typeof makeChStyles> }) {
  const { width } = useWindowDimensions();
  const cardW = (width - 28 - 8) / 2; // 14px padding each side, 8px gap
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <MiniBarChart data={data} dataKey="calories" label="Calories" icon="🔥" color="#60a5fa" goal={calorieGoal} cardW={cardW} ch={ch} />
      <MiniBarChart data={data} dataKey="proteinG" label="Protein" icon="💪" color="#818cf8" goal={proteinGoal} cardW={cardW} ch={ch} />
    </View>
  );
}

function makeChStyles(c: Colors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: 8 },
    card: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 10, height: 110 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
    icon: { fontSize: 12 },
    label: { fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, flex: 1 },
    goal: { fontSize: fontSize.xs, color: c.muted },
  });
}

export default function NutritionScreen() {
  const token = useAuthStore((s) => s.token)!;
  const c = useColors();
  const router = useRouter();
  const [date, setDate] = useState(toDateStr(new Date()));
  const [log, setLog] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Record<MealSlot, boolean>>({ breakfast: true, lunch: true, dinner: true, snack: true });
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);

  // Move/copy modal state
  const [moveCopyEntry, setMoveCopyEntry] = useState<NutritionLogEntry | null>(null);
  const [moveCopyMode, setMoveCopyMode] = useState<'move' | 'copy'>('move');
  const [targetMeal, setTargetMeal] = useState<MealSlot>('breakfast');
  const [targetDate, setTargetDate] = useState(toDateStr(new Date()));
  const [savingMoveCopy, setSavingMoveCopy] = useState(false);

  // Add food modal state
  const [addMeal, setAddMeal] = useState<MealSlot | null>(null);
  const [modalView, setModalView] = useState<ModalView>('search');

  // Food search
  const [query, setQuery] = useState('');
  const [foodResults, setFoodResults] = useState<Food[]>([]);
  const [recipeResults, setRecipeResults] = useState<RecipeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Food pick
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedServing, setSelectedServing] = useState<ServingSize | null>(null);
  const [quantity, setQuantity] = useState('1');

  // Recipe pick
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSearchResult | null>(null);
  const [recipeServings, setRecipeServings] = useState('1');
  const [addingRecipe, setAddingRecipe] = useState(false);

  // Barcode scanner
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  // Pending barcode: set after scanning finds a food (not a recipe) so we can offer Save as Recipe
  const pendingBarcodeRef = useRef<{ barcode: string; foodName: string } | null>(null);
  const swipe = useSwipeNav(1);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getDailyLog(token, date);
      setLog(data);
    } catch {
      Alert.alert('Error', 'Could not load nutrition log.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, date]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getDailyLog(token, date);
      setLog(data);
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  }, [token, date]);

  function shiftDate(days: number) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(toDateStr(d));
  }

  function handleSearch(text: string) {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) { setFoodResults([]); setRecipeResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const [foods, recipes] = await Promise.all([
          searchFoods(token, text.trim()).catch(() => [] as Food[]),
          searchRecipes(token, text.trim()).catch(() => [] as RecipeSearchResult[]),
        ]);
        setFoodResults(foods);
        setRecipeResults(recipes);
      } finally {
        setSearching(false);
      }
    }, 400);
  }

  function openAddFood(meal: MealSlot) {
    setAddMeal(meal);
    setModalView('search');
    setQuery('');
    setFoodResults([]);
    setRecipeResults([]);
    setSelectedFood(null);
    setSelectedServing(null);
    setQuantity('1');
    setSelectedRecipe(null);
    setRecipeServings('1');
    scannedRef.current = false;
  }

  async function openAddFoodScan(meal: MealSlot) {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Camera permission required', 'Please allow camera access to scan barcodes.');
        return;
      }
    }
    setAddMeal(meal);
    setModalView('scanning');
    setQuery('');
    setFoodResults([]);
    setRecipeResults([]);
    setSelectedFood(null);
    setSelectedServing(null);
    setQuantity('1');
    setSelectedRecipe(null);
    setRecipeServings('1');
    scannedRef.current = false;
  }

  function selectFood(food: Food) {
    setSelectedFood(food);
    const def = food.servingSizes.find((s) => s.isDefault) ?? food.servingSizes[0] ?? null;
    setSelectedServing(def);
    setQuantity('1');
    setModalView('food-pick');
  }

  function selectRecipe(recipe: RecipeSearchResult) {
    setSelectedRecipe(recipe);
    setRecipeServings('1');
    setModalView('recipe-pick');
  }

  async function openScanner() {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Camera permission required', 'Please allow camera access to scan barcodes.');
        return;
      }
    }
    scannedRef.current = false;
    setModalView('scanning');
  }

  async function handleBarcodeScan(barcode: string) {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setModalView('search');

    try {
      const [recipe, food] = await Promise.all([
        getRecipeByBarcode(token, barcode).catch(() => null),
        getFoodByBarcode(token, barcode).catch(() => null),
      ]);
      if (recipe) {
        selectRecipe(recipe);
      } else if (food) {
        selectFood(food);
        // Offer to save this food as a reusable prepackaged recipe
        const foodName = food.brand ? `${food.name} (${food.brand})` : food.name;
        pendingBarcodeRef.current = { barcode, foodName };
        Alert.alert(
          'Save as Recipe?',
          `Save "${foodName}" as a prepackaged recipe in your library?`,
          [
            {
              text: 'Save',
              onPress: async () => {
                try {
                  const result = await createRecipeFromBarcode(token, { barcode });
                  if ('recipeId' in result && result.created) {
                    setAddMeal(null);
                    router.push(`/(app)/recipe/edit?id=${result.recipeId}`);
                  }
                } catch { /* ignore */ }
                pendingBarcodeRef.current = null;
              },
            },
            { text: 'Not now', style: 'cancel', onPress: () => { pendingBarcodeRef.current = null; } },
          ]
        );
      } else {
        // Barcode not recognized — prompt for product name so AI can estimate nutrition
        Alert.prompt(
          'Product not found',
          'Enter the product name to create a recipe with estimated nutrition:',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => { scannedRef.current = false; } },
            {
              text: 'Create Recipe',
              onPress: async (name?: string) => {
                if (!name?.trim()) { scannedRef.current = false; return; }
                try {
                  const result = await createRecipeFromBarcode(token, { barcode, name: name.trim() });
                  if ('recipeId' in result) {
                    setAddMeal(null);
                    router.push(`/(app)/recipe/edit?id=${result.recipeId}`);
                  }
                } catch (e: any) {
                  Alert.alert('Error', e.message || 'Could not create recipe.');
                }
                scannedRef.current = false;
              },
            },
          ],
          'plain-text'
        );
      }
    } catch {
      Alert.alert('Error', 'Could not look up barcode.');
      scannedRef.current = false;
    }
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

  async function confirmAddRecipe() {
    if (!addMeal || !selectedRecipe) return;
    const qty = parseFloat(recipeServings);
    if (!qty || qty <= 0) { Alert.alert('Invalid servings'); return; }
    setAddingRecipe(true);
    try {
      await logRecipeToNutrition(token, {
        recipeId: selectedRecipe.id,
        meal: addMeal,
        servings: qty,
        logDate: date,
      });
      setAddMeal(null);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not log recipe.');
    } finally {
      setAddingRecipe(false);
    }
  }

  function handleEntryAction(entry: NutritionLogEntry, currentMeal: MealSlot) {
    Alert.alert(entry.food.name, undefined, [
      {
        text: 'Move to…',
        onPress: () => {
          setMoveCopyMode('move');
          setMoveCopyEntry(entry);
          setTargetMeal(currentMeal);
          setTargetDate(date);
        },
      },
      {
        text: 'Copy to…',
        onPress: () => {
          setMoveCopyMode('copy');
          setMoveCopyEntry(entry);
          setTargetMeal(currentMeal);
          setTargetDate(date);
        },
      },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try { await deleteNutritionLogEntry(token, entry.id); load(); }
          catch { Alert.alert('Error', 'Could not remove entry.'); }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function confirmMoveCopy() {
    if (!moveCopyEntry) return;
    setSavingMoveCopy(true);
    try {
      if (moveCopyMode === 'move') {
        await moveLogEntry(token, moveCopyEntry.id, targetMeal, targetDate);
      } else {
        await copyLogEntry(token, moveCopyEntry, targetMeal, targetDate);
      }
      setMoveCopyEntry(null);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save.');
    } finally {
      setSavingMoveCopy(false);
    }
  }

  async function handleAddWater(oz: number) {
    const savedY = scrollYRef.current;
    try {
      await addWater(token, date, oz);
      await load(true);
      scrollRef.current?.scrollTo({ y: savedY, animated: false });
    }
    catch { Alert.alert('Error', 'Could not log water.'); }
  }

  const goals = log?.goals;
  const totals = log?.totals ?? { calories: 0, carbs: 0, protein: 0, fat: 0 };
  const calGoal = goals?.calories ?? 2000;
  const calPct = Math.min(totals.calories / calGoal, 1);
  const waterOz = log?.waterTotalOz ?? 0;
  const waterGoalOz = goals?.waterGoalOz ?? 64;
  const waterPct = Math.min(waterOz / waterGoalOz, 1);
  const waterGlasses = (waterOz / 8).toFixed(1);
  const waterGoalGlasses = Math.round(waterGoalOz / 8);

  const mealLabel = MEALS.find((m) => m.slot === addMeal)?.label ?? '';
  const s = makeStyles(c);

  return (
    <SafeAreaView style={s.container} {...swipe.panHandlers}>
      {/* Page header with inline date nav */}
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Food Log</Text>
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
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        >
          {/* Summary card */}
          <View style={s.summaryCard}>
            <View style={s.calRow}>
              <Text style={s.calActual}>{Math.round(totals.calories)}</Text>
              <Text style={s.calSep}> / </Text>
              <Text style={s.calGoalText}>{calGoal} kcal</Text>
            </View>
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${calPct * 100}%` as any, backgroundColor: calPct >= 1 ? c.error : c.accent }]} />
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

          {/* 30-day history charts */}
          <NutritionHistoryCharts
            calorieGoal={goals?.calories}
            proteinGoal={goals?.proteinG}
            token={token}
          />

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
                        onLongPress={() => handleEntryAction(entry, slot)}
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
                    <View style={s.addFoodBtn}>
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => openAddFood(slot)}>
                        <Text style={s.addFoodBtnText}>+ Add food</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => openAddFoodScan(slot)} style={s.addFoodScanBtn}>
                        <Text style={s.addFoodScanIcon}>⊡</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            );
          })}

          {/* Water */}
          <View style={s.waterSection}>
            <View style={s.waterHeader}>
              <Text style={s.mealLabel}>Water</Text>
              <Text style={s.mealCals}>{waterGlasses} / {waterGoalGlasses} glasses</Text>
            </View>
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${waterPct * 100}%` as any, backgroundColor: '#60a5fa' }]} />
            </View>
            <View style={s.waterBtns}>
              <TouchableOpacity style={s.waterBtn} onPress={() => handleAddWater(8)}>
                <Text style={s.waterBtnText}>+ glass (8oz)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.waterBtn} onPress={() => handleAddWater(20)}>
                <Text style={s.waterBtnText}>+ bottle (20oz)</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Move / Copy Modal */}
      <Modal visible={moveCopyEntry !== null} animationType="slide" transparent onRequestClose={() => setMoveCopyEntry(null)}>
        <View style={s.moveCopyOverlay}>
          <View style={s.moveCopySheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{moveCopyMode === 'move' ? 'Move' : 'Copy'} to…</Text>
              <TouchableOpacity onPress={() => setMoveCopyEntry(null)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              <Text style={s.moveCopySection}>Meal</Text>
              <View style={s.mealGrid}>
                {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[s.mealChip, targetMeal === m && s.mealChipActive]}
                    onPress={() => setTargetMeal(m)}
                  >
                    <Text style={[s.mealChipText, targetMeal === m && s.mealChipTextActive]}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.moveCopySection}>Date</Text>
              <View style={s.dateChipRow}>
                {[-1, 0, 1].map((offset) => {
                  const d = toDateStr(new Date(Date.now() + offset * 86400000));
                  const label = offset === -1 ? 'Yesterday' : offset === 0 ? 'Today' : 'Tomorrow';
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[s.dateChip, targetDate === d && s.mealChipActive]}
                      onPress={() => setTargetDate(d)}
                    >
                      <Text style={[s.mealChipText, targetDate === d && s.mealChipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={[s.confirmBtn, { marginTop: 16 }, savingMoveCopy && { opacity: 0.6 }]}
                onPress={confirmMoveCopy}
                disabled={savingMoveCopy}
              >
                <Text style={s.confirmBtnText}>{savingMoveCopy ? 'Saving…' : moveCopyMode === 'move' ? 'Move' : 'Copy'}</Text>
              </TouchableOpacity>
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Food Modal */}
      <Modal visible={addMeal !== null} animationType="slide" onRequestClose={() => setAddMeal(null)}>
        <SafeAreaView style={s.modal}>
          {/* Scanner view */}
          {modalView === 'scanning' ? (
            <>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Scan Barcode</Text>
                <TouchableOpacity onPress={() => setModalView('search')}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={s.scannerContainer}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
                  onBarcodeScanned={(result) => handleBarcodeScan(result.data)}
                />
                <View style={s.scannerOverlay}>
                  <View style={s.scannerFrame} />
                  <Text style={s.scannerHint}>Point at a barcode to scan</Text>
                </View>
              </View>
            </>
          ) : modalView === 'recipe-pick' && selectedRecipe ? (
            /* Recipe serving picker */
            <>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Add to {mealLabel}</Text>
                <TouchableOpacity onPress={() => setAddMeal(null)}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={s.modalBody}>
                <TouchableOpacity onPress={() => setModalView('search')} style={s.backBtn}>
                  <Text style={s.backBtnText}>← {selectedRecipe.name}</Text>
                </TouchableOpacity>
                <Text style={s.servingTitle}>Servings</Text>
                <TextInput
                  style={s.quantityInput}
                  value={recipeServings}
                  onChangeText={setRecipeServings}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                {selectedRecipe.calories != null && (
                  <Text style={s.nutritionPreview}>
                    {Math.round(selectedRecipe.calories * parseFloat(recipeServings || '0'))} kcal
                    {selectedRecipe.protein_g != null ? ` · P: ${Math.round(selectedRecipe.protein_g * parseFloat(recipeServings || '0'))}g` : ''}
                    {selectedRecipe.carbs_g != null ? ` · C: ${Math.round(selectedRecipe.carbs_g * parseFloat(recipeServings || '0'))}g` : ''}
                    {selectedRecipe.fat_g != null ? ` · F: ${Math.round(selectedRecipe.fat_g * parseFloat(recipeServings || '0'))}g` : ''}
                  </Text>
                )}
                <TouchableOpacity
                  style={[s.confirmBtn, addingRecipe && { opacity: 0.6 }]}
                  onPress={confirmAddRecipe}
                  disabled={addingRecipe}
                >
                  <Text style={s.confirmBtnText}>{addingRecipe ? 'Adding…' : `Add to ${mealLabel}`}</Text>
                </TouchableOpacity>
              </ScrollView>
            </>
          ) : modalView === 'food-pick' && selectedFood ? (
            /* Food serving picker */
            <>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Add to {mealLabel}</Text>
                <TouchableOpacity onPress={() => setAddMeal(null)}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={s.modalBody}>
                <TouchableOpacity onPress={() => setModalView('search')} style={s.backBtn}>
                  <Text style={s.backBtnText}>← {selectedFood.name}</Text>
                </TouchableOpacity>
                <Text style={s.servingTitle}>Serving size</Text>
                {selectedFood.servingSizes.map((sv) => (
                  <TouchableOpacity
                    key={sv.id}
                    style={[s.servingRow, selectedServing?.id === sv.id && s.servingRowActive]}
                    onPress={() => setSelectedServing(sv)}
                  >
                    <Text style={[s.servingLabel, selectedServing?.id === sv.id && { color: c.accent }]}>
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
            </>
          ) : (
            /* Search view */
            <>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Add to {mealLabel}</Text>
                <TouchableOpacity onPress={() => setAddMeal(null)}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={s.searchBox}>
                <TextInput
                  style={s.searchInput}
                  placeholder="Search foods…"
                  placeholderTextColor={c.muted}
                  value={query}
                  onChangeText={handleSearch}
                  autoFocus
                  returnKeyType="search"
                />
                {searching
                  ? <ActivityIndicator size="small" color={c.accent} style={{ marginRight: 4 }} />
                  : null
                }
                <TouchableOpacity onPress={openScanner} style={s.scanBtn}>
                  <Text style={s.scanBtnText}>📷</Text>
                </TouchableOpacity>
              </View>

              {recipeResults.length === 0 && foodResults.length === 0 && query.length === 0 ? (
                <View style={s.emptyState}>
                  <Text style={s.emptyText}>Search by name or scan a barcode</Text>
                </View>
              ) : (
                <FlatList
                  data={[
                    ...recipeResults.map((r) => ({ type: 'recipe' as const, item: r })),
                    ...foodResults.map((f) => ({ type: 'food' as const, item: f })),
                  ]}
                  keyExtractor={(entry) => `${entry.type}-${entry.item.id}`}
                  ListHeaderComponent={
                    recipeResults.length > 0 && foodResults.length > 0 ? null : null
                  }
                  renderItem={({ item: entry, index }) => {
                    const showRecipeHeader = index === 0 && recipeResults.length > 0;
                    const showFoodHeader = entry.type === 'food' && (index === 0 || (index > 0 && recipeResults.length > 0 && index === recipeResults.length));

                    if (entry.type === 'recipe') {
                      const r = entry.item as RecipeSearchResult;
                      return (
                        <>
                          {showRecipeHeader && (
                            <Text style={s.sectionHeader}>My Recipes</Text>
                          )}
                          <TouchableOpacity style={s.resultRow} onPress={() => selectRecipe(r)}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.resultName}>{r.name}</Text>
                              {r.servings != null && <Text style={s.resultBrand}>per serving</Text>}
                            </View>
                            <Text style={s.resultCals}>{r.calories != null ? `${Math.round(r.calories)} kcal` : '—'}</Text>
                          </TouchableOpacity>
                        </>
                      );
                    } else {
                      const f = entry.item as Food;
                      const defServing = f.servingSizes.find((sv) => sv.isDefault) ?? f.servingSizes[0];
                      return (
                        <>
                          {showFoodHeader && <Text style={s.sectionHeader}>Foods</Text>}
                          <TouchableOpacity style={s.resultRow} onPress={() => selectFood(f)}>
                            <View>
                              <Text style={s.resultName}>{f.name}</Text>
                              {f.brand && <Text style={s.resultBrand}>{f.brand}</Text>}
                            </View>
                            <Text style={s.resultCals}>
                              {Math.round(f.nutrition.calories * (defServing?.grams ?? 100) / 100)} kcal
                            </Text>
                          </TouchableOpacity>
                        </>
                      );
                    }
                  }}
                  ListEmptyComponent={
                    query.length > 0 && !searching ? (
                      <Text style={s.emptyText}>No results for "{query}"</Text>
                    ) : null
                  }
                  keyboardShouldPersistTaps="handled"
                />
              )}
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    pageHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    pageTitle: { flex: 1, fontSize: fontSize.xl, fontWeight: '700', color: c.text },
    dateNav: { flexDirection: 'row', alignItems: 'center' },
    dateArrow: { paddingHorizontal: 8, paddingVertical: 4 },
    dateArrowText: { fontSize: 24, color: c.muted },
    dateLabel: { fontSize: fontSize.sm, fontWeight: '600', color: c.text, minWidth: 72, textAlign: 'center' },
    scroll: { flex: 1 },
    scrollContent: { padding: 14, gap: 12 },
    summaryCard: { backgroundColor: c.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, gap: 10 },
    calRow: { flexDirection: 'row', alignItems: 'baseline' },
    calActual: { fontSize: fontSize['2xl'], fontWeight: '700', color: c.text },
    calSep: { fontSize: fontSize.base, color: c.muted },
    calGoalText: { fontSize: fontSize.sm, color: c.muted },
    progressBg: { height: 6, backgroundColor: c.border, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: 6, borderRadius: 3 },
    macroRow: { flexDirection: 'row', justifyContent: 'space-around' },
    macroItem: { alignItems: 'center', gap: 1 },
    macroVal: { fontSize: fontSize.base, fontWeight: '600' },
    macroLabel: { fontSize: fontSize.xs, color: c.text },
    macroGoal: { fontSize: fontSize.xs, color: c.muted },
    mealSection: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    mealHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    mealLabel: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: c.text },
    mealCals: { fontSize: fontSize.xs, color: c.muted, marginRight: 8 },
    mealChevron: { color: c.muted, fontSize: 14 },
    foodRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
    foodInfo: { flex: 1, marginRight: 8 },
    foodName: { fontSize: fontSize.sm, color: c.text },
    foodServing: { fontSize: fontSize.xs, color: c.muted, marginTop: 1 },
    foodCals: { fontSize: fontSize.sm, color: c.muted },
    addFoodBtn: { borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
    addFoodBtnText: { fontSize: fontSize.sm, color: c.accent },
    addFoodScanBtn: { paddingLeft: 12, paddingVertical: 2 },
    addFoodScanIcon: { fontSize: 20, color: c.muted },
    waterSection: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10 },
    waterHeader: { flexDirection: 'row', alignItems: 'center' },
    waterBtns: { flexDirection: 'row', gap: 8 },
    waterBtn: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
    waterBtnText: { fontSize: fontSize.sm, color: c.muted },
    // Modal
    modal: { flex: 1, backgroundColor: c.bg },
    modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    modalTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: '700', color: c.text },
    modalClose: { fontSize: 20, color: c.muted, paddingLeft: 12 },
    modalBody: { flex: 1, padding: 16 },
    searchBox: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 14 },
    searchInput: { flex: 1, paddingVertical: 14, fontSize: fontSize.base, color: c.text },
    scanBtn: { padding: 8 },
    scanBtnText: { fontSize: 22 },
    sectionHeader: { fontSize: fontSize.xs, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
    resultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    resultName: { fontSize: fontSize.sm, color: c.text },
    resultBrand: { fontSize: fontSize.xs, color: c.muted, marginTop: 1 },
    resultCals: { marginLeft: 'auto', fontSize: fontSize.sm, color: c.muted },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyText: { textAlign: 'center', color: c.muted, fontSize: fontSize.sm },
    backBtn: { paddingVertical: 12 },
    backBtnText: { color: c.accent, fontSize: fontSize.sm },
    servingTitle: { fontSize: fontSize.xs, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 16, marginBottom: 6 },
    servingRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    servingRowActive: { backgroundColor: 'rgba(212,168,67,0.08)' },
    servingLabel: { fontSize: fontSize.sm, color: c.text },
    quantityInput: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, fontSize: fontSize.base, color: c.text, backgroundColor: c.card },
    nutritionPreview: { fontSize: fontSize.xs, color: c.muted, marginTop: 12, textAlign: 'center' },
    confirmBtn: { backgroundColor: c.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    confirmBtnText: { fontSize: fontSize.base, fontWeight: '700', color: c.bg },
    // Move/Copy modal
    moveCopyOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    moveCopySheet: { backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
    moveCopySection: { fontSize: fontSize.xs, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
    mealGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    mealChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: c.border },
    mealChipActive: { backgroundColor: c.accent, borderColor: c.accent },
    mealChipText: { fontSize: fontSize.sm, color: c.text },
    mealChipTextActive: { color: c.bg, fontWeight: '700' },
    dateChipRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    dateChip: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
    // Scanner
    scannerContainer: { flex: 1, position: 'relative' },
    scannerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    scannerFrame: { width: 240, height: 160, borderWidth: 2, borderColor: c.accent, borderRadius: 12 },
    scannerHint: { marginTop: 16, color: 'white', fontSize: fontSize.sm, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  });
}
