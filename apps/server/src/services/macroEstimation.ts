import { runWithTools } from './aiProvider';
import type {
  MacroEstimatePayload,
  MacroEstimateResult,
  MealEstimatePayload,
  MealEstimateResult,
} from '../types';

const nutritionTool = {
  name: 'set_nutrition',
  description: 'Set the estimated nutrition facts per 100g of food',
  schema: {
    type: 'object' as const,
    properties: {
      calories:   { type: 'number', description: 'kcal per 100g' },
      carbs_g:    { type: 'number', description: 'total carbohydrates in grams per 100g' },
      protein_g:  { type: 'number', description: 'protein in grams per 100g' },
      fat_g:      { type: 'number', description: 'total fat in grams per 100g' },
      fiber_g:    { type: 'number', description: 'dietary fiber in grams per 100g' },
      sodium_mg:  { type: 'number', description: 'sodium in milligrams per 100g' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'estimation confidence' },
    },
    required: ['calories', 'carbs_g', 'protein_g', 'fat_g', 'confidence'],
  },
};

export async function estimateMacros(payload: MacroEstimatePayload): Promise<MacroEstimateResult> {
  const { name, brand, description, knownMacros } = payload;

  const knownParts = knownMacros
    ? Object.entries(knownMacros)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
    : null;

  const prompt = [
    `Estimate the nutrition facts per 100g for: ${name}${brand ? ` by ${brand}` : ''}.`,
    description ? `Description: ${description}` : '',
    knownParts ? `Known values (do not change): ${knownParts}` : '',
    'Use your knowledge of typical food composition. If the food is ambiguous, use a common preparation.',
  ]
    .filter(Boolean)
    .join('\n');

  const input = await runWithTools({ model: 'haiku', prompt, tool: nutritionTool });

  // Apply known values on top (don't let AI override what user already knows)
  return {
    nutrition: {
      calories: (knownMacros?.calories ?? input.calories) as number,
      carbs:    (knownMacros?.carbs    ?? input.carbs_g) as number,
      protein:  (knownMacros?.protein  ?? input.protein_g) as number,
      fat:      (knownMacros?.fat      ?? input.fat_g) as number,
      fiber:    (knownMacros?.fiber    ?? input.fiber_g) as number | undefined,
      sodium:   (knownMacros?.sodium   ?? input.sodium_mg) as number | undefined,
    },
    confidence: input.confidence as MacroEstimateResult['confidence'],
  };
}

// ── Meal-level estimation ─────────────────────────────────────────────────────
// Used by the "Describe a Meal" flow, where the user types a whole portion
// ("Noodles & Co. Butter Noodles with Meatballs") and the numbers are logged
// verbatim as that meal's totals. Distinct from estimateMacros above, which is
// per-100g for the food database.

const mealNutritionTool = {
  name: 'set_meal_nutrition',
  description: 'Set the estimated nutrition totals for the entire meal as described',
  schema: {
    type: 'object' as const,
    properties: {
      calories:   { type: 'number', description: 'total kcal for the whole portion described' },
      carbs_g:    { type: 'number', description: 'total carbohydrates in grams for the whole portion' },
      protein_g:  { type: 'number', description: 'total protein in grams for the whole portion' },
      fat_g:      { type: 'number', description: 'total fat in grams for the whole portion' },
      fiber_g:    { type: 'number', description: 'total dietary fiber in grams for the whole portion' },
      sodium_mg:  { type: 'number', description: 'total sodium in milligrams for the whole portion' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'estimation confidence' },
    },
    required: ['calories', 'carbs_g', 'protein_g', 'fat_g', 'confidence'],
  },
};

export async function estimateMeal(payload: MealEstimatePayload): Promise<MealEstimateResult> {
  const { description } = payload;

  const prompt = [
    `Estimate the nutrition for this meal as eaten: ${description}`,
    '',
    'Return TOTALS for the entire portion described — not per 100g and not per serving.',
    'If a restaurant or brand is named, use that chain\'s actual menu item, including the full portion',
    'they serve. Restaurant entrees are frequently 800-1500 kcal; do not anchor low.',
    'If no portion is stated, assume one typical full serving as a person would eat it.',
  ].join('\n');

  const input = await runWithTools({ model: 'haiku', prompt, tool: mealNutritionTool });

  return {
    nutrition: {
      calories: input.calories as number,
      carbs:    input.carbs_g as number,
      protein:  input.protein_g as number,
      fat:      input.fat_g as number,
      fiber:    input.fiber_g as number | undefined,
      sodium:   input.sodium_mg as number | undefined,
    },
    confidence: input.confidence as MealEstimateResult['confidence'],
  };
}
