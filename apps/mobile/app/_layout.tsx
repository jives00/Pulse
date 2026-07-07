import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, DeviceEventEmitter, Platform, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { configureClient, setApiBase } from '../../../packages/api-client/src/client';
import { API_BASE } from '../src/api/config';
import { resolveApiBase, resetApiBase } from '../src/api/apiBase';
import { useAuthStore } from '../src/store/auth';
import { getNotifications } from '../src/notifications';
import { initializeHealthConnect, syncGrantedPermissions } from '../src/services/healthConnectPermissions';
import { useHealthSteps } from '../src/hooks/useHealthSteps';
import { useUpdateStore } from '../src/store/update';
import { stepsApi } from '../../../packages/api-client/src/endpoints/steps';
import { useStepsStore } from '../src/store/steps';
import { useColors } from '../src/hooks/useColors';

export default function RootLayout() {
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { updateAvailable, downloading, progress, dismissed, checkForUpdate, startUpdate, dismiss } = useUpdateStore();
  const { readTodaySteps } = useHealthSteps();
  const setLiveSteps = useStepsStore((s) => s.setLiveSteps);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    initializeHealthConnect().then(() => syncGrantedPermissions()).catch(() => {});
  }, []);

  // Check for updates on launch and whenever app comes to foreground
  useEffect(() => {
    checkForUpdate();
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        checkForUpdate();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!token) return;
    const syncSteps = async () => {
      try {
        const hcSteps = await readTodaySteps();
        if (hcSteps == null || hcSteps <= 0) return;
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
        const stored = await stepsApi.getDay(today);
        if (hcSteps !== stored.steps) {
          await stepsApi.log(today, hcSteps, 'health_connect');
        }
        setLiveSteps(hcSteps);
      } catch {
        // steps sync is best-effort
      }
    };

    syncSteps();

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        syncSteps();
      }
      appState.current = nextState;
    });

    return () => sub.remove();
  }, [token]);

  useEffect(() => {
    configureClient({
      apiBase: API_BASE + '/api',
      getToken: () => useAuthStore.getState().token,
      onUnauthorized: () => {
        logout();
        router.replace('/(auth)/login');
      },
      // On a network error, re-probe the candidate bases and retry with a reachable one
      // (Tailscale IP ↔ home-LAN IP), so the app survives a network/Tailscale change.
      resolveBaseOnError: async () => {
        resetApiBase();
        const base = await resolveApiBase();
        if (base) setApiBase(base);
        return base;
      },
    });
    // Resolve the reachable base at launch (picks the LAN IP when Tailscale is down).
    resolveApiBase().then((base) => { if (base) setApiBase(base); }).catch(() => {});
  }, [logout]);

  useEffect(() => {
    let isMounted = true;
    let sub: { remove: () => void } | null = null;

    getNotifications().then((Notifications) => {
      if (!Notifications || !isMounted) return;

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });

      Notifications.requestPermissionsAsync().catch(() => {});

      Notifications.setNotificationCategoryAsync('workout-running', [
        { identifier: 'PAUSE', buttonTitle: 'Pause', options: { opensAppToForeground: true } },
      ]).catch(() => {});
      Notifications.setNotificationCategoryAsync('workout-paused', [
        { identifier: 'RESUME', buttonTitle: 'Resume', options: { opensAppToForeground: true } },
      ]).catch(() => {});

      if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('rest-complete', {
          name: 'Rest Timer',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          audioAttributes: { usage: 4 }, // AudioAttributesUsage.ALARM — bypasses DND/silent
        }).catch(() => {});
      }

      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const actionId = response.actionIdentifier;
        const url = response.notification.request.content.data?.url as string | undefined;
        if (actionId === 'PAUSE' || actionId === 'RESUME') {
          const match = url?.match(/\/workout\/(\d+)/);
          if (match) {
            DeviceEventEmitter.emit('workoutAction', { type: actionId, workoutId: Number(match[1]) });
          }
          return;
        }

        if (url) router.push(url as any);
      });

      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        const url = response.notification.request.content.data?.url as string | undefined;
        if (url) router.push(url as any);
      }).catch(() => {});
    });

    return () => {
      isMounted = false;
      sub?.remove();
    };
  }, []);

  const navTheme = {
    dark: true,
    colors: {
      primary: c.accent,
      background: c.bg,
      card: c.card,
      text: c.text,
      border: c.border,
      notification: c.accent,
    },
    fonts: { regular: { fontFamily: 'System', fontWeight: '400' as const }, medium: { fontFamily: 'System', fontWeight: '500' as const }, bold: { fontFamily: 'System', fontWeight: '700' as const }, heavy: { fontFamily: 'System', fontWeight: '900' as const } },
  };

  const showBanner = updateAvailable && !dismissed;

  return (
    <ThemeProvider value={navTheme}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {showBanner && (
          <View style={[styles.updateBanner, { backgroundColor: c.accent, paddingTop: insets.top + 8 }]}>
            <TouchableOpacity style={styles.bannerContent} onPress={startUpdate} disabled={downloading}>
              <Text style={styles.updateText}>
                {downloading
                  ? `Downloading… ${Math.round(progress * 100)}%`
                  : 'Update available — tap to install'}
              </Text>
            </TouchableOpacity>
            {!downloading && (
              <TouchableOpacity onPress={dismiss} style={styles.dismissBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.dismissText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="index" options={{ animation: 'none' }} />
        </Stack>
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  bannerContent: {
    flex: 1,
    alignItems: 'center',
  },
  updateText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  dismissBtn: {
    paddingLeft: 12,
  },
  dismissText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
});
