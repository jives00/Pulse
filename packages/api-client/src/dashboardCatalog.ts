// Dashboard widget catalog + layout resolution.
//
// Features decide what is AVAILABLE. Layout decides what is SHOWN and WHERE.
// A widget whose module is disabled disappears from the dashboard and from the
// customize UI, but its stored layout entry is left untouched so re-enabling the
// module restores its old position and width.

import { EnabledFeatures, FeatureKey, featuresSatisfied } from './featureCatalog';

export type DashboardWidgetKey =
  | 'fuelToday'
  | 'exerciseToday'
  | 'weeklyProgress'
  | 'calVsBurned'
  | 'volumeByWeek'
  | 'heatmap'
  | 'weeklyAverages'
  | 'goalProgress'
  | 'recentSessions'
  | 'todayBlurb'
  | 'weeklyBlurb';

export type WidgetPlatform = 'web' | 'mobile' | 'both';

/** Section header a widget sits under. Consecutive widgets sharing a group render one kicker. */
export type WidgetGroup = 'Today' | 'Trends' | 'Goal progress' | 'Sessions' | "Today's Blurb" | 'Weekly Blurb';

export interface FeatureRequirement {
  all?: FeatureKey[];
  any?: FeatureKey[];
}

export interface DashboardWidget {
  key:            DashboardWidgetKey;
  label:          string;
  description:    string;
  requires:       FeatureRequirement;
  platform:       WidgetPlatform;
  /** Web grid units out of 12. */
  defaultSpan:    number;
  minSpan:        number;
  defaultOrder:   number;
  defaultVisible: boolean;
  group:          WidgetGroup;
  /** Mobile tab this widget seeds into. */
  mobileTab?:     'today' | 'goals' | 'trends' | 'sessions';
}

/** Spans reproduce the pre-customization layout exactly: 2fr/1.2fr -> 7/5, 1fr/1.4fr -> 5/7. */
export const DASHBOARD_CATALOG: DashboardWidget[] = [
  { key: 'fuelToday', label: 'Fuel today', group: 'Today', mobileTab: 'today',
    description: 'Calories and macros logged so far today.',
    requires: { all: ['nutrition'] }, platform: 'both',
    defaultSpan: 7, minSpan: 4, defaultOrder: 10, defaultVisible: true },

  { key: 'exerciseToday', label: 'Exercise today', group: 'Today', mobileTab: 'today',
    description: "Today's session, upcoming work, and recovery.",
    requires: { all: ['exercise'] }, platform: 'both',
    defaultSpan: 5, minSpan: 4, defaultOrder: 20, defaultVisible: true },

  { key: 'weeklyProgress', label: 'Weekly goal progress', group: 'Today', mobileTab: 'today',
    description: 'Week-to-date pace against your weekly targets.',
    requires: { any: ['nutrition', 'exercise'] }, platform: 'both',
    defaultSpan: 12, minSpan: 6, defaultOrder: 30, defaultVisible: true },

  { key: 'calVsBurned', label: 'Calories · consumed vs burned', group: 'Trends', mobileTab: 'trends',
    description: 'Daily intake against total expenditure.',
    requires: { any: ['nutrition', 'exercise'] }, platform: 'both',
    defaultSpan: 6, minSpan: 6, defaultOrder: 40, defaultVisible: true },

  { key: 'volumeByWeek', label: 'Exercise volume · week over week', group: 'Trends', mobileTab: 'trends',
    description: 'Training volume trend by week.',
    requires: { all: ['exercise'] }, platform: 'both',
    defaultSpan: 6, minSpan: 6, defaultOrder: 50, defaultVisible: true },

  { key: 'heatmap', label: 'Exercise volume · 12-week heatmap', group: 'Trends', mobileTab: 'trends',
    description: 'Training consistency at a glance.',
    requires: { all: ['exercise'] }, platform: 'both',
    defaultSpan: 5, minSpan: 4, defaultOrder: 60, defaultVisible: true },

  { key: 'weeklyAverages', label: 'Weekly averages', group: 'Trends', mobileTab: 'trends',
    description: 'Per-week averages across the domains you track.',
    requires: { any: ['nutrition', 'exercise', 'activity'] }, platform: 'both',
    defaultSpan: 7, minSpan: 6, defaultOrder: 70, defaultVisible: true },

  { key: 'goalProgress', label: 'Goal progress', group: 'Goal progress', mobileTab: 'goals',
    description: 'Cards for the goals you pinned to the dashboard.',
    requires: { all: ['goals'] }, platform: 'both',
    defaultSpan: 12, minSpan: 6, defaultOrder: 80, defaultVisible: true },

  { key: 'recentSessions', label: 'Recent sessions', group: 'Sessions', mobileTab: 'sessions',
    description: 'Your most recent workouts.',
    requires: { all: ['exercise'] }, platform: 'both',
    defaultSpan: 12, minSpan: 6, defaultOrder: 90, defaultVisible: true },

  { key: 'todayBlurb', label: "Today's blurb", group: "Today's Blurb", mobileTab: 'today',
    description: 'A copyable plain-text summary of today.',
    requires: {}, platform: 'both',
    defaultSpan: 12, minSpan: 6, defaultOrder: 100, defaultVisible: true },

  { key: 'weeklyBlurb', label: 'Weekly blurb', group: 'Weekly Blurb', mobileTab: 'today',
    description: 'A copyable plain-text summary of the week.',
    requires: {}, platform: 'both',
    defaultSpan: 12, minSpan: 6, defaultOrder: 110, defaultVisible: true },
];

