import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');
  const after = url.searchParams.get('after');
  if (!sessionId || sessionId.length > 64) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  let q = supabase
    .from('messages')
    .select('id, body, created_at')
    .eq('session_id', sessionId)
    .eq('direction', 'out')
    .eq('channel', 'whatsapp')
    .eq('metadata->>from_operator', 'true')
    .order('created_at', { ascending: true })
    .limit(50);
  if (after) q = q.gt('created_at', after);

  const { data } = await q;
  return Response.json({ ok: true, messages: data ?? [] });
}
