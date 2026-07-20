import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { fetchProperty } from '@/lib/host/queries';
import { suggestPricing } from '@/lib/revenue/suggest';
import { priceTurnover } from '@/lib/cleaning/price';
import { devMockEnabled } from '@/lib/dev-mock';
import type { PropertyRow } from '../properties-client';
import { PropertyDetailClient } from './detail-client';

export const dynamic = 'force-dynamic';

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const supabase = createSupabaseServiceRoleClient();
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (!customer) notFound();

  const property = (await fetchProperty(customer.id, id)) as PropertyRow | null;
  if (!property) notFound();

  // Everything precomputed server-side — the host never clicks to "calculate".
  const [insight, turnover] = await Promise.all([suggestPricing(id), priceTurnover(id)]);

  return (
    <PropertyDetailClient
      property={property}
      insight={insight}
      turnoverPrice={'priceClp' in turnover ? turnover.priceClp : null}
      showSim={devMockEnabled()}
    />
  );
}
