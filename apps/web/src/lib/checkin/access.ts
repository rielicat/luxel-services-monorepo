import 'server-only';

/** What the guest is shown or sent. Access details are method-gated in exactly
 *  one place: a concierge property must never leak a keyless code, and vice
 *  versa. Every surface that reveals access reads through `shapeAccess`. */
export interface AccessInfo {
  method: 'keyless' | 'physical_concierge' | 'physical_none';
  keylessCode: string | null;
  keylessInstructions: string | null;
  conciergeName: string | null;
  conciergeHours: string | null;
}

/** Columns `shapeAccess` needs — the caller's select must cover these. */
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

/** True when there is something worth delivering. A property still set to
 *  `physical_none`, or keyless with no code, has nothing to say — sending an
 *  empty "here is your access" message is worse than sending none. */
export function hasDeliverableAccess(a: AccessInfo | null): boolean {
  if (!a) return false;
  if (a.method === 'keyless') return Boolean(a.keylessCode || a.keylessInstructions);
  if (a.method === 'physical_concierge') return true;
  return false;
}

/** Plain-text access for the channel thread. The guest reads this in the
 *  Airbnb app, which is the one channel we know reaches them — email needs
 *  Resend configured and an address they actually typed. */
export function accessMessage(a: AccessInfo, place: string): string {
  if (a.method === 'keyless') {
    return [
      `¡Hola! Te compartimos el acceso a ${place}.`,
      a.keylessCode ? `Código: ${a.keylessCode}` : null,
      a.keylessInstructions,
      '¿Algún problema al entrar? Respóndenos por aquí.',
    ]
      .filter(Boolean)
      .join('\n');
  }
  const who = a.conciergeName ?? 'la conserjería del edificio';
  const hours = a.conciergeHours ? ` (${a.conciergeHours})` : '';
  return [
    `¡Hola! Te compartimos el acceso a ${place}.`,
    `Retira la llave con ${who}${hours} presentando tu documento.`,
    '¿Algún problema al entrar? Respóndenos por aquí.',
  ].join('\n');
}
