import 'server-only';
import type { createSupabaseServiceRoleClient } from '../supabase/server';
import { coalesceBurst, type Burst } from './burst';

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

const LEASE_MS = 90_000;
const THREADS = 'guest_threads';

export async function claimThreadTurn(supabase: Supabase, threadId: string): Promise<boolean> {
  const { data: before } = await supabase
    .from(THREADS)
    .select('agent_busy_until')
    .eq('id', threadId)
    .maybeSingle();
  if (!before) return false;

  const held = (before.agent_busy_until as string | null) ?? null;
  if (held && Date.parse(held) > Date.now()) return false;

  const until = new Date(Date.now() + LEASE_MS).toISOString();
  const swap = supabase.from(THREADS).update({ agent_busy_until: until }).eq('id', threadId);
  const { data } = await (
    held === null ? swap.is('agent_busy_until', null) : swap.eq('agent_busy_until', held)
  )
    .select('id')
    .maybeSingle();
  return Boolean(data);
}

export async function releaseThreadTurn(supabase: Supabase, threadId: string): Promise<void> {
  await supabase.from(THREADS).update({ agent_busy_until: null }).eq('id', threadId);
}

export async function unansweredGuestMessages(
  supabase: Supabase,
  threadId: string,
  limit = 10,
): Promise<Burst> {
  const { data: lastOut } = await supabase
    .from('guest_messages')
    .select('created_at')
    .eq('thread_id', threadId)
    .eq('direction', 'out')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const since = (lastOut?.created_at as string | null) ?? null;
  let query = supabase
    .from('guest_messages')
    .select('id, body, created_at')
    .eq('thread_id', threadId)
    .eq('direction', 'in')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (since) query = query.gt('created_at', since);

  const { data } = await query;
  return coalesceBurst(
    ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      body: (row.body as string) ?? null,
    })),
  );
}
