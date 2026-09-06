import 'server-only';
import { randomUUID } from 'node:crypto';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { AI_MODEL } from '../ai/model';
import { startAgentTurn } from '../agent/dispatch';
import { getMessageSender } from '../channels/provider';
import { hospitableTokenForCustomer } from '../channels/hospitable';

export type DraftOrigin = 'inbound' | 'simulation';

export interface ReplyDraft {
  id: string;
  threadId: string;
  guestMessage: string;
  body: string;
  handoff: boolean;
  model: string | null;
  origin: DraftOrigin;
  createdAt: string;
}

export interface InboxMessage {
  id: string;
  direction: 'in' | 'out';
  source: 'guest' | 'ai' | 'host';
  body: string;
  createdAt: string;
}

export interface InboxThread {
  id: string;
  propertyId: string;
  propertyName: string;
  channel: string;
  externalThreadId: string | null;
  guestName: string | null;
  reservationCategory: string | null;
  status: string;
  aiReplies: boolean;
  aiReviews: boolean;
  updatedAt: string;
  messages: InboxMessage[];
  draft: ReplyDraft | null;
}

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

const DRAFTS = 'guest_reply_drafts';

function toDraft(row: Record<string, unknown>): ReplyDraft {
  return {
    id: row.id as string,
    threadId: row.thread_id as string,
    guestMessage: (row.guest_message as string) ?? '',
    body: (row.body as string) ?? '',
    handoff: Boolean(row.handoff),
    model: (row.model as string | null) ?? null,
    origin: (row.origin as DraftOrigin) ?? 'inbound',
    createdAt: row.created_at as string,
  };
}

export async function recordReplyDraft(
  supabase: Supabase,
  input: {
    threadId: string;
    inboundMessageId?: string | null;
    guestMessage: string;
    body: string;
    handoff: boolean;
    origin: DraftOrigin;
  },
): Promise<ReplyDraft | null> {
  await supabase
    .from(DRAFTS)
    .update({ status: 'discarded', decided_at: new Date().toISOString(), decided_by: 'superseded' })
    .eq('thread_id', input.threadId)
    .eq('status', 'pending');

  const { data, error } = await supabase
    .from(DRAFTS)
    .insert({
      thread_id: input.threadId,
      inbound_message_id: input.inboundMessageId ?? null,
      guest_message: input.guestMessage,
      body: input.body,
      handoff: input.handoff,
      model: AI_MODEL,
      origin: input.origin,
    })
    .select('*')
    .maybeSingle();
  if (error || !data) {
    console.error('drafts.record_failed', { threadId: input.threadId, message: error?.message });
    return null;
  }
  return toDraft(data as Record<string, unknown>);
}

const SIMULATION_CONTEXT_MESSAGES = 20;

async function threadTranscript(supabase: Supabase, threadId: string): Promise<string> {
  const { data } = await supabase
    .from('guest_messages')
    .select('source, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(SIMULATION_CONTEXT_MESSAGES);
  const rows = ((data ?? []) as Record<string, unknown>[]).reverse();
  const lines = rows.map((row) => {
    const source = row.source as string;
    const who = source === 'guest' ? 'Huesped' : source === 'ai' ? 'Lux' : 'Luxel';
    return `${who}: ${(row.body as string) ?? ''}`;
  });
  return lines.join('\n');
}

export async function simulateThreadReply(
  threadId: string,
): Promise<{ ok: boolean; reason?: string; pending?: boolean }> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: thread } = await supabase
    .from('guest_threads')
    .select('id, property_id')
    .eq('id', threadId)
    .maybeSingle();
  if (!thread) return { ok: false, reason: 'unknown_thread' };

  const { data: last } = await supabase
    .from('guest_messages')
    .select('id, body')
    .eq('thread_id', threadId)
    .eq('source', 'guest')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { ok: false, reason: 'no_guest_message' };

  const started = await startAgentTurn({
    surface: 'guest',
    principalId: `sim:${randomUUID()}`,
    message: last.body as string,
    propertyId: thread.property_id as string,
    threadId,
    context: await threadTranscript(supabase, threadId),
    simulation: true,
  });
  if (!started.ok) return { ok: false, reason: started.reason ?? 'error' };
  if (started.mocked) {
    await recordSimulationOutcome({
      threadId,
      body: started.mocked.text,
      handoff: started.mocked.handoff,
    });
  }
  return { ok: true, pending: true };
}

