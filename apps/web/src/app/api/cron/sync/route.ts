import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { hospitableAccess } from '@/lib/channels/scope';
import { autoAssignListings } from '@/lib/channels/auto-assign';
import { syncHospitableAccount } from '@/lib/channels/hospitable-sync';
import { syncBeds24Account } from '@/lib/channels/beds24-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Scheduled sync: pulls reservations, calendar and conversations for every
 * managed account, auto-replying to new guest messages. This is what keeps the
 * AI interacting with the channel continuously without webhook access.
 *
 * Driven by .github/workflows/sync-cron.yml (~every 30 min), NOT by vercel.json
 * — a sub-daily cron there is rejected on Hobby and silently blocks every
 * deploy. The caller sends `Authorization: Bearer ${CRON_SECRET}`; when
 * CRON_SECRET is unset the route is open, so set it in production.
 *
 * Two kinds of customer are synced: those with their own stored connection, and
 * those Luxel manages through the central account (identified by having listings
 * assigned to them). `hospitableAccess` resolves which, and the scope it returns
 * keeps a central fetch filtered to that customer's assigned listings.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Beds24 takes over the moment its credential exists. The Hospitable path
  // stays as the fallback rather than being deleted: it is the only thing that
  // works for any customer still on a live Hospitable connection.
  const beds24Token = process.env.BEDS24_REFRESH_TOKEN;

  // Attribution reads Hospitable's listings[].platform_email, which Beds24 does
  // not expose — and calling it while that subscription is inactive just burns a
  // request for a 402. Skip it when Beds24 is driving; assignment is an operator
  // action there until attribution moves onto airbnbUserId.
  const auto = beds24Token ? null : await autoAssignListings().catch(() => null);

  const supabase = createSupabaseServiceRoleClient();
  const [{ data: connections }, { data: assigned }] = await Promise.all([
    supabase
      .from('channel_connections')
      .select('customer_id')
      .eq('provider', 'hospitable')
      .eq('status', 'connected'),
    supabase.from('listing_assignments').select('customer_id'),
  ]);

  const customerIds = [
    ...new Set([
      ...(connections ?? []).map((c) => c.customer_id as string),
      ...(assigned ?? []).map((a) => a.customer_id as string),
    ]),
  ];

  const results: Array<{
    customer: string;
    ok: boolean;
    provider?: string;
    scope?: string;
    replies?: number;
    relinked?: number;
    unmatched?: number;
    reason?: string;
  }> = [];

  for (const customerId of customerIds) {
    if (beds24Token) {
      try {
        const r = await syncBeds24Account(customerId, beds24Token, new Date());
        results.push({
          customer: customerId,
          ok: r.ok,
          provider: 'beds24',
          relinked: r.relinked,
          unmatched: r.unmatched.length,
          reason: r.reason,
        });
      } catch {
        results.push({ customer: customerId, ok: false, provider: 'beds24' });
      }
      continue;
    }

    const access = await hospitableAccess(customerId);
    if (!access) {
      results.push({ customer: customerId, ok: false, provider: 'hospitable' });
      continue;
    }
    try {
      const r = await syncHospitableAccount(customerId, access.token, new Date(), access.scope);
      results.push({
        customer: customerId,
        ok: r.ok,
        provider: 'hospitable',
        scope: access.scope,
        replies: r.aiReplies,
      });
    } catch {
      results.push({
        customer: customerId,
        ok: false,
        provider: 'hospitable',
        scope: access.scope,
      });
    }
  }
  return Response.json({
    ok: true,
    provider: beds24Token ? 'beds24' : 'hospitable',
    autoAssigned: auto?.assigned ?? 0,
    accounts: results.length,
    results,
  });
}
