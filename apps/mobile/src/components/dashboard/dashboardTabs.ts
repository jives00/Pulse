// Pure layout-derivation helpers for the mobile dashboard's segmented tab bar.
//
// On mobile `span` is meaningless (single column) — order + visibility + which tab a
// widget lives on are what matter. This module turns a resolved DashboardLayout into
// the ordered tab list (dropping tabs whose widgets are all hidden/disabled) and, for
// a given tab, its ordered list of visible widget keys. No React here so it's cheap
// to unit test in isolation.

import type { DashboardLayout, DashboardWidgetKey, LayoutEntry } from '../../../../../packages/api-client/src/index';

export const TAB_ORDER = ['today', 'goals', 'trends', 'sessions'] as const;
export type Tab = typeof TAB_ORDER[number];

export const TAB_LABELS: Record<Tab, string> = {
  today: 'Today',
  goals: 'Goals',
  trends: 'Trends',
  sessions: 'Sessions',
};

/** Ordered, visible widget keys for one tab (layout order, i.e. catalog defaultOrder unless reordered). */
export function widgetsForTab(layout: DashboardLayout, tab: Tab): DashboardWidgetKey[] {
  return layout.widgets.filter((e: LayoutEntry) => e.visible && e.tab === tab).map((e: LayoutEntry) => e.key);
}

/**
 * TAB_ORDER filtered down to tabs that have at least one visible widget. A tab whose
 * every widget is hidden (by the user) or disabled (by a feature toggle — resolveLayout
 * already filtered those out before this runs) disappears from the segmented control
 * entirely rather than rendering an empty tab.
 */
export function visibleTabs(layout: DashboardLayout): Tab[] {
  return TAB_ORDER.filter((tab) => widgetsForTab(layout, tab).length > 0);
}
