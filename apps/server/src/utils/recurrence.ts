// Our day-of-week: 0=Mon ... 6=Sun (different from JS Date.getUTCDay() where 0=Sun)
export function getDow(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 6 : js - 1;
}

export function parseConfig(raw: any): any {
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

export function dateStr(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

export function utcDate(s: string): Date {
  return new Date(s + 'T00:00:00.000Z');
}

export const DOW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const ORDINALS  = ['', '1st', '2nd', '3rd', '4th', '5th'];

export function ordinalStr(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function describeRecurrence(type: string, cfg: any): string {
  switch (type) {
    case 'once':            return 'One time';
    case 'daily':           return 'Every day';
    case 'every_other_day': return 'Every other day';
    case 'days_of_week':
      return [...(cfg.days as number[])].sort((a, b) => a - b).map((d) => DOW_NAMES[d]).join(' · ');
    case 'every_x_days':    return `Every ${cfg.interval} days`;
    case 'day_of_month':
      if (cfg.type === 'nth_weekday') return `${ORDINALS[cfg.n]} ${DOW_NAMES[cfg.weekday]}`;
      if (cfg.type === 'specific_dates') return (cfg.dates as number[]).map(ordinalStr).join(' & ');
      return '';
    case 'custom_cycle': {
      const itemCount = (cfg.items || cfg.exercises || []).length;
      const itemLabel = itemCount ? `${itemCount}-item cycle` : 'Custom cycle';
      const rest = cfg.restFrequency ? ` with rest every ${cfg.restFrequency}` : '';
      const days = Array.isArray(cfg.days) && cfg.days.length > 0
        ? ` on ${cfg.days.map((d: number) => DOW_NAMES[d]).join(' · ')}`
        : '';
      return itemLabel + rest + days;
    }
    default: return '';
  }
}

// Used by nutrition-schedules, meal-schedules, nutritionScheduleForDate.
// routes/schedules.ts keeps its own extended version (custom_cycle with item cycling).
export function matchesRecurrence(type: string, cfg: any, date: Date, startDate: Date): boolean {
  const diff = Math.round((date.getTime() - startDate.getTime()) / 86400000);
  switch (type) {
    case 'once':            return diff === 0;
    case 'daily':           return true;
    case 'every_other_day': return diff >= 0 && diff % 2 === 0;
    case 'days_of_week':    return Array.isArray(cfg.days) && cfg.days.includes(getDow(date));
    case 'every_x_days':    return diff >= 0 && cfg.interval > 0 && diff % cfg.interval === 0;
    case 'day_of_month':
      if (cfg.type === 'specific_dates') return Array.isArray(cfg.dates) && cfg.dates.includes(date.getUTCDate());
      if (cfg.type === 'nth_weekday') {
        if (getDow(date) !== cfg.weekday) return false;
        const dom = date.getUTCDate();
        return dom >= (cfg.n - 1) * 7 + 1 && dom <= cfg.n * 7;
      }
      return false;
    case 'custom_cycle':
      if (!Array.isArray(cfg.days) || cfg.days.length === 0) return false;
      return cfg.days.includes(getDow(date)) && diff >= 0;
    default: return false;
  }
}
