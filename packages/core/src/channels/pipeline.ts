import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { runAgentTurn } from '../agent/dispatch';
import { sessionForThread, setThreadSession } from '../agent/session';
import { recordReplyDraft } from '../messaging/drafts';
import { getMessageSender } from './provider';
import { hospitableTokenForCustomer } from './hospitable';

type InboundResult = {
  ok: boolean;
  action?: 'sent' | 'drafted' | 'handoff' | 'duplicate';
  draft?: string;
  threadId?: string;
  draftId?: string;
};

export async function handleInboundMessage(input: {
  propertyId: string;
  channel?: string;
  externalThreadId?: string | null;
  guestName?: string | null;
  body: string;
  externalMessageId?: string | null;
}): Promise<InboundResult> {
  const supabase = createSupabaseServiceRoleClient();
  const channel = input.channel ?? 'local';

  if (input.externalMessageId) {
    const { data: dup } = await supabase
      .from('guest_messages')
      .select('id')
      .eq('external_id', input.externalMessageId)
      .limit(1)
      .maybeSingle();
    if (dup) return { ok: true, action: 'duplicate' };
  }

  const { data: thread } = await supabase
    .from('guest_threads')
    .upsert(
      {
        property_id: input.propertyId,
        channel,
        external_thread_id: input.externalThreadId ?? null,
        guest_name: input.guestName ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'property_id,channel,external_thread_id' },
    )
    .select('id')
    .single();
  if (!thread) return { ok: false };

  const { data: inbound } = await supabase
    .from('guest_messages')
    .insert({
      thread_id: thread.id,
      direction: 'in',
      source: 'guest',
      body: input.body,
      external_id: input.externalMessageId ?? null,
    })
    .select('id')
    .maybeSingle();

  const { data: property } = await supabase
    .from('properties')
    .select('ai_replies, ai_reviews, owner_id')
    .eq('id', input.propertyId)
    .maybeSingle();
  if (property && property.ai_replies === false) {
    await markNeedsHost(supabase, thread.id as string);
    return { ok: true, action: 'handoff', threadId: thread.id };
  }

  const threadId = thread.id as string;
  const existing = await sessionForThread(threadId);
  const turn = await runAgentTurn({
    surface: 'guest',
    principalId: `guest:${threadId}`,
    sessionId: existing,
    message: input.body,
    propertyId: input.propertyId,
    threadId,
  });

  if (turn.ok && turn.sessionId && turn.sessionId !== existing) {
    await setThreadSession(threadId, turn.sessionId);
  }

  if (!turn.ok) {
    await markNeedsHost(supabase, threadId);
    return { ok: false, action: 'handoff', threadId };
  }

  const reply = (turn.text ?? '').trim();
  if (turn.handoff || !reply) {
    await markNeedsHost(supabase, threadId);
    return { ok: true, action: 'handoff', draft: reply || undefined, threadId };
  }

  if (property?.ai_reviews !== false) {
    const pending = await recordReplyDraft(supabase, {
      threadId,
      inboundMessageId: inbound?.id ?? null,
      guestMessage: input.body,
      body: reply,
      handoff: false,
      origin: 'inbound',
    });
    if (!pending) return { ok: false, threadId };
    return { ok: true, action: 'drafted', draft: reply, threadId, draftId: pending.id };
  }

  let token: string | null = null;
  if (channel === 'hospitable') {
    token = await hospitableTokenForCustomer((property?.owner_id as string | undefined) ?? null);
  }
  const extId = await getMessageSender(channel).send(input.externalThreadId ?? null, reply, {
    token,
  });
  await supabase.from('guest_messages').insert({
    thread_id: threadId,
    direction: 'out',
    source: 'ai',
    body: reply,
    external_id: extId,
  });
  return { ok: true, action: 'sent', draft: reply, threadId };
}

async function markNeedsHost(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  threadId: string,
): Promise<void> {
  await supabase
    .from('guest_threads')
    .update({ status: 'needs_host', updated_at: new Date().toISOString() })
    .eq('id', threadId);
}
