// Feature modules — the single source of truth for which parts of Pulse a user tracks.
// Consumed by web, mobile, and server. Modeled on goalCatalog.ts.

export type FeatureKey =
  // Top-level modules
  | 'recipes'
  | 'nutrition'
  | 'exercise'
  | 'body'
  | 'activity'
  | 'goals'
  | 'ai'
  // Sub-modules
  | 'drinks'
  | 'links'
  | 'water'
  | 'mealPlanning'
  | 'routines'
  | 'workoutSchedules'
  | 'recovery'
  | 'weightGurusSync'
  | 'healthConnect'
  | 'planning'
  | 'voice';

export interface FeatureCatalogEntry {
  key:         FeatureKey;
  label:       string;
  description: string;
  /** Set on sub-modules; the module is only meaningful while its parent is enabled. */
  parent?:     FeatureKey;
  /** Soft dependencies — surfaced in the UI, not enforced destructively. */
  dependsOn?:  FeatureKey[];
  /** Everything ships on so existing users see no change until they opt out. */
  default:     boolean;
}

export const FEATURE_CATALOG: FeatureCatalogEntry[] = [
  // ─── Recipes ───────────────────────────────────────────────────────────────
  { key: 'recipes', label: 'Recipes', default: true,
    description: 'Recipe library, photos, and cooking history.' },
  { key: 'drinks', label: 'Drinks', parent: 'recipes', default: true,
    description: 'Cocktail and drink recipes as a separate section.' },
  { key: 'links', label: 'Links', parent: 'recipes', default: true,
    description: 'Saved links and reading list.' },

  // ─── Nutrition ─────────────────────────────────────────────────────────────
  { key: 'nutrition', label: 'Food & Nutrition', default: true,
    description: 'Food log, calorie and macro tracking, nutrition targets.' },
  { key: 'water', label: 'Water', parent: 'nutrition', default: true,
    description: 'Daily hydration tracking.' },
  { key: 'mealPlanning', label: 'Meal planning', parent: 'nutrition', dependsOn: ['nutrition'], default: true,
    description: 'Planned meals on the calendar.' },

  // ─── Exercise ──────────────────────────────────────────────────────────────
  { key: 'exercise', label: 'Exercise', default: true,
    description: 'Workout logging, exercises, volume and session history.' },
  { key: 'routines', label: 'Routines', parent: 'exercise', default: true,
    description: 'Reusable workout routines.' },
  { key: 'workoutSchedules', label: 'Workout schedules', parent: 'exercise', dependsOn: ['routines'], default: true,
    description: 'Scheduled and upcoming sessions.' },
  { key: 'recovery', label: 'Recovery', parent: 'exercise', default: true,
    description: 'Muscle-group recovery readiness.' },

  // ─── Body ──────────────────────────────────────────────────────────────────
  { key: 'body', label: 'Body & Weight', default: true,
    description: 'Weight and body measurements.' },
  { key: 'weightGurusSync', label: 'WeightGurus sync', parent: 'body', default: true,
    description: 'Hourly automatic import from a WeightGurus scale.' },

  // ─── Activity ──────────────────────────────────────────────────────────────
  { key: 'activity', label: 'Steps & Activity', default: true,
    description: 'Daily step count and activity calories.' },
  { key: 'healthConnect', label: 'Health Connect', parent: 'activity', default: true,
    description: 'Sync steps from Health Connect on Android.' },

  // ─── Goals ─────────────────────────────────────────────────────────────────
  { key: 'goals', label: 'Goals & Planning', default: true,
    description: 'Goal tracking, progress cards, and nudges.' },
  { key: 'planning', label: 'Planning calendar', parent: 'goals', default: true,
    description: 'Calendar of planned meals, workouts, and checkpoints.' },

  // ─── AI ────────────────────────────────────────────────────────────────────
  { key: 'ai', label: 'AI Assistant', default: true,
    description: 'Chat assistant and daily insights.' },
  { key: 'voice', label: 'Voice input', parent: 'ai', default: true,
    description: 'Speak to the assistant instead of typing.' },
];

export const FEATURE_BY_KEY = Object.fromEntries(
  FEATURE_CATALOG.map((e) => [e.key, e]),
) as Record<FeatureKey, FeatureCatalogEntry>;

export const FEATURE_KEYS = FEATURE_CATALOG.map((e) => e.key);

/** Top-level modules, in catalog order. */
export const TOP_LEVEL_FEATURES = FEATURE_CATALOG.filter((e) => !e.parent);

/** Sub-modules of a given parent, in catalog order. */
export function subFeatures(parent: FeatureKey): FeatureCatalogEntry[] {
  return FEATURE_CATALOG.filter((e) => e.parent === parent);
}

export type EnabledFeatures = Record<FeatureKey, boolean>;

export const DEFAULT_FEATURES: EnabledFeatures = Object.fromEntries(
  FEATURE_CATALOG.map((e) => [e.key, e.default]),
) as EnabledFeatures;

/**
 * Merge stored preferences over catalog defaults.
 * - A module added in a later release is automatically on for existing users.
 * - Keys no longer in the catalog are dropped.
 * - A sub-module reads as off whenever its parent is off, so callers never
 *   have to check the parent themselves.
 */
export function resolveFeatures(stored: Partial<EnabledFeatures> | null | undefined): EnabledFeatures {
  const out = { ...DEFAULT_FEATURES };
  if (stored) {
    for (const entry of FEATURE_CATALOG) {
      const v = stored[entry.key];
      if (typeof v === 'boolean') out[entry.key] = v;
    }
  }
  for (const entry of FEATURE_CATALOG) {
    if (entry.parent && !out[entry.parent]) out[entry.key] = false;
  }
  return out;
}

/** True when every key in `all` and at least one key in `any` is enabled. */
export function featuresSatisfied(
  features: EnabledFeatures,
  req: { all?: FeatureKey[]; any?: FeatureKey[] } | undefined,
): boolean {
  if (!req) return true;
  if (req.all?.length && !req.all.every((k) => features[k])) return false;
  if (req.any?.length && !req.any.some((k) => features[k])) return false;
  return true;
}
