import { useRef, useEffect } from 'react';
import { PanResponder } from 'react-native';
import { useRouter } from 'expo-router';
import { useFeaturesStore } from '../store/features';
import type { EnabledFeatures, FeatureKey } from '../../../../packages/api-client/src/index';

// Every swipeable top-level screen, keyed by a stable route id (not an index — indices
// drift as modules are hidden). Includes links + settings even though they're under the
// More menu.
export type TabRouteKey =
  | 'dashboard'
  | 'nutrition'
  | 'workouts'
  | 'goals'
  | 'recipes'
  | 'links'
  | 'history'
  | 'settings';

const ROUTE_ORDER: TabRouteKey[] = [
  'dashboard', 'nutrition', 'workouts', 'goals', 'recipes', 'links', 'history', 'settings',
];

export const ROUTE_PATHS: Record<TabRouteKey, string> = {
  dashboard: '/(app)/(tabs)/dashboard',
  nutrition: '/(app)/(tabs)/nutrition',
  workouts:  '/(app)/(tabs)/workouts',
  goals:     '/(app)/(tabs)/goals',
  recipes:   '/(app)/(tabs)/',
  links:     '/(app)/(tabs)/links',
  history:   '/(app)/(tabs)/history',
  settings:  '/(app)/(tabs)/settings',
};

// Feature module gating each route — routes with no entry here (dashboard, history,
// settings) are always available, matching the web sidebar.
const ROUTE_REQUIRES: Partial<Record<TabRouteKey, FeatureKey>> = {
  nutrition: 'nutrition',
  workouts:  'exercise',
  goals:     'goals',
  recipes:   'recipes',
  links:     'links',
};

/** Ordered list of currently-enabled routes, resolved at swipe time so toggles apply live. */
export function enabledTabRoutes(features: EnabledFeatures): TabRouteKey[] {
  return ROUTE_ORDER.filter((r) => {
    const req = ROUTE_REQUIRES[r];
    return !req || features[req];
  });
}

const SWIPE_THRESHOLD = 50; // min horizontal distance to register swipe
const SWIPE_RATIO = 2.5;    // horizontal must be this many times larger than vertical

/**
 * Returns a PanResponder for swipe-left/right navigation.
 *
 * @param currentRoute     The current screen's route key. The ordered route list is
 *                          resolved from the features store at swipe time, so a swipe
 *                          never lands on a disabled tab.
 * @param internalTabs     Ordered list of internal tab keys (if the page has its own tabs)
 * @param currentInternalTab  The currently active internal tab key
 * @param setInternalTab   Setter to change the internal tab
 */
export function useSwipeNav<T extends string>(
  currentRoute: TabRouteKey,
  internalTabs?: readonly T[],
  currentInternalTab?: T,
  setInternalTab?: (tab: T) => void,
) {
  const router = useRouter();

  // Keep refs so the PanResponder closure always sees current values
  const currentRouteRef = useRef(currentRoute);
  const internalTabsRef = useRef<readonly T[] | undefined>(internalTabs);
  const currentInternalTabRef = useRef(currentInternalTab);
  const setInternalTabRef = useRef(setInternalTab);

  useEffect(() => { currentRouteRef.current = currentRoute; }, [currentRoute]);
  useEffect(() => { internalTabsRef.current = internalTabs; }, [internalTabs]);
  useEffect(() => { currentInternalTabRef.current = currentInternalTab; }, [currentInternalTab]);
  useEffect(() => { setInternalTabRef.current = setInternalTab; }, [setInternalTab]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gs) => {
        const dx = Math.abs(gs.dx);
        const dy = Math.abs(gs.dy);
        return dx > 10 && dx > dy * SWIPE_RATIO;
      },
      onPanResponderRelease: (_evt, gs) => {
        const dx = gs.dx;
        const dy = gs.dy;
        if (Math.abs(dx) < SWIPE_THRESHOLD) return;
        if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;

        const swipedLeft = dx < 0;  // finger moved left → go to next (right)
        const swipedRight = dx > 0; // finger moved right → go to prev (left)

        const tabs = internalTabsRef.current;
        const curTab = currentInternalTabRef.current;
        const setter = setInternalTabRef.current;

        if (tabs && curTab && setter) {
          const idx = tabs.indexOf(curTab);
          if (swipedLeft && idx < tabs.length - 1) {
            setter(tabs[idx + 1]);
            return;
          }
          if (swipedRight && idx > 0) {
            setter(tabs[idx - 1]);
            return;
          }
          // Fall through to bottom tab navigation at the edges
        }

        // Resolve the enabled-route list fresh at swipe time so a live toggle takes
        // effect immediately, without needing a subscription/re-render.
        const routes = enabledTabRoutes(useFeaturesStore.getState().features);
        const routeIdx = routes.indexOf(currentRouteRef.current);
        if (routeIdx === -1) return; // current route isn't in the enabled set — nothing to swipe to

        if (swipedLeft && routeIdx < routes.length - 1) {
          router.push(ROUTE_PATHS[routes[routeIdx + 1]] as string);
        } else if (swipedRight && routeIdx > 0) {
          router.push(ROUTE_PATHS[routes[routeIdx - 1]] as string);
        }
      },
    })
  ).current;

  return panResponder;
}
