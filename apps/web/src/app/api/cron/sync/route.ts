import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { activeChannelPlugin, registeredProviderIds } from '@/lib/channels/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * The daily reconcile — a backstop, NOT the mechanism.
 *
 * Events arrive by webhook at /api/channels/hospitable within seconds, so this
 * exists only for the work no event can carry: the day-before nudge and the
 * arrival-day access message (triggered by the calendar, not by anything
 * upstream), cleaning suggestions off checkout dates, attribution of listings
 * nobody has claimed, and detecting what silently stopped existing — which a
 * stream of events, by construction, never reports.
 *
 * Driven by Vercel's own scheduler (apps/web/vercel.json, `0 12 * * *` — 08:00
 * Santiago). There is no external caller and no URL to configure: Vercel GETs
 * the production deployment directly, and sends `Authorization: Bearer
 * ${CRON_SECRET}` automatically when that variable exists on the project. With
 * it unset the route refuses every request, so the daily pass does nothing at
 * all until it is set — visible in the Vercel cron log as a 401.
 *
 * ⚠ ONCE PER DAY, not more. Hobby rejects a sub-daily expression and a rejected
 * vercel.json fails deployment creation outright — which once blocked every
 * luxel-web deploy for weeks while the site silently served a stale build (see
 * c64c945). Anything needing finer granularity belongs on a webhook.
 *
 * Vercel cron delivery is best effort: a run can be missed, or delivered twice.
 * Everything below is idempotent (send-once anchors, upserts, catch-up windows)
 * for that reason.
 *
 * No vendor is named anywhere in this file. The active plugin resolves the
 * credential and owns the mirror pass; this route only decides WHO to sync and
 * reports what came back. Two kinds of customer qualify: those with their own
 * stored connection, and those Luxel manages through the central account
 * (identified by having listings assigned to them).
 */
export async function GET(req: Request) {
  // Fails CLOSED. An unset secret used to mean "no check at all", which on an
  // endpoint that messages guests and triggers AI replies is an open door
  // wearing the costume of a default. Vercel sends this header automatically
  // once CRON_SECRET exists on the project, so the configured path is one
  // variable in one place — and the unconfigured path refuses rather than
  // inviting anyone who guesses the URL to sync every account.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('cron.secret_missing — refusing to run; set CRON_SECRET on the project');
    return new Response('Unauthorized', { status: 401 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const selected = activeChannelPlugin();
  if (!selected.ok) {
    // Loud, not a fallback: the mirror is keyed per provider, so syncing with
    // the wrong one is a data event rather than a misconfiguration.
    return Response.json(
      {
        ok: false,
        error: `CHANNEL_PROVIDER="${selected.requested}" is not a registered channel plugin`,
        registered: registeredProviderIds(),
      },
      { status: 500 },
    );
  }
  const plugin = selected.plugin;

  // Attribution needs a per-listing host identity; a plugin without one leaves
  // assignment to the operator screen.
  const auto =
    plugin.capabilities.hasHostIdentity && plugin.autoAssign
      ? await plugin.autoAssign().catch(() => null)
      : null;

  const supabase = createSupabaseServiceRoleClient();
  const [{ data: connections }, { data: assigned }] = await Promise.all([
    supabase
      .from('channel_connections')
      .select('customer_id')
      .eq('provider', plugin.id)
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
    scope?: string;
    replies?: number;
    relinked?: number;
    reason?: string;
  }> = [];

  const now = new Date();
  for (const customerId of customerIds) {
    const access = await plugin.access(customerId);
    if (!access) {
      results.push({ customer: customerId, ok: false, reason: 'no_access' });
      continue;
    }
    try {
      const r = await plugin.sync(customerId, access, now);
      results.push({
        customer: customerId,
        ok: r.ok,
        scope: access.scope,
        replies: r.replies,
        relinked: r.relinked,
      });
    } catch {
      results.push({ customer: customerId, ok: false, scope: access.scope, reason: 'threw' });
    }
  }

  return Response.json({
    ok: true,
    provider: plugin.id,
    autoAssigned: auto?.assigned ?? 0,
    accounts: results.length,
    results,
  });
}
