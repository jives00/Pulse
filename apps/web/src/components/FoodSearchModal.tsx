import { useState, useEffect, useRef } from 'react';
import { foodsApi, recipesApi, logApi } from '@pulse/api-client';
import { useLogStore } from '../store/logStore';
import type { Food, MealSlot, RecipeSearchResult, FrequentFood } from '@pulse/api-client';

type View     = 'meal' | 'search' | 'pick' | 'recipe-pick';
type SearchTab = 'search' | 'add-recipe' | 'describe-meal';

interface Props {
  meal?: MealSlot;
  mode?: 'create';
  onClose: () => void;
}

function defaultMealByTime(): MealSlot {
  const h = new Date().getHours();
  if (h >= 5  && h < 10) return 'breakfast';
  if (h >= 11 && h < 14) return 'lunch';
  if (h >= 17 && h < 20) return 'dinner';
  return 'snack';
}

const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch:     'Lunch',
  dinner:    'Dinner',
  snack:     'Snacks',
};

const MEAL_META: Record<MealSlot, { emoji: string; color: string }> = {
  breakfast: { emoji: '🍳', color: '#f59e0b' },
  lunch:     { emoji: '🥗', color: '#22c55e' },
  dinner:    { emoji: '🍽️', color: '#60a5fa' },
  snack:     { emoji: '🍎', color: '#f87171' },
};

const CONFIDENCE_COLORS = {
  high:   'text-emerald-400',
  medium: 'text-yellow-400',
  low:    'text-red-400',
};

const TAB_LABELS: Record<SearchTab, string> = {
  'search':       'Search',
  'add-recipe':   'Add Recipe',
  'describe-meal':'Describe a Meal',
};

