import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { setUnauthorizedHandler } from '../src/api/client';
import { useAuthStore } from '../src/store/auth';

export default function RootLayout() {
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      router.replace('/(auth)/login');
    });
  }, [logout]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
