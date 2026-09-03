export const MANUAL_ORIGIN = 'manual';
export const MANUAL_REF_PREFIX = 'manual:';
export const BLOCK_SOURCE = 'import';
export const BLOCK_SUMMARY = 'Estadía directa';
export const MAX_PARTY = 16;
export const MAX_NIGHTS = 90;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function manualRef(stayId: string): string {
  return `${MANUAL_REF_PREFIX}${stayId}`;
}

export function shiftDate(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function santiagoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now);
}

const NIGHT_LIMIT = 1200;

export function nightsBetween(arrival: string, departure: string): string[] {
  const out: string[] = [];
  for (let d = arrival; d < departure && out.length < NIGHT_LIMIT; d = shiftDate(d, 1)) {
    out.push(d);
  }
  return out;
}

export function stayNights(arrival: string, departure: string): string[] {
  return nightsBetween(arrival, departure).slice(0, MAX_NIGHTS + 1);
}

export function checkinUrl(token: string): string | null {
  const base = (process.env.NEXT_PUBLIC_WEB_URL ?? '').trim().replace(/\/$/, '');
  return base ? `${base}/checkin/${token}` : null;
}

export interface ManualStayRow {
  id: string;
  property_id: string;
  token: string;
  status: string;
  guest_name: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  arrival_time: string | null;
  departure_time: string | null;
  expected_guests: number | null;
  reservation_uid: string | null;
  revoked_at: string | null;
  submitted_at: string | null;
  created_at: string;
}

export interface ManualBlockRow {
  id: string;
  property_id: string;
  starts_on: string;
  ends_on: string;
  external_uid: string | null;
}
