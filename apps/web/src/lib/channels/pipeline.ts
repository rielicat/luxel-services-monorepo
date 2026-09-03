import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { draftGuestReply } from '@/lib/ai/copilot';
import { buildThreadHistory, recordReplyDraft } from '@/lib/messaging/drafts';
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
    await supabase
      .from('guest_threads')
      .update({ status: 'needs_host', updated_at: new Date().toISOString() })
      .eq('id', thread.id);
    return { ok: true, action: 'handoff', threadId: thread.id };
  }

  const history = await buildThreadHistory(supabase, thread.id as string, input.propertyId);
  const draft = await draftGuestReply(input.propertyId, input.body, { history });
  if (!draft.ok) return { ok: false, threadId: thread.id };

  if (draft.handoff || !draft.draft) {
    await supabase
      .from('guest_threads')
      .update({ status: 'needs_host', updated_at: new Date().toISOString() })
      .eq('id', thread.id);
    return { ok: true, action: 'handoff', draft: draft.draft, threadId: thread.id };
  }

  if (property?.ai_reviews !== false) {
    const pending = await recordReplyDraft(supabase, {
      threadId: thread.id as string,
      inboundMessageId: inbound?.id ?? null,
      guestMessage: input.body,
      body: draft.draft,
      handoff: false,
      origin: 'inbound',
    });
    if (!pending) return { ok: false, threadId: thread.id };
    return {
      ok: true,
      action: 'drafted',
      draft: draft.draft,
      threadId: thread.id,
      draftId: pending.id,
    };
  }

  let token: string | null = null;
  if (channel === 'hospitable') {
    token = await hospitableTokenForCustomer((property?.owner_id as string | undefined) ?? null);
  }
  const extId = await getMessageSender(channel).send(input.externalThreadId ?? null, draft.draft, {
    token,
  });
  await supabase.from('guest_messages').insert({
    thread_id: thread.id,
    direction: 'out',
    source: 'ai',
    body: draft.draft,
    external_id: extId,
  });
  return { ok: true, action: 'sent', draft: draft.draft, threadId: thread.id };
}
