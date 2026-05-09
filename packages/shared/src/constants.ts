export const TIMEZONE = 'America/Santiago';
export const CURRENCY = 'CLP';
export const COUNTRY = 'CL';
export const DEFAULT_LOCALE = 'es';

export const TIMEBLOCKS = {
  manana: { start: '08:00', end: '12:00' },
  tarde: { start: '14:00', end: '18:00' },
} as const;

export type TimeblockId = keyof typeof TIMEBLOCKS;
