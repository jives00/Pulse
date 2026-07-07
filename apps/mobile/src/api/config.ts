// Single origin (legacy) — the primary is the Tailscale IP, baked via EXPO_PUBLIC_API_BASE.
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:3000';

// Full API base candidates (with the /api prefix), tried in order by apiBase.ts. The LAN
// fallback keeps the app working on the home network when Tailscale is down.
const LAN_ORIGIN = process.env.EXPO_PUBLIC_API_LAN_BASE ?? 'http://192.168.0.105:3000';
export const API_BASES = [`${API_BASE}/api`, `${LAN_ORIGIN}/api`];
