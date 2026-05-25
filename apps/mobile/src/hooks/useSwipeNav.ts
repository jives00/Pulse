import { useRef, useEffect } from 'react';
import { PanResponder } from 'react-native';
import { useRouter } from 'expo-router';

// Ordered list of all swipeable screens — includes links + settings even though they're under the More menu
const BOTTOM_TABS = [
  '/(app)/(tabs)/dashboard',
  '/(app)/(tabs)/nutrition',
  '/(app)/(tabs)/workouts',
  '/(app)/(tabs)/',
  '/(app)/(tabs)/links',
  '/(app)/(tabs)/history',
  '/(app)/(tabs)/settings',
] as const;

const SWIPE_THRESHOLD = 50; // min horizontal distance to register swipe
const SWIPE_RATIO = 2.5;    // horizontal must be this many times larger than vertical

/**
 * Returns a PanResponder for swipe-left/right navigation.
 *
 * @param currentTabIndex  Index into BOTTOM_TABS for the current screen (0–5)
 * @param internalTabs     Ordered list of internal tab keys (if the page has its own tabs)
 * @param currentInternalTab  The currently active internal tab key
 * @param setInternalTab   Setter to change the internal tab
 */
export function useSwipeNav<T extends string>(
  currentTabIndex: number,
  internalTabs?: readonly T[],
  currentInternalTab?: T,
  setInternalTab?: (tab: T) => void,
) {
  const router = useRouter();

  // Keep refs so the PanResponder closure always sees current values
  const internalTabsRef = useRef<readonly T[] | undefined>(internalTabs);
  const currentInternalTabRef = useRef(currentInternalTab);
  const setInternalTabRef = useRef(setInternalTab);

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

        if (swipedLeft && currentTabIndex < BOTTOM_TABS.length - 1) {
          router.push(BOTTOM_TABS[currentTabIndex + 1] as string);
        } else if (swipedRight && currentTabIndex > 0) {
          router.push(BOTTOM_TABS[currentTabIndex - 1] as string);
        }
      },
    })
  ).current;

  return panResponder;
}
