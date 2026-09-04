import { createSupabaseServiceRoleClient } from '../supabase/server';

const THREADS = 'guest_threads';
const MESSAGES = 'guest_messages';
const DIGESTS = 'lux_conversation_digest';

const ID_CHUNK = 80;
const PAGE = 500;
const MAX_PAGES = 40;

export interface ThreadHead {
  threadId: string;
  propertyId: string | null;
  lastMessageId: string;
  messages: number;
}

export interface ThreadMessage {
  direction: 'in' | 'out';
  source: string | null;
  body: string;
}

export function threadSessionId(threadId: string): string {
  return `thread:${threadId}`;
}

export function threadOperationId(threadId: string, lastMessageId: string): string {
  return `thread:${threadId}:${lastMessageId}`;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function messageRowsFor(threadIds: readonly string[]): Promise<Record<string, unknown>[]> {
  const supabase = createSupabaseServiceRoleClient();
  const rows: Record<string, unknown>[] = [];
  for (const ids of chunk(threadIds, ID_CHUNK)) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE;
      const { data, error } = await supabase
        .from(MESSAGES)
        .select('id, thread_id, created_at')
        .in('thread_id', ids as string[])
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error('agent.thread_scan_failed', { message: error.message });
        break;
      }
      const batch = (data ?? []) as Record<string, unknown>[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
  }
  return rows;
}

export async function threadHeads(scanLimit = 400): Promise<ThreadHead[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: threads } = await supabase
    .from(THREADS)
    .select('id, property_id')
    .order('updated_at', { ascending: true })
    .limit(scanLimit);
  if (!threads?.length) return [];

  const propertyOf = new Map<string, string | null>(
    (threads as Record<string, unknown>[]).map((t) => [
      t.id as string,
      (t.property_id as string | null) ?? null,
    ]),
  );

  const heads = new Map<string, ThreadHead>();
  for (const row of await messageRowsFor([...propertyOf.keys()])) {
    const threadId = row.thread_id as string;
    const current = heads.get(threadId);
    heads.set(threadId, {
      threadId,
      propertyId: propertyOf.get(threadId) ?? null,
      lastMessageId: row.id as string,
      messages: (current?.messages ?? 0) + 1,
    });
  }
  return [...heads.values()];
}

export async function undigestedThreads(heads: readonly ThreadHead[]): Promise<ThreadHead[]> {
  if (!heads.length) return [];
  const wanted = heads.map((head) => threadOperationId(head.threadId, head.lastMessageId));
  const done = new Set<string>();
  const supabase = createSupabaseServiceRoleClient();
  for (const ids of chunk(wanted, ID_CHUNK)) {
    const { data, error } = await supabase
      .from(DIGESTS)
      .select('operation_id')
      .in('operation_id', ids);
    if (error) {
      console.error('agent.digest_lookup_failed', { message: error.message });
      return [];
    }
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      done.add(row.operation_id as string);
    }
  }
  return heads.filter((head) => !done.has(threadOperationId(head.threadId, head.lastMessageId)));
}

export async function threadMessages(threadId: string, limit = 40): Promise<ThreadMessage[]> {
  const { data } = await createSupabaseServiceRoleClient()
    .from(MESSAGES)
    .select('direction, source, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[])
    .map((row) => ({
      direction: (row.direction as 'in' | 'out') ?? 'in',
      source: (row.source as string | null) ?? null,
      body: (row.body as string) ?? '',
    }))
    .filter((message) => message.body.trim().length > 0)
    .reverse();
}
