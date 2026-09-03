import 'server-only';
import type { createSupabaseServiceRoleClient } from '../supabase/server';

export const MANUAL_ORIGIN = 'manual';

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

export async function propertiesHoldingManualStays(
  supabase: Supabase,
  propertyIds: string[],
): Promise<Set<string> | null> {
  const out = new Set<string>();
  if (!propertyIds.length) return out;
  for (const table of ['checkins', 'calendar_blocks'] as const) {
    const { data, error } = await supabase
      .from(table)
      .select('property_id')
      .eq('origin', MANUAL_ORIGIN)
      .in('property_id', propertyIds);
    if (error) return null;
    for (const row of data ?? []) out.add(row.property_id as string);
  }
  return out;
}

export async function deletablePropertyIds(
  supabase: Supabase,
  candidateIds: string[],
  context: Record<string, unknown>,
): Promise<string[]> {
  if (!candidateIds.length) return [];
  const held = await propertiesHoldingManualStays(supabase, candidateIds);
  if (!held) {
    console.warn('property.delete_skipped_unreadable_manual_stays', context);
    return [];
  }
  const deletable = candidateIds.filter((id) => !held.has(id));
  if (deletable.length < candidateIds.length) {
    console.warn('property.delete_skipped_manual_stay', {
      ...context,
      kept: candidateIds.length - deletable.length,
    });
  }
  return deletable;
}
