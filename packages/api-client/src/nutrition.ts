// ============================================================
// Core domain types shared between server, web, and mobile
// ============================================================

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodSource = 'custom' | 'open_food_facts' | 'usda';
export type MacroEstimateConfidence = 'high' | 'medium' | 'low';

// ── Nutrition ────────────────────────────────────────────────

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

// ── Foods ────────────────────────────────────────────────────

export interface ServingSize {
  id: number;
  label: string;  // e.g. "1 cup", "1 slice", "100g"
  grams: number;
  isDefault: boolean;
}

export interface Food {
  id: number;
  barcode?: string;
  name: string;
  brand?: string;
  source: FoodSource;
  isCustom: boolean;
  nutrition: NutritionPer100g;
  servingSizes: ServingSize[];
}

export interface CreateFoodPayload {
  barcode?: string;
  name: string;
  brand?: string;
  nutrition: NutritionPer100g;
  servingSizes: Array<Omit<ServingSize, 'id'>>;
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

// ── Food Log ─────────────────────────────────────────────────

export interface LogEntry {
  id: number;
  logDate: string; // YYYY-MM-DD
  meal: MealSlot;
  food: Food;
  servingSize: ServingSize;
  quantity: number;
  nutrition: NutritionSnapshot; // pre-calculated snapshot
  notes?: string;
  dramRecipeId?: number;
}

export interface AddLogEntryPayload {
  logDate: string;
  meal: MealSlot;
  foodId: number;
  servingSizeId: number;
  quantity: number;
  notes?: string;
  dramRecipeId?: number;
}

export interface UpdateLogEntryPayload {
  servingSizeId?: number;
  quantity?: number;
  notes?: string;
  meal?: MealSlot;
  logDate?: string;
}

export interface CopyLogPayload {
  fromDate: string;
  toDate: string;
  meal?: MealSlot; // omit to copy all meals
}

export interface DailyLog {
  date: string;
  meals: Record<MealSlot, LogEntry[]>;
  totals: NutritionSnapshot;
  goals: UserGoals;
  waterTotalOz: number;
}

// ── Goals ────────────────────────────────────────────────────

export interface UserGoals {
  id: number;
  calories: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
  fiberG?: number;
  sodiumMg?: number;
  waterGoalOz: number;
  weeklyCalories?: number | null;
  weeklyProteinG?: number | null;
  weeklyCarbsG?: number | null;
  weeklyFatG?: number | null;
  weeklyWaterGoalOz?: number | null;
  effectiveFrom: string;
}

export type SaveGoalsPayload = {
  calories: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
  fiberG?: number;
  sodiumMg?: number;
  waterGoalOz?: number;
};

// ── Water ────────────────────────────────────────────────────

export interface WaterEntry {
  id: number;
  logDate: string;
  amountOz: number;
  loggedAt: string;
}

export interface WaterDay {
  date: string;
  totalOz: number;
  goalOz: number;
  entries: WaterEntry[];
}

// ── Meal Templates ───────────────────────────────────────────

export interface MealTemplateItem {
  id: number;
  food: Food;
  servingSize: ServingSize;
  quantity: number;
  sortOrder: number;
}

export interface MealTemplate {
  id: number;
  name: string;
  items: MealTemplateItem[];
  nutritionTotals: NutritionSnapshot;
  createdAt: string;
}

export interface CreateTemplatePayload {
  name: string;
  items: Array<{ foodId: number; servingSizeId: number; quantity: number; sortOrder?: number }>;
}

export interface CreateTemplateFromLogPayload {
  name: string;
  fromDate: string;
  meal: MealSlot;
}

export interface LogTemplatePayload {
  logDate: string;
  meal: MealSlot;
}

// ── History ──────────────────────────────────────────────────

export interface DailyHistoryEntry {
  date: string;
  calories: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
  entryCount: number;
}

export interface WeeklyHistoryEntry {
  year: number;
  week: number;
  startDate: string;
  endDate: string;
  avgCalories: number;
  avgCarbsG: number;
  avgProteinG: number;
  avgFatG: number;
  daysLogged: number;
}

// ── Auth ─────────────────────────────────────────────────────

export interface LoginPayload {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
}
