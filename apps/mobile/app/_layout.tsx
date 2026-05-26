import { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { Stack, router } from 'expo-router';
import { configureClient } from '../../../packages/api-client/src/client';
import { API_BASE } from '../src/api/config';
import { useAuthStore } from '../src/store/auth';
import { getNotifications } from '../src/notifications';
import { initializeHealthConnect, requestHealthConnectPermissions } from '../src/services/healthConnectPermissions';

export default function RootLayout() {
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    const initHealthConnect = async () => {
      await initializeHealthConnect();
      await requestHealthConnectPermissions();
    };
    initHealthConnect();
  }, []);

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

  return <Stack screenOptions={{ headerShown: false }} />;
}
