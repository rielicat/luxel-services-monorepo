import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { recordEvent } from '@/lib/analytics/store';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

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
});

const Body = z.object({ events: z.array(EventSchema).min(1).max(20) });

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });

  const h = req.headers;
  const ip = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0]?.trim() || null;
  const userAgent = h.get('user-agent');
  const country = h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry');

  // Resolve the customer once if signed in (cheap; enriches attribution).
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
        ip,
        source: 'web',
      }),
    ),
  );

  return Response.json({ ok: true });
}
