import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { draftGuestReply } from '@/lib/ai/copilot';
import { getChannelProvider } from './provider';
import { hospitableTokenForCustomer } from './hospitable';

export type InboundResult = {
  ok: boolean;
  action?: 'sent' | 'handoff';
  draft?: string;
  threadId?: string;
};

/**
 * Core Phase-2 loop: an inbound guest message is stored, the AI drafts a reply
 * grounded in the property info + learned answers + recent history, then either
 * auto-sends via the channel adapter or flags the thread for a human. Handoff
 * fires when the AI can't answer, detects frustration, or the guest asks for a
 * person — matching the agreed triggers.
 */
export async function handleInboundMessage(input: {
  propertyId: string;
  channel?: string;
  externalThreadId?: string | null;
  guestName?: string | null;
  body: string;
}): Promise<InboundResult> {
  const supabase = createSupabaseServiceRoleClient();
  const channel = input.channel ?? 'local';

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

  await supabase
    .from('guest_messages')
    .insert({ thread_id: thread.id, direction: 'in', source: 'guest', body: input.body });

  const [{ data: recent }, { data: learned }] = await Promise.all([
    supabase
      .from('guest_messages')
      .select('source, body')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('learned_answers')
      .select('question, answer')
      .eq('property_id', input.propertyId)
      .limit(20),
  ]);
  const history = [
    ...(learned ?? []).map((l) => `P: ${l.question}\nR: ${l.answer}`),
    ...(recent ?? [])
      .reverse()
      .map((m) => `${m.source === 'guest' ? 'Huésped' : 'Anfitrión'}: ${m.body}`),
  ].join('\n');

  const draft = await draftGuestReply(input.propertyId, input.body, { history });
  if (!draft.ok) return { ok: false, threadId: thread.id };

  if (draft.handoff || !draft.draft) {
    await supabase
      .from('guest_threads')
      .update({ status: 'needs_host', updated_at: new Date().toISOString() })
      .eq('id', thread.id);
    return { ok: true, action: 'handoff', draft: draft.draft, threadId: thread.id };
  }

  // SaaS: sends go out with the property owner's own channel token.
  let token: string | null = null;
  if (channel === 'hospitable') {
    const { data: prop } = await supabase
      .from('properties')
      .select('owner_id')
      .eq('id', input.propertyId)
      .maybeSingle();
    token = await hospitableTokenForCustomer((prop?.owner_id as string | undefined) ?? null);
  }
  const extId = await getChannelProvider(channel).send(
    input.externalThreadId ?? null,
    draft.draft,
    {
      token,
    },
  );
  await supabase.from('guest_messages').insert({
    thread_id: thread.id,
    direction: 'out',
    source: 'ai',
    body: draft.draft,
    external_id: extId,
  });
  return { ok: true, action: 'sent', draft: draft.draft, threadId: thread.id };
}
