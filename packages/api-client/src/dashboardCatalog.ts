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
  | 'stepsByDay'
  | 'volumeByWeek'
  | 'heatmap'
  | 'weeklyAverages'
  | 'goalProgress'
  | 'goalSince'
  | 'recentSessions'
  | 'todayBlurb'
  | 'weeklyBlurb';

export type WidgetPlatform = 'web' | 'mobile' | 'both';

/** Section header a widget sits under. Consecutive widgets sharing a group render one kicker. */
export type WidgetGroup = 'Today' | 'Trends' | 'Goal progress' | 'Sessions' | "Today's Blurb" | 'Weekly Blurb';

/** Every section a widget can be moved into, in the order they render by default. */
export const WIDGET_GROUPS: WidgetGroup[] = [
  'Today', 'Trends', 'Goal progress', 'Sessions', "Today's Blurb", 'Weekly Blurb',
];

const GROUP_SET = new Set<string>(WIDGET_GROUPS);

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

  { key: 'stepsByDay', label: 'Steps · by day', group: 'Trends', mobileTab: 'trends',
    description: 'Daily step count with averages, best day, and streak against your step goal.',
    requires: { all: ['activity'] }, platform: 'both',
    defaultSpan: 12, minSpan: 6, defaultOrder: 45, defaultVisible: true },

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

  { key: 'goalSince', label: 'Goal progress since a date', group: 'Goal progress', mobileTab: 'goals',
    description: 'Where each goal stood on a date you pick, where it stands today, and the change between.',
    requires: { all: ['goals'] }, platform: 'both',
    defaultSpan: 12, minSpan: 6, defaultOrder: 85, defaultVisible: true },

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
  /**
   * Web only. Section the user moved this widget into, overriding the catalog group.
   * Absent means "wherever the catalog put it", so a widget that has never been moved
   * follows any future change to its default section instead of being frozen in place.
   */
  section?: WidgetGroup;
}

/** The section a widget renders under: the user's override, else its catalog group. */
export function sectionFor(entry: LayoutEntry): WidgetGroup {
  return entry.section ?? WIDGET_BY_KEY[entry.key].group;
}

export interface DashboardLayout {
  v:       1;
  widgets: LayoutEntry[];
}

/**
 * Per-widget user config that isn't position or visibility. Deliberately NOT stored
 * per-platform: a "progress since Jan 1" comparison means the same thing on the phone
 * as on the laptop, and having to set the date twice would be a bug, not a feature.
 */
export interface DashboardWidgetSettings {
  goalSince?: {
    since?: string | null;
    /** Goal ids to show. Absent/null means every active goal — see resolveSinceGoalIds. */
    goalIds?: number[] | null;
  };
}

export interface StoredDashboardLayout {
  web?:            Partial<DashboardLayout>;
  mobile?:         Partial<DashboardLayout>;
  widgetSettings?: DashboardWidgetSettings;
}

/** Default baseline for the goalSince widget: Jan 1 of the current year. */
export function defaultSinceDate(today = new Date()): string {
  return `${today.getFullYear()}-01-01`;
}

/** The stored goalSince baseline, falling back to Jan 1 of the current year. */
export function resolveSinceDate(stored: StoredDashboardLayout | null | undefined): string {
  const v = stored?.widgetSettings?.goalSince?.since;
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : defaultSinceDate();
}

/**
 * Which goals the card shows, or null for "all of them".
 *
 * Null and "every id" are deliberately different states: null follows the goal list,
 * so a goal added next month appears on its own, while an explicit list stays exactly
 * as picked. Storing all ids the moment the user opens the picker would silently
 * convert one into the other.
 */
export function resolveSinceGoalIds(stored: StoredDashboardLayout | null | undefined): number[] | null {
  const v = stored?.widgetSettings?.goalSince?.goalIds;
  if (!Array.isArray(v)) return null;
  return v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

function patchGoalSince(
  stored: StoredDashboardLayout | null | undefined,
  patch: NonNullable<DashboardWidgetSettings['goalSince']>,
): StoredDashboardLayout {
  const settings = stored?.widgetSettings ?? {};
  return {
    ...(stored ?? {}),
    // Merge rather than replace: the date and the goal selection are independent
    // settings that happen to share a key, and each writer must not clobber the other.
    widgetSettings: { ...settings, goalSince: { ...(settings.goalSince ?? {}), ...patch } },
  };
}

/** Layout with the goalSince baseline replaced — callers persist the result as-is. */
export function withSinceDate(
  stored: StoredDashboardLayout | null | undefined,
  since: string,
): StoredDashboardLayout {
  return patchGoalSince(stored, { since });
}

/** Layout with the goalSince selection replaced. Pass null to follow every active goal. */
export function withSinceGoalIds(
  stored: StoredDashboardLayout | null | undefined,
  goalIds: number[] | null,
): StoredDashboardLayout {
  return patchGoalSince(stored, { goalIds });
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
 * - Widgets the stored layout has never seen are INSERTED next to their catalog
 *   neighbour, so a widget added in a later release shows up where it was designed
 *   to live rather than being orphaned at the bottom of the dashboard. Appending
 *   was the old behaviour and it stranded, say, a new Trends card below the blurbs,
 *   opening a second "Trends" section header instead of joining the existing one.
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
      // Only carry an override that still names a real section — a section renamed or
      // dropped in a later release falls back to the catalog group rather than
      // rendering a band header that no longer exists.
      ...(platform === 'web' && typeof e.section === 'string' && GROUP_SET.has(e.section)
        ? { section: e.section }
        : {}),
    });
  }

  // Splice in anything the stored layout has never seen, next to its nearest present
  // catalog PREDECESSOR — the widget it ships directly after. Walking the catalog in
  // ascending order means a release that adds several adjacent widgets chains them
  // correctly, since each one can anchor on the one inserted just before it.
  for (const w of catalog) {
    if (seen.has(w.key)) continue;
    const entry: LayoutEntry = {
      key:     w.key,
      span:    w.defaultSpan,
      visible: w.defaultVisible,
      ...(platform === 'mobile' ? { tab: w.mobileTab } : {}),
    };

    let anchorIdx = -1;
    let anchorOrder = -Infinity;
    for (let i = 0; i < merged.length; i++) {
      const order = WIDGET_BY_KEY[merged[i].key].defaultOrder;
      // >= keeps the LAST of any tie, so the newcomer lands after every widget it
      // shares a default position with rather than in the middle of them.
      if (order < w.defaultOrder && order >= anchorOrder) {
        anchorOrder = order;
        anchorIdx = i;
      }
    }

    // No predecessor present means this widget sorts first in the catalog, so it
    // belongs at the top; anything else goes immediately after its anchor.
    merged.splice(anchorIdx + 1, 0, entry);
    seen.add(w.key);
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
    const group = sectionFor(entry);
    const last  = out[out.length - 1];
    if (last && last.group === group) last.widgets.push(entry);
    else out.push({ group, widgets: [entry] });
  }
  return out;
}
