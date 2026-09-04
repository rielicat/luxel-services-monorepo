import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { draftGuestReply } from '../ai/copilot';
import { buildGrounding } from '../ai/grounding';
import { AI_MODEL } from '../ai/client';
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

export async function buildThreadHistory(
  supabase: Supabase,
  threadId: string,
  propertyId: string,
): Promise<string> {
  const [grounding, { data: recent }] = await Promise.all([
    buildGrounding(propertyId),
    supabase
      .from('guest_messages')
      .select('source, body')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);
  return [
    grounding.text,
    'Conversación actual:',
    ...(recent ?? [])
      .reverse()
      .map((m) => `${m.source === 'guest' ? 'Huésped' : 'Anfitrión'}: ${m.body}`),
  ]
    .filter(Boolean)
    .join('\n');
}

export async function simulateThreadReply(
  threadId: string,
): Promise<{ ok: boolean; reason?: string; draft?: ReplyDraft }> {
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

  const propertyId = thread.property_id as string;
  const history = await buildThreadHistory(supabase, threadId, propertyId);
  const result = await draftGuestReply(propertyId, last.body as string, { history });
  if (!result.ok) return { ok: false, reason: result.reason ?? 'error' };

  const draft = await recordReplyDraft(supabase, {
    threadId,
    inboundMessageId: last.id as string,
    guestMessage: last.body as string,
    body: result.draft ?? '',
    handoff: Boolean(result.handoff),
    origin: 'simulation',
  });
  if (!draft) return { ok: false, reason: 'write_failed' };
  return { ok: true, draft };
}

export async function sendReplyDraft(
  draftId: string,
  body: string,
  actor: string,
): Promise<{ ok: boolean; reason?: string }> {
  const text = body.trim();
  if (!text) return { ok: false, reason: 'empty' };

  const supabase = createSupabaseServiceRoleClient();
  const { data: draft } = await supabase
    .from(DRAFTS)
    .select('id, thread_id, status, body')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) return { ok: false, reason: 'unknown_draft' };
  if (draft.status !== 'pending') return { ok: false, reason: 'already_decided' };

  const { data: thread } = await supabase
    .from('guest_threads')
    .select('id, property_id, channel, external_thread_id, reservation_category')
    .eq('id', draft.thread_id as string)
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
      source: text === ((draft.body as string) ?? '').trim() ? 'ai' : 'host',
      body: text,
      external_id: externalId,
    })
    .select('id')
    .maybeSingle();

  await supabase
    .from(DRAFTS)
    .update({
      status: 'sent',
      body: text,
      decided_at: new Date().toISOString(),
      decided_by: actor,
      sent_message_id: (message?.id as string | undefined) ?? null,
    })
    .eq('id', draftId);

  await supabase
    .from('guest_threads')
    .update({ status: 'open', updated_at: new Date().toISOString() })
    .eq('id', thread.id as string);

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
  const { data: threads } = await supabase
    .from('guest_threads')
    .select(
      'id, property_id, channel, external_thread_id, guest_name, reservation_category, status, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(limit);
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
