import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { REVIEW_SWEEP_LIMIT } from '@luxel/shared/cleaning-review';
import { runCleaningReview, sweepReviewRuns } from '@luxel/core/cleaning/review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.union([
  z.object({ runId: z.string().uuid() }),
  z.object({ op: z.literal('sweep'), limit: z.number().int().positive().optional() }),
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

  if ('op' in parsed.data) {
    const runs = await sweepReviewRuns(
      Math.min(parsed.data.limit ?? REVIEW_SWEEP_LIMIT, REVIEW_SWEEP_LIMIT),
    );
    return Response.json({ runs }, { headers: { 'cache-control': 'no-store' } });
  }

  const result = await runCleaningReview(parsed.data.runId);
  return Response.json(result, { headers: { 'cache-control': 'no-store' } });
}
