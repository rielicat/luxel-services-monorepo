import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { fetchProperty } from '@/lib/host/queries';
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

  return <PropertyDetailClient property={property} />;
}
