import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any, 'public', any>;

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const CODE_RE = /^[A-Za-z0-9-]{4,32}$/;

export const isCheckinToken = (id: string): boolean => TOKEN_RE.test(id);

export function normalizeCheckinId(raw: string): string {
  return raw.trim().replace(/\s+/g, '');
}

export async function findCheckin(
  supabase: Supabase,
  rawId: string,
  columns: string,
): Promise<Record<string, unknown> | null> {
  const id = normalizeCheckinId(rawId);
  if (!id) return null;

  if (isCheckinToken(id)) {
    const { data } = await supabase.from('checkins').select(columns).eq('token', id).maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
  }

  if (!CODE_RE.test(id)) return null;
  const { data } = await supabase
    .from('checkins')
    .select(columns)
    .ilike('confirmation_code', id)
    .is('revoked_at', null)
    .order('arrival_date', { ascending: false })
    .limit(3);
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  if (new Set(rows.map((r) => r.property_id)).size > 1) return null;
  return rows[0]!;
}
