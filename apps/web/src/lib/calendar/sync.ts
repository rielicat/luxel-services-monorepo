import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { parseICal } from './ical';

/**
 * Pulls every external iCal feed for a property and refreshes its imported busy
 * blocks (manual blocks are left untouched). Full-refresh of imported rows so a
 * cancelled reservation disappears instead of lingering. Never throws on a single
 * unreachable feed.
 */
export async function syncPropertyCalendars(propertyId: string): Promise<{ imported: number }> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: feeds } = await supabase
    .from('property_calendars')
    .select('id, ical_url, label')
    .eq('property_id', propertyId);
  if (!feeds?.length) return { imported: 0 };

  const byUid = new Map<
    string,
    {
      property_id: string;
      starts_on: string;
      ends_on: string;
      source: string;
      summary: string;
      external_uid: string;
    }
  >();
  for (const feed of feeds) {
    try {
      const res = await fetch(feed.ical_url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const text = await res.text();
      for (const ev of parseICal(text)) {
        const external_uid = `${feed.id}:${ev.uid}`; // namespace per feed → no cross-feed UID clashes
        byUid.set(external_uid, {
          property_id: propertyId,
          starts_on: ev.start,
          ends_on: ev.end,
          source: 'import',
          summary: ev.summary || feed.label,
          external_uid,
        });
      }
      await supabase
        .from('property_calendars')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', feed.id);
    } catch {
      /* skip unreachable feed */
    }
  }

  await supabase
    .from('calendar_blocks')
    .delete()
    .eq('property_id', propertyId)
    .eq('source', 'import');
  const rows = [...byUid.values()];
  if (rows.length) await supabase.from('calendar_blocks').insert(rows);
  return { imported: rows.length };
}
