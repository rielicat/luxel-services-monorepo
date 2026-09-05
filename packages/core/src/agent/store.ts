import { createSupabaseServiceRoleClient } from '../supabase/server';
import { embed } from './embed';
import { sanitizeForMemory } from './sanitize';
import {
  MAX_PLAYBOOK_NOTES,
  MAX_PROPERTY_DIGESTS,
  MAX_PROPERTY_NOTES,
  PLAYBOOK_SCOPE,
  type ConversationDigest,
  type MemoryNote,
  type MemoryTier,
  type NoteSource,
  type Surface,
} from './types';

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

const NOTES = 'lux_memory_note';
const DIGESTS = 'lux_conversation_digest';

function db(): Supabase {
  return createSupabaseServiceRoleClient();
}

export async function accessSecrets(propertyId: string | null): Promise<string[]> {
  const supabase = db();
  const query = supabase
    .from('property_access')
    .select('keyless_code')
    .not('keyless_code', 'is', null);
  const { data } = await (propertyId ? query.eq('property_id', propertyId) : query);
  const out: string[] = [];
  for (const row of data ?? []) if (row.keyless_code) out.push(String(row.keyless_code));
  return out;
}

export async function listPlaybook(limit = MAX_PLAYBOOK_NOTES): Promise<MemoryNote[]> {
  const { data } = await db()
    .from(NOTES)
    .select('id, note_key, body, weight')
    .eq('tier', 'global')
    .eq('scope_key', PLAYBOOK_SCOPE)
    .order('weight', { ascending: false })
    .limit(limit);
  return toNotes(data);
}

export async function searchNotes(
  scopeKey: string,
  query: string,
  limit = MAX_PROPERTY_NOTES,
): Promise<MemoryNote[]> {
  const supabase = db();
  const embedding = await embed(query);
  const { data, error } = await supabase.rpc('lux_search_notes', {
    p_scope_key: scopeKey,
    p_query: query.slice(0, 400),
    p_embedding: embedding,
    p_limit: limit,
  });
  if (error) {
    const { data: fallback } = await supabase
      .from(NOTES)
      .select('id, note_key, body, weight')
      .eq('scope_key', scopeKey)
      .order('weight', { ascending: false })
      .limit(limit);
    return toNotes(fallback);
  }
  return toNotes(data);
}

export async function searchDigests(
  propertyId: string | null,
  query: string,
  limit = MAX_PROPERTY_DIGESTS,
  surface: Surface | null = null,
): Promise<{ id: string; summary: string }[]> {
  const supabase = db();
  const embedding = await embed(query);
  const { data, error } = await supabase.rpc('lux_search_digests', {
    p_property_id: propertyId,
    p_query: query.slice(0, 400),
    p_embedding: embedding,
    p_limit: limit,
    p_surface: surface,
  });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    summary: (row.summary as string) ?? '',
  }));
}

export async function countDigests(propertyId: string): Promise<number> {
  const { count } = await db()
    .from(DIGESTS)
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId);
  return count ?? 0;
}

export async function upsertNote(input: {
  tier: MemoryTier;
  scopeKey: string;
  noteKey: string | null;
  body: string;
  weight?: number;
  source?: NoteSource;
  propertyId?: string | null;
  secrets?: readonly string[];
}): Promise<boolean> {
  const body = sanitizeForMemory(input.body, input.secrets ?? []);
  if (!body) return false;
  const row = {
    tier: input.tier,
    scope_key: input.scopeKey,
    note_key: input.noteKey,
    body,
    weight: input.weight ?? 0,
    source: input.source ?? 'agent',
    property_id: input.propertyId ?? null,
    embedding: await embed(body),
    updated_at: new Date().toISOString(),
  };
  const supabase = db();
  const { error } = input.noteKey
    ? await supabase.from(NOTES).upsert(row, { onConflict: 'scope_key,note_key' })
    : await supabase.from(NOTES).insert(row);
  if (error) {
    console.error('agent.note_write_failed', { tier: input.tier, message: error.message });
    return false;
  }
  return true;
}

export async function deleteNote(scopeKey: string, noteKey: string): Promise<boolean> {
  const { error } = await db()
    .from(NOTES)
    .delete()
    .eq('scope_key', scopeKey)
    .eq('note_key', noteKey);
  return !error;
}

export async function writeDigest(input: {
  sessionId: string;
  operationId: string;
  surface: Surface;
  propertyId: string | null;
  threadId: string | null;
  summary: string;
  facts: string[];
  outcome: string | null;
  secrets?: readonly string[];
}): Promise<boolean> {
  const secrets = input.secrets ?? [];
  const summary = sanitizeForMemory(input.summary, secrets, 1200);
  if (!summary) return false;
  const facts = input.facts
    .map((fact) => sanitizeForMemory(fact, secrets, 300))
    .filter((fact) => fact.length > 0)
    .slice(0, 12);

  const { error } = await db()
    .from(DIGESTS)
    .upsert(
      {
        session_id: input.sessionId,
        operation_id: input.operationId,
        surface: input.surface,
        property_id: input.propertyId,
        thread_id: input.threadId,
        summary,
        facts,
        outcome: input.outcome,
        embedding: await embed(summary),
      },
      { onConflict: 'operation_id', ignoreDuplicates: true },
    );
  if (error) {
    console.error('agent.digest_write_failed', { surface: input.surface, message: error.message });
    return false;
  }
  return true;
}

export async function pendingDigests(limit = 30): Promise<ConversationDigest[]> {
  const { data } = await db()
    .from(DIGESTS)
    .select('id, session_id, surface, property_id, thread_id, summary, facts, outcome, created_at')
    .is('distilled_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    sessionId: row.session_id as string,
    surface: row.surface as Surface,
    propertyId: (row.property_id as string | null) ?? null,
    threadId: (row.thread_id as string | null) ?? null,
    summary: (row.summary as string) ?? '',
    facts: Array.isArray(row.facts) ? (row.facts as string[]) : [],
    outcome: (row.outcome as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function markDistilled(ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  await db()
    .from(DIGESTS)
    .update({ distilled_at: new Date().toISOString() })
    .in('id', ids as string[]);
}

function toNotes(data: unknown): MemoryNote[] {
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    noteKey: (row.note_key as string | null) ?? null,
    body: (row.body as string) ?? '',
    weight: Number(row.weight ?? 0),
  }));
}
