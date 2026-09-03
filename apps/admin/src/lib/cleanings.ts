export const CLEANINGS_TABLE = 'cleanings';
export const WALKTHROUGH_TABLE = 'cleaning_walkthrough';
export const INVENTORY_TABLE = 'cleaning_inventory';
export const DRAFT_TABLE = 'cleaning_inventory_draft';
export const CHECKLIST_TABLE = 'cleaning_checklist';

export const HISTORY_DAYS = 60;
export const CLEANINGS_LIMIT = 300;

export const CLEANING_STATUS_LABEL: Record<string, string> = {
  suggested: 'Sugerido',
  scheduled: 'Agendado',
  done: 'Listo',
  skipped: 'Cancelado',
};

export const CLEANING_STATUS_TONE: Record<string, string> = {
  suggested: 'new',
  scheduled: 'contacted',
  done: 'converted',
  skipped: 'lost',
};

export const DRAFT_STATUS_LABEL: Record<string, string> = {
  pending: 'Lux está leyendo el video',
  ready: 'Borrador de Lux listo, sin confirmar',
  unavailable: 'Sin lista automática',
  failed: 'Lux no pudo leer el video',
};

export const INVENTORY_SOURCE_LABEL: Record<string, string> = {
  ai: 'Confirmado tal cual lo propuso Lux',
  crew: 'Confirmado y corregido por el equipo',
};

export const CONDITION_LABEL: Record<string, string> = {
  ok: 'Bien',
  dirty: 'Sucio',
  damaged: 'Dañado',
  missing: 'Falta',
  extra: 'De más',
};

export function statusLabel(value: string): string {
  return CLEANING_STATUS_LABEL[value] ?? value;
}

export function statusTone(value: string): string {
  return CLEANING_STATUS_TONE[value] ?? 'lost';
}

export function conditionLabel(value: string): string {
  return CONDITION_LABEL[value] ?? value;
}

export function megabytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes)) return null;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function clock(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function santiagoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}
