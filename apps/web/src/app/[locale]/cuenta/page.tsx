import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getOrCreateCustomer } from '@/lib/customer';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { Separator } from '@/components/ui/separator';
import { TrackView } from '@/components/analytics/track-view';
import { ProfileForm } from './profile-form';
import { SubscriptionsList } from './subscriptions-list';
import { BookingsList } from './bookings-list';

export default async function CuentaPage() {
  const customer = await getOrCreateCustomer();
  if (!customer) redirect('/');

  const t = await getTranslations('account');
  const supabase = createSupabaseServiceRoleClient();

  const [{ data: subscriptions }, { data: bookings }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('id, frequency, status, amount_per_visit_clp, square_meters')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('id, scheduled_date, timeblock, status, total_price_clp, square_meters')
      .eq('customer_id', customer.id)
      .order('scheduled_date', { ascending: false })
      .limit(20),
  ]);

  return (
    <main className="container max-w-4xl py-12">
      <TrackView event="account_viewed" />
      <h1 className="font-display text-3xl font-bold tracking-tight">{t('title')}</h1>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{t('profile.title')}</h2>
        <Separator className="my-4" />
        <ProfileForm
          initial={{
            email: customer.email,
            full_name: customer.full_name,
            phone: customer.phone,
          }}
        />
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">{t('subscription.title')}</h2>
        <Separator className="my-4" />
        <SubscriptionsList subscriptions={subscriptions ?? []} />
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">{t('bookings.title')}</h2>
        <Separator className="my-4" />
        <BookingsList bookings={bookings ?? []} />
      </section>
    </main>
  );
}
