import { createSupabaseServiceRoleClient } from '../supabase/server';
import type { AgentSessionRecord, Surface } from './types';

const SESSIONS = 'lux_agent_session';

export async function claimSession(input: {
  sessionId: string;
  principalId: string;
  surface: Surface;
  propertyId?: string | null;
  threadId?: string | null;
}): Promise<boolean> {
  const { error } = await createSupabaseServiceRoleClient()
    .from(SESSIONS)
    .upsert(
      {
        session_id: input.sessionId,
        principal_id: input.principalId,
        surface: input.surface,
        property_id: input.propertyId ?? null,
        thread_id: input.threadId ?? null,
      },
      { onConflict: 'session_id', ignoreDuplicates: true },
    );
  return !error;
}

export async function readSession(sessionId: string): Promise<AgentSessionRecord | null> {
  const { data } = await createSupabaseServiceRoleClient()
    .from(SESSIONS)
    .select('session_id, principal_id, surface, property_id, thread_id')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (!data) return null;
  return {
    sessionId: data.session_id as string,
    principalId: data.principal_id as string,
    surface: data.surface as Surface,
    propertyId: (data.property_id as string | null) ?? null,
    threadId: (data.thread_id as string | null) ?? null,
  };
}

export async function ownsSession(sessionId: string, principalId: string): Promise<boolean> {
  const record = await readSession(sessionId);
  return record !== null && record.principalId === principalId;
}

export async function sessionForThread(threadId: string): Promise<string | null> {
  const { data } = await createSupabaseServiceRoleClient()
    .from('guest_threads')
    .select('agent_session_id')
    .eq('id', threadId)
    .maybeSingle();
  return (data?.agent_session_id as string | null) ?? null;
}

export async function setThreadSession(threadId: string, sessionId: string): Promise<void> {
  await createSupabaseServiceRoleClient()
    .from('guest_threads')
    .update({ agent_session_id: sessionId })
    .eq('id', threadId);
}