export async function recordSimulationOutcome(input: {
  threadId: string;
  body: string;
  handoff: boolean;
}): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: last } = await supabase
    .from('guest_messages')
    .select('id, body')
    .eq('thread_id', input.threadId)
    .eq('source', 'guest')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const draft = await recordReplyDraft(supabase, {
    threadId: input.threadId,
    inboundMessageId: (last?.id as string | undefined) ?? null,
    guestMessage: (last?.body as string | undefined) ?? '',
    body: input.body.trim(),
    handoff: input.handoff,
    origin: 'simulation',
  });
  return draft !== null;
}

const SUPERSEDED_BY = 'superseded';

function wasSuperseded(draft: Record<string, unknown>): boolean {
  return draft.status === 'discarded' && draft.decided_by === SUPERSEDED_BY;
}

function refuse(
  reason: string,
  context: Record<string, string | null>,
): { ok: false; reason: string } {
  console.warn('drafts.send_refused', { ...context, reason });
  return { ok: false, reason };
}

async function deliverToThread(
  supabase: Supabase,
  threadId: string,
  text: string,
  source: 'ai' | 'host',
): Promise<{ ok: boolean; reason?: string; messageId?: string | null }> {
  const { data: thread } = await supabase
    .from('guest_threads')
    .select('id, property_id, channel, external_thread_id, reservation_category')
    .eq('id', threadId)
    .maybeSingle();
  if (!thread) return { ok: false, reason: 'unknown_thread' };

  const { data: property } = await supabase
    .from('properties')
    .select('owner_id')
    .eq('id', thread.property_id as string)
    .maybeSingle();

  const channel = (thread.channel as string) ?? 'local';
  const token =
    channel === 'hospitable'
      ? await hospitableTokenForCustomer((property?.owner_id as string | undefined) ?? null)
      : null;
  if (channel === 'hospitable' && !token) return { ok: false, reason: 'no_access' };

  const externalId = await getMessageSender(channel).send(
    (thread.external_thread_id as string | null) ?? null,
    text,
    { token, kind: thread.reservation_category === 'inquiry' ? 'inquiry' : 'reservation' },
  );
  if (channel !== 'local' && !externalId) return { ok: false, reason: 'send_failed' };

  const { data: message } = await supabase
    .from('guest_messages')
    .insert({
      thread_id: thread.id as string,
      direction: 'out',
      source,
      body: text,
      external_id: externalId,
    })
    .select('id')
    .maybeSingle();

  await supabase
    .from('guest_threads')
    .update({
      status: 'open',
      updated_at: new Date().toISOString(),
      handoff_notified_at: null,
    })
    .eq('id', thread.id as string);

  return { ok: true, messageId: (message?.id as string | undefined) ?? null };
}

export async function sendReplyDraft(
  draftId: string,
  body: string,
  actor: string,
): Promise<{ ok: boolean; reason?: string }> {
  const text = body.trim();
  if (!text) return refuse('empty', { draftId });

  const supabase = createSupabaseServiceRoleClient();
  const { data: draft } = await supabase
    .from(DRAFTS)
    .select('id, thread_id, status, body, decided_by')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) return refuse('unknown_draft', { draftId });
  if (draft.status !== 'pending' && !wasSuperseded(draft)) {
    return refuse('already_decided', { draftId, status: draft.status as string });
  }

  const sent = await deliverToThread(
    supabase,
    draft.thread_id as string,
    text,
    text === ((draft.body as string) ?? '').trim() ? 'ai' : 'host',
  );
  if (!sent.ok) return refuse(sent.reason ?? 'send_failed', { draftId });

  await supabase
    .from(DRAFTS)
    .update({
      status: 'sent',
      body: text,
      decided_at: new Date().toISOString(),
      decided_by: actor,
      sent_message_id: sent.messageId ?? null,
    })
    .eq('id', draftId);

  return { ok: true };
}

export async function sendThreadReply(
  threadId: string,
  body: string,
  actor: string,
): Promise<{ ok: boolean; reason?: string }> {
  const text = body.trim();
  if (!text) return refuse('empty', { threadId });

  const supabase = createSupabaseServiceRoleClient();
  const sent = await deliverToThread(supabase, threadId, text, 'host');
  if (!sent.ok) return refuse(sent.reason ?? 'send_failed', { threadId });

  await supabase
    .from(DRAFTS)
    .update({ status: 'discarded', decided_at: new Date().toISOString(), decided_by: actor })
    .eq('thread_id', threadId)
    .eq('status', 'pending');

  return { ok: true };
}

