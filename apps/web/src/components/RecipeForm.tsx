import { useState, useEffect, FormEvent, useRef } from 'react';
import {
  recipesApi,
  tagsApi,
  uploadPhotoToS3,
  type TagDefinitions,
  type RecipeDetail,
  type Ingredient,
} from '@pulse/api-client';

interface Props {
  initialData?: RecipeDetail;
  onSaved: (id: number) => void;
  onCancel: () => void;
}

const ABV_OPTIONS = ['Low', 'Medium', 'Strong'];
const GLASS_OPTIONS = ['Rocks', 'Coupe', 'Highball', 'Martini', 'Flute', 'Nick & Nora', 'Mule', 'Collins', 'Other'];
const UNIT_OPTIONS = ['oz', 'ml', 'dash', 'tsp', 'tbsp', 'cup', 'g', 'lb', 'piece', 'sprig', 'slice', ''];

type IngredientRow = { name: string; quantity: string; unit: string };

function toRows(ingredients: Ingredient[]): IngredientRow[] {
  return ingredients.map((i) => ({
    name: i.name,
    quantity: i.quantity != null ? String(i.quantity) : '',
    unit: i.unit || '',
  }));
}

export default function RecipeForm({ initialData, onSaved, onCancel }: Props) {
  const isEdit = Boolean(initialData);

  const [type, setType] = useState<'cocktail' | 'food'>(initialData?.type || 'cocktail');
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [source, setSource] = useState(initialData?.source || '');
  const [prepTime, setPrepTime] = useState(initialData?.prep_time ? String(initialData.prep_time) : '');
  const [cookTime, setCookTime] = useState(initialData?.cook_time ? String(initialData.cook_time) : '');
  const [servings, setServings] = useState(initialData?.servings ? String(initialData.servings) : '');
  const [subcategory, setSubcategory] = useState((initialData as any)?.subcategory || '');
  const [glassType, setGlassType] = useState(initialData?.glass_type || '');
  const [abvLevel, setAbvLevel] = useState(initialData?.abv_level || '');
  const [calories, setCalories] = useState(initialData?.calories ? String(initialData.calories) : '');
  const [carbsG, setCarbsG] = useState(initialData?.carbs_g ? String(initialData.carbs_g) : '');
  const [proteinG, setProteinG] = useState(initialData?.protein_g ? String(initialData.protein_g) : '');
  const [fatG, setFatG] = useState(initialData?.fat_g ? String(initialData.fat_g) : '');
  const [fiberG, setFiberG] = useState(initialData?.fiber_g ? String(initialData.fiber_g) : '');
  const [sodiumMg, setSodiumMg] = useState(initialData?.sodium_mg ? String(initialData.sodium_mg) : '');
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initialData?.ingredients.length ? toRows(initialData.ingredients) : [{ name: '', quantity: '', unit: 'oz' }]
  );
  const [steps, setSteps] = useState<string[]>(
    initialData?.steps.length ? initialData.steps.map((s) => s.instruction) : ['']
  );
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [tagDefs, setTagDefs] = useState<TagDefinitions | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialData?.photo_url || null);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [importTab, setImportTab] = useState<'url' | 'paste'>('url');
  const [importUrl, setImportUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    tagsApi.getDefinitions().then(setTagDefs).catch(() => {});
  }, []);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleImport() {
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportError('');
    try {
      const data = await recipesApi.scrape(importUrl.trim(), type);
      setName(data.name || '');
      setType(data.type || type);
      setDescription(data.description || '');
      setPrepTime(data.prep_time ? String(data.prep_time) : '');
      setCookTime(data.cook_time ? String(data.cook_time) : '');
      setServings((data as any).servings ? String((data as any).servings) : '');
      setSubcategory((data as any).subcategory || '');
      setGlassType(data.glass_type || '');
      setSource(data.source || new URL(importUrl).hostname.replace('www.', ''));
      setCalories(data.calories ? String(data.calories) : '');
      setCarbsG(data.carbs_g ? String(data.carbs_g) : '');
      setProteinG(data.protein_g ? String(data.protein_g) : '');
      setFatG(data.fat_g ? String(data.fat_g) : '');
      setFiberG(data.fiber_g ? String(data.fiber_g) : '');
      setSodiumMg(data.sodium_mg ? String(data.sodium_mg) : '');
      if (data.ingredients.length) {
        setIngredients(data.ingredients.map((i) => ({
          name: i.name,
          quantity: i.quantity != null ? String(i.quantity) : '',
          unit: i.unit || '',
        })));
      }
      if (data.steps.length) setSteps(data.steps);
      if (data.suggested_tags.length) setTags(data.suggested_tags);
      if (data.photo_url) { setPhotoUrlInput(data.photo_url); setPhotoPreview(null); setPhotoFile(null); }
      setImportUrl('');
    } catch (err: any) {
      setImportError(err?.message || 'Could not import from that URL. Try a different recipe page.');
    } finally {
      setImporting(false);
    }
  }

  async function handleParseText() {
    if (!pasteText.trim()) return;
    setImporting(true);
    setImportError('');
    try {
      const data = await recipesApi.parseText(pasteText.trim(), type);
      setName(data.name || '');
      setType(data.type || type);
      setDescription(data.description || '');
      setPrepTime(data.prep_time ? String(data.prep_time) : '');
      setCookTime(data.cook_time ? String(data.cook_time) : '');
      setServings((data as any).servings ? String((data as any).servings) : '');
      setSubcategory((data as any).subcategory || '');
      setGlassType(data.glass_type || '');
      setCalories((data as any).calories ? String((data as any).calories) : '');
      setCarbsG((data as any).carbs_g ? String((data as any).carbs_g) : '');
      setProteinG((data as any).protein_g ? String((data as any).protein_g) : '');
      setFatG((data as any).fat_g ? String((data as any).fat_g) : '');
      setFiberG((data as any).fiber_g ? String((data as any).fiber_g) : '');
      setSodiumMg((data as any).sodium_mg ? String((data as any).sodium_mg) : '');
      if (data.ingredients.length) {
        setIngredients(data.ingredients.map((i) => ({
          name: i.name,
          quantity: i.quantity != null ? String(i.quantity) : '',
          unit: i.unit || '',
        })));
      }
      if (data.steps.length) setSteps(data.steps);
      if (data.suggested_tags.length) setTags(data.suggested_tags);
      setPasteText('');
    } catch (err: any) {
      setImportError(err?.message || 'Could not parse recipe text.');
    } finally {
      setImporting(false);
    }
  }

  function toggleTag(t: string) {
    setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }

  function updateIngredient(idx: number, field: keyof IngredientRow, val: string) {
    setIngredients((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: val } : row)));
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, { name: '', quantity: '', unit: 'oz' }]);
  }

  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, val: string) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? val : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, '']);
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setError('');
    setSaving(true);

    try {
      const payload = {
        type,
        name: name.trim(),
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        source: source.trim() || undefined,
        prep_time: prepTime ? parseInt(prepTime) : undefined,
        cook_time: cookTime ? parseInt(cookTime) : undefined,
        servings: servings ? parseInt(servings) : undefined,
        subcategory: subcategory || undefined,
        glass_type: glassType.trim() || undefined,
        abv_level: abvLevel || undefined,
        calories: calories ? parseInt(calories) : undefined,
        carbs_g: carbsG ? parseFloat(carbsG) : undefined,
        protein_g: proteinG ? parseFloat(proteinG) : undefined,
        fat_g: fatG ? parseFloat(fatG) : undefined,
        fiber_g: fiberG ? parseFloat(fiberG) : undefined,
        sodium_mg: sodiumMg ? parseInt(sodiumMg) : undefined,
        ingredients: ingredients
          .filter((i) => i.name.trim())
          .map((i) => ({
            name: i.name.trim(),
            quantity: i.quantity ? parseFloat(i.quantity) : null,
            unit: i.unit || null,
          })),
        steps: steps.filter((s) => s.trim()),
        tags,
      };

      let recipeId: number;

      if (isEdit && initialData) {
        await recipesApi.update(initialData.id, payload);
        recipeId = initialData.id;
      } else {
        const result = await recipesApi.create(payload);
        recipeId = result.id;
      }

      // Upload photo if selected
      if (photoFile) {
        const { uploadUrl, key } = await recipesApi.getPhotoUploadUrl(recipeId, photoFile.type);
        await uploadPhotoToS3(uploadUrl, photoFile);
        await recipesApi.update(recipeId, { type, name: name.trim(), photo_key: key });
      } else if (photoUrlInput.trim()) {
        await recipesApi.uploadPhotoFromUrl(recipeId, photoUrlInput.trim());
      }

      onSaved(recipeId);
    } catch (err: any) {
      setError(err.message || 'Failed to save recipe');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-dram-card border-l border-dram-border">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-dram-border flex-shrink-0">
        <button onClick={onCancel} className="text-gray-400 hover:text-white text-sm">
          ✕ Cancel
        </button>
        <h2 className="font-semibold text-white">{isEdit ? 'Edit Recipe' : 'Add Recipe'}</h2>
        <button
          onClick={handleSubmit as any}
          disabled={saving}
          className="bg-dram-accent text-black text-sm font-semibold px-4 py-1.5 rounded-lg hover:brightness-110 transition disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Import */}
        <div className="bg-dram-card border border-dram-border rounded-xl p-4">
          <div className="flex gap-1 mb-3">
            {(['url', 'paste'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setImportTab(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${importTab === tab ? 'bg-dram-accent text-black' : 'text-gray-400 hover:text-white'}`}
              >
                {tab === 'url' ? 'Import from URL' : 'Paste Text'}
              </button>
            ))}
          </div>
          {importTab === 'url' ? (
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://example.com/old-fashioned"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                className="flex-1 bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              />
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || !importUrl.trim()}
                className="bg-dram-accent text-black text-sm font-semibold px-4 rounded-lg hover:brightness-110 disabled:opacity-40"
              >
                {importing ? '…' : 'Import'}
              </button>
            </div>
          ) : (
            <div>
              <textarea
                placeholder="Paste a recipe here — ingredients, steps, any format…"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent resize-none"
              />
              <button
                type="button"
                onClick={handleParseText}
                disabled={importing || !pasteText.trim()}
                className="mt-2 bg-dram-accent text-black text-sm font-semibold px-4 py-2 rounded-lg hover:brightness-110 disabled:opacity-40"
              >
                {importing ? '…' : 'Parse Recipe'}
              </button>
            </div>
          )}
          {importError && <p className="text-red-400 text-xs mt-2">{importError}</p>}
        </div>

        {/* Photo */}
        <div>
          <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Photo</p>
          {(photoPreview || photoUrlInput) && (
            <img
              src={photoUrlInput.trim() || photoPreview!}
              alt="preview"
              className="w-full h-40 object-cover rounded-xl mb-2"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          )}
          <div
            onClick={() => photoInputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-dram-border hover:border-dram-accent/50 transition h-12 flex items-center justify-center text-gray-600 text-sm gap-2"
          >
            📷 {photoPreview || photoUrlInput ? 'Change file…' : 'Upload file…'}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="hidden"
          />
          <div className="flex gap-2 mt-2">
            <input
              type="url"
              placeholder="…or paste an image URL"
              value={photoUrlInput}
              onChange={(e) => { setPhotoUrlInput(e.target.value); setPhotoFile(null); setPhotoPreview(null); }}
              className="flex-1 bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
            />
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-dram-accent"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Type</label>
          <div className="flex gap-2">
            {(['cocktail', 'food'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`px-4 py-2 rounded-lg text-sm capitalize border transition ${
                  type === t
                    ? 'border-dram-accent text-dram-accent bg-dram-accent/10'
                    : 'border-dram-border text-gray-400 hover:border-gray-600'
                }`}
              >
                {t === 'cocktail' ? '🍸 Cocktail' : '🍴 Food'}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-dram-accent resize-none"
          />
        </div>

        {/* Ingredients */}
        <div>
          <label className="block text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Ingredients</label>
          <div className="space-y-2">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Qty"
                  value={ing.quantity}
                  onChange={(e) => updateIngredient(idx, 'quantity', e.target.value)}
                  className="w-16 bg-dram-card border border-dram-border rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-dram-accent"
                />
                <select
                  value={ing.unit}
                  onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                  className="w-20 bg-dram-card border border-dram-border rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-dram-accent"
                >
                  {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u || '—'}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Ingredient name"
                  value={ing.name}
                  onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                  className="flex-1 bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-dram-accent"
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(idx)}
                  className="text-gray-600 hover:text-red-400 text-lg w-8"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addIngredient}
            className="mt-2 text-sm text-dram-accent hover:brightness-110"
          >
            + Add ingredient
          </button>
        </div>

        {/* Steps */}
        <div>
          <label className="block text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Steps</label>
          <div className="space-y-2">
            {steps.map((step, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <span className="text-dram-accent font-bold text-sm mt-2.5 w-5 flex-shrink-0">{idx + 1}.</span>
                <textarea
                  value={step}
                  onChange={(e) => updateStep(idx, e.target.value)}
                  placeholder={`Step ${idx + 1}…`}
                  rows={3}
                  className="flex-1 bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-dram-accent resize-none"
                />
                <button
                  type="button"
                  onClick={() => removeStep(idx)}
                  className="text-gray-600 hover:text-red-400 text-lg w-8 mt-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addStep}
            className="mt-2 text-sm text-dram-accent hover:brightness-110"
          >
            + Add step
          </button>
        </div>

        {/* Tags */}
        {tagDefs && (
          <div>
            <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">Tags</label>
            <div className="space-y-3">
              {([
                ['Health',   'health'],
                ['Cuisine',  'cuisine'],
                ['Category', 'category'],
              ] as [string, keyof typeof tagDefs][]).map(([label, cat]) => (
                <div key={cat}>
                  <p className="text-xs text-gray-500 mb-1.5">{label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tagDefs[cat].map((tag) => {
                      const active = tags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition capitalize ${
                            active
                              ? 'border-dram-accent text-dram-accent bg-dram-accent/10'
                              : 'border-dram-border text-gray-400 hover:border-gray-500 hover:text-white'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cocktail-specific */}
        {type === 'cocktail' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Glass</label>
              <select
                value={glassType}
                onChange={(e) => setGlassType(e.target.value)}
                className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-dram-accent"
              >
                <option value="">—</option>
                {GLASS_OPTIONS.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">ABV Level</label>
              <select
                value={abvLevel}
                onChange={(e) => setAbvLevel(e.target.value)}
                className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-dram-accent"
              >
                <option value="">—</option>
                {ABV_OPTIONS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Timing & meta — food only */}
        {type === 'food' && (
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Category</label>
            <select
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-dram-accent"
            >
              <option value="">— Select —</option>
              <option value="main">Main Dish</option>
              <option value="side">Side Dish</option>
              <option value="breakfast">Breakfast</option>
              <option value="dessert">Dessert</option>
            </select>
          </div>
        )}

        {type === 'food' && (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Prep Time (min)</label>
              <input
                type="number"
                min="0"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-dram-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Cook Time (min)</label>
              <input
                type="number"
                min="0"
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-dram-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Servings</label>
              <input
                type="number"
                min="1"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-dram-accent"
              />
            </div>
          </div>
        )}

        {/* Nutrition — food only */}
        {type === 'food' && (
          <div>
            <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Nutrition (per serving)</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Calories', value: calories, set: setCalories, unit: 'kcal', step: '1' },
                { label: 'Carbs', value: carbsG, set: setCarbsG, unit: 'g', step: '0.1' },
                { label: 'Protein', value: proteinG, set: setProteinG, unit: 'g', step: '0.1' },
                { label: 'Fat', value: fatG, set: setFatG, unit: 'g', step: '0.1' },
                { label: 'Fiber', value: fiberG, set: setFiberG, unit: 'g', step: '0.1' },
                { label: 'Sodium', value: sodiumMg, set: setSodiumMg, unit: 'mg', step: '1' },
              ].map(({ label, value, set, unit, step }) => (
                <div key={label}>
                  <label className="block text-xs text-gray-500 mb-1">{label} <span className="text-gray-600">({unit})</span></label>
                  <input
                    type="number"
                    min="0"
                    step={step}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="w-full bg-dram-card border border-dram-border rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-dram-accent"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Source / Attribution</label>
          <input
            type="text"
            placeholder="e.g. Death & Co., Dad's recipe"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-dram-accent"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Personal riffs, substitutions, tips…"
            rows={3}
            className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-dram-accent resize-none"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Bottom save button */}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-dram-accent text-black font-semibold py-2.5 rounded-lg hover:brightness-110 transition disabled:opacity-50 mb-4"
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Recipe'}
        </button>
      </form>
    </div>
  );
}