export const WIDGET_BY_KEY = Object.fromEntries(
  DASHBOARD_CATALOG.map((w) => [w.key, w]),
) as Record<DashboardWidgetKey, DashboardWidget>;

/** Allowed web widths, in grid units out of 12. */
export const SPAN_OPTIONS = [4, 6, 8, 12] as const;
export type SpanOption = typeof SPAN_OPTIONS[number];

export interface LayoutEntry {
  key:     DashboardWidgetKey;
  span:    number;
  visible: boolean;
  /** Mobile only. */
  tab?:    'today' | 'goals' | 'trends' | 'sessions';
}

export interface DashboardLayout {
  v:       1;
  widgets: LayoutEntry[];
}

export interface StoredDashboardLayout {
  web?:    Partial<DashboardLayout>;
  mobile?: Partial<DashboardLayout>;
}

export type LayoutPlatform = 'web' | 'mobile';

function catalogFor(platform: LayoutPlatform): DashboardWidget[] {
  return DASHBOARD_CATALOG
    .filter((w) => w.platform === 'both' || w.platform === platform)
    .sort((a, b) => a.defaultOrder - b.defaultOrder);
}

export function defaultLayout(platform: LayoutPlatform): DashboardLayout {
  return {
    v: 1,
    widgets: catalogFor(platform).map((w) => ({
      key:     w.key,
      span:    w.defaultSpan,
      visible: w.defaultVisible,
      ...(platform === 'mobile' ? { tab: w.mobileTab } : {}),
    })),
  };
}

function clampSpan(span: unknown, w: DashboardWidget): number {
  const n = typeof span === 'number' && Number.isFinite(span) ? Math.round(span) : w.defaultSpan;
  return Math.min(12, Math.max(w.minSpan, n));
}

/**
 * Merge a stored layout over catalog defaults for one platform.
 * - Widgets the stored layout has never seen are APPENDED in catalog order, so a
 *   widget added in a later release shows up rather than silently going missing.
 * - Keys no longer in the catalog are dropped.
 * - Spans are clamped to [minSpan, 12].
 * - Feature filtering happens LAST, so a disabled module always wins over a
 *   stored `visible: true` without mutating what was stored.
 */
export function resolveLayout(
  stored: StoredDashboardLayout | Partial<DashboardLayout> | null | undefined,
  platform: LayoutPlatform,
  features?: EnabledFeatures,
): DashboardLayout {
  const catalog = catalogFor(platform);
  const known   = new Set(catalog.map((w) => w.key));

  const perPlatform =
    stored && typeof stored === 'object' && (platform in stored)
      ? (stored as StoredDashboardLayout)[platform]
      : (stored as Partial<DashboardLayout> | null | undefined);

  const storedEntries = Array.isArray(perPlatform?.widgets) ? perPlatform!.widgets! : [];
  const seen = new Set<DashboardWidgetKey>();

  const merged: LayoutEntry[] = [];
  for (const e of storedEntries) {
    if (!e || !known.has(e.key) || seen.has(e.key)) continue;
    seen.add(e.key);
    const w = WIDGET_BY_KEY[e.key];
    merged.push({
      key:     e.key,
      span:    clampSpan(e.span, w),
      visible: typeof e.visible === 'boolean' ? e.visible : w.defaultVisible,
      ...(platform === 'mobile' ? { tab: e.tab ?? w.mobileTab } : {}),
    });
  }

  // Append anything the stored layout has never seen.
  for (const w of catalog) {
    if (seen.has(w.key)) continue;
    merged.push({
      key:     w.key,
      span:    w.defaultSpan,
      visible: w.defaultVisible,
      ...(platform === 'mobile' ? { tab: w.mobileTab } : {}),
    });
  }

  const filtered = features
    ? merged.filter((e) => featuresSatisfied(features, WIDGET_BY_KEY[e.key].requires))
    : merged;

  return { v: 1, widgets: filtered };
}

/**
 * Group consecutive visible widgets by their catalog group so a section header is
 * only emitted when it has content. Returns groups in layout order.
 */
export function groupLayout(layout: DashboardLayout): { group: WidgetGroup; widgets: LayoutEntry[] }[] {
  const out: { group: WidgetGroup; widgets: LayoutEntry[] }[] = [];
  for (const entry of layout.widgets) {
    if (!entry.visible) continue;
    const group = WIDGET_BY_KEY[entry.key].group;
    const last  = out[out.length - 1];
    if (last && last.group === group) last.widgets.push(entry);
    else out.push({ group, widgets: [entry] });
  }
  return out;
}
