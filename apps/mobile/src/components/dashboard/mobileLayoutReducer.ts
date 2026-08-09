// Pure layout-mutation helpers for the MOBILE dashboard customize editor (Settings ›
// Dashboard). Mirrors apps/web/src/components/dashboard/layoutReducer.ts, but adapted
// for mobile's single-column layout: instead of a span + drag-and-drop grid, a mobile
// widget is assigned to one of the four tabs (today/goals/trends/sessions) and is
// reordered with up/down buttons among the editable widgets that share that tab.
//
// These operate on the FULL merged widget list (every catalog key, including ones
// whose feature module is currently disabled) so that a widget's stored position and
// tab survive a feature being toggled off and back on — only `isWidgetEditable` decides
// what the user can currently see/manage. Nothing here touches the network; the
// settings screen is responsible for persisting the result via the features store.

import {
  WIDGET_BY_KEY, defaultLayout, featuresSatisfied,
  type DashboardWidgetKey, type LayoutEntry, type EnabledFeatures,
} from '../../../../../packages/api-client/src/index';
import type { Tab } from './dashboardTabs';

/** A widget is editable (shows up in the dashboard/customize UI at all) once its
 *  required feature modules are enabled — independent of its stored `visible` flag. */
export function isWidgetEditable(entry: LayoutEntry, features: EnabledFeatures): boolean {
  return featuresSatisfied(features, WIDGET_BY_KEY[entry.key].requires);
}

function editableSlotsInTab(widgets: LayoutEntry[], tab: Tab, features: EnabledFeatures) {
  return widgets
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.tab === tab && isWidgetEditable(w, features));
}

/**
 * Moves `key` one step up/down among the currently-editable widgets sharing its tab,
 * swapping it with its editable neighbor in that direction. Feature-disabled entries
 * (and entries on other tabs) are skipped over and keep their own array slot untouched.
 * A no-op at either end of that tab's editable list, or if the key isn't found/has no tab.
 */
export function moveWidgetInTab(
  widgets: LayoutEntry[],
  key: DashboardWidgetKey,
  direction: 'up' | 'down',
  features: EnabledFeatures,
): LayoutEntry[] {
  const entry = widgets.find((w) => w.key === key);
  if (!entry || !entry.tab) return widgets;

  const slots = editableSlotsInTab(widgets, entry.tab, features);
  const pos = slots.findIndex(({ w }) => w.key === key);
  if (pos === -1) return widgets;
  const targetPos = direction === 'up' ? pos - 1 : pos + 1;
  if (targetPos < 0 || targetPos >= slots.length) return widgets;

  const next = [...widgets];
  const aIdx = slots[pos].i;
  const bIdx = slots[targetPos].i;
  [next[aIdx], next[bIdx]] = [next[bIdx], next[aIdx]];
  return next;
}

export function setWidgetVisible(widgets: LayoutEntry[], key: DashboardWidgetKey, visible: boolean): LayoutEntry[] {
  return widgets.map((w) => (w.key === key ? { ...w, visible } : w));
}

/**
 * Reassigns `key` to a different tab, appended at the end of that tab's widgets (i.e.
 * placed right after the last entry — editable or not — currently on that tab, so a
 * later feature re-enable doesn't reshuffle the destination order). If the destination
 * tab has no widgets yet, it's appended at the very end of the list. A no-op if the key
 * isn't found or is already on that tab.
 */
export function setWidgetTab(widgets: LayoutEntry[], key: DashboardWidgetKey, tab: Tab): LayoutEntry[] {
  const idx = widgets.findIndex((w) => w.key === key);
  if (idx === -1) return widgets;
  const entry = widgets[idx];
  if (entry.tab === tab) return widgets;

  const without = [...widgets.slice(0, idx), ...widgets.slice(idx + 1)];
  const moved: LayoutEntry = { ...entry, tab };

  let lastInTab = -1;
  for (let i = 0; i < without.length; i++) {
    if (without[i].tab === tab) lastInTab = i;
  }
  const insertAt = lastInTab === -1 ? without.length : lastInTab + 1;
  return [...without.slice(0, insertAt), moved, ...without.slice(insertAt)];
}

/** Widget list for a hard reset to catalog defaults. */
export function resetLayoutWidgets(): LayoutEntry[] {
  return defaultLayout('mobile').widgets;
}
