import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { authApi } from '../../../packages/api-client/src/index';
import { setApiBase } from '../../../packages/api-client/src/client';
import { useAuthStore } from '../src/store/auth';
import { resolveApiBase } from '../src/api/apiBase';
import { useColors } from '../src/hooks/useColors';

export default function Index() {
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const setToken = useAuthStore((s) => s.setToken);
  const [sessionTried, setSessionTried] = useState(false);
  const c = useColors();

  // After store hydration, if there's no stored token, try passwordless network
  // auto-login (trusted LAN / Tailscale) before falling back to the login screen.
  useEffect(() => {
    if (!hydrated || token || sessionTried) return;
    let cancelled = false;
    (async () => {
      try {
        const base = await resolveApiBase();
        if (base) setApiBase(base); // point the client at a reachable base first
        const { token: t } = await authApi.session();
        if (!cancelled) setToken(t);
      } catch {
        // Untrusted network or offline — fall through to the login screen.
      } finally {
        if (!cancelled) setSessionTried(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, sessionTried, setToken]);

  // Wait for hydration, and (when there's no token) for the auto-session attempt to
  // finish, so trusted users never flash the login screen.
  if (!hydrated || (!token && !sessionTried)) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    );
  }

  return <Redirect href={token ? '/(app)/(tabs)/dashboard' : '/(auth)/login'} />;
}
