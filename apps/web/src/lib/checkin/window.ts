export const RETENTION_DAYS = 90;

export function santiagoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now);
}

export function shiftDate(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
