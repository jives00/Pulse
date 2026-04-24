import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { setUnauthorizedHandler } from '../src/api/client';
import { useAuthStore } from '../src/store/auth';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      router.replace('/(auth)/login');
    });
  }, [logout]);

  useEffect(() => {
    Notifications.requestPermissionsAsync();

    Notifications.setNotificationCategoryAsync('workout-running', [
      { identifier: 'PAUSE', buttonTitle: 'Pause', options: { opensAppToForeground: true } },
    ]);
    Notifications.setNotificationCategoryAsync('workout-paused', [
      { identifier: 'RESUME', buttonTitle: 'Resume', options: { opensAppToForeground: true } },
    ]);

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url as string | undefined;
      if (url) router.push(url as any);
    });

    // Handle tap when app was killed
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const url = response.notification.request.content.data?.url as string | undefined;
      if (url) router.push(url as any);
    });

    return () => sub.remove();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
