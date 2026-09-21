import { authApi } from '../../../../packages/api-client/src/endpoints/auth';
import { useAuthStore } from '../store/auth';

// Passwordless session recovery for trusted networks (home LAN / Tailscale).
//
// The JWT only lives 7 days and there is no refresh endpoint, so a stored token
// eventually expires — and every 401 used to mean "show the login screen". On a trusted
// network the server hands out a fresh token with no password, so a 401 should first try
// that and only fall back to the login screen when it too is refused (genuinely
// off-network, or the request came through a public tunnel).
//
// Concurrent 401s share one in-flight request so a screen firing six calls at once
// doesn't spend six of the login limiter's tokens.

let inFlight: Promise<string | null> | null = null;

export function recoverSession(): Promise<string | null> {
  if (!inFlight) {
    inFlight = authApi
      .session()
      .then(({ token }) => {
        useAuthStore.getState().setToken(token);
        return token;
      })
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
