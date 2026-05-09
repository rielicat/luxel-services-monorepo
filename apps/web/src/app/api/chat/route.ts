import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { getFaqEntries, matchFaq } from '@/lib/faq';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

const Body = z.object({
  message: z.string().min(1).max(1000),
  sessionId: z.string().min(1).max(64),
  handoff: z.boolean().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'validation' }, { status: 400 });

  const { message, sessionId, handoff } = parsed.data;

  const { userId } = await auth();
  const supabase = createSupabaseServiceRoleClient();

  // Resolve customer if signed in.
  let customerId: string | null = null;
  if (userId) {
    const { data: c } = await supabase
      .from('customers')
      .select('id')
      .eq('clerk_user_id', userId)
      .maybeSingle();
    customerId = c?.id ?? null;
  }

  // Persist inbound message.
  await supabase.from('messages').insert({
    customer_id: customerId,
    session_id: sessionId,
    direction: 'in',
    channel: 'web',
    body: message,
    metadata: handoff ? { handoff: true } : null,
  });

  // Handoff to WhatsApp: store and let an operator follow up.
  if (handoff) {
    const reply =
      'Listo — un humano de Servicios Luxel te contactará por WhatsApp en breve.';
    await supabase.from('messages').insert({
      customer_id: customerId,
      session_id: sessionId,
      direction: 'out',
      channel: 'web',
      body: reply,
      metadata: { kind: 'handoff_ack' },
    });
    return NextResponse.json({ ok: true, reply, kind: 'handoff' });
  }

  // FAQ matcher.
  const entries = await getFaqEntries();
  const match = matchFaq(message, entries);
  const reply = match
    ? { i18nKey: match.answerKey }
    : {
        i18nKey: null,
        text:
          'No encontré una respuesta automática. ¿Quieres hablar con una persona por WhatsApp?',
      };

  await supabase.from('messages').insert({
    customer_id: customerId,
    session_id: sessionId,
    direction: 'out',
    channel: 'web',
    body: reply.i18nKey ?? reply.text ?? '',
    metadata: { kind: match ? 'faq' : 'no_match', matchedKey: match?.answerKey },
  });

  return NextResponse.json({ ok: true, reply });
}
