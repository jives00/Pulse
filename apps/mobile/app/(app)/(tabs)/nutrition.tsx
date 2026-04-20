import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  getDailyLog, addLogEntry, deleteNutritionLogEntry, moveLogEntry, copyLogEntry,
  editNutritionLogEntry, getFoodById, addWater,
  searchFoods, searchRecipes, getRecipeByBarcode, getFoodByBarcode, logRecipeToNutrition,
  type DailyLog, type NutritionLogEntry, type MealSlot, type Food, type ServingSize,
  type RecipeSearchResult,
} from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';
import { useSwipeNav } from '../../../src/hooks/useSwipeNav';
import { localDateStr } from '../../../../../packages/api-client/src/index';

// TextInput that always shows the start of its value when unfocused (not scrolled to the end)
function StartAlignedInput({ style, value, onChangeText, placeholder, placeholderTextColor }: {
  style?: any; value: string; onChangeText: (v: string) => void;
  placeholder?: string; placeholderTextColor?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      style={style}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      scrollEnabled={false}
      selection={focused ? undefined : { start: 0, end: 0 }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

const MEALS: { slot: MealSlot; label: string }[] = [
  { slot: 'breakfast', label: 'Breakfast' },
  { slot: 'lunch', label: 'Lunch' },
  { slot: 'dinner', label: 'Dinner' },
  { slot: 'snack', label: 'Snack' },
];

type ModalView = 'search' | 'food-pick' | 'recipe-pick' | 'barcode-queue' | 'barcode-review';

type BarcodeQueueItem = {
  key: string;
  type: 'recipe' | 'food';
  recipe?: RecipeSearchResult;
  food?: Food;
  serving?: ServingSize;
  quantity: string;
  editName: string;
  editCalories: string;
  editProtein: string;
  editCarbs: string;
  editFat: string;
};

function formatDate(dateStr: string) {
  const today = localDateStr();
  const yesterday = localDateStr(new Date(Date.now() - 86400000));
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}


export default function NutritionScreen() {
  const token = useAuthStore((s) => s.token)!;
  const c = useColors();
  const [date, setDate] = useState(localDateStr(new Date()));
  const [log, setLog] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Record<MealSlot, boolean>>({ breakfast: true, lunch: true, dinner: true, snack: true });
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMeal, setSelectMeal] = useState<MealSlot | null>(null); // which meal is in select mode

  // Move/copy modal state (works for multi-select)
  const [moveCopyEntries, setMoveCopyEntries] = useState<NutritionLogEntry[]>([]);
  const [moveCopyMode, setMoveCopyMode] = useState<'move' | 'copy'>('move');
  const [targetMeal, setTargetMeal] = useState<MealSlot>('breakfast');
  const [targetDate, setTargetDate] = useState(localDateStr(new Date()));
  const [savingMoveCopy, setSavingMoveCopy] = useState(false);

  // Single-entry action sheet state
  const [actionEntry, setActionEntry] = useState<{ entry: NutritionLogEntry; meal: MealSlot } | null>(null);

  // Edit entry modal state
  const [editEntry, setEditEntry] = useState<NutritionLogEntry | null>(null);
  const [editServingSizes, setEditServingSizes] = useState<ServingSize[]>([]);
  const [editServing, setEditServing] = useState<ServingSize | null>(null);
  const [editQuantity, setEditQuantity] = useState('1');
  const [loadingEditServings, setLoadingEditServings] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

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
  const [barcodeQueue, setBarcodeQueue] = useState<BarcodeQueueItem[]>([]);
  const [scanningActive, setScanningActive] = useState(false);
  const [barcodeScanning, setBarcodeScanning] = useState(false); // lookup in-flight
  const swipe = useSwipeNav(2);

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
    setDate(localDateStr(d));
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
    setModalView('barcode-queue');
    setQuery('');
    setFoodResults([]);
    setRecipeResults([]);
    setSelectedFood(null);
    setSelectedServing(null);
    setQuantity('1');
    setSelectedRecipe(null);
    setRecipeServings('1');
    setBarcodeQueue([]);
    setScanningActive(true);
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
    setBarcodeQueue([]);
    setScanningActive(true);
    setModalView('barcode-queue');
  }

  async function handleBarcodeScan(barcode: string) {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanningActive(false);
    setBarcodeScanning(true);

    try {
      const [recipe, food] = await Promise.all([
        getRecipeByBarcode(token, barcode).catch(() => null),
        getFoodByBarcode(token, barcode).catch(() => null),
      ]);
      if (recipe) {
        const item: BarcodeQueueItem = {
          key: `${Date.now()}-${Math.random()}`,
          type: 'recipe',
          recipe,
          quantity: '1',
          editName: recipe.name,
          editCalories: recipe.calories != null ? String(Math.round(recipe.calories)) : '',
          editProtein: recipe.protein_g != null ? String(Math.round(recipe.protein_g)) : '',
          editCarbs: recipe.carbs_g != null ? String(Math.round(recipe.carbs_g)) : '',
          editFat: recipe.fat_g != null ? String(Math.round(recipe.fat_g)) : '',
        };
        setBarcodeQueue((q) => [...q, item]);
        scannedRef.current = false;
        setScanningActive(true);
      } else if (food) {
        const def = food.servingSizes.find((s) => s.isDefault) ?? food.servingSizes[0] ?? undefined;
        const item: BarcodeQueueItem = {
          key: `${Date.now()}-${Math.random()}`,
          type: 'food',
          food,
          serving: def,
          quantity: '1',
          editName: food.name,
          editCalories: def ? String(Math.round(food.nutrition.calories * def.grams / 100)) : '',
          editProtein: def ? String(Math.round(food.nutrition.protein * def.grams / 100)) : '',
          editCarbs: def ? String(Math.round(food.nutrition.carbs * def.grams / 100)) : '',
          editFat: def ? String(Math.round(food.nutrition.fat * def.grams / 100)) : '',
        };
        setBarcodeQueue((q) => [...q, item]);
        scannedRef.current = false;
        setScanningActive(true);
      } else {
        Alert.alert('Barcode not recognized', 'No food found for this barcode.');
        scannedRef.current = false;
        setScanningActive(true);
      }
    } catch {
      Alert.alert('Error', 'Could not look up barcode.');
      scannedRef.current = false;
      setScanningActive(true);
    } finally {
      setBarcodeScanning(false);
    }
  }

  function updateQueueItem(key: string, patch: Partial<BarcodeQueueItem>) {
    setBarcodeQueue((q) => q.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  function removeQueueItem(key: string) {
    setBarcodeQueue((q) => q.filter((item) => item.key !== key));
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

  async function confirmAddAll() {
    if (!addMeal || barcodeQueue.length === 0) return;
    const validItems = barcodeQueue.filter((item) => {
      const qty = parseFloat(item.quantity);
      return qty > 0;
    });
    if (validItems.length === 0) { Alert.alert('No valid items', 'Enter a quantity greater than 0 for at least one item.'); return; }
    setAddingRecipe(true);
    try {
      await Promise.all(validItems.map((item) => {
        const qty = parseFloat(item.quantity);
        if (item.type === 'recipe' && item.recipe) {
          return logRecipeToNutrition(token, {
            recipeId: item.recipe.id,
            meal: addMeal!,
            servings: qty,
            logDate: date,
          });
        } else if (item.type === 'food' && item.food && item.serving) {
          return addLogEntry(token, {
            logDate: date,
            meal: addMeal!,
            foodId: item.food.id,
            servingSizeId: item.serving.id,
            quantity: qty,
          });
        }
        return Promise.resolve();
      }));
      setAddMeal(null);
      setBarcodeQueue([]);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not add items.');
    } finally {
      setAddingRecipe(false);
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectMeal(null);
  }

  function handleEntryLongPress(entry: NutritionLogEntry, currentMeal: MealSlot) {
    // Enter select mode for this meal
    setSelectMeal(currentMeal);
    setSelectedIds(new Set([entry.id]));
  }

  function handleEntryTap(entry: NutritionLogEntry, currentMeal: MealSlot) {
    if (selectMeal !== currentMeal) return; // not in select mode for this meal
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entry.id)) { next.delete(entry.id); } else { next.add(entry.id); }
      if (next.size === 0) { setSelectMeal(null); }
      return next;
    });
  }

  function openMoveCopyForSelected(mode: 'move' | 'copy', currentMeal: MealSlot) {
    const entries = (log?.meals[currentMeal] ?? []).filter((e) => selectedIds.has(e.id));
    setMoveCopyMode(mode);
    setMoveCopyEntries(entries);
    setTargetMeal(currentMeal);
    setTargetDate(localDateStr(new Date()));
  }

  async function removeSelected(currentMeal: MealSlot) {
    const ids = Array.from(selectedIds);
    clearSelection();
    try {
      await Promise.all(ids.map((id) => deleteNutritionLogEntry(token, id)));
      load();
    } catch { Alert.alert('Error', 'Could not remove entries.'); }
  }

  async function openEditEntry(entry: NutritionLogEntry) {
    clearSelection();
    setEditEntry(entry);
    setEditQuantity(String(entry.quantity));
    // Use serving sizes already on the food if populated, else fetch
    if (entry.food.servingSizes && entry.food.servingSizes.length > 0) {
      setEditServingSizes(entry.food.servingSizes);
      setEditServing(entry.food.servingSizes.find((s) => s.id === entry.servingSize.id) ?? entry.food.servingSizes[0]);
    } else {
      setLoadingEditServings(true);
      try {
        const food = await getFoodById(token, entry.food.id);
        setEditServingSizes(food.servingSizes);
        setEditServing(food.servingSizes.find((s) => s.id === entry.servingSize.id) ?? food.servingSizes[0]);
      } catch {
        // Fall back to just the current serving size
        setEditServingSizes([entry.servingSize]);
        setEditServing(entry.servingSize);
      } finally {
        setLoadingEditServings(false);
      }
    }
  }

  async function confirmEdit() {
    if (!editEntry || !editServing) return;
    const qty = parseFloat(editQuantity);
    if (!qty || qty <= 0) { Alert.alert('Invalid quantity'); return; }
    setSavingEdit(true);
    try {
      await editNutritionLogEntry(token, editEntry.id, { servingSizeId: editServing.id, quantity: qty });
      setEditEntry(null);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmMoveCopy() {
    if (!moveCopyEntries.length) return;
    setSavingMoveCopy(true);
    try {
      if (moveCopyMode === 'move') {
        await Promise.all(moveCopyEntries.map((e) => moveLogEntry(token, e.id, targetMeal, targetDate)));
      } else {
        await Promise.all(moveCopyEntries.map((e) => copyLogEntry(token, e, targetMeal, targetDate)));
      }
      setMoveCopyEntries([]);
      clearSelection();
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
            disabled={date >= localDateStr(new Date())}
          >
            <Text style={[s.dateArrowText, date >= localDateStr(new Date()) && { opacity: 0.3 }]}>›</Text>
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
              {(() => {
                const calRemaining = calGoal - Math.round(totals.calories);
                const calOver = calRemaining < 0;
                return (
                  <Text style={[s.calRemaining, calOver && { color: c.error }]}>
                    {calOver ? `  +${Math.abs(calRemaining)} over` : `  ${calRemaining} left`}
                  </Text>
                );
              })()}
            </View>
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${calPct * 100}%` as any, backgroundColor: calPct >= 1 ? c.error : c.accent }]} />
            </View>
            <View style={s.macroRow}>
              {[
                { label: 'Protein', val: totals.protein, goal: goals?.proteinG, color: '#60a5fa' },
                { label: 'Carbs', val: totals.carbs, goal: goals?.carbsG, color: '#34d399' },
                { label: 'Fat', val: totals.fat, goal: goals?.fatG, color: '#fb923c' },
              ].map(({ label, val, goal, color }) => {
                const remaining = goal != null ? Math.max(goal - Math.round(val), 0) : null;
                const over = goal != null && Math.round(val) > goal;
                return (
                  <View key={label} style={s.macroItem}>
                    <Text style={[s.macroVal, { color }]}>{Math.round(val)}g</Text>
                    <Text style={s.macroLabel}>{label}</Text>
                    {remaining !== null && (
                      <Text style={[s.macroGoal, over && { color: c.error }]}>
                        {over ? `+${Math.round(val) - goal!}g over` : `${remaining}g left`}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

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

          {/* Meal sections */}
          {MEALS.map(({ slot, label }) => {
            const entries = log?.meals[slot] ?? [];
            const mealCals = entries.reduce((sum, e) => sum + e.nutrition.calories, 0);
            const open = expanded[slot];
            const inSelectMode = selectMeal === slot;
            return (
              <View key={slot} style={s.mealSection}>
                <TouchableOpacity
                  style={s.mealHeader}
                  onPress={() => {
                    if (inSelectMode) { clearSelection(); return; }
                    setExpanded((prev) => ({ ...prev, [slot]: !prev[slot] }));
                  }}
                >
                  <Text style={s.mealLabel}>{label}</Text>
                  {inSelectMode
                    ? <Text style={[s.mealCals, { color: c.accent }]}>{selectedIds.size} selected · tap to cancel</Text>
                    : <Text style={s.mealCals}>{Math.round(mealCals)} kcal</Text>
                  }
                  <Text style={s.mealChevron}>{open ? '▾' : '▸'}</Text>
                </TouchableOpacity>
                {open && (
                  <>
                    {entries.map((entry) => {
                      const isSelected = selectedIds.has(entry.id);
                      return (
                        <TouchableOpacity
                          key={entry.id}
                          style={[s.foodRow, isSelected && { backgroundColor: `${c.accent}22` }]}
                          onPress={() => {
                            if (inSelectMode) {
                              handleEntryTap(entry, slot);
                            } else {
                              setActionEntry({ entry, meal: slot });
                            }
                          }}
                          onLongPress={() => handleEntryLongPress(entry, slot)}
                        >
                          {inSelectMode && (
                            <View style={[s.checkbox, isSelected && { backgroundColor: c.accent, borderColor: c.accent }]}>
                              {isSelected && <Text style={{ color: c.bg, fontSize: 10, fontWeight: '700' }}>✓</Text>}
                            </View>
                          )}
                          <View style={s.foodInfo}>
                            <Text style={s.foodName} numberOfLines={1}>{entry.food.name}</Text>
                            <Text style={s.foodServing}>
                              {entry.quantity} × {entry.servingSize.label}
                              {entry.food.brand ? ` · ${entry.food.brand}` : ''}
                            </Text>
                          </View>
                          <Text style={s.foodCals}>{Math.round(entry.nutrition.calories)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {/* Multi-select action bar */}
                    {inSelectMode && selectedIds.size > 0 && (
                      <View style={s.selectActions}>
                        <TouchableOpacity style={s.selectActionBtn} onPress={() => openMoveCopyForSelected('move', slot)}>
                          <Text style={s.selectActionText}>Move</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.selectActionBtn} onPress={() => openMoveCopyForSelected('copy', slot)}>
                          <Text style={s.selectActionText}>Copy</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.selectActionBtn, { borderColor: c.error }]} onPress={() => removeSelected(slot)}>
                          <Text style={[s.selectActionText, { color: c.error }]}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {!inSelectMode && (
                      <View style={s.addFoodBtn}>
                        <TouchableOpacity style={{ flex: 1 }} onPress={() => openAddFood(slot)}>
                          <Text style={s.addFoodBtnText}>+ Add food</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => openAddFoodScan(slot)} style={s.addFoodScanBtn}>
                          <Text style={s.addFoodScanIcon}>⊡</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Single-entry Action Sheet */}
      <Modal visible={actionEntry !== null} animationType="slide" transparent onRequestClose={() => setActionEntry(null)}>
        <TouchableOpacity style={s.moveCopyOverlay} activeOpacity={1} onPress={() => setActionEntry(null)}>
          <TouchableOpacity style={s.moveCopySheet} activeOpacity={1} onPress={() => {}}>
            <View style={[s.modalHeader, { paddingBottom: 8 }]}>
              <Text style={[s.modalTitle, { fontSize: fontSize.sm }]} numberOfLines={1}>{actionEntry?.entry.food.name}</Text>
              <TouchableOpacity onPress={() => setActionEntry(null)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={s.actionSheetRow}
              onPress={() => { const e = actionEntry!.entry; setActionEntry(null); setTimeout(() => openEditEntry(e), 300); }}
            >
              <Text style={s.actionSheetText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.actionSheetRow}
              onPress={() => {
                const { entry, meal } = actionEntry!;
                setActionEntry(null);
                setMoveCopyMode('move');
                setMoveCopyEntries([entry]);
                setTargetMeal(meal);
                setTargetDate(localDateStr(new Date()));
              }}
            >
              <Text style={s.actionSheetText}>Move to…</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.actionSheetRow}
              onPress={() => {
                const { entry, meal } = actionEntry!;
                setActionEntry(null);
                setMoveCopyMode('copy');
                setMoveCopyEntries([entry]);
                setTargetMeal(meal);
                setTargetDate(localDateStr(new Date()));
              }}
            >
              <Text style={s.actionSheetText}>Copy to…</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionSheetRow, { borderTopColor: c.border }]}
              onPress={async () => {
                const { entry } = actionEntry!;
                setActionEntry(null);
                try { await deleteNutritionLogEntry(token, entry.id); load(); }
                catch { Alert.alert('Error', 'Could not remove entry.'); }
              }}
            >
              <Text style={[s.actionSheetText, { color: c.error }]}>Remove</Text>
            </TouchableOpacity>
            <View style={{ height: 16 }} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Move / Copy Modal */}
      <Modal visible={moveCopyEntries.length > 0} animationType="slide" transparent onRequestClose={() => setMoveCopyEntries([])}>
        <TouchableOpacity style={s.moveCopyOverlay} activeOpacity={1} onPress={() => setMoveCopyEntries([])}>
          <TouchableOpacity style={s.moveCopySheet} activeOpacity={1} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {moveCopyMode === 'move' ? 'Move' : 'Copy'} {moveCopyEntries.length > 1 ? `${moveCopyEntries.length} items` : ''} to…
              </Text>
              <TouchableOpacity onPress={() => setMoveCopyEntries([])}>
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
                  const d = localDateStr(new Date(Date.now() + offset * 86400000));
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
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Edit Entry Modal */}
      <Modal visible={editEntry !== null} animationType="slide" transparent onRequestClose={() => setEditEntry(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={s.moveCopyOverlay} activeOpacity={1} onPress={() => setEditEntry(null)}>
          <TouchableOpacity style={s.moveCopySheet} activeOpacity={1} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} numberOfLines={1}>{editEntry?.food.name}</Text>
              <TouchableOpacity onPress={() => setEditEntry(null)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              {loadingEditServings ? (
                <ActivityIndicator color={c.accent} style={{ marginVertical: 24 }} />
              ) : (
                <>
                  <Text style={s.moveCopySection}>Serving size</Text>
                  {editServingSizes.map((sv) => (
                    <TouchableOpacity
                      key={sv.id}
                      style={[s.servingRow, editServing?.id === sv.id && s.servingRowActive]}
                      onPress={() => setEditServing(sv)}
                    >
                      <Text style={[s.servingLabel, editServing?.id === sv.id && { color: c.accent }]}>{sv.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <Text style={[s.moveCopySection, { marginTop: 16 }]}>Quantity</Text>
                  <TextInput
                    style={s.quantityInput}
                    value={editQuantity}
                    onChangeText={setEditQuantity}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
                  {editServing && editEntry && (
                    <Text style={s.nutritionPreview}>
                      {Math.round(editEntry.food.nutrition.calories * editServing.grams * parseFloat(editQuantity || '0') / 100)} kcal ·{' '}
                      P: {Math.round(editEntry.food.nutrition.protein * editServing.grams * parseFloat(editQuantity || '0') / 100)}g ·{' '}
                      C: {Math.round(editEntry.food.nutrition.carbs * editServing.grams * parseFloat(editQuantity || '0') / 100)}g ·{' '}
                      F: {Math.round(editEntry.food.nutrition.fat * editServing.grams * parseFloat(editQuantity || '0') / 100)}g
                    </Text>
                  )}
                  <TouchableOpacity
                    style={[s.confirmBtn, { marginTop: 16 }, savingEdit && { opacity: 0.6 }]}
                    onPress={confirmEdit}
                    disabled={savingEdit}
                  >
                    <Text style={s.confirmBtnText}>{savingEdit ? 'Saving…' : 'Save'}</Text>
                  </TouchableOpacity>
                </>
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Food Modal */}
      <Modal visible={addMeal !== null} animationType="slide" onRequestClose={() => setAddMeal(null)}>
        <SafeAreaView style={s.modal}>
          {/* Barcode queue scanner view */}
          {modalView === 'barcode-queue' ? (
            <>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Scan Barcode</Text>
                <TouchableOpacity onPress={() => setAddMeal(null)}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={[s.scannerContainer, barcodeQueue.length > 0 && { flex: 0, height: 240 }]}>
                {scanningActive && (
                  <CameraView
                    style={StyleSheet.absoluteFillObject}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
                    onBarcodeScanned={(result) => handleBarcodeScan(result.data)}
                  />
                )}
                <View style={s.scannerOverlay}>
                  <View style={s.scannerFrame} />
                  <Text style={s.scannerHint}>
                    {barcodeScanning ? 'Looking up barcode…' : 'Point at a barcode to scan'}
                  </Text>
                </View>
              </View>
              {/* Scanned items list */}
              {barcodeQueue.length > 0 && (
                <View style={{ flex: 1 }}>
                  <FlatList
                    data={barcodeQueue}
                    keyExtractor={(item) => item.key}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ padding: 12 }}
                    renderItem={({ item }) => (
                      <View style={s.queueRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.queueItemName} numberOfLines={1}>{item.editName}</Text>
                          <Text style={s.queueItemSub}>
                            {item.editCalories ? `${item.editCalories} kcal` : ''}
                            {item.editProtein ? ` · P: ${item.editProtein}g` : ''}
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => removeQueueItem(item.key)} style={s.queueRemoveBtn}>
                          <Text style={s.queueRemoveText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  />
                  <View style={s.queueActions}>
                    <TouchableOpacity
                      style={s.queueReviewBtn}
                      onPress={() => setModalView('barcode-review')}
                    >
                      <Text style={s.queueReviewText}>Review & Add ({barcodeQueue.length})</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {barcodeScanning && barcodeQueue.length === 0 && (
                <View style={{ alignItems: 'center', padding: 24 }}>
                  <ActivityIndicator color={c.accent} />
                </View>
              )}
            </>
          ) : modalView === 'barcode-review' ? (
            /* Review & edit scanned items */
            <>
              <View style={s.modalHeader}>
                <TouchableOpacity onPress={() => setModalView('barcode-queue')} style={{ padding: 4 }}>
                  <Text style={[s.backBtnText, { fontSize: fontSize.base }]}>← Back</Text>
                </TouchableOpacity>
                <Text style={s.modalTitle}>Review Items</Text>
                <TouchableOpacity onPress={() => setAddMeal(null)}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
                {barcodeQueue.map((item) => {
                  const qty = parseFloat(item.quantity) || 1;
                  const cal = parseFloat(item.editCalories) || 0;
                  const pro = parseFloat(item.editProtein) || 0;
                  const carb = parseFloat(item.editCarbs) || 0;
                  const fat = parseFloat(item.editFat) || 0;
                  return (
                    <View key={item.key} style={s.reviewCard}>
                      <View style={s.reviewCardHeader}>
                        <StartAlignedInput
                          style={[s.reviewNameInput, { flex: 1 }]}
                          value={item.editName}
                          onChangeText={(v) => updateQueueItem(item.key, { editName: v })}
                          placeholder="Name"
                          placeholderTextColor={c.muted}
                        />
                        <TouchableOpacity onPress={() => removeQueueItem(item.key)} style={s.queueRemoveBtn}>
                          <Text style={s.queueRemoveText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      {/* Serving size selector for food items */}
                      {item.type === 'food' && item.food && item.food.servingSizes.length > 1 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                          {item.food.servingSizes.map((sv) => (
                            <TouchableOpacity
                              key={sv.id}
                              style={[s.servingRow, item.serving?.id === sv.id && s.servingRowActive, { marginBottom: 0 }]}
                              onPress={() => {
                                const def = sv;
                                updateQueueItem(item.key, {
                                  serving: def,
                                  editCalories: String(Math.round(item.food!.nutrition.calories * def.grams / 100)),
                                  editProtein: String(Math.round(item.food!.nutrition.protein * def.grams / 100)),
                                  editCarbs: String(Math.round(item.food!.nutrition.carbs * def.grams / 100)),
                                  editFat: String(Math.round(item.food!.nutrition.fat * def.grams / 100)),
                                });
                              }}
                            >
                              <Text style={[s.servingLabel, item.serving?.id === sv.id && { color: c.accent }]}>{sv.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      <View style={s.reviewRow}>
                        <Text style={s.reviewFieldLabel}>Servings</Text>
                        <TextInput
                          style={[s.reviewFieldInput, { flex: 0, width: 72 }]}
                          value={item.quantity}
                          onChangeText={(v) => updateQueueItem(item.key, { quantity: v })}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                        />
                        {item.serving && (
                          <Text style={[s.reviewFieldLabel, { flex: 1 }]}>× {item.serving.label}</Text>
                        )}
                        {item.type === 'recipe' && item.recipe?.servings && (
                          <Text style={[s.reviewFieldLabel, { flex: 1 }]}>× 1 serving</Text>
                        )}
                      </View>
                      <View style={s.reviewMacroRow}>
                        <View style={s.reviewMacroField}>
                          <Text style={s.reviewFieldLabel}>Cal</Text>
                          <TextInput
                            style={s.reviewFieldInput}
                            value={item.editCalories}
                            onChangeText={(v) => updateQueueItem(item.key, { editCalories: v })}
                            keyboardType="number-pad"
                            selectTextOnFocus
                          />
                        </View>
                        <View style={s.reviewMacroField}>
                          <Text style={s.reviewFieldLabel}>P (g)</Text>
                          <TextInput
                            style={s.reviewFieldInput}
                            value={item.editProtein}
                            onChangeText={(v) => updateQueueItem(item.key, { editProtein: v })}
                            keyboardType="number-pad"
                            selectTextOnFocus
                          />
                        </View>
                        <View style={s.reviewMacroField}>
                          <Text style={s.reviewFieldLabel}>C (g)</Text>
                          <TextInput
                            style={s.reviewFieldInput}
                            value={item.editCarbs}
                            onChangeText={(v) => updateQueueItem(item.key, { editCarbs: v })}
                            keyboardType="number-pad"
                            selectTextOnFocus
                          />
                        </View>
                        <View style={s.reviewMacroField}>
                          <Text style={s.reviewFieldLabel}>F (g)</Text>
                          <TextInput
                            style={s.reviewFieldInput}
                            value={item.editFat}
                            onChangeText={(v) => updateQueueItem(item.key, { editFat: v })}
                            keyboardType="number-pad"
                            selectTextOnFocus
                          />
                        </View>
                      </View>
                      <Text style={s.nutritionPreview}>
                        {Math.round(cal * qty)} kcal · P: {Math.round(pro * qty)}g · C: {Math.round(carb * qty)}g · F: {Math.round(fat * qty)}g
                      </Text>
                    </View>
                  );
                })}
                {barcodeQueue.length === 0 && (
                  <Text style={[s.emptyText, { padding: 24 }]}>No items — go back to scan.</Text>
                )}
                <TouchableOpacity
                  style={[s.confirmBtn, (addingRecipe || barcodeQueue.length === 0) && { opacity: 0.5 }]}
                  onPress={confirmAddAll}
                  disabled={addingRecipe || barcodeQueue.length === 0}
                >
                  <Text style={s.confirmBtnText}>
                    {addingRecipe ? 'Adding…' : `Add all to ${mealLabel} (${barcodeQueue.length} item${barcodeQueue.length !== 1 ? 's' : ''})`}
                  </Text>
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </ScrollView>
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
                      {sv.label}
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
    calRemaining: { fontSize: fontSize.sm, color: c.muted },
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
    checkbox: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.border, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
    selectActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
    selectActionBtn: { flex: 1, borderWidth: 1, borderColor: c.accent, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
    selectActionText: { fontSize: fontSize.sm, color: c.accent, fontWeight: '600' },
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
    // Action sheet
    actionSheetRow: { paddingVertical: 16, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: c.border },
    actionSheetText: { fontSize: fontSize.base, color: c.text },
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
    // Barcode queue
    queueRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: c.border },
    queueItemName: { color: c.text, fontSize: fontSize.base, fontWeight: '500' },
    queueItemSub: { color: c.muted, fontSize: fontSize.sm, marginTop: 2 },
    queueRemoveBtn: { padding: 8 },
    queueRemoveText: { color: c.muted, fontSize: fontSize.base },
    queueActions: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: c.border },
    queueScanMoreBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.accent, alignItems: 'center' },
    queueScanMoreText: { color: c.accent, fontSize: fontSize.base, fontWeight: '600' },
    queueReviewBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center' },
    queueReviewText: { color: '#fff', fontSize: fontSize.base, fontWeight: '600' },
    // Review screen
    reviewCard: { backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: c.border },
    reviewCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
    reviewNameInput: { color: c.text, fontSize: fontSize.base, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: c.border, paddingVertical: 4 },
    reviewRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
    reviewFieldLabel: { color: c.muted, fontSize: fontSize.sm, minWidth: 48 },
    reviewFieldInput: { flex: 1, color: c.text, fontSize: fontSize.base, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: c.bg },
    reviewMacroRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    reviewMacroField: { flex: 1, gap: 4 },
  });
}
