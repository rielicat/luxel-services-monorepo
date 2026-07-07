/**
 * Human-support working hours, evaluated in America/Santiago. The AI concierge
 * runs 24/7; only the live human handoff is gated by these. Configurable via env:
 *   LUXEL_WORKING_DAYS  e.g. "1,2,3,4,5,6" (0=Sun … 6=Sat)  — default Mon–Sat
 *   LUXEL_WORKING_OPEN  hour 0–23  — default 9
 *   LUXEL_WORKING_CLOSE hour 0–23  — default 19
 */

const TZ = 'America/Santiago';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface WorkingHoursStatus {
  open: boolean;
  openHour: number;
  closeHour: number;
  days: number[];
}

function config() {
  const days = (process.env.LUXEL_WORKING_DAYS ?? '1,2,3,4,5,6')
    .split(',')
    .map((d) => d.trim())
    // Drop empty tokens FIRST — Number('') is 0, which would silently inject
    // Sunday (empty env or a trailing comma otherwise flips the whole schedule).
    .filter((d) => d !== '')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  const openHour = clampHour(Number(process.env.LUXEL_WORKING_OPEN ?? 9), 9);
  const closeHour = clampHour(Number(process.env.LUXEL_WORKING_CLOSE ?? 19), 19);
  return { days: days.length ? days : [1, 2, 3, 4, 5, 6], openHour, closeHour };
}

function clampHour(v: number, fallback: number): number {
  return Number.isInteger(v) && v >= 0 && v <= 24 ? v : fallback;
}

export function workingHoursStatus(now: Date = new Date()): WorkingHoursStatus {
  const { days, openHour, closeHour } = config();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'long',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  if (hour === 24) hour = 0; // some runtimes emit "24" for midnight

  const dow = DAY_NAMES.indexOf(weekday);
  const open = days.includes(dow) && hour >= openHour && hour < closeHour;
  return { open, openHour, closeHour, days };
}
