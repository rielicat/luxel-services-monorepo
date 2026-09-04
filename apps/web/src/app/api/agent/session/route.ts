import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';
import { mintAgentToken, AGENT_TOKEN_TTL_SECONDS } from '@luxel/core/agent/token';
import { createAgentSession } from '@luxel/core/agent/dispatch';
import { appUrl } from '@luxel/core/urls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const VISITOR_COOKIE = 'luxel_visitor';

const Body = z.object({ message: z.string().min(1).max(4000).optional() });

async function warmAgent(): Promise<boolean> {
  try {
    const res = await fetch(`${appUrl()}/eve/v1/health`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const jar = await cookies();
  const { userId } = await auth();
  const payload = Body.safeParse(await req.json().catch(() => ({})));
  const message = payload.success ? (payload.data.message ?? null) : null;

  let customerId: string | null = null;
  if (userId) {
    const { data } = await createSupabaseServiceRoleClient()
      .from('customers')
      .select('id')
      .eq('clerk_user_id', userId)
      .maybeSingle();
    customerId = (data?.id as string | undefined) ?? null;
  }

  let visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  if (!visitorId) {
    visitorId = randomUUID();
    jar.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const principalId = userId ? `host:${userId}` : `visitor:${visitorId}`;
  const token = mintAgentToken({
    surface: 'web',
    principalId,
    signedIn: Boolean(userId),
    customerId,
    propertyId: null,
    threadId: null,
  });

  if (!token) {
    return Response.json({ ok: false, error: 'agent_unavailable' }, { status: 503 });
  }

  if (!message) {
    const warm = await warmAgent();
    return Response.json(
      {
        ok: true,
        token,
        principalId,
        signedIn: Boolean(userId),
        warm,
        ttl: AGENT_TOKEN_TTL_SECONDS,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  const created = await createAgentSession({
    surface: 'web',
    principalId,
    signedIn: Boolean(userId),
    customerId,
    message,
  });
  if (!created.ok || !created.sessionId) {
    return Response.json({ ok: false, error: created.reason ?? 'create_failed' }, { status: 502 });
  }

  return Response.json(
    {
      ok: true,
      token,
      principalId,
      signedIn: Boolean(userId),
      sessionId: created.sessionId,
      ttl: AGENT_TOKEN_TTL_SECONDS,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
