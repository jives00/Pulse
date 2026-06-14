import { getPresignedGetUrl } from '../services/s3';

/** Block SSRF: reject loopback, RFC-1918, link-local, and AWS metadata addresses. */
export function isSafePhotoUrl(raw: string): boolean {
  try {
    const { protocol, hostname } = new URL(raw);
    if (!['http:', 'https:'].includes(protocol)) return false;
    if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1)/i.test(hostname)) return false;
    return true;
  } catch { return false; }
}

export async function resolveMediaUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith('http')) return stored;
  return await getPresignedGetUrl(stored);
}
