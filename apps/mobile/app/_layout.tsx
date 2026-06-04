import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, DeviceEventEmitter, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { configureClient } from '../../../packages/api-client/src/client';
import { API_BASE } from '../src/api/config';
import { useAuthStore } from '../src/store/auth';
import { getNotifications } from '../src/notifications';
import { initializeHealthConnect, syncGrantedPermissions } from '../src/services/healthConnectPermissions';
import { useHealthSteps } from '../src/hooks/useHealthSteps';
import { stepsApi } from '../../../packages/api-client/src/endpoints/steps';
import { useStepsStore } from '../src/store/steps';
import { useColors } from '../src/hooks/useColors';

export default function RootLayout() {
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const c = useColors();
  const { readTodaySteps } = useHealthSteps();
  const setLiveSteps = useStepsStore((s) => s.setLiveSteps);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    initializeHealthConnect().then(() => syncGrantedPermissions()).catch(() => {});
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

    // Run immediately on login
    syncSteps();

    // Re-run whenever app comes to foreground
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
    });
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

      // Handle tap when app was killed
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

  return (
    <ThemeProvider value={navTheme}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="index" options={{ animation: 'none' }} />
        </Stack>
      </View>
    </ThemeProvider>
  );
}
