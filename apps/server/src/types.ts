// Server-side copies of shared domain types.
// Kept in sync with packages/api-client/src/nutrition.ts.

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MacroEstimateConfidence = 'high' | 'medium' | 'low';

export interface NutritionPer100g {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber?: number;
  sodium?: number; // mg
}

export interface NutritionSnapshot {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber?: number;
  sodium?: number; // mg
}

export interface MacroEstimatePayload {
  name: string;
  brand?: string;
  description?: string;
  knownMacros?: Partial<NutritionPer100g>;
}

export interface MacroEstimateResult {
  nutrition: NutritionPer100g;
  confidence: MacroEstimateConfidence;
}

export interface MealEstimatePayload {
  description: string;
}

// Totals for the whole described portion, not per 100g.
export interface MealEstimateResult {
  nutrition: NutritionSnapshot;
  confidence: MacroEstimateConfidence;
}
