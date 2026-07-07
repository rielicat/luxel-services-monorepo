import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { capture } from '@/lib/analytics/server';
import { EVENTS } from '@/lib/analytics/events';
import { workingHoursStatus } from '@/lib/working-hours';
import { whatsappBridgeConfigured, sendWhatsAppViaWorker } from '@/lib/whatsapp/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  sessionId: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
});

// Per-session cap on this public endpoint. Enforced atomically in Postgres
// (claim_chat_slot) so concurrent bursts can't slip past a check-then-write race.
const MAX_MESSAGES_PER_MINUTE = 12;

/**
 * A message the user sends while in "human mode" (after the concierge handed off).
 * Persists it, and forwards it to the operator's WhatsApp when configured — the
 * user stays in the web chat; the operator replies from WhatsApp and those come
 * back via the worker + /api/chat/poll. Reports whether we're within hours.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: 'validation' }, { status: 400 });
  const { sessionId, message } = parsed.data;

  const { userId } = await auth();
  const supabase = createSupabaseServiceRoleClient();

  // Abuse gate: this endpoint is public (anonymous chat), so it can only be used
  // by a session that has actually reached an AI handoff — otherwise it's an
  // unauthenticated write/WhatsApp-spam amplifier. The concierge persists a
  // metadata.kind='handoff' assistant message when it escalates.
  const { data: handoff } = await supabase
    .from('messages')
    .select('id')
    .eq('session_id', sessionId)
    .eq('metadata->>kind', 'handoff')
    .limit(1)
    .maybeSingle();
  if (!handoff) return Response.json({ ok: false, error: 'no_handoff' }, { status: 403 });

  let customerId: string | null = null;
  let customerName: string | null = null;
  if (userId) {
    const { data: c } = await supabase
      .from('customers')
      .select('id, full_name')
      .eq('clerk_user_id', userId)
      .maybeSingle();
    customerId = c?.id ?? null;
    customerName = c?.full_name ?? null;
  }

  const hours = workingHoursStatus();

  // Atomic per-session cap. This also writes the user's message row, so a request
  // that trips the cap persists nothing and can't be used to amplify DB writes or
  // WhatsApp forwards. Counts attempts, so a later send failure still spends a slot.
  const { data: allowed, error: slotErr } = await supabase.rpc('claim_chat_slot', {
    p_session_id: sessionId,
    p_customer_id: customerId,
    p_body: message,
    p_max: MAX_MESSAGES_PER_MINUTE,
    p_window_seconds: 60,
  });
  if (slotErr) return Response.json({ ok: false, error: 'store' }, { status: 500 });
  if (allowed === false) {
    return Response.json({
      ok: true,
      open: hours.open,
      forwarded: false,
      rate_limited: true,
      openHour: hours.openHour,
      closeHour: hours.closeHour,
    });
  }
  capture(EVENTS.CHAT_MESSAGE_SENT, userId ?? sessionId, { session_id: sessionId, mode: 'human' });

  let forwarded = false;
  if (whatsappBridgeConfigured()) {
    const who = customerName ?? 'Visitante web';
    const text =
      `🟢 Luxel · chat web — ${who}\nSesión: ${sessionId}\n\n${message}\n\n` +
      `↩️ Responde a este mensaje para contestarle en el chat.`;
    const wamid = await sendWhatsAppViaWorker(text);
    if (wamid) {
      forwarded = true;
      // Anchor for reply-context routing: the operator's reply carries this id.
      await supabase.from('messages').insert({
        customer_id: customerId,
        session_id: sessionId,
        direction: 'out',
        channel: 'whatsapp',
        body: message,
        whatsapp_message_id: wamid,
        metadata: { to_operator: true },
      });
    }
  }

  return Response.json({
    ok: true,
    open: hours.open,
    forwarded,
    openHour: hours.openHour,
    closeHour: hours.closeHour,
  });
}
