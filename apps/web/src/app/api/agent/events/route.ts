import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';
import { createLead } from '@luxel/core/leads';
import { capture } from '@luxel/core/analytics/server';
import { EVENTS } from '@luxel/core/analytics/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Body = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('web_message'),
    sessionId: z.string().max(128),
    customerId: z.string().uuid().nullable(),
    distinctId: z.string().max(128),
    direction: z.enum(['in', 'out']),
    body: z.string().min(1).max(8000),
    handoff: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('lead'),
    sessionId: z.string().max(128).nullable(),
    customerId: z.string().uuid().nullable(),
    message: z.string().max(2000).nullable(),
  }),
  z.object({
    kind: z.literal('tool_called'),
    distinctId: z.string().max(128),
    sessionId: z.string().max(128),
    tool: z.string().max(64),
  }),
]);

function authorised(req: Request): boolean {
  const expected = process.env.INTERNAL_SEND_TOKEN;
  const sent = req.headers.get('x-luxel-internal-token');
  if (!expected || !sent) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorised(req)) return new Response('Unauthorized', { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad_request' }, { status: 400 });
  const event = parsed.data;

  if (event.kind === 'web_message') {
    const supabase = createSupabaseServiceRoleClient();
    await supabase.from('messages').insert({
      customer_id: event.customerId,
      session_id: event.sessionId,
      direction: event.direction,
      channel: 'web',
      body: event.body,
      metadata: event.direction === 'out' ? { kind: event.handoff ? 'handoff' : 'ai' } : null,
    });
    if (event.direction === 'in') {
      capture(EVENTS.CHAT_MESSAGE_SENT, event.distinctId, { session_id: event.sessionId });
    }
    return Response.json({ ok: true });
  }

  if (event.kind === 'lead') {
    await createLead({
      source: 'chat_handoff',
      sessionId: event.sessionId,
      customerId: event.customerId,
      message: event.message,
      metadata: { via: 'lux_concierge' },
    });
    return Response.json({ ok: true });
  }

  capture(EVENTS.AI_TOOL_CALLED, event.distinctId, {
    tool: event.tool,
    session_id: event.sessionId,
  });
  return Response.json({ ok: true });
}
