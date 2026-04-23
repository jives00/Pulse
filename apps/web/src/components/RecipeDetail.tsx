import { useEffect, useState } from 'react';
import { recipesApi, type RecipeDetail as RecipeDetailType, type MakeLogEntry, type MealSlot, type RecipeFormData } from '@pulse/api-client';
import Spinner from './Spinner';

// ── AI Modify Modal ───────────────────────────────────────────────────────────
// Extracted as its own component so textarea keystrokes only re-render this
// small subtree, not the full RecipeDetail.

function normQty(v: number | string | null | undefined) {
  return Math.round((Number(v) || 0) * 1000);
}
function normUnit(v: string | null | undefined) {
  return (v || '').trim().toLowerCase();
}

interface AiModifyModalProps {
  recipe: RecipeDetailType;
  onClose: () => void;
  onSaved: (updatedRecipe: RecipeDetailType, logEntries: MakeLogEntry[]) => void;
}

function AiModifyModal({ recipe, onClose, onSaved }: AiModifyModalProps) {
  const [step, setStep] = useState<'prompt' | 'preview'>('prompt');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecipeFormData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSubmit() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { modified } = await recipesApi.aiModify(recipe.id, prompt.trim(), 'update');
      setResult(modified as RecipeFormData);
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
      await recipesApi.update(recipe.id, {
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
        const logDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        await recipesApi.log(recipe.id, { meal: defaultMealByTime(), servings: 1, logDate });
      }
      const [updated, logData] = await Promise.all([
        recipesApi.get(recipe.id),
        recipesApi.getLog(recipe.id),
      ]);
      onSaved(updated, logData.entries);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Compute ingredient diff
  const origByName = new Map(recipe.ingredients.map((i) => [i.name.toLowerCase().trim(), i]));
  const newByName = result ? new Map(result.ingredients.map((i) => [i.name.toLowerCase().trim(), i])) : new Map();
  const removed = recipe.ingredients.filter((i) => !newByName.has(i.name.toLowerCase().trim()));
  const added = result ? result.ingredients.filter((i) => !origByName.has(i.name.toLowerCase().trim())) : [];
  const changed = result ? result.ingredients.filter((i) => {
    const orig = origByName.get(i.name.toLowerCase().trim());
    if (!orig) return false;
    return normQty(orig.quantity) !== normQty(i.quantity) || normUnit(orig.unit) !== normUnit(i.unit);
  }) : [];

  // Compute macro diff — only show fields where AI returned a value AND it differs
  const macroDiff = result ? [
    { label: 'Calories', orig: recipe.calories, next: result.calories, unit: 'kcal' },
    { label: 'Carbs',    orig: recipe.carbs_g,   next: result.carbs_g,   unit: 'g' },
    { label: 'Protein',  orig: recipe.protein_g,  next: result.protein_g,  unit: 'g' },
    { label: 'Fat',      orig: recipe.fat_g,      next: result.fat_g,      unit: 'g' },
    { label: 'Fiber',    orig: recipe.fiber_g,    next: result.fiber_g,    unit: 'g' },
    { label: 'Sodium',   orig: recipe.sodium_mg,  next: result.sodium_mg,  unit: 'mg' },
  ].filter(({ next, orig }) => next != null && next !== orig) : [];

  const hasChanges = removed.length > 0 || added.length > 0 || changed.length > 0 || macroDiff.length > 0 || (result && result.name !== recipe.name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-200">Modify this recipe</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        {step === 'prompt' && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-slate-400">Describe what you'd like to change. The AI will update the ingredients, steps, and macros.</p>
            <textarea
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
              placeholder='e.g. "replace butter with olive oil" or "make it dairy-free"'
              rows={3}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-dram-accent resize-none"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={loading || !prompt.trim()}
              className="w-full bg-dram-accent text-black font-semibold py-2.5 rounded-lg hover:brightness-110 transition disabled:opacity-50"
            >
              {loading ? 'Modifying…' : 'Preview changes'}
            </button>
          </div>
        )}

        {step === 'preview' && result && (
          <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {result.name !== recipe.name && (
              <div>
                <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">Name</p>
                <p className="text-sm text-slate-300 line-through opacity-50">{recipe.name}</p>
                <p className="text-sm text-white">{result.name}</p>
              </div>
            )}
            {(removed.length > 0 || added.length > 0 || changed.length > 0) && (
              <div>
                <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Ingredients</p>
                <ul className="space-y-1 text-sm">
                  {removed.map((i) => (
                    <li key={i.name} className="text-red-400 line-through opacity-70">{i.name}</li>
                  ))}
                  {added.map((i) => (
                    <li key={i.name} className="text-green-400">+ {i.quantity} {i.unit} {i.name}</li>
                  ))}
                  {changed.map((i) => {
                    const orig = origByName.get(i.name.toLowerCase().trim())!;
                    return (
                      <li key={i.name} className="text-yellow-400">
                        {i.name}: <span className="line-through opacity-60">{orig.quantity}{orig.unit ? ` ${orig.unit}` : ''}</span> → {i.quantity}{i.unit ? ` ${i.unit}` : ''}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {macroDiff.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Macros</p>
                <div className="space-y-1">
                  {macroDiff.map(({ label, orig, next, unit }) => (
                    <div key={label} className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400 w-16">{label}</span>
                      <span className="text-slate-500 line-through">{orig ?? '—'}{unit}</span>
                      <span className="text-slate-300">→ {next}{unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!hasChanges && <p className="text-sm text-slate-400">No changes detected.</p>}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="flex-1 bg-dram-accent text-black font-semibold py-2.5 rounded-lg hover:brightness-110 transition disabled:opacity-50"
              >
                {saving ? '…' : 'Save'}
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="flex-1 bg-dram-accent/20 text-dram-accent font-semibold py-2.5 rounded-lg hover:bg-dram-accent/30 transition disabled:opacity-50 border border-dram-accent/40"
              >
                {saving ? '…' : 'Save & Log'}
              </button>
            </div>
            <button
              onClick={() => { setStep('prompt'); setError(null); }}
              className="w-full text-xs text-slate-500 hover:text-slate-300 py-1"
            >
              ← Back to edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [cookDate, setCookDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  const [deleting, setDeleting] = useState(false);
  const [togglingFav, setTogglingFav] = useState(false);
  const [log, setLog] = useState<MakeLogEntry[]>([]);
  const [showAiModal, setShowAiModal] = useState(false);

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

  useEffect(() => {
    if (!showCookModal) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCookModal(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showCookModal]);

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
              onClick={() => setShowAiModal(true)}
              className="text-xs text-gray-400 hover:text-white border border-dram-border rounded-lg px-3 py-1"
            >
              Modify
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
                    {(recipe as any).subcategory === 'main' ? 'Main Dish' : (recipe as any).subcategory === 'side' ? 'Side Dish' : (recipe as any).subcategory === 'breakfast' ? 'Breakfast' : (recipe as any).subcategory === 'prepackaged' ? 'Prepackaged' : 'Desserts & Snacks'}
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

              {/* Nutrition — food, prepackaged, and cocktails with data */}
              {(recipe.calories || recipe.carbs_g || recipe.protein_g || recipe.fat_g) && (
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
                onClick={() => { const d = new Date(); setCookMeal(defaultMealByTime()); setCookServings('1'); setCookDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); setShowCookModal(true); }}
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
                max={cookDate}
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

    {showAiModal && recipe && (
      <AiModifyModal
        recipe={recipe}
        onClose={() => setShowAiModal(false)}
        onSaved={(updatedRecipe, logEntries) => {
          setRecipe(updatedRecipe);
          setLog(logEntries);
          setShowAiModal(false);
          onUpdated();
        }}
      />
    )}
</>
  );
}
