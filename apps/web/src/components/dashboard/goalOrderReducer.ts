// Pure goal-list mutation helpers for the dashboard customize editor's goal-card
// controls (reorder / span / options / pin / unpin).
//
// Mirrors layoutReducer.ts's style: everything here operates on plain Goal arrays and
// returns new arrays — no network calls, no React. DashboardPage is responsible for
// persisting the result via goalsV2Api.update.

import { resolveGoalCard, type Goal, type GoalCardConfig } from '@pulse/api-client';

/** Pinned goals (showOnDashboard) in on-dashboard display order. */
export function pinnedGoalsSorted(goals: Goal[]): Goal[] {
  return goals
    .filter((g) => g.showOnDashboard)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
}

export interface GoalSortChange { id: number; sortOrder: number }

/**
 * Renumbers every goal named in `orderedIds` to its index (0..n-1) in that list.
 * Goals not present in `orderedIds` are left untouched. Only goals whose sortOrder
 * actually changes are reported in `changed`, so callers can skip no-op PATCHes.
 */
export function reorderPinnedGoals(goals: Goal[], orderedIds: number[]): { goals: Goal[]; changed: GoalSortChange[] } {
  const changed: GoalSortChange[] = [];
  const next = goals.map((g) => {
    const idx = orderedIds.indexOf(g.id);
    if (idx === -1) return g;
    if (g.sortOrder !== idx) changed.push({ id: g.id, sortOrder: idx });
    return g.sortOrder === idx ? g : { ...g, sortOrder: idx };
  });
  return { goals: next, changed };
}

/**
 * Moves `id` one step up/down among the pinned goals, swapping it with its pinned
 * neighbor in that direction. A no-op (empty `changed`) at either end of the list.
 */
export function moveGoal(goals: Goal[], id: number, direction: 'up' | 'down'): { goals: Goal[]; changed: GoalSortChange[] } {
  const pinned = pinnedGoalsSorted(goals);
  const pos = pinned.findIndex((g) => g.id === id);
  if (pos === -1) return { goals, changed: [] };
  const targetPos = direction === 'up' ? pos - 1 : pos + 1;
  if (targetPos < 0 || targetPos >= pinned.length) return { goals, changed: [] };

  const order = pinned.map((g) => g.id);
  [order[pos], order[targetPos]] = [order[targetPos], order[pos]];
  return reorderPinnedGoals(goals, order);
}

/** Sets a goal's card span, clamped via resolveGoalCard (never below 4, never above 12). */
export function setGoalSpan(goals: Goal[], id: number, span: number): Goal[] {
  return goals.map((g) => {
    if (g.id !== id) return g;
    const cfg = resolveGoalCard(g.catalogKey, g.cardConfig);
    const resolved = resolveGoalCard(g.catalogKey, { ...cfg, span });
    return { ...g, cardConfig: resolved };
  });
}

/** Overwrites a goal's full resolved card config (from the options popover). */
export function setGoalCardConfig(goals: Goal[], id: number, cfg: GoalCardConfig): Goal[] {
  return goals.map((g) => (g.id === id ? { ...g, cardConfig: cfg } : g));
}

/**
 * Flips showOnDashboard. Pinning places the goal after the current highest sortOrder
 * among pinned goals so it lands at the end of the dashboard rather than jumping to
 * the front; unpinning leaves sortOrder untouched (it's irrelevant once hidden).
 */
export function setGoalPinned(goals: Goal[], id: number, pinned: boolean): Goal[] {
  if (!pinned) {
    return goals.map((g) => (g.id === id ? { ...g, showOnDashboard: false } : g));
  }
  const maxOrder = goals.filter((g) => g.showOnDashboard).reduce((m, g) => Math.max(m, g.sortOrder), -1);
  return goals.map((g) => (g.id === id ? { ...g, showOnDashboard: true, sortOrder: maxOrder + 1 } : g));
}