export async function discardReplyDraft(
  draftId: string,
  actor: string,
  handoff: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: draft } = await supabase
    .from(DRAFTS)
    .select('id, thread_id, status')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) return { ok: false, reason: 'unknown_draft' };
  if (draft.status !== 'pending') return { ok: false, reason: 'already_decided' };

  await supabase
    .from(DRAFTS)
    .update({ status: 'discarded', decided_at: new Date().toISOString(), decided_by: actor })
    .eq('id', draftId);

  if (handoff) {
    await supabase
      .from('guest_threads')
      .update({ status: 'needs_host', updated_at: new Date().toISOString() })
      .eq('id', draft.thread_id as string);
  }
  return { ok: true };
}

export async function listInboxThreads(limit = 30): Promise<InboxThread[]> {
  const supabase = createSupabaseServiceRoleClient();
  const [{ data: pending }, { data: waiting }, { data: latest }] = await Promise.all([
    supabase.from(DRAFTS).select('thread_id').eq('status', 'pending'),
    supabase
      .from('guest_threads')
      .select('id')
      .eq('status', 'needs_host')
      .order('updated_at', { ascending: false })
      .limit(limit),
    supabase
      .from('guest_threads')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(limit),
  ]);

  const ids = [
    ...new Set([
      ...((pending ?? []) as Record<string, unknown>[]).map((d) => d.thread_id as string),
      ...((waiting ?? []) as Record<string, unknown>[]).map((t) => t.id as string),
      ...((latest ?? []) as Record<string, unknown>[]).map((t) => t.id as string),
    ]),
  ];
  if (!ids.length) return [];

  const { data: threads } = await supabase
    .from('guest_threads')
    .select(
      'id, property_id, channel, external_thread_id, guest_name, reservation_category, status, updated_at',
    )
    .in('id', ids)
    .order('updated_at', { ascending: false });
  const rows = (threads ?? []) as Record<string, unknown>[];
  if (!rows.length) return [];

  const threadIds = rows.map((t) => t.id as string);
  const propertyIds = [...new Set(rows.map((t) => t.property_id as string))];

  const [{ data: properties }, { data: messages }, { data: drafts }] = await Promise.all([
    supabase
      .from('properties')
      .select('id, nickname, ai_replies, ai_reviews')
      .in('id', propertyIds),
    supabase
      .from('guest_messages')
      .select('id, thread_id, direction, source, body, created_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: true }),
    supabase.from(DRAFTS).select('*').in('thread_id', threadIds).eq('status', 'pending'),
  ]);

  const propertyById = new Map(
    ((properties ?? []) as Record<string, unknown>[]).map((p) => [p.id as string, p]),
  );
  const draftByThread = new Map(
    ((drafts ?? []) as Record<string, unknown>[]).map((d) => [d.thread_id as string, toDraft(d)]),
  );
  const messagesByThread = new Map<string, InboxMessage[]>();
  for (const m of (messages ?? []) as Record<string, unknown>[]) {
    const key = m.thread_id as string;
    const list = messagesByThread.get(key) ?? [];
    list.push({
      id: m.id as string,
      direction: m.direction as 'in' | 'out',
      source: m.source as 'guest' | 'ai' | 'host',
      body: m.body as string,
      createdAt: m.created_at as string,
    });
    messagesByThread.set(key, list);
  }

  return rows.map((t) => {
    const property = propertyById.get(t.property_id as string);
    return {
      id: t.id as string,
      propertyId: t.property_id as string,
      propertyName: (property?.nickname as string | undefined) ?? '',
      channel: (t.channel as string) ?? 'local',
      externalThreadId: (t.external_thread_id as string | null) ?? null,
      guestName: (t.guest_name as string | null) ?? null,
      reservationCategory: (t.reservation_category as string | null) ?? null,
      status: (t.status as string) ?? 'open',
      aiReplies: property?.ai_replies !== false,
      aiReviews: property?.ai_reviews !== false,
      updatedAt: t.updated_at as string,
      messages: (messagesByThread.get(t.id as string) ?? []).slice(-20),
      draft: draftByThread.get(t.id as string) ?? null,
    };
  });
}
