/**
 * Shared media-type helpers for exercise media (web, mobile, and server).
 *
 * Exercise media lives in S3 under a key like `exercises/12/media/1724445000.mp4`.
 * The extension is the only record of what the object is — there is no separate
 * content-type column — so uploads must append one and renderers must read it.
 */

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v'] as const;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
};

/** File extension (no dot) for a content type, or null when unrecognised. */
export function mediaExtensionFor(contentType: string | null | undefined): string | null {
  if (!contentType) return null;
  const base = contentType.split(';')[0].trim().toLowerCase();
  return EXTENSION_BY_CONTENT_TYPE[base] ?? null;
}

/** Append the content type's extension to an S3 key, when we recognise the type. */
export function keyWithExtension(key: string, contentType: string | null | undefined): string {
  const ext = mediaExtensionFor(contentType);
  return ext ? `${key}.${ext}` : key;
}

/**
 * True when a stored key or URL points at a video.
 *
 * Presigned S3 URLs carry the key in their path plus a query string of signature
 * params, so the query is stripped before the extension is read.
 */
export function isVideoMedia(urlOrKey: string | null | undefined): boolean {
  if (!urlOrKey) return false;
  const path = urlOrKey.split('?')[0].split('#')[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => path.endsWith(`.${ext}`));
}
