export interface Recipe {
  id: number;
  type: 'cocktail' | 'food';
  name: string;
  description?: string | null;
  photo_key?: string | null;
  photo_url?: string | null;
  is_favorite: number;
  notes?: string | null;
  source?: string | null;
  prep_time?: number | null;
  cook_time?: number | null;
  servings?: number | null;
  glass_type?: string | null;
  abv_level?: string | null;
  subcategory?: string | null;
  calories?: number | null;
  carbs_g?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  fiber_g?: number | null;
  sodium_mg?: number | null;
  created_at: string;
  tags: string[];
  last_made?: string | null;
}

export interface MakeLogEntry {
  id: number;
  made_at: string;
}

export interface RecipeDetail extends Recipe {
  ingredients: Ingredient[];
  steps: RecipeStep[];
}

export interface Ingredient {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  sort_order?: number;
}

export interface RecipeStep {
  step_number: number;
  instruction: string;
}

export interface ScrapedRecipe {
  name: string;
  type: 'cocktail' | 'food';
  description?: string | null;
  prep_time?: number | null;
  cook_time?: number | null;
  servings?: number | null;
  glass_type?: string | null;
  source?: string | null;
  subcategory?: string | null;
  calories?: number | null;
  carbs_g?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  fiber_g?: number | null;
  sodium_mg?: number | null;
  ingredients: Ingredient[];
  steps: string[];
  photo_url?: string | null;
  suggested_tags: string[];
}

export interface RecipeSuggestion {
  name: string;
  type: 'cocktail' | 'food';
  description: string;
  ingredients: string[];
}

export interface RecipeFormData {
  type: 'cocktail' | 'food';
  name: string;
  description?: string;
  notes?: string;
  source?: string;
  prep_time?: number;
  cook_time?: number;
  servings?: number;
  glass_type?: string;
  abv_level?: string;
  subcategory?: string;
  calories?: number;
  carbs_g?: number;
  protein_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
}

export interface RecipeFilters {
  type?: string;
  search?: string;
  favorite?: boolean;
  made?: boolean;
  subcategory?: string;
  tags?: string[];
  sort?: string;
  limit?: number;
  offset?: number;
}

export function buildRecipeParams(filters: RecipeFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.type && filters.type !== 'all') params.set('type', filters.type);
  if (filters.search) params.set('search', filters.search);
  if (filters.favorite) params.set('favorite', '1');
  if (filters.made === true) params.set('made', '1');
  else if (filters.made === false) params.set('made', '0');
  if (filters.subcategory) params.set('subcategory', filters.subcategory);
  if (filters.tags?.length) params.set('tags', filters.tags.join(','));
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));
  return params;
}
