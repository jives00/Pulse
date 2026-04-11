import { runWithTools } from './aiProvider';
import type { MacroEstimatePayload, MacroEstimateResult } from '../types';

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
