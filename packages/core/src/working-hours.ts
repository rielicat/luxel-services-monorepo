const TZ = 'America/Santiago';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface WorkingHoursStatus {
  open: boolean;
  openHour: number;
  closeHour: number;
  days: number[];
}

function config() {
  const days = (process.env.LUXEL_WORKING_DAYS ?? '1,2,3,4,5,6')
    .split(',')
    .map((d) => d.trim())
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
  if (hour === 24) hour = 0;

  const dow = DAY_NAMES.indexOf(weekday);
  const open = days.includes(dow) && hour >= openHour && hour < closeHour;
  return { open, openHour, closeHour, days };
}
