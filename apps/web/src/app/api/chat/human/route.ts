import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { capture } from '@/lib/analytics/server';
import { EVENTS } from '@/lib/analytics/events';
import { workingHoursStatus } from '@/lib/working-hours';
import { whatsappBridgeConfigured, operatorNumber, sendWhatsAppText } from '@/lib/whatsapp/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  sessionId: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
});

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

  await supabase.from('messages').insert({
    customer_id: customerId,
    session_id: sessionId,
    direction: 'in',
    channel: 'web',
    body: message,
    metadata: { kind: 'human' },
  });
  capture(EVENTS.CHAT_MESSAGE_SENT, userId ?? sessionId, { session_id: sessionId, mode: 'human' });

  const hours = workingHoursStatus();

  let forwarded = false;
  const to = operatorNumber();
  if (whatsappBridgeConfigured() && to) {
    // Per-session forward cap (bounds operator-phone spam / Meta cost without
    // external rate-limit infra): at most 8 WhatsApp forwards per rolling minute.
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('metadata->>to_operator', 'true')
      .gt('created_at', since);
    if ((count ?? 0) >= 8) {
      return Response.json({
        ok: true,
        open: hours.open,
        forwarded: false,
        openHour: hours.openHour,
        closeHour: hours.closeHour,
      });
    }

    const who = customerName ?? 'Visitante web';
    const text =
      `🟢 Luxel · chat web — ${who}\nSesión: ${sessionId}\n\n${message}\n\n` +
      `↩️ Responde a este mensaje para contestarle en el chat.`;
    const wamid = await sendWhatsAppText(to, text);
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
