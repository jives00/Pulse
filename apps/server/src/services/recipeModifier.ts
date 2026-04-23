import { runWithTools } from './aiProvider';

export interface RecipeInput {
  name: string;
  description?: string | null;
  calories?: number | null;
  carbs_g?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  fiber_g?: number | null;
  sodium_mg?: number | null;
  ingredients: { name: string; quantity?: number | null; unit?: string | null }[];
  steps: { step_number: number; instruction: string }[];
}

export interface ModifiedRecipe {
  name: string;
  description: string;
  ingredients: { name: string; quantity: string; unit: string }[];
  steps: string[];
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
}

export interface ModifiedMacros {
  name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
}

const UPDATE_TOOL = {
  name: 'modify_recipe',
  description: 'Return the complete modified recipe with updated ingredients, steps, and recalculated macros.',
  schema: {
    type: 'object' as const,
    properties: {
      name:        { type: 'string', description: 'Recipe name' },
      description: { type: 'string', description: 'Recipe description' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:     { type: 'string' },
            quantity: { type: 'string' },
            unit:     { type: 'string' },
          },
          required: ['name', 'quantity', 'unit'],
        },
      },
      steps:      { type: 'array', items: { type: 'string' } },
      calories:   { type: 'number' },
      carbs_g:    { type: 'number' },
      protein_g:  { type: 'number' },
      fat_g:      { type: 'number' },
      fiber_g:    { type: 'number' },
      sodium_mg:  { type: 'number' },
    },
    required: ['name', 'description', 'ingredients', 'steps', 'calories', 'carbs_g', 'protein_g', 'fat_g', 'fiber_g', 'sodium_mg'],
  },
};

const LOG_TOOL = {
  name: 'modify_recipe_macros',
  description: 'Return only the updated name and estimated macros for a modified version of the recipe.',
  schema: {
    type: 'object' as const,
    properties: {
      name:      { type: 'string', description: 'Modified recipe name' },
      calories:  { type: 'number' },
      carbs_g:   { type: 'number' },
      protein_g: { type: 'number' },
      fat_g:     { type: 'number' },
      fiber_g:   { type: 'number' },
      sodium_mg: { type: 'number' },
    },
    required: ['name', 'calories', 'carbs_g', 'protein_g', 'fat_g', 'fiber_g', 'sodium_mg'],
  },
};

export async function modifyRecipe(
  recipe: RecipeInput,
  userPrompt: string,
  mode: 'update'
): Promise<ModifiedRecipe>;
export async function modifyRecipe(
  recipe: RecipeInput,
  userPrompt: string,
  mode: 'log'
): Promise<ModifiedMacros>;
export async function modifyRecipe(
  recipe: RecipeInput,
  userPrompt: string,
  mode: 'update' | 'log'
): Promise<ModifiedRecipe | ModifiedMacros> {
  if (mode === 'update') {
    const prompt = `You are a recipe editor. You MUST apply the following change to the recipe and return the full modified recipe with updated macros.

CHANGE TO APPLY: ${userPrompt}

Rules:
1. Update the ingredients list to reflect the change (add, remove, or adjust quantities as instructed).
2. Recalculate macros using standard nutritional data for the changed ingredient(s) and their quantities.
3. You MUST change the macro values if any calorie-bearing ingredient was added or removed. Do not return the original values.
4. Example: removing 1 tbsp butter removes ~100 calories and ~11g fat from the totals.

Current recipe:
${JSON.stringify(recipe, null, 2)}`;

    const result = await runWithTools({ model: 'sonnet', prompt, maxTokens: 4096, tool: UPDATE_TOOL });
    return result as unknown as ModifiedRecipe;
  }

  // log mode — macros and name only
  const macroSummary = [
    `Calories: ${recipe.calories ?? 0}`,
    `Carbs: ${recipe.carbs_g ?? 0}g`,
    `Protein: ${recipe.protein_g ?? 0}g`,
    `Fat: ${recipe.fat_g ?? 0}g`,
    `Fiber: ${recipe.fiber_g ?? 0}g`,
    `Sodium: ${recipe.sodium_mg ?? 0}mg`,
  ].join(', ');

  const prompt = `A user wants to log a modified version of a recipe. Use standard nutritional data to calculate the macro impact of the modification and return updated totals.

Recipe: ${recipe.name}
Ingredients: ${JSON.stringify(recipe.ingredients)}
Current macros (total recipe): ${macroSummary}

Modification: ${userPrompt}

Rules:
- Determine the nutritional values of any added or removed ingredients based on quantity and unit.
- Adjust the current macro totals accordingly.
- Never return the original macro values unchanged if an ingredient with nutritional value was added or removed.`;

  const result = await runWithTools({ model: 'sonnet', prompt, maxTokens: 256, tool: LOG_TOOL });
  return result as unknown as ModifiedMacros;
}
