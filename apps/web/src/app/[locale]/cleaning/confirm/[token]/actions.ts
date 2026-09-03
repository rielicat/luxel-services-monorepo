'use server';

import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';

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
