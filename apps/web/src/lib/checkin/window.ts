const ACCESS_LEAD_DAYS = 3;

export const RETENTION_DAYS = 90;

export function santiagoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now);
}

export function shiftDate(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function accessWindowOpen(arrivalDate: string | null | undefined, today: string): boolean {
  return !arrivalDate || today >= shiftDate(arrivalDate, -ACCESS_LEAD_DAYS);
}
