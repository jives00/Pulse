export function parseId(param: string): number | null {
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ponytail: 'en-CA' locale + timeZone gives YYYY-MM-DD in America/Chicago, which differs from the api-client's localDateStr
export const localDateStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
