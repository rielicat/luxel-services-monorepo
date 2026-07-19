import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

/** Natural-language operations report for a property over a date range —
 *  nights booked, check-ins, and cleanings (count + total). */
export async function generateReport(
  propertyId: string,
  from: string,
  to: string,
): Promise<string> {
  const supabase = createSupabaseServiceRoleClient();
  const [{ data: prop }, { count: checkins }, { data: cleanings }, { data: blocks }] =
    await Promise.all([
      supabase.from('properties').select('nickname').eq('id', propertyId).maybeSingle(),
      supabase
        .from('checkins')
        .select('*', { count: 'exact', head: true })
        .eq('property_id', propertyId)
        .gte('arrival_at', from)
        .lte('arrival_at', `${to}T23:59:59`),
      supabase
        .from('cleanings')
        .select('price_clp, status')
        .eq('property_id', propertyId)
        .gte('cleaning_date', from)
        .lte('cleaning_date', to),
      supabase
        .from('calendar_blocks')
        .select('starts_on, ends_on')
        .eq('property_id', propertyId)
        .eq('source', 'import')
        .lt('starts_on', to)
        .gte('ends_on', from),
    ]);

  let nights = 0;
  for (const b of blocks ?? []) {
    const s = b.starts_on < from ? from : b.starts_on;
    const e = b.ends_on > to ? to : b.ends_on;
    const diff = (new Date(e).getTime() - new Date(s).getTime()) / 86_400_000;
    if (diff > 0) nights += diff;
  }
  const list = cleanings ?? [];
  const cleaningCount = list.filter((c) => c.status !== 'skipped').length;
  const cleaningTotal = list.reduce((sum, c) => sum + (c.price_clp ?? 0), 0);

  return [
    `Reporte de ${prop?.nickname ?? 'la propiedad'} (${from} → ${to}):`,
    `• Noches reservadas: ${nights}`,
    `• Check-ins: ${checkins ?? 0}`,
    `• Aseos: ${cleaningCount} (total $${cleaningTotal.toLocaleString('es-CL')})`,
  ].join('\n');
}
