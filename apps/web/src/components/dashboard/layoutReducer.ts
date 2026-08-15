// Pure layout-mutation helpers for the dashboard customize editor.
//
// These operate on the FULL merged widget list (every catalog key, including ones
// whose feature module is currently disabled) so that a widget's stored position and
// width survive a feature being toggled off and back on — only `isWidgetEditable`
// decides what the user can currently see/move. Nothing here touches the network;
// DashboardPage is responsible for persisting the result via the features store.

import {
  WIDGET_BY_KEY, defaultLayout, featuresSatisfied, sectionFor,
  type DashboardWidgetKey, type LayoutEntry, type EnabledFeatures, type LayoutPlatform,
  type WidgetGroup,
} from '@pulse/api-client';

/** A widget is editable (shows up in the dashboard/customize UI at all) once its
 *  required feature modules are enabled — independent of its stored `visible` flag. */
export function isWidgetEditable(entry: LayoutEntry, features: EnabledFeatures): boolean {
  return featuresSatisfied(features, WIDGET_BY_KEY[entry.key].requires);
}

function editableSlots(widgets: LayoutEntry[], features: EnabledFeatures) {
  return widgets
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => isWidgetEditable(w, features));
}

/**
 * Moves `key` one step up/down among the currently-editable widgets, swapping it with
 * its editable neighbor in that direction. Feature-disabled entries are skipped over
 * (and keep their own array slot untouched), so reordering naturally crosses group
 * boundaries — the stored layout is a flat list; groups are just consecutive runs of
 * the same catalog group. A no-op at either end of the editable list.
 */
export function moveWidget(
  widgets: LayoutEntry[],
  key: DashboardWidgetKey,
  direction: 'up' | 'down',
  features: EnabledFeatures,
): LayoutEntry[] {
  const slots = editableSlots(widgets, features);
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

/**
 * Rewrites the order of the editable widgets to match `order` (drag-and-drop drop
 * result), keeping feature-disabled entries pinned at their existing array slots.
 * `order` must list exactly the currently-editable keys — anything else is a no-op.
 *
 * `adopt` re-sections one widget as part of the same change. The drop indicator is
 * drawn against a specific card in a specific band, so the caller passes that band
 * explicitly rather than having this infer it from neighbours — what the user saw
 * highlighted is exactly what they get, including at the boundary between two bands.
 */
export function reorderEditableWidgets(
  widgets: LayoutEntry[],
  features: EnabledFeatures,
  order: DashboardWidgetKey[],
  adopt?: { key: DashboardWidgetKey; section: WidgetGroup },
): LayoutEntry[] {
  const slots = editableSlots(widgets, features);
  if (order.length !== slots.length) return widgets;

  const next = [...widgets];
  order.forEach((key, i) => {
    const entry = widgets.find((w) => w.key === key);
    if (entry) next[slots[i].i] = entry;
  });

  if (adopt) {
    const pos = order.indexOf(adopt.key);
    const entry = widgets.find((w) => w.key === adopt.key);
    if (pos !== -1 && entry && sectionFor(entry) !== adopt.section) {
      next[slots[pos].i] = { ...entry, section: adopt.section };
    }
  }

  return next;
}

/** Clamps to [minSpan, 12] so a bad chip value (or corrupt stored data) can never
 *  shrink a widget below its usable minimum or overflow the 12-col grid. */
export function setWidgetSpan(widgets: LayoutEntry[], key: DashboardWidgetKey, span: number): LayoutEntry[] {
  const widget = WIDGET_BY_KEY[key];
  const clamped = Math.min(12, Math.max(widget.minSpan, span));
  return widgets.map((w) => (w.key === key ? { ...w, span: clamped } : w));
}

/**
 * Moves `key` into `section`, placing it after the last entry already in that section.
 *
 * The position matters as much as the label: bands are consecutive runs of the same
 * section, so stamping a widget with a new section but leaving it in place would split
 * the band it was sitting in and open a second header for the destination. Anchoring on
 * the LAST entry of the section — feature-disabled entries included — also keeps the
 * destination order stable if a module is later re-enabled.
 *
 * A no-op if the key isn't present or is already in that section.
 */
export function setWidgetSection(
  widgets: LayoutEntry[],
  key: DashboardWidgetKey,
  section: WidgetGroup,
): LayoutEntry[] {
  const idx = widgets.findIndex((w) => w.key === key);
  if (idx === -1 || sectionFor(widgets[idx]) === section) return widgets;

  const without = [...widgets.slice(0, idx), ...widgets.slice(idx + 1)];
  const moved: LayoutEntry = { ...widgets[idx], section };

  let lastInSection = -1;
  for (let i = 0; i < without.length; i++) {
    if (sectionFor(without[i]) === section) lastInSection = i;
  }
  // An empty destination section has no anchor, so the widget goes to the end and
  // brings the new band with it rather than landing somewhere arbitrary.
  const insertAt = lastInSection === -1 ? without.length : lastInSection + 1;
  return [...without.slice(0, insertAt), moved, ...without.slice(insertAt)];
}

export function setWidgetVisible(widgets: LayoutEntry[], key: DashboardWidgetKey, visible: boolean): LayoutEntry[] {
  return widgets.map((w) => (w.key === key ? { ...w, visible } : w));
}

/** Widget list for a hard reset to catalog defaults. */
export function resetLayoutWidgets(platform: LayoutPlatform): LayoutEntry[] {
  return defaultLayout(platform).widgets;
}
