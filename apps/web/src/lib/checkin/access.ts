import 'server-only';

export interface AccessInfo {
  method: 'keyless' | 'physical_concierge' | 'physical_none';
  keylessCode: string | null;
  keylessInstructions: string | null;
  conciergeName: string | null;
  conciergeHours: string | null;
}

export const ACCESS_COLUMNS =
  'method, keyless_code, keyless_instructions, concierge_name, concierge_hours, require_id';

type AccessRow = {
  method: string | null;
  keyless_code?: string | null;
  keyless_instructions?: string | null;
  concierge_name?: string | null;
  concierge_hours?: string | null;
} | null;

export function shapeAccess(row: AccessRow): AccessInfo | null {
  if (!row?.method) return null;
  const keyless = row.method === 'keyless';
  const concierge = row.method === 'physical_concierge';
  return {
    method: row.method as AccessInfo['method'],
    keylessCode: keyless ? (row.keyless_code ?? null) : null,
    keylessInstructions: keyless ? (row.keyless_instructions ?? null) : null,
    conciergeName: concierge ? (row.concierge_name ?? null) : null,
    conciergeHours: concierge ? (row.concierge_hours ?? null) : null,
  };
}
