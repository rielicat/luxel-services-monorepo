import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { recordEvent } from '@luxel/core/analytics/store';
import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';
import { callerKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EventSchema = z.object({
  event: z.string().min(1).max(80),
  anonId: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
  path: z.string().max(300).optional(),
  referrer: z.string().max(500).optional(),
  utm: z.record(z.string().max(200)).optional(),
  properties: z.record(z.unknown()).optional(),
  posthogCaptured: z.boolean().optional(),
});

const Body = z.object({ events: z.array(EventSchema).min(1).max(20) });

const REQUESTS_PER_MINUTE = 60;

export async function POST(req: Request) {
  if (!rateLimit(callerKey(req.headers), REQUESTS_PER_MINUTE)) {
    return Response.json({ ok: false }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });

  const h = req.headers;
  const userAgent = h.get('user-agent');
  const country = h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry');

  const { userId } = await auth();
  const distinctId: string | null = userId ?? null;
  let customerId: string | null = null;
  if (userId) {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase
      .from('customers')
      .select('id')
      .eq('clerk_user_id', userId)
      .maybeSingle();
    customerId = data?.id ?? null;
  }

  await Promise.all(
    parsed.data.events.map((e) =>
      recordEvent({
        event: e.event,
        anonId: e.anonId,
        sessionId: e.sessionId,
        distinctId: distinctId ?? e.anonId ?? null,
        customerId,
        path: e.path,
        referrer: e.referrer,
        utm: e.utm,
        properties: e.properties,
        userAgent,
        country,
        source: 'web',
        posthogCaptured: e.posthogCaptured,
      }),
    ),
  );

  return Response.json({ ok: true });
}
