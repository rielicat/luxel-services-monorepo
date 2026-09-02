export const MAX_PARTY = 16;

export const NATIONALITIES = [
  'CL',
  'AR',
  'PE',
  'CO',
  'VE',
  'BR',
  'BO',
  'EC',
  'MX',
  'US',
  'ES',
  'other',
] as const;
export type Nationality = (typeof NATIONALITIES)[number];

export const SLOT_RE = /^\d{2}:\d{2}\+?$/;

const STEP_MINUTES = 90;
const LAST_ARRIVAL = 22 * 60 + 30;
const EARLIEST_DEPARTURE = 5 * 60;

function minutes(time: string | null | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})/.exec((time ?? '').trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? fallback : h * 60 + min;
}

function clock(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function arrivalSlots(checkinTime: string | null): string[] {
  const out: string[] = [];
  for (let m = minutes(checkinTime, 15 * 60); m < LAST_ARRIVAL; m += STEP_MINUTES) {
    out.push(clock(m));
  }
  out.push(`${clock(LAST_ARRIVAL)}+`);
  return out;
}

export function departureSlots(checkoutTime: string | null): string[] {
  const end = minutes(checkoutTime, 11 * 60);
  const out: string[] = [];
  for (let i = 3; i >= 0; i -= 1) {
    const m = end - i * STEP_MINUTES;
    if (m >= EARLIEST_DEPARTURE) out.push(clock(m));
  }
  return out;
}

export function guestSlots(expected: number | null | undefined, max: number): number {
  return Math.min(Math.max(expected ?? 1, 1), Math.max(max, 1));
}

export function nightsBetween(arrival: string, departure: string): number {
  const a = Date.parse(`${arrival.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${departure.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
