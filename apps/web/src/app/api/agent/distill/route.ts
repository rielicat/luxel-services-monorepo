import { timingSafeEqual } from 'node:crypto';
import { distillPending } from '@luxel/core/agent/distill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

  const result = await distillPending();
  return Response.json(result, {
    status: result.ok ? 200 : 500,
    headers: { 'cache-control': 'no-store' },
  });
}
