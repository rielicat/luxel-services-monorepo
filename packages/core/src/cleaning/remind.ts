import 'server-only';
import type { CleaningRemindResult } from '@luxel/shared/cleaning-remind';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { santiagoToday, shiftDate } from '../checkin/window';
import { notifyCleaningScheduled } from './notify';

export async function remindCleanings(
  today: string = santiagoToday(),
): Promise<CleaningRemindResult> {
  const supabase = createSupabaseServiceRoleClient();
  const date = shiftDate(today, 1);

  const { data: claimed, error } = await supabase
    .from('cleanings')
    .update({ reminded_at: new Date().toISOString() })
    .eq('status', 'scheduled')
    .eq('cleaning_date', date)
    .is('reminded_at', null)
    .is('crew_declined_at', null)
    .select('id, property_id');
  if (error) {
    console.error('cleaning.remind_claim_failed', { date, message: error.message });
    return { ok: false, date, due: 0, reminded: 0, failed: 0 };
  }

  const rows = claimed ?? [];
  let reminded = 0;
  let failed = 0;

  for (const row of rows) {
    const cleaningId = String(row.id);
    const propertyId = String(row.property_id);
    const sent = await notifyCleaningScheduled(supabase, propertyId, cleaningId, 'reminder');
    if (sent) {
      reminded++;
      continue;
    }
    failed++;
    await supabase.from('cleanings').update({ reminded_at: null }).eq('id', cleaningId);
    console.error('cleaning.remind_undelivered', { cleaningId, date });
  }

  return { ok: failed === 0, date, due: rows.length, reminded, failed };
}
