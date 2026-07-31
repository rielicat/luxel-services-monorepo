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

// There is deliberately no helper that renders access as a channel message.
// Anything written into the guest thread is re-imported as a `host` message and
// replayed to the AI as grounding for later guests, so a door code sent that way
// leaks to everyone who books afterwards. Access is revealed behind the token on
// the check-in page; the thread only ever carries a link. See reminders.ts.
