import { SCENARIO_NOW } from '../data';

export function relativeTime(value: string | Date, now: string | Date = SCENARIO_NOW): string {
  const difference = new Date(value).getTime() - new Date(now).getTime();
  if (!Number.isFinite(difference)) return 'Unknown time';
  if (Math.abs(difference) < 60_000) return 'just now';
  const units = [[86_400_000, 'day'], [3_600_000, 'hour'], [60_000, 'minute']] as const;
  const [divisor, unit] = units.find(([divisor]) => Math.abs(difference) >= divisor)!;
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.trunc(difference / divisor), unit);
}
