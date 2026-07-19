import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { getPlan, type PlanRow } from '@/lib/plans';
import { PropertiesClient, type PropertyRow } from './properties-client';

export const dynamic = 'force-dynamic';

export default async function PropertiesPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const supabase = createSupabaseServiceRoleClient();
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('clerk_user_id', userId)
    .maybeSingle();

  let properties: PropertyRow[] = [];
  let plan: PlanRow | null = null;
  if (customer) {
    plan = await getPlan(customer.id);
    const { data } = await supabase
      .from('properties')
      .select(
        'id, nickname, address, comuna, guest_info, property_access(method, require_id, keyless_code, keyless_instructions, concierge_name, concierge_whatsapp, concierge_email, concierge_hours, id_basis, id_disclosed), property_calendars(id, label, ical_url, last_synced_at), calendar_blocks(id, starts_on, ends_on, source, summary), cleanings(id, cleaning_date, status, price_clp, source), guest_threads(id, status, guest_name, updated_at, guest_messages(id, direction, source, body, created_at))',
      )
      .eq('owner_id', customer.id)
      .order('created_at', { ascending: true });
    properties = (data ?? []).map((p) => {
      const pa = p.property_access;
      return {
        ...p,
        property_access: Array.isArray(pa) ? (pa[0] ?? null) : pa,
        property_calendars: p.property_calendars ?? [],
        calendar_blocks: p.calendar_blocks ?? [],
        cleanings: p.cleanings ?? [],
        guest_threads: p.guest_threads ?? [],
      } as PropertyRow;
    });
  }

  return <PropertiesClient initial={properties} plan={plan} />;
}
