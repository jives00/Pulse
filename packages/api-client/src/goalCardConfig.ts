// Per-goal dashboard card presentation.
//
// Stored on the goal (user_goals.card_config) rather than in the dashboard layout,
// so these options survive a "reset layout" and follow the goal if it moves.

import { CATALOG_BY_KEY, GoalCatalogKey } from './goalCatalog';

/** Card body variants. The shell (title / meta / stat row / legend) is shared by all. */
export type GoalCardVariant = 'trend' | 'daily' | 'streak' | 'progress';

export type GoalCardWindow     = '30d' | '90d' | '180d' | '1y' | 'all';
export type GoalCardProjection = 'none' | 'trend' | 'trend+tdee';
export type GoalCardDirection  = 'auto' | 'up' | 'down';
export type GoalCardMetricLine = 'value' | 'avg' | 'both';

export interface GoalCardConfig {
  span:         number;              // web grid units out of 12
  variant:      GoalCardVariant;
  window:       GoalCardWindow;
  projection:   GoalCardProjection;
  direction:    GoalCardDirection;
  showStatus:   boolean;
  showTarget:   boolean;
  showDeadline: boolean;
  showLegend:   boolean;
  metricLine:   GoalCardMetricLine;
  accent:       string | null;       // null -> per-category default
}

export const GOAL_CARD_WINDOW_DAYS: Record<GoalCardWindow, number | null> = {
  '30d': 30, '90d': 90, '180d': 180, '1y': 365, all: null,
};

/** Only the weight card computes a TDEE-based pace, so only it may offer that projection. */
export const TDEE_PROJECTION_KEYS: GoalCatalogKey[] = ['body_weight'];

/** Which body variant a catalog key gets when the user has not chosen one. */
export function defaultVariantFor(catalogKey: GoalCatalogKey): GoalCardVariant {
  if (catalogKey === 'exercise_routine_sessions') return 'streak';
  const entry = CATALOG_BY_KEY[catalogKey];
  if (!entry) return 'progress';
  if (entry.cardType === 'progress_bar') return 'progress';
  // Body measurements plot history and project forward; daily-average goals plot a
  // rolling daily series against a target line.
  return entry.category === 'body' ? 'trend' : 'daily';
}

/** Variants a given goal may legally be switched to. `streak` is routine-sessions only. */
export function allowedVariantsFor(catalogKey: GoalCatalogKey): GoalCardVariant[] {
  const def = defaultVariantFor(catalogKey);
  if (def === 'streak') return ['streak', 'progress'];
  const entry = CATALOG_BY_KEY[catalogKey];
  if (!entry) return ['progress'];
  return entry.category === 'body' ? ['trend', 'progress'] : ['daily', 'progress'];
}

export function defaultGoalCardConfig(catalogKey: GoalCatalogKey): GoalCardConfig {
  const variant = defaultVariantFor(catalogKey);
  return {
    span:         variant === 'progress' ? 4 : 6,
    variant,
    window:       variant === 'daily' ? '30d' : '90d',
    projection:   variant === 'trend'
      ? (TDEE_PROJECTION_KEYS.includes(catalogKey) ? 'trend+tdee' : 'trend')
      : 'none',
    direction:    'auto',
    showStatus:   true,
    showTarget:   true,
    showDeadline: true,
    showLegend:   variant === 'trend',
    metricLine:   variant === 'daily' ? 'avg' : 'value',
    accent:       null,
  };
}

const WINDOWS:     GoalCardWindow[]     = ['30d', '90d', '180d', '1y', 'all'];
const PROJECTIONS: GoalCardProjection[] = ['none', 'trend', 'trend+tdee'];
const DIRECTIONS:  GoalCardDirection[]  = ['auto', 'up', 'down'];
const METRICS:     GoalCardMetricLine[] = ['value', 'avg', 'both'];

function pick<T>(v: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/**
 * Merge a stored card_config over catalog-derived defaults.
 * Unknown keys are dropped, invalid values fall back, span is clamped, a variant the
 * goal cannot support falls back to its default, and `trend+tdee` is rejected for any
 * goal that does not compute a TDEE pace.
 */
export function resolveGoalCard(
  catalogKey: GoalCatalogKey,
  stored: Partial<GoalCardConfig> | null | undefined,
): GoalCardConfig {
  const def = defaultGoalCardConfig(catalogKey);
  if (!stored || typeof stored !== 'object') return def;

  const allowedVariants = allowedVariantsFor(catalogKey);
  const variant = pick(stored.variant, allowedVariants, def.variant);

  let projection = pick(stored.projection, PROJECTIONS, def.projection);
  if (variant !== 'trend') projection = 'none';
  if (projection === 'trend+tdee' && !TDEE_PROJECTION_KEYS.includes(catalogKey)) projection = 'trend';

  const rawSpan = typeof stored.span === 'number' && Number.isFinite(stored.span)
    ? Math.round(stored.span)
    : def.span;

  return {
    span:         Math.min(12, Math.max(4, rawSpan)),
    variant,
    window:       pick(stored.window, WINDOWS, def.window),
    projection,
    direction:    pick(stored.direction, DIRECTIONS, def.direction),
    showStatus:   bool(stored.showStatus,   def.showStatus),
    showTarget:   bool(stored.showTarget,   def.showTarget),
    showDeadline: bool(stored.showDeadline, def.showDeadline),
    showLegend:   variant === 'streak' || variant === 'progress'
      ? false
      : bool(stored.showLegend, def.showLegend),
    metricLine:   pick(stored.metricLine, METRICS, def.metricLine),
    accent:       typeof stored.accent === 'string' ? stored.accent : def.accent,
  };
}

/** Which option rows an editor should show for a resolved config. */
export function editableOptionsFor(cfg: GoalCardConfig, catalogKey: GoalCatalogKey): {
  window: boolean; projection: boolean; legend: boolean; metricLine: boolean; tdee: boolean;
} {
  const chart = cfg.variant === 'trend' || cfg.variant === 'daily';
  return {
    window:     chart,
    projection: cfg.variant === 'trend',
    legend:     chart,
    metricLine: chart,
    tdee:       TDEE_PROJECTION_KEYS.includes(catalogKey),
  };
}
