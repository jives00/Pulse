import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { authApi } from '../../../packages/api-client/src/index';
import { setApiBase } from '../../../packages/api-client/src/client';
import { useAuthStore } from '../src/store/auth';
import { resolveApiBase, resetApiBase } from '../src/api/apiBase';
import { recoverSession } from '../src/api/session';
import { useColors } from '../src/hooks/useColors';
import { useFeaturesStore } from '../src/store/features';
import { enabledTabRoutes, ROUTE_PATHS } from '../src/hooks/useSwipeNav';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One bootstrap attempt: find a reachable base, then establish a session — validate the
// stored token, or (expired/absent) ask for a passwordless one. Returns false only when
// the server couldn't be reached or refused to trust this network.
async function attempt(): Promise<boolean> {
  const base = await resolveApiBase();
  if (!base) return false;
  setApiBase(base);

  if (useAuthStore.getState().token) {
    try {
      // A 401 here means the 7-day JWT expired; the client interceptor transparently
      // mints a fresh one via /auth/session and retries, so this only throws when that
      // recovery also failed (off-network) or the request never reached the server.
      // Don't ask for a session again here — that would spend a second one for nothing.
      await authApi.verify();
      return true;
    } catch {
      return false;
    }
  }

  return (await recoverSession()) !== null;
}

export default function Index() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const [outcome, setOutcome] = useState<'pending' | 'app' | 'login'>('pending');
  const c = useColors();

  // On launch (after store hydration), confirm we can establish a session before showing
  // the app. The app is often opened the moment the phone wakes, before wifi/Tailscale
  // have settled, so a failure is retried a couple of times with a short backoff rather
  // than going straight to the login screen. If it still fails, show login — without
  // clearing the stored token, so a reconnect + relaunch goes straight back in.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 3; i += 1) {
        if (cancelled) return;
        if (await attempt()) {
          if (!cancelled) setOutcome('app');
          return;
        }
        if (i < 2) {
          await sleep(750 * (i + 1));
          resetApiBase(); // re-probe; the network may have come up in the meantime
        }
      }
      if (!cancelled) setOutcome('login');
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  if (!hydrated || outcome === 'pending') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    );
  }

  const firstEnabledRoute = enabledTabRoutes(useFeaturesStore.getState().features)[0] ?? 'dashboard';
  const appHref = ROUTE_PATHS[firstEnabledRoute];

  return <Redirect href={outcome === 'app' ? (appHref as any) : '/(auth)/login'} />;
}
