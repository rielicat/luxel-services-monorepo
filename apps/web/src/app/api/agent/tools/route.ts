import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { runTool, type ToolContext } from '@luxel/core/ai/tools';
import {
  escalateToLuxel,
  propertyFacts,
  reservationStatus,
  type GuestToolContext,
} from '@luxel/core/ai/guest-tools';
import { pricingReference, propertyCalendar } from '@luxel/core/ai/analyst-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Body = z.object({
  tool: z.string().min(1).max(64),
  input: z.record(z.unknown()).default({}),
  surface: z.enum(['web', 'guest', 'analyst']),
  customerId: z.string().uuid().nullable().optional(),
  signedIn: z.boolean().optional(),
  sessionId: z.string().max(128).nullable().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

const GUEST_TOOLS = new Set(['property_facts', 'reservation_status', 'escalate_to_luxel']);

const ANALYST_TOOLS = new Set(['pricing_reference', 'property_calendar']);

const WEB_TOOLS = new Set([
  'get_airbnb_quote',
  'get_pricing_reference',
  'save_property_details',
  'get_host_status',
  'share_links',
  'escalate_to_human',
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
  const body = parsed.data;

  const allowed =
    body.surface === 'guest' ? GUEST_TOOLS : body.surface === 'analyst' ? ANALYST_TOOLS : WEB_TOOLS;
  if (!allowed.has(body.tool)) {
    return Response.json({ error: 'tool_not_allowed' }, { status: 403 });
  }

  if (body.surface === 'analyst') {
    if (body.tool === 'property_calendar') {
      if (!body.propertyId) return Response.json({ error: 'bad_request' }, { status: 400 });
      return Response.json(await propertyCalendar(body.propertyId), {
        headers: { 'cache-control': 'no-store' },
      });
    }
    const bedrooms = Number(body.input.bedrooms);
    return Response.json(
      await pricingReference({
        comuna: typeof body.input.comuna === 'string' ? body.input.comuna : null,
        bedrooms: Number.isFinite(bedrooms) ? Math.round(bedrooms) : null,
      }),
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  if (body.surface === 'guest') {
    const ctx: GuestToolContext = {
      propertyId: body.propertyId ?? null,
      threadId: body.threadId ?? null,
    };
    const result =
      body.tool === 'property_facts'
        ? await propertyFacts(ctx)
        : body.tool === 'reservation_status'
          ? await reservationStatus(ctx)
          : await escalateToLuxel(ctx, String(body.input.reason ?? ''));
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  }

  const ctx: ToolContext = {
    customerId: body.customerId ?? null,
    signedIn: Boolean(body.signedIn),
    sessionId: body.sessionId ?? null,
  };
  const result = await runTool(body.tool, body.input, ctx);
  return Response.json(result, { headers: { 'cache-control': 'no-store' } });
}
