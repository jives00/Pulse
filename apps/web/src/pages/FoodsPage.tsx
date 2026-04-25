import { useState, useEffect, useRef } from 'react';
import { foodsApi, logApi } from '@pulse/api-client';
import type { Food, MealSlot } from '@pulse/api-client';

type Tab = 'search' | 'custom';

const CONFIDENCE_COLORS = {
  high: 'text-emerald-400',
  medium: 'text-yellow-400',
  low: 'text-red-400',
};

function FoodCard({ food, onDelete }: { food: Food; onDelete?: (id: number) => void }) {
  const def = food.servingSizes.find((s) => s.isDefault) ?? food.servingSizes[0];
  const cal = def
    ? Math.round(food.nutrition.calories * def.grams / 100)
    : Math.round(food.nutrition.calories);

  return (
    <div className="flex items-center px-4 py-3 border-b border-slate-700/50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200 truncate">{food.name}</div>
        {food.brand && <div className="text-xs text-slate-500 truncate">{food.brand}</div>}
        <div className="text-xs text-slate-400 mt-0.5">
          {cal} cal{def ? ` / ${def.label}` : ' / 100g'}
          {' · '}P {Math.round(food.nutrition.protein * (def?.grams ?? 100) / 100)}g
          {' · '}C {Math.round(food.nutrition.carbs * (def?.grams ?? 100) / 100)}g
          {' · '}F {Math.round(food.nutrition.fat * (def?.grams ?? 100) / 100)}g
        </div>
      </div>
      {onDelete && food.isCustom && (
        <button
          onClick={() => onDelete(food.id)}
          className="ml-3 text-slate-600 hover:text-red-400 transition-colors text-sm shrink-0"
          title="Delete custom food"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function CreateFoodForm({ onCreated }: { onCreated: (food: Food) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [desc, setDesc] = useState('');
  const [calories, setCalories] = useState('');
  const [carbs, setCarbs] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [sodium, setSodium] = useState('');
  const [servingLabel, setServingLabel] = useState('1 serving');
  const [servingGrams, setServingGrams] = useState('100');
  const [estimating, setEstimating] = useState(false);
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [logAfterSave, setLogAfterSave] = useState(false);
  const [logMeal, setLogMeal] = useState<MealSlot>('lunch');

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function reset() {
    setName(''); setBrand(''); setDesc('');
    setCalories(''); setCarbs(''); setProtein(''); setFat('');
    setFiber(''); setSodium('');
    setServingLabel('1 serving'); setServingGrams('100');
    setConfidence(null); setError('');
    setLogAfterSave(false); setLogMeal('lunch');
  }

  async function handleEstimate() {
    if (!name.trim()) return;
    setEstimating(true);
    setConfidence(null);
    try {
      const result = await foodsApi.estimateMacros({
        name, brand: brand || undefined, description: desc || undefined,
      });
      const n = result.nutrition;
      setCalories(String(Math.round(n.calories)));
      setCarbs(String(Math.round(n.carbs * 10) / 10));
      setProtein(String(Math.round(n.protein * 10) / 10));
      setFat(String(Math.round(n.fat * 10) / 10));
      if (n.fiber != null) setFiber(String(Math.round(n.fiber * 10) / 10));
      if (n.sodium != null) setSodium(String(Math.round(n.sodium)));
      setConfidence(result.confidence);
    } catch {
      setError('AI estimation failed');
    } finally {
      setEstimating(false);
    }
  }

  async function handleSave(andLog = false) {
    if (!name.trim() || !calories) return;
    setSaving(true);
    setError('');
    try {
      const food = await foodsApi.create({
        name,
        brand: brand || undefined,
        nutrition: {
          calories: Number(calories),
          carbs: Number(carbs) || 0,
          protein: Number(protein) || 0,
          fat: Number(fat) || 0,
          fiber: fiber ? Number(fiber) : undefined,
          sodium: sodium ? Number(sodium) : undefined,
        },
        servingSizes: [{ label: servingLabel || '1 serving', grams: Number(servingGrams) || 100, isDefault: true }],
      });
      if (andLog && food.servingSizes.length > 0) {
        const serving = food.servingSizes.find((s) => s.isDefault) ?? food.servingSizes[0];
        await logApi.add({ logDate: todayStr(), meal: logMeal, foodId: food.id, servingSizeId: serving.id, quantity: 1 });
      }
      onCreated(food);
      reset();
      setOpen(false);
    } catch {
      setError('Failed to save food');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500';
  const smallInputCls = 'w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-sm text-blue-400 hover:text-blue-300 transition-colors py-3 border border-dashed border-slate-700 rounded-lg"
      >
        + Create custom food
      </button>
    );
  }

  return (
    <div className="border border-slate-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Create custom food</h3>
        <button onClick={() => { reset(); setOpen(false); }} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
      </div>

      <div className="space-y-2">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Name *</label>
          <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Brand</label>
          <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Description <span className="text-slate-500">(helps AI estimate)</span>
          </label>
          <input type="text" placeholder="e.g. grilled, with sauce, homemade…" value={desc} onChange={(e) => setDesc(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Nutrition per 100g</span>
          <button
            onClick={handleEstimate}
            disabled={estimating || !name.trim()}
            className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
          >
            {estimating ? 'Estimating…' : '✨ Estimate with AI'}
          </button>
        </div>
        {confidence && (
          <div className={`text-xs mb-2 ${CONFIDENCE_COLORS[confidence]}`}>AI confidence: {confidence}</div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {([
            ['Calories (kcal) *', calories, setCalories],
            ['Carbs (g) *', carbs, setCarbs],
            ['Protein (g) *', protein, setProtein],
            ['Fat (g) *', fat, setFat],
            ['Fiber (g)', fiber, setFiber],
            ['Sodium (mg)', sodium, setSodium],
          ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
            <div key={label}>
              <label className="block text-xs text-slate-500 mb-1">{label}</label>
              <input type="number" min="0" step="0.1" value={val} onChange={(e) => setter(e.target.value)} className={smallInputCls} />
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-2">Serving size</span>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Label</label>
            <input type="text" value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} className={smallInputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Grams</label>
            <input type="number" min="1" value={servingGrams} onChange={(e) => setServingGrams(e.target.value)} className={smallInputCls} />
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="border-t border-slate-700 pt-3 space-y-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={logAfterSave}
              onChange={(e) => setLogAfterSave(e.target.checked)}
              className="accent-blue-500"
            />
            <span className="text-xs text-slate-400">Log to today's food journal</span>
          </label>
          {logAfterSave && (
            <select
              value={logMeal}
              onChange={(e) => setLogMeal(e.target.value as MealSlot)}
              className="ml-auto bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          )}
        </div>
        <button
          onClick={() => handleSave(logAfterSave)}
          disabled={saving || !name.trim() || !calories}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
        >
          {saving ? 'Saving…' : logAfterSave ? 'Save & log today' : 'Save food'}
        </button>
      </div>
    </div>
  );
}

export default function FoodsPage() {
  const [tab, setTab] = useState<Tab>('search');

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchId = useRef(0);

  // Custom foods state
  const [customFoods, setCustomFoods] = useState<Food[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(false);

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

  // Load custom foods when tab switches to custom
  useEffect(() => {
    if (tab !== 'custom') return;
    setLoadingCustom(true);
    foodsApi.listCustom()
      .then(setCustomFoods)
      .catch(() => {/* ignore */})
      .finally(() => setLoadingCustom(false));
  }, [tab]);

  function handleCreated(food: Food) {
    setCustomFoods((prev) => [food, ...prev]);
  }

  async function handleDelete(id: number) {
    try {
      await foodsApi.delete(id);
      setCustomFoods((prev) => prev.filter((f) => f.id !== id));
    } catch {
      // ignore — server returns 409 if food is in log
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-dram-border">
        <h1 className="text-xl font-semibold text-slate-200">Foods</h1>

        {/* Tab bar */}
        <div className="flex gap-1 mt-3">
          {(['search', 'custom'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
                tab === t
                  ? 'border-dram-accent text-dram-accent'
                  : 'border-transparent text-dram-muted hover:text-slate-200'
              }`}
            >
              {t === 'search' ? 'Search' : 'My Custom Foods'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">

      {/* Search tab */}
      {tab === 'search' && (
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search foods (USDA, Open Food Facts, custom)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />

          <div className="bg-slate-800 rounded-lg overflow-hidden">
            {searching && (
              <div className="px-4 py-6 text-center text-sm text-slate-500">Searching…</div>
            )}
            {!searching && results.length > 0 && (
              results.map((food) => <FoodCard key={food.id} food={food} />)
            )}
            {!searching && query.trim() && results.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                No results for "{query}"
              </div>
            )}
            {!query.trim() && (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                Start typing to search
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom foods tab */}
      {tab === 'custom' && (
        <div className="space-y-4">
          <CreateFoodForm onCreated={handleCreated} />

          <div className="bg-slate-800 rounded-lg overflow-hidden">
            {loadingCustom && (
              <div className="px-4 py-6 text-center text-sm text-slate-500">Loading…</div>
            )}
            {!loadingCustom && customFoods.length > 0 && (
              customFoods.map((food) => (
                <FoodCard key={food.id} food={food} onDelete={handleDelete} />
              ))
            )}
            {!loadingCustom && customFoods.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                No custom foods yet
              </div>
            )}
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
