import { useEffect, useState } from 'react';
import { recipesApi, type RecipeDetail as RecipeDetailType, type MakeLogEntry, type MealSlot } from '@pulse/api-client';
import Spinner from './Spinner';

interface Props {
  recipeId: number;
  onClose: () => void;
  onEdit: (recipe: RecipeDetailType) => void;
  onDeleted: () => void;
  onUpdated: () => void;
}

const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

function defaultMealByTime(): MealSlot {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return 'breakfast';
  if (h >= 11 && h < 14) return 'lunch';
  if (h >= 17 && h < 20) return 'dinner';
  return 'snack';
}

function formatTime(minutes?: number | null) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function RecipeDetail({ recipeId, onClose, onEdit, onDeleted, onUpdated }: Props) {
  const [recipe, setRecipe] = useState<RecipeDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [servings, setServings] = useState(1);
  const [baseServings, setBaseServings] = useState(1);
  const [logging, setLogging] = useState(false);
  const [showCookModal, setShowCookModal] = useState(false);
  const [cookMeal, setCookMeal] = useState<MealSlot>(defaultMealByTime());
  const [cookServings, setCookServings] = useState('1');
  const [cookDate, setCookDate] = useState(new Date().toISOString().slice(0, 10));
  const [deleting, setDeleting] = useState(false);
  const [togglingFav, setTogglingFav] = useState(false);
  const [log, setLog] = useState<MakeLogEntry[]>([]);

  useEffect(() => {
    setLoading(true);
    recipesApi.get(recipeId)
      .then((r) => {
        setRecipe(r);
        const s = (r as any).servings || 1;
        setServings(s);
        setBaseServings(s);
      })
      .finally(() => setLoading(false));
    recipesApi.getLog(recipeId).then((data) => setLog(data.entries)).catch(() => {});
  }, [recipeId]);

  async function handleLog() {
    if (!recipe) return;
    setLogging(true);
    try {
      const qty = Number(cookServings) || 1;
      await recipesApi.log(recipe.id, { meal: cookMeal, servings: qty, logDate: cookDate });
      const [updated, logData] = await Promise.all([
        recipesApi.get(recipe.id),
        recipesApi.getLog(recipe.id),
      ]);
      setRecipe(updated);
      setLog(logData.entries);
      setShowCookModal(false);
      onUpdated();
    } finally {
      setLogging(false);
    }
  }

  async function handleDeleteLogEntry(logId: number) {
    if (!recipe) return;
    await recipesApi.deleteLogEntry(recipe.id, logId);
    setLog((prev) => prev.filter((e) => e.id !== logId));
    onUpdated();
  }

  async function handleClearLog() {
    if (!recipe) return;
    if (!window.confirm('Clear all made history for this recipe?')) return;
    try {
      await recipesApi.clearLog(recipe.id);
      setLog([]);
      onUpdated();
    } catch (err) {
      console.error('Failed to clear log:', err);
    }
  }

  async function handleToggleFav() {
    if (!recipe || togglingFav) return;
    setTogglingFav(true);
    const newFav = recipe.is_favorite ? 0 : 1;
    try {
      await recipesApi.update(recipe.id, {
        type: recipe.type,
        name: recipe.name,
        is_favorite: newFav,
      });
      setRecipe({ ...recipe, is_favorite: newFav });
      onUpdated();
    } finally {
      setTogglingFav(false);
    }
  }

  async function handleDelete() {
    if (!recipe) return;
    if (!window.confirm(`Delete "${recipe.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await recipesApi.delete(recipe.id);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  const isFav = Boolean(recipe?.is_favorite);

  return (
    <>
    <div className="h-full flex flex-col bg-dram-card border-l border-dram-border">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-dram-border flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
          ← Back
        </button>
        {recipe && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleFav}
              disabled={togglingFav}
              className={`text-xl transition ${isFav ? 'text-dram-accent' : 'text-gray-600 hover:text-dram-accent'}`}
            >
              ★
            </button>
            <button
              onClick={() => onEdit(recipe)}
              className="text-xs text-gray-400 hover:text-white border border-dram-border rounded-lg px-3 py-1"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-red-400 hover:text-red-300 border border-red-900/40 rounded-lg px-3 py-1 disabled:opacity-50"
            >
              {deleting ? '…' : 'Delete'}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center mt-16">
            <Spinner size={8} />
          </div>
        ) : !recipe ? (
          <p className="text-gray-500 text-center mt-16">Recipe not found.</p>
        ) : (
          <>
            {/* Photo */}
            <div className="aspect-video bg-dram-card relative overflow-hidden">
              {recipe.photo_url ? (
                <img src={recipe.photo_url} alt={recipe.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-6xl opacity-20">
                    {recipe.type === 'cocktail' ? '🍸' : '🍴'}
                  </span>
                </div>
              )}
            </div>

            <div className="px-5 py-4">
              {/* Title & meta */}
              <h2 className="text-2xl font-bold text-white leading-tight">{recipe.name}</h2>
              <p className="text-gray-400 text-sm mt-1 capitalize">
                {recipe.type === 'cocktail' ? '🍸' : '🍴'} {recipe.type}
                {(recipe as any).subcategory && (
                  <span className="ml-2 text-xs bg-dram-border px-2 py-0.5 rounded-full">
                    {(recipe as any).subcategory === 'main' ? 'Main Dish' : (recipe as any).subcategory === 'side' ? 'Side Dish' : (recipe as any).subcategory === 'breakfast' ? 'Breakfast' : 'Dessert'}
                  </span>
                )}
              </p>

              {/* Tags */}
              {recipe.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {recipe.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs border border-dram-accent/40 text-dram-accent rounded-full px-2.5 py-0.5 capitalize"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              {recipe.description && (
                <p className="text-gray-300 text-sm mt-4 leading-relaxed">{recipe.description}</p>
              )}

              {/* Serving scaler */}
              <div className="flex items-center gap-3 mt-5 py-3 border-y border-dram-border">
                <span className="text-sm text-gray-400">Servings</span>
                <button
                  onClick={() => setServings((s) => Math.max(1, s - 1))}
                  className="w-7 h-7 rounded-full bg-dram-border text-white flex items-center justify-center hover:bg-gray-600"
                >
                  −
                </button>
                <span className="text-white font-semibold w-4 text-center">{servings}</span>
                <button
                  onClick={() => setServings((s) => s + 1)}
                  className="w-7 h-7 rounded-full bg-dram-border text-white flex items-center justify-center hover:bg-gray-600"
                >
                  +
                </button>
              </div>

              {/* Ingredients */}
              {recipe.ingredients.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
                    Ingredients
                  </h3>
                  <ul className="space-y-2">
                    {recipe.ingredients.map((ing, i) => (
                      <li key={i} className="flex items-baseline gap-3 text-sm min-w-0">
                        <span className="text-dram-accent w-32 flex-shrink-0 text-right whitespace-nowrap">
                          {ing.quantity
                            ? `${+(ing.quantity * servings / baseServings).toFixed(2)} ${ing.unit || ''}`.trim()
                            : ing.unit || '—'}
                        </span>
                        <span className="text-white">{ing.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Steps */}
              {recipe.steps.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
                    Method
                  </h3>
                  <ol className="space-y-3">
                    {recipe.steps.map((step) => (
                      <li key={step.step_number} className="flex gap-3 text-sm">
                        <span className="text-dram-accent font-bold w-5 flex-shrink-0">
                          {step.step_number}.
                        </span>
                        <span className="text-gray-200 leading-relaxed">{step.instruction}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Notes */}
              {recipe.notes && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2">
                    Notes
                  </h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{recipe.notes}</p>
                </div>
              )}

              {/* Nutrition — food only */}
              {recipe.type === 'food' && (recipe.calories || recipe.carbs_g || recipe.protein_g || recipe.fat_g) && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Nutrition per serving</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Calories', value: recipe.calories, unit: 'kcal' },
                      { label: 'Carbs', value: recipe.carbs_g, unit: 'g' },
                      { label: 'Protein', value: recipe.protein_g, unit: 'g' },
                      { label: 'Fat', value: recipe.fat_g, unit: 'g' },
                      { label: 'Fiber', value: recipe.fiber_g, unit: 'g' },
                      { label: 'Sodium', value: recipe.sodium_mg, unit: 'mg' },
                    ].filter(({ value }) => value != null).map(({ label, value, unit }) => (
                      <div key={label} className="bg-dram-card rounded-lg px-3 py-2 text-center">
                        <p className="text-dram-accent font-semibold text-sm">{value}{unit}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer meta */}
              <div className="mt-6 pt-4 border-t border-dram-border space-y-1 text-xs text-gray-500">
                {recipe.source && (
                  <p>From: <a href={recipe.source} target="_blank" rel="noopener noreferrer" className="text-dram-accent hover:underline">{recipe.source}</a></p>
                )}
                {(recipe.prep_time || recipe.cook_time) && (
                  <p>
                    {recipe.prep_time ? `Prep: ${formatTime(recipe.prep_time)}` : ''}
                    {recipe.prep_time && recipe.cook_time ? '  ·  ' : ''}
                    {recipe.cook_time ? `Cook: ${formatTime(recipe.cook_time)}` : ''}
                  </p>
                )}
                {recipe.glass_type && <p>Glass: {recipe.glass_type}</p>}
                {recipe.abv_level && <p>ABV: {recipe.abv_level}</p>}
              </div>

              {/* Log button */}
              <button
                onClick={() => { setCookMeal(defaultMealByTime()); setCookServings('1'); setCookDate(new Date().toISOString().slice(0, 10)); setShowCookModal(true); }}
                className="w-full mt-6 bg-dram-accent text-black font-semibold py-2.5 rounded-lg hover:brightness-110 transition"
              >
                ✔ I made this!
              </button>

              {/* Made history */}
              <div className="mt-6 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                    Made History ({log.length})
                  </h3>
                  {log.length > 0 && (
                    <button onClick={handleClearLog} className="text-xs text-red-400 hover:text-red-300">Clear all</button>
                  )}
                </div>
                {log.length === 0 ? (
                  <p className="text-gray-500 text-xs">Not made yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {log.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">
                          {new Date(entry.made_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <button
                          onClick={() => handleDeleteLogEntry(entry.id)}
                          className="text-xs text-gray-600 hover:text-red-400 transition"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>

    {/* Cook modal — meal slot + servings + date */}
    {showCookModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCookModal(false)} />
        <div className="relative w-full max-w-sm bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-200">I made this!</h2>
            <button onClick={() => setShowCookModal(false)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-2">Meal</label>
              <div className="grid grid-cols-2 gap-2">
                {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCookMeal(m)}
                    className={`py-2 rounded-lg text-sm border transition ${cookMeal === m ? 'border-dram-accent text-dram-accent bg-dram-accent/10' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}
                  >
                    {MEAL_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Servings</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={cookServings}
                onChange={(e) => setCookServings(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-dram-accent"
              />
            </div>
            {recipe?.calories != null && (
              <div className="bg-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-400">
                ≈ {Math.round(recipe.calories * (Number(cookServings) || 1))} cal — will also log to nutrition
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Date</label>
              <input
                type="date"
                value={cookDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setCookDate(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-dram-accent"
              />
            </div>
            <button
              onClick={handleLog}
              disabled={logging || Number(cookServings) <= 0}
              className="w-full bg-dram-accent text-black font-semibold py-2.5 rounded-lg hover:brightness-110 transition disabled:opacity-50"
            >
              {logging ? '…' : 'Log it'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