export default function FoodSearchModal({ meal: mealProp, mode, onClose }: Props) {
  const { currentDate, refreshDay } = useLogStore();

  const [view, setView]               = useState<View>(mealProp ? 'search' : 'meal');
  const [activeTab, setActiveTab]     = useState<SearchTab>(mode === 'create' ? 'add-recipe' : 'search');
  const [selectedMeal, setSelectedMeal] = useState<MealSlot | null>(mealProp ?? defaultMealByTime());

  // Search state
  const [query, setQuery]               = useState('');
  const [results, setResults]           = useState<Food[]>([]);
  const [recipeResults, setRecipeResults] = useState<RecipeSearchResult[]>([]);
  const [searching, setSearching]       = useState(false);

  // Recipe pick state
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSearchResult | null>(null);
  const [recipeServings, setRecipeServings] = useState('1');
  const [recipeLogDate, setRecipeLogDate]   = useState(currentDate);
  const [addingRecipe, setAddingRecipe]     = useState(false);

  // Food pick state
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [servingSizeId, setServingSizeId] = useState(0);
  const [quantity, setQuantity]           = useState('1');
  const [logDate, setLogDate]             = useState(currentDate);
  const [adding, setAdding]               = useState(false);

  // Frequent foods
  const [frequentFoods, setFrequentFoods] = useState<FrequentFood[]>([]);
  const [addingFrequent, setAddingFrequent] = useState(false);

  // Add Recipe (create custom food) state
  const [cfName, setCfName]               = useState('');
  const [cfBrand, setCfBrand]             = useState('');
  const [cfDesc, setCfDesc]               = useState('');
  const [cfCalories, setCfCalories]       = useState('');
  const [cfCarbs, setCfCarbs]             = useState('');
  const [cfProtein, setCfProtein]         = useState('');
  const [cfFat, setCfFat]                 = useState('');
  const [cfFiber, setCfFiber]             = useState('');
  const [cfSodium, setCfSodium]           = useState('');
  const [cfServingLabel, setCfServingLabel] = useState('1 serving');
  const [cfServingGrams, setCfServingGrams] = useState('100');
  const [estimating, setEstimating]       = useState(false);
  const [confidence, setConfidence]       = useState<'high' | 'medium' | 'low' | null>(null);
  const [savingCustom, setSavingCustom]   = useState(false);

  // Describe a Meal (AI inline) state
  const [ciDescription, setCiDescription] = useState('');
  const [ciCalories, setCiCalories]       = useState('');
  const [ciProtein, setCiProtein]         = useState('');
  const [ciCarbs, setCiCarbs]             = useState('');
  const [ciFat, setCiFat]                 = useState('');
  const [ciEstimated, setCiEstimated]     = useState(false);
  const [ciEstimating, setCiEstimating]   = useState(false);
  const [ciLogging, setCiLogging]         = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchId    = useRef(0);

  // Debounced food/recipe search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) { setResults([]); setRecipeResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const id = ++searchId.current;
      setSearching(true);
      try {
        const [foodData, recipeData] = await Promise.all([
          foodsApi.search(query),
          recipesApi.search(query),
        ]);
        if (id === searchId.current) {
          setResults(foodData);
          setRecipeResults(recipeData);
        }
      } catch { /* ignore */ }
      finally { if (id === searchId.current) setSearching(false); }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  // Load frequent foods
  useEffect(() => {
    logApi.getFrequent().then(setFrequentFoods).catch(() => {});
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function selectFood(food: Food) {
    setSelectedFood(food);
    const def = food.servingSizes.find((s) => s.isDefault) ?? food.servingSizes[0];
    setServingSizeId(def?.id ?? 0);
    setQuantity('1');
    setView('pick');
  }

  function selectRecipe(recipe: RecipeSearchResult) {
    setSelectedRecipe(recipe);
    setRecipeServings('1');
    setRecipeLogDate(currentDate);
    setView('recipe-pick');
  }

  async function handleAddRecipe() {
    if (!selectedRecipe || !selectedMeal) return;
    setAddingRecipe(true);
    try {
      await logApi.logRecipe({
        recipeId: selectedRecipe.id,
        meal:     selectedMeal,
        servings: Number(recipeServings) || 1,
        logDate:  recipeLogDate,
      });
      onClose();
      refreshDay();
    } catch { /* ignore */ }
    finally { setAddingRecipe(false); }
  }

  async function handleAdd() {
    if (!selectedFood || !servingSizeId || !selectedMeal) return;
    setAdding(true);
    try {
      await logApi.add({
        logDate,
        meal:          selectedMeal,
        foodId:        selectedFood.id,
        servingSizeId,
        quantity:      Number(quantity) || 1,
      });
      onClose();
      refreshDay();
    } catch { /* ignore */ }
    finally { setAdding(false); }
  }

  async function handleFrequentSelect(food: FrequentFood) {
    if (!selectedMeal || addingFrequent) return;
    setAddingFrequent(true);
    try {
      await logApi.add({
        logDate:      currentDate,
        meal:         selectedMeal,
        foodId:       food.foodId,
        servingSizeId: food.servingSizeId,
        quantity:     1,
      });
      onClose();
      refreshDay();
    } catch { /* ignore */ }
    finally { setAddingFrequent(false); }
  }

  function handleFrequentModify(food: FrequentFood) {
    setCiDescription(food.name);
    setCiCalories('');
    setCiProtein('');
    setCiCarbs('');
    setCiFat('');
    setCiEstimated(false);
    setActiveTab('describe-meal');
  }

  async function handleEstimate() {
    if (!cfName.trim()) return;
    setEstimating(true);
    setConfidence(null);
    try {
      const result = await foodsApi.estimateMacros({
        name:        cfName,
        brand:       cfBrand   || undefined,
        description: cfDesc    || undefined,
      });
      const n = result.nutrition;
      setCfCalories(String(Math.round(n.calories)));
      setCfCarbs(String(Math.round(n.carbs * 10) / 10));
      setCfProtein(String(Math.round(n.protein * 10) / 10));
      setCfFat(String(Math.round(n.fat * 10) / 10));
      if (n.fiber  != null) setCfFiber(String(Math.round(n.fiber  * 10) / 10));
      if (n.sodium != null) setCfSodium(String(Math.round(n.sodium)));
      setConfidence(result.confidence);
    } catch { /* ignore */ }
    finally { setEstimating(false); }
  }

  async function handleSaveCustom() {
    if (!cfName.trim() || !cfCalories) return;
    setSavingCustom(true);
    try {
      const food = await foodsApi.create({
        name:  cfName,
        brand: cfBrand || undefined,
        nutrition: {
          calories: Number(cfCalories),
          carbs:    Number(cfCarbs)   || 0,
          protein:  Number(cfProtein) || 0,
          fat:      Number(cfFat)     || 0,
          fiber:    cfFiber  ? Number(cfFiber)  : undefined,
          sodium:   cfSodium ? Number(cfSodium) : undefined,
        },
        servingSizes: [{
          label:     cfServingLabel || '1 serving',
          grams:     Number(cfServingGrams) || 100,
          isDefault: true,
        }],
      });
      if (mode === 'create') { onClose(); return; }
      selectFood(food);
    } catch { /* ignore */ }
    finally { setSavingCustom(false); }
  }

  async function handleCIEstimate() {
    if (!ciDescription.trim()) return;
    setCiEstimating(true);
    try {
      const result = await foodsApi.estimateMacros({ name: ciDescription.trim() });
      const n = result.nutrition;
      setCiCalories(String(Math.round(n.calories)));
      setCiProtein(String(Math.round(n.protein * 10) / 10));
      setCiCarbs(String(Math.round(n.carbs * 10) / 10));
      setCiFat(String(Math.round(n.fat * 10) / 10));
      setCiEstimated(true);
    } catch { /* ignore */ }
    finally { setCiEstimating(false); }
  }

  async function handleCILog() {
    if (!ciDescription.trim() || !ciCalories || !selectedMeal) return;
    setCiLogging(true);
    try {
      await logApi.logInline({
        name:      ciDescription.trim(),
        meal:      selectedMeal,
        logDate:   currentDate,
        calories:  Number(ciCalories),
        carbs_g:   Number(ciCarbs)   || 0,
        protein_g: Number(ciProtein) || 0,
        fat_g:     Number(ciFat)     || 0,
      });
      onClose();
      refreshDay();
    } catch { /* ignore */ }
    finally { setCiLogging(false); }
  }

  const selectedServing = selectedFood?.servingSizes.find((s) => s.id === servingSizeId);
  const qty             = Number(quantity) || 1;
  const previewCal      = selectedFood && selectedServing
    ? Math.round(selectedFood.nutrition.calories * selectedServing.grams * qty / 100)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">

        {/* ── Modal header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            {view === 'search' && !mealProp && mode !== 'create' && (
              <button onClick={() => setView('meal')} className="text-slate-400 hover:text-slate-200 transition-colors">←</button>
            )}
            {(view === 'pick' || view === 'recipe-pick') && (
              <button onClick={() => setView('search')} className="text-slate-400 hover:text-slate-200 transition-colors">←</button>
            )}
            <h2 className="text-sm font-semibold text-slate-200">
              {view === 'meal'         && 'Add to log'}
              {view === 'search'       && `Add to ${selectedMeal ? MEAL_LABELS[selectedMeal] : '…'}`}
              {view === 'pick'         && (selectedFood?.name ?? '')}
              {view === 'recipe-pick'  && (selectedRecipe?.name ?? '')}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none transition-colors">×</button>
        </div>

        {/* ── Meal picker ──────────────────────────────────────────── */}
        {view === 'meal' && (
          <div className="p-4 grid grid-cols-2 gap-3">
            {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((m) => {
              const meta = MEAL_META[m];
              return (
                <button
                  key={m}
                  onClick={() => { setSelectedMeal(m); setView('search'); }}
                  className="flex items-center gap-3 bg-slate-700/50 hover:bg-slate-700 rounded-xl px-4 py-3 text-left transition-colors border border-slate-700 hover:border-slate-500"
                >
                  <span className="text-2xl">{meta.emoji}</span>
                  <span className="text-sm font-medium text-slate-200">{MEAL_LABELS[m]}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Search view + tabs ───────────────────────────────────── */}
        {view === 'search' && (
          <div className="flex flex-col flex-1 overflow-hidden">

            {/* Tab bar */}
            <div className="flex border-b border-slate-700 shrink-0">
              {(['search', 'add-recipe', 'describe-meal'] as SearchTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                    activeTab === tab
                      ? 'text-dram-accent border-dram-accent'
                      : 'text-slate-500 border-transparent hover:text-slate-300'
                  }`}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            {/* ── Tab: Search ─────────────────────────────────────── */}
            {activeTab === 'search' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700/50 shrink-0">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search foods…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="flex-1 overflow-y-auto">
                  {searching && (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">Searching…</div>
                  )}

                  {!searching && (recipeResults.length > 0 || results.length > 0) && (
                    <div>
                      {recipeResults.length > 0 && (
                        <>
                          <div className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-800/50">
                            My Recipes
                          </div>
                          <ul className="divide-y divide-slate-700/50">
                            {recipeResults.map((recipe) => (
                              <li key={`r-${recipe.id}`}>
                                <button
                                  className="w-full flex items-center px-4 py-3 hover:bg-slate-700/50 text-left transition-colors"
                                  onClick={() => selectRecipe(recipe)}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm text-slate-200 truncate">{recipe.name}</div>
                                    {recipe.servings && (
                                      <div className="text-xs text-slate-500">{recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}</div>
                                    )}
                                  </div>
                                  <div className="ml-3 text-xs text-slate-400 shrink-0">
                                    {recipe.calories != null ? `${recipe.calories} cal / serving` : '—'}
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      {results.length > 0 && (
                        <>
                          {recipeResults.length > 0 && (
                            <div className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-800/50">
                              Foods
                            </div>
                          )}
                          <ul className="divide-y divide-slate-700/50">
                            {results.map((food) => {
                              const def = food.servingSizes.find((s) => s.isDefault) ?? food.servingSizes[0];
                              const cal = def
                                ? Math.round(food.nutrition.calories * def.grams / 100)
                                : Math.round(food.nutrition.calories);
                              return (
                                <li key={food.id}>
                                  <button
                                    className="w-full flex items-center px-4 py-3 hover:bg-slate-700/50 text-left transition-colors"
                                    onClick={() => selectFood(food)}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm text-slate-200 truncate">{food.name}</div>
                                      {food.brand && (
                                        <div className="text-xs text-slate-500 truncate">{food.brand}</div>
                                      )}
                                    </div>
                                    <div className="ml-3 text-xs text-slate-400 shrink-0">
                                      {cal} cal{def ? ` / ${def.label}` : ' / 100g'}
                                    </div>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </div>
                  )}

                  {!searching && query.trim() && recipeResults.length === 0 && results.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">
                      No results for "{query}"
                    </div>
                  )}

                  {/* Frequent foods */}
                  {!query.trim() && frequentFoods.length > 0 && (
                    <div>
                      <div className="px-4 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wide bg-slate-800/50">
                        Frequently Logged
                      </div>
                      <ul className="divide-y divide-slate-700/50">
                        {frequentFoods.map((food) => (
                          <li key={food.foodId} className="flex items-center hover:bg-slate-700/50 transition-colors">
                            <button
                              className="flex-1 flex items-center px-4 py-3 text-left min-w-0"
                              onClick={() => handleFrequentSelect(food)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-slate-200 truncate">{food.name}</div>
                                {food.brand && <div className="text-xs text-slate-500 truncate">{food.brand}</div>}
                              </div>
                              <div className="ml-3 text-right shrink-0">
                                <div className="text-xs text-slate-400">{food.caloriesPerServing} cal</div>
                                <div className="text-[10px] text-slate-600 font-mono">
                                  {food.proteinPerServing}p · {food.carbsPerServing}c · {food.fatPerServing}f
                                </div>
                              </div>
                            </button>
                            <button
                              onClick={() => handleFrequentModify(food)}
                              className="px-3 py-3 text-slate-600 hover:text-slate-300 transition-colors text-sm shrink-0"
                              title="Modify before adding"
                            >
                              ✎
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!query.trim() && frequentFoods.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">
                      Start typing to search foods
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab: Add Recipe (create custom food) ────────────── */}
            {activeTab === 'add-recipe' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Name *</label>
                    <input
                      autoFocus
                      type="text"
                      value={cfName}
                      onChange={(e) => setCfName(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Brand</label>
                    <input
                      type="text"
                      value={cfBrand}
                      onChange={(e) => setCfBrand(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Description <span className="text-slate-500">(helps AI estimate)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. grilled, with sauce, homemade…"
                      value={cfDesc}
                      onChange={(e) => setCfDesc(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-700 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                      Nutrition per 100g
                    </span>
                    <button
                      onClick={handleEstimate}
                      disabled={estimating || !cfName.trim()}
                      className="text-xs text-brand-400 hover:text-brand-300 disabled:opacity-50 transition-colors"
                    >
                      {estimating ? 'Estimating…' : '✨ Estimate with AI'}
                    </button>
                  </div>

                  {confidence && (
                    <div className={`text-xs mb-2 ${CONFIDENCE_COLORS[confidence]}`}>
                      AI confidence: {confidence}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['Calories (kcal) *', cfCalories, setCfCalories],
                      ['Carbs (g) *',       cfCarbs,    setCfCarbs],
                      ['Protein (g) *',     cfProtein,  setCfProtein],
                      ['Fat (g) *',         cfFat,      setCfFat],
                      ['Fiber (g)',          cfFiber,    setCfFiber],
                      ['Sodium (mg)',        cfSodium,   setCfSodium],
                    ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
                      <div key={label}>
                        <label className="block text-xs text-slate-500 mb-1">{label}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={val}
                          onChange={(e) => setter(e.target.value)}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-700 pt-3">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-2">
                    Serving size
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Label</label>
                      <input
                        type="text"
                        value={cfServingLabel}
                        onChange={(e) => setCfServingLabel(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Grams</label>
                      <input
                        type="number"
                        min="1"
                        value={cfServingGrams}
                        onChange={(e) => setCfServingGrams(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSaveCustom}
                  disabled={savingCustom || !cfName.trim() || !cfCalories}
                  className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
                >
                  {savingCustom ? 'Saving…' : 'Save & add to log'}
                </button>
              </div>
            )}

            {/* ── Tab: Describe a Meal (AI inline) ────────────────── */}
            {activeTab === 'describe-meal' && (
              <div className="flex flex-col flex-1 p-4 gap-4 overflow-y-auto">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">What did you eat?</label>
                  <textarea
                    autoFocus
                    rows={2}
                    value={ciDescription}
                    onChange={(e) => { setCiDescription(e.target.value); setCiEstimated(false); }}
                    placeholder='e.g. "6oz grilled chicken breast" or "bowl of oatmeal with berries"'
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 resize-none"
                  />
                </div>
                <button
                  onClick={handleCIEstimate}
                  disabled={!ciDescription.trim() || ciEstimating}
                  className="w-full bg-dram-accent/20 border border-dram-accent/40 text-dram-accent font-semibold py-2 rounded-lg hover:bg-dram-accent/30 transition disabled:opacity-50"
                >
                  {ciEstimating ? 'Estimating…' : '✦ Estimate macros with AI'}
                </button>

                {(ciEstimated || ciCalories !== '') && (
                  <>
                    <p className="text-xs text-slate-500 -mt-2">
                      {ciEstimated ? 'AI estimate — edit if needed' : 'Enter macros manually'}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {([
                        { label: 'Cal',      value: ciCalories, set: setCiCalories },
                        { label: 'Protein g', value: ciProtein, set: setCiProtein },
                        { label: 'Carbs g',   value: ciCarbs,   set: setCiCarbs   },
                        { label: 'Fat g',     value: ciFat,     set: setCiFat     },
                      ] as { label: string; value: string; set: (v: string) => void }[]).map(({ label, value, set }) => (
                        <div key={label}>
                          <label className="block text-xs text-slate-500 mb-1 text-center">{label}</label>
                          <input
                            type="number"
                            value={value}
                            onChange={(e) => set(e.target.value)}
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-100 text-center focus:outline-none focus:border-brand-500"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleCILog}
                      disabled={!ciDescription.trim() || !ciCalories || ciLogging || !selectedMeal}
                      className="w-full bg-dram-accent text-black font-semibold py-2.5 rounded-lg hover:brightness-110 transition disabled:opacity-50"
                    >
                      {ciLogging ? 'Logging…' : `Log to ${selectedMeal ? MEAL_LABELS[selectedMeal] : '…'}`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Food serving / quantity picker ───────────────────────── */}
        {view === 'pick' && selectedFood && (
          <div className="flex flex-col flex-1 p-4 gap-4 overflow-y-auto">
            {selectedFood.brand && (
              <div className="text-sm text-slate-400">{selectedFood.brand}</div>
            )}

            <div>
              <label className="block text-xs text-slate-400 mb-1">Serving size</label>
              <select
                value={servingSizeId}
                onChange={(e) => setServingSizeId(Number(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
              >
                {selectedFood.servingSizes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.grams}g)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Quantity</label>
              <input
                autoFocus
                type="number"
                min="0.1"
                step="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="bg-slate-700/50 rounded-lg p-3">
              <div className="flex justify-between text-sm text-slate-300 font-medium">
                <span>Calories</span>
                <span>{previewCal}</span>
              </div>
              {selectedServing && (
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-400">
                  <div>Carbs: {Math.round(selectedFood.nutrition.carbs   * selectedServing.grams * qty / 100)}g</div>
                  <div>Protein: {Math.round(selectedFood.nutrition.protein * selectedServing.grams * qty / 100)}g</div>
                  <div>Fat: {Math.round(selectedFood.nutrition.fat       * selectedServing.grams * qty / 100)}g</div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Date</label>
              <input
                type="date"
                value={logDate}
                max={currentDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
              />
            </div>

            <button
              onClick={handleAdd}
              disabled={adding || servingSizeId === 0 || Number(quantity) <= 0 || !selectedMeal}
              className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm transition-colors mt-auto"
            >
              {adding ? 'Adding…' : `Add to ${selectedMeal ? MEAL_LABELS[selectedMeal] : '…'}`}
            </button>
          </div>
        )}

        {/* ── Recipe serving picker ────────────────────────────────── */}
        {view === 'recipe-pick' && selectedRecipe && (
          <div className="flex flex-col flex-1 p-4 gap-4 overflow-y-auto">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Servings</label>
              <input
                autoFocus
                type="number"
                min="0.5"
                step="0.5"
                value={recipeServings}
                onChange={(e) => setRecipeServings(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
              />
            </div>

            {selectedRecipe.calories != null && (
              <div className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex justify-between text-sm text-slate-300 font-medium">
                  <span>Calories</span>
                  <span>{Math.round(selectedRecipe.calories * (Number(recipeServings) || 1))}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-400">
                  {selectedRecipe.carbs_g   != null && <div>Carbs: {Math.round(selectedRecipe.carbs_g   * (Number(recipeServings) || 1))}g</div>}
                  {selectedRecipe.protein_g != null && <div>Protein: {Math.round(selectedRecipe.protein_g * (Number(recipeServings) || 1))}g</div>}
                  {selectedRecipe.fat_g     != null && <div>Fat: {Math.round(selectedRecipe.fat_g     * (Number(recipeServings) || 1))}g</div>}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-400 mb-1">Date</label>
              <input
                type="date"
                value={recipeLogDate}
                max={currentDate}
                onChange={(e) => setRecipeLogDate(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
              />
            </div>

            <button
              onClick={handleAddRecipe}
              disabled={addingRecipe || Number(recipeServings) <= 0 || !selectedMeal}
              className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm transition-colors mt-auto"
            >
              {addingRecipe ? 'Adding…' : `Add to ${selectedMeal ? MEAL_LABELS[selectedMeal] : '…'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
