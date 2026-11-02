import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { santiagoToday } from '../checkin/window';
import { notifyCleaningCancelled } from './notify';

export async function suggestCleaningsFromCheckouts(
  propertyId: string,
): Promise<{ suggested: number; skipped: number; revived: number }> {
  const supabase = createSupabaseServiceRoleClient();
  const today = santiagoToday();
  const { data: blocks, error } = await supabase
    .from('calendar_blocks')
    .select('ends_on')
    .eq('property_id', propertyId)
    .eq('source', 'import')
    .gte('ends_on', today);
  if (error || !blocks?.length) return { suggested: 0, skipped: 0, revived: 0 };

  const dates = [...new Set(blocks.map((b) => b.ends_on as string))];
  const skipped = await skipOrphanCleanings(supabase, propertyId, today, dates);
  const revived = await reviveSkippedCleanings(supabase, propertyId, today, dates);
  const rows = dates.map((d) => ({
    property_id: propertyId,
    cleaning_date: d,
    status: 'suggested',
    source: 'checkout',
  }));
  const { data: inserted } = await supabase
    .from('cleanings')
    .upsert(rows, { onConflict: 'property_id,cleaning_date', ignoreDuplicates: true })
    .select('id');
  return { suggested: inserted?.length ?? 0, skipped, revived };
}

async function reviveSkippedCleanings(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  propertyId: string,
  today: string,
  liveDates: string[],
): Promise<number> {
  const dates = liveDates.filter((d) => d >= today);
  if (!dates.length) return 0;

  const { data: revived, error } = await supabase
    .from('cleanings')
    .update({
      status: 'suggested',
      crew_confirmed_at: null,
      crew_declined_at: null,
      notified_at: null,
      reminded_at: null,
    })
    .eq('property_id', propertyId)
    .eq('source', 'checkout')
    .eq('status', 'skipped')
    .in('cleaning_date', dates)
    .select('cleaning_date');
  if (error) {
    console.warn('cleaning.revive_failed', { propertyId, message: error.message });
    return 0;
  }
  if (revived?.length) {
    console.warn('cleaning.revived', {
      propertyId,
      dates: revived.map((c) => c.cleaning_date as string),
    });
  }
  return revived?.length ?? 0;
}

async function skipOrphanCleanings(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  propertyId: string,
  today: string,
  liveDates: string[],
): Promise<number> {
  const { data: future } = await supabase
    .from('cleanings')
    .select('id, cleaning_date, status')
    .eq('property_id', propertyId)
    .eq('source', 'checkout')
    .gte('cleaning_date', today)
    .in('status', ['suggested', 'scheduled']);
  if (!future?.length) return 0;

  const live = new Set(liveDates);
  const orphans = future.filter((c) => !live.has(c.cleaning_date as string));
  if (!orphans.length) return 0;

  const { error } = await supabase
    .from('cleanings')
    .update({ status: 'skipped' })
    .in(
      'id',
      orphans.map((c) => c.id),
    );
  if (error) return 0;

  for (const c of orphans.filter((o) => o.status === 'scheduled')) {
    await notifyCleaningCancelled(propertyId, c.cleaning_date as string);
  }
  return orphans.length;
}
