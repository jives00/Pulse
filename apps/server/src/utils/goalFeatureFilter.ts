import type { EnabledFeatures, FeatureKey } from '@pulse/api-client';

// goals.category -> the feature module that gates it. Kept 1:1 with GoalCategory
// ('body' | 'nutrition' | 'exercise' | 'activity').
const CATEGORY_FEATURE: Record<string, FeatureKey> = {
  body:      'body',
  nutrition: 'nutrition',
  exercise:  'exercise',
  activity:  'activity',
};

/**
 * Filter goals whose category maps to a disabled module. FILTERS, does not delete —
 * rows stay in the database and reappear as soon as the module is re-enabled.
 * Only meant for LIST-style endpoints (GET / and GET /nudges) — a GET by id must
 * still work regardless of feature state.
 */
export function filterGoalsByFeatures<T extends { category: string }>(
  goals: T[],
  features: EnabledFeatures,
): T[] {
  return goals.filter((g) => {
    const key = CATEGORY_FEATURE[g.category];
    return !key || features[key];
  });
}
