/**
 * Hospitable's own rule sends the check-in details 3 days before arrival. The
 * page reveals access on that same day, so the thread and the page never
 * disagree about when the code becomes available.
 */
export const ACCESS_LEAD_DAYS = 3;

/** Calendar dates are host-local: computed in UTC they would roll over every
 *  Chilean evening (UTC midnight is 20:00–21:00 in Santiago). */
export function santiagoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now);
}

export function shiftDate(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** A row with no arrival date is an operator debug link — no window to wait for. */
export function accessWindowOpen(arrivalDate: string | null | undefined, today: string): boolean {
  return !arrivalDate || today >= shiftDate(arrivalDate, -ACCESS_LEAD_DAYS);
}
