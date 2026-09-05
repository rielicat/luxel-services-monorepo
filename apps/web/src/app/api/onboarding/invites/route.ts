import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  INVITE_QUEUE_LIMIT,
  deliverInvite,
  hostsAwaitingInvite,
} from '@luxel/core/channels/onboarding-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.union([
  z.object({
    op: z.literal('pending'),
    limit: z.number().int().positive().max(INVITE_QUEUE_LIMIT).optional(),
  }),
  z.object({
    op: z.literal('deliver'),
    customerId: z.string().uuid(),
    inviteUrl: z.string().trim().url().max(2048).startsWith('https://'),
    source: z.string().trim().min(1).max(40).optional(),
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

const noStore = { 'cache-control': 'no-store' };

export async function POST(req: Request) {
  if (!authorised(req)) return new Response('Unauthorized', { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad_request' }, { status: 400 });

  if (parsed.data.op === 'pending') {
    const hosts = await hostsAwaitingInvite(parsed.data.limit ?? INVITE_QUEUE_LIMIT);
    return Response.json({ hosts }, { headers: noStore });
  }

  const result = await deliverInvite(
    parsed.data.customerId,
    parsed.data.inviteUrl,
    parsed.data.source ?? 'agent',
  );
  if (!result.ok) {
    const status = result.error === 'unknown_customer' ? 404 : 409;
    return Response.json(result, { status, headers: noStore });
  }
  return Response.json(result, { headers: noStore });
}
