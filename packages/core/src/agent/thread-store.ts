import { createSupabaseServiceRoleClient } from '../supabase/server';

const THREADS = 'guest_threads';
const MESSAGES = 'guest_messages';
const DIGESTS = 'lux_conversation_digest';

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

  const { data: messages } = await supabase
    .from(MESSAGES)
    .select('id, thread_id, created_at')
    .in('thread_id', [...propertyOf.keys()])
    .order('created_at', { ascending: true });

  const heads = new Map<string, ThreadHead>();
  for (const row of (messages ?? []) as Record<string, unknown>[]) {
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
  const CHUNK = 100;
  const supabase = createSupabaseServiceRoleClient();
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const { data } = await supabase
      .from(DIGESTS)
      .select('operation_id')
      .in('operation_id', wanted.slice(i, i + CHUNK));
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
