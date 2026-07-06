import type { ComponentType } from 'react';
import { redirect } from 'next/navigation';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getTranslations } from 'next-intl/server';
import { CalendarClock, CalendarDays, UserRound } from 'lucide-react';
import { getOrCreateCustomer } from '@/lib/customer';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { TrackView } from '@/components/analytics/track-view';
import { ProfileForm } from './profile-form';
import { SubscriptionsList } from './subscriptions-list';
import { BookingsList } from './bookings-list';

type Subscription = {
  id: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  status: 'active' | 'paused' | 'cancelled';
  amount_per_visit_clp: number;
  square_meters: number;
};

type Booking = {
  id: string;
  scheduled_date: string;
  timeblock: 'manana' | 'tarde';
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  total_price_clp: number;
  square_meters: number;
};

export default async function CuentaPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const t = await getTranslations('account');

  // The account page must survive an unseeded/unreachable Supabase: fall back to
  // the Clerk profile and empty lists rather than bouncing the user home.
  const customer = await getOrCreateCustomer();

  let profile = { email: '', full_name: null as string | null, phone: null as string | null };
  let subscriptions: Subscription[] = [];
  let bookings: Booking[] = [];

  if (customer) {
    profile = { email: customer.email, full_name: customer.full_name, phone: customer.phone };
    const supabase = createSupabaseServiceRoleClient();
    const [subs, bks] = await Promise.all([
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
    subscriptions = subs.data ?? [];
    bookings = bks.data ?? [];
  } else {
    const user = await currentUser();
    profile = {
      email: user?.emailAddresses[0]?.emailAddress ?? '',
      full_name: [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || null,
      phone: user?.phoneNumbers[0]?.phoneNumber ?? null,
    };
  }

  const firstName = profile.full_name?.split(' ')[0];

  return (
    <main className="pb-16">
      <TrackView event="account_viewed" />

      <section className="bg-aurora border-border/50 border-b">
        <div className="container flex max-w-5xl flex-col gap-4 py-10 sm:flex-row sm:items-end sm:justify-between sm:py-12">
          <div className="animate-fade-in-up space-y-2">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {firstName ? t('greeting', { name: firstName }) : t('greeting_generic')}
            </h1>
            <p className="text-muted-foreground max-w-xl text-sm sm:text-base">{t('subtitle')}</p>
          </div>
          <Button asChild variant="lime" className="w-fit">
            <Link href="/calculadora">{t('new_quote')}</Link>
          </Button>
        </div>
      </section>

      <div className="container max-w-5xl space-y-12 pt-10">
        <section>
          <SectionHeader
            icon={CalendarClock}
            title={t('subscription.title')}
            subtitle={t('subscription.subtitle')}
          />
          <SubscriptionsList subscriptions={subscriptions} />
        </section>

        <section>
          <SectionHeader
            icon={CalendarDays}
            title={t('bookings.title')}
            subtitle={t('bookings.subtitle')}
          />
          <BookingsList bookings={bookings} />
        </section>

        <section>
          <SectionHeader
            icon={UserRound}
            title={t('profile.title')}
            subtitle={t('profile.subtitle')}
          />
          <ProfileForm initial={profile} />
        </section>
      </div>
    </main>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      </div>
    </div>
  );
}
