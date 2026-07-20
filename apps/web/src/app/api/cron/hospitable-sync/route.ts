import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { hospitableTokenForCustomer } from '@/lib/channels/hospitable';
import { syncHospitableAccount } from '@/lib/channels/hospitable-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Scheduled sync (vercel.json cron, every 15 min): pulls reservations, calendar
 * and conversations for every connected account, auto-replying to new guest
 * messages. This is what keeps the AI interacting with Hospitable continuously
 * without webhook access. Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: connections } = await supabase
    .from('channel_connections')
    .select('customer_id')
    .eq('provider', 'hospitable')
    .eq('status', 'connected');

  const results: Array<{ customer: string; ok: boolean; replies?: number }> = [];
  for (const c of connections ?? []) {
    const token = await hospitableTokenForCustomer(c.customer_id as string);
    if (!token) {
      results.push({ customer: c.customer_id as string, ok: false });
      continue;
    }
    try {
      const r = await syncHospitableAccount(c.customer_id as string, token);
      results.push({ customer: c.customer_id as string, ok: r.ok, replies: r.aiReplies });
    } catch {
      results.push({ customer: c.customer_id as string, ok: false });
    }
  }
  return Response.json({ ok: true, accounts: results.length, results });
}
