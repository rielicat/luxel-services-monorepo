'use server';

import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

/** The crew's side of the loop: the notification carries this token, and
 *  tapping confirm is all they do. Token possession is the auth. */
export async function confirmCleaningAttendance(input: unknown): Promise<{ ok: boolean }> {
  const p = z.string().uuid().safeParse(input);
  if (!p.success) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('cleanings')
    .update({ crew_confirmed_at: new Date().toISOString() })
    .eq('confirm_token', p.data)
    .eq('status', 'scheduled')
    .is('crew_confirmed_at', null)
    .select('id');
  return { ok: !error && (data?.length ?? 0) > 0 };
}
