import { useState, useEffect, useRef } from 'react';
import { foodsApi } from '@food-tracker/api-client';
import { useLogStore } from '../store/logStore';
import type { Food, MealSlot } from '@food-tracker/api-client';

type View = 'search' | 'pick' | 'create';

interface Props {
  meal: MealSlot;
  onClose: () => void;
}

const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

const CONFIDENCE_COLORS = {
  high: 'text-emerald-400',
  medium: 'text-yellow-400',
  low: 'text-red-400',
};

export default function FoodSearchModal({ meal, onClose }: Props) {
  const [view, setView] = useState<View>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);

  // Serving picker state
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [servingSizeId, setServingSizeId] = useState(0);
  const [quantity, setQuantity] = useState('1');
  const [adding, setAdding] = useState(false);

  // Custom food state
  const [cfName, setCfName] = useState('');
  const [cfBrand, setCfBrand] = useState('');
  const [cfDesc, setCfDesc] = useState('');
  const [cfCalories, setCfCalories] = useState('');
  const [cfCarbs, setCfCarbs] = useState('');
  const [cfProtein, setCfProtein] = useState('');
  const [cfFat, setCfFat] = useState('');
  const [cfFiber, setCfFiber] = useState('');
  const [cfSodium, setCfSodium] = useState('');
  const [cfServingLabel, setCfServingLabel] = useState('1 serving');
  const [cfServingGrams, setCfServingGrams] = useState('100');
  const [estimating, setEstimating] = useState(false);
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [savingCustom, setSavingCustom] = useState(false);

  const { currentDate, addEntry } = useLogStore();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchId = useRef(0);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const id = ++searchId.current;
      setSearching(true);
      try {
        const data = await foodsApi.search(query);
        if (id === searchId.current) setResults(data);
      } catch {
        // ignore
      } finally {
        if (id === searchId.current) setSearching(false);
      }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

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

  async function handleAdd() {
    if (!selectedFood || !servingSizeId) return;
    setAdding(true);
    try {
      await addEntry({
        logDate: currentDate,
        meal,
        foodId: selectedFood.id,
        servingSizeId,
        quantity: Number(quantity) || 1,
      });
      onClose();
    } catch {
      // ignore — TODO: show error toast
    } finally {
      setAdding(false);
    }
  }

  async function handleEstimate() {
    if (!cfName.trim()) return;
    setEstimating(true);
    setConfidence(null);
    try {
      const result = await foodsApi.estimateMacros({
        name: cfName,
        brand: cfBrand || undefined,
        description: cfDesc || undefined,
      });
      const n = result.nutrition;
      setCfCalories(String(Math.round(n.calories)));
      setCfCarbs(String(Math.round(n.carbs * 10) / 10));
      setCfProtein(String(Math.round(n.protein * 10) / 10));
      setCfFat(String(Math.round(n.fat * 10) / 10));
      if (n.fiber != null) setCfFiber(String(Math.round(n.fiber * 10) / 10));
      if (n.sodium != null) setCfSodium(String(Math.round(n.sodium)));
      setConfidence(result.confidence);
    } catch {
      // ignore
    } finally {
      setEstimating(false);
    }
  }

  async function handleSaveCustom() {
    if (!cfName.trim() || !cfCalories) return;
    setSavingCustom(true);
    try {
      const food = await foodsApi.create({
        name: cfName,
        brand: cfBrand || undefined,
        nutrition: {
          calories: Number(cfCalories),
          carbs: Number(cfCarbs) || 0,
          protein: Number(cfProtein) || 0,
          fat: Number(cfFat) || 0,
          fiber: cfFiber ? Number(cfFiber) : undefined,
          sodium: cfSodium ? Number(cfSodium) : undefined,
        },
        servingSizes: [{
          label: cfServingLabel || '1 serving',
          grams: Number(cfServingGrams) || 100,
          isDefault: true,
        }],
      });
      selectFood(food);
    } catch {
      // ignore
    } finally {
      setSavingCustom(false);
    }
  }

  const selectedServing = selectedFood?.servingSizes.find((s) => s.id === servingSizeId);
  const qty = Number(quantity) || 1;
  const previewCal = selectedFood && selectedServing
    ? Math.round(selectedFood.nutrition.calories * selectedServing.grams * qty / 100)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            {view !== 'search' && (
              <button
                onClick={() => setView('search')}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ←
              </button>
            )}
            <h2 className="text-sm font-semibold text-slate-200">
              {view === 'search' && `Add to ${MEAL_LABELS[meal]}`}
              {view === 'pick' && (selectedFood?.name ?? '')}
              {view === 'create' && 'Create custom food'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* ── Search view ──────────────────────────────────────── */}
        {view === 'search' && (
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

              {!searching && results.length > 0 && (
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
              )}

              {!searching && query.trim() && results.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  No results for "{query}"
                </div>
              )}

              {!query.trim() && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  Start typing to search foods
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-700/50 shrink-0">
              <button
                onClick={() => setView('create')}
                className="w-full text-sm text-brand-400 hover:text-brand-300 transition-colors py-1"
              >
                + Create custom food
              </button>
            </div>
          </div>
        )}

        {/* ── Serving / quantity picker ─────────────────────────── */}
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
                  <div>
                    Carbs: {Math.round(selectedFood.nutrition.carbs * selectedServing.grams * qty / 100)}g
                  </div>
                  <div>
                    Protein: {Math.round(selectedFood.nutrition.protein * selectedServing.grams * qty / 100)}g
                  </div>
                  <div>
                    Fat: {Math.round(selectedFood.nutrition.fat * selectedServing.grams * qty / 100)}g
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleAdd}
              disabled={adding || servingSizeId === 0 || Number(quantity) <= 0}
              className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm transition-colors mt-auto"
            >
              {adding ? 'Adding…' : `Add to ${MEAL_LABELS[meal]}`}
            </button>
          </div>
        )}

        {/* ── Create custom food ────────────────────────────────── */}
        {view === 'create' && (
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
                  ['Carbs (g) *', cfCarbs, setCfCarbs],
                  ['Protein (g) *', cfProtein, setCfProtein],
                  ['Fat (g) *', cfFat, setCfFat],
                  ['Fiber (g)', cfFiber, setCfFiber],
                  ['Sodium (mg)', cfSodium, setCfSodium],
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
      </div>
    </div>
  );
}
