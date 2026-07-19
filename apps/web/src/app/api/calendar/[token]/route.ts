import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { buildICal } from '@/lib/calendar/ical';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public iCal feed for one property (token-authed), for other platforms to import.
 *  Availability only — the blocks carry no guest data. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return new Response('Not found', { status: 404 });

  const supabase = createSupabaseServiceRoleClient();
  const { data: prop } = await supabase
    .from('properties')
    .select('id, nickname')
    .eq('ical_token', token)
    .maybeSingle();
  if (!prop) return new Response('Not found', { status: 404 });

  const { data: blocks } = await supabase
    .from('calendar_blocks')
    .select('id, starts_on, ends_on, summary')
    .eq('property_id', prop.id)
    .order('starts_on', { ascending: true });

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const ics = buildICal(prop.nickname, blocks ?? [], stamp);
  return new Response(ics, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' },
  });
}
