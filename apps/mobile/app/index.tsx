import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { authApi } from '../../../packages/api-client/src/index';
import { setApiBase } from '../../../packages/api-client/src/client';
import { useAuthStore } from '../src/store/auth';
import { resolveApiBase } from '../src/api/apiBase';
import { useColors } from '../src/hooks/useColors';

export default function Index() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const setToken = useAuthStore((s) => s.setToken);
  const [outcome, setOutcome] = useState<'pending' | 'app' | 'login'>('pending');
  const c = useColors();

  // On launch (after store hydration), confirm we can establish a session before
  // showing the app: validate a stored token, or try passwordless network auto-login.
  // If the server is unreachable (off-network without Tailscale), show the login screen
  // like the other apps — without clearing the stored token, so a reconnect + relaunch
  // goes straight back in.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const base = await resolveApiBase();
        if (base) setApiBase(base);
        if (useAuthStore.getState().token) {
          // 401 (invalid token) auto-logs-out via the client interceptor; network
          // errors reject and fall to the catch below.
          await authApi.verify();
          if (!cancelled) setOutcome('app');
        } else {
          const { token: t } = await authApi.session();
          if (!cancelled) {
            setToken(t);
            setOutcome('app');
          }
        }
      } catch {
        if (!cancelled) setOutcome('login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, setToken]);

  if (!hydrated || outcome === 'pending') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    );
  }

  return <Redirect href={outcome === 'app' ? '/(app)/(tabs)/dashboard' : '/(auth)/login'} />;
}
