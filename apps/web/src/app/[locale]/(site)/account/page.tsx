import type { ComponentType } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CalendarClock, CalendarDays, Home, Sparkles, ArrowRight } from 'lucide-react';
import { getAccountContext } from '@/lib/customer';
import { backfillSubscriptionsForCustomer } from '@/lib/subscriptions';
import { getPlan, type PlanRow } from '@/lib/plans';
import { fetchProperties } from '@/lib/host/queries';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TrackView } from '@/components/analytics/track-view';
import { EVENTS } from '@/lib/analytics/events';
import { SubscriptionsList } from './subscriptions-list';
import { BookingsList } from './bookings-list';

export const dynamic = 'force-dynamic';

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

function trialDaysLeft(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export default async function CuentaPage() {
  const ctx = await getAccountContext();
  if (!ctx) redirect('/sign-in');

  const t = await getTranslations('account');

  let subscriptions: Subscription[] = [];
  let bookings: Booking[] = [];
  let plan: PlanRow | null = null;
  let propertyCount = 0;

  if (ctx.customer) {
    const supabase = createSupabaseServiceRoleClient();
    await backfillSubscriptionsForCustomer(supabase, ctx.customer.id);
    const [subs, bks, planRow, properties] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('id, frequency, status, amount_per_visit_clp, square_meters')
        .eq('customer_id', ctx.customer.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('bookings')
        .select('id, scheduled_date, timeblock, status, total_price_clp, square_meters')
        .eq('customer_id', ctx.customer.id)
        .order('scheduled_date', { ascending: false })
        .limit(20),
      getPlan(ctx.customer.id),
      fetchProperties(ctx.customer.id),
    ]);
    subscriptions = subs.data ?? [];
    bookings = bks.data ?? [];
    plan = planRow;
    propertyCount = properties.length;
  }

  const firstName = ctx.profile.full_name?.split(' ')[0];
  const airbnbActive = Boolean(plan && plan.status !== 'cancelled');
  const activeSubs = subscriptions.filter((s) => s.status === 'active').length;

  const airbnbStatus =
    plan?.status === 'trialing'
      ? t('airbnb.trialing', { days: trialDaysLeft(plan.trial_ends_at) })
      : plan?.status === 'active'
        ? t('airbnb.active')
        : plan?.status === 'cancelled'
          ? t('airbnb.cancelled')
          : t('airbnb.none_body');

  return (
    <main className="pb-16">
      <TrackView event={EVENTS.ACCOUNT_VIEWED} />

      <section className="bg-aurora border-border/50 border-b">
        <div className="container flex max-w-5xl flex-col gap-4 py-10 sm:flex-row sm:items-end sm:justify-between sm:py-12">
          <div className="animate-fade-in-up space-y-2">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {firstName ? t('greeting', { name: firstName }) : t('greeting_generic')}
            </h1>
            <p className="text-muted-foreground max-w-xl text-sm sm:text-base">{t('subtitle')}</p>
          </div>
          <Button asChild variant="default" className="w-fit">
            <Link href="/calculator">{t('new_quote')}</Link>
          </Button>
        </div>
      </section>

      <div className="container max-w-5xl space-y-12 pt-10">
        <section>
          <h2 className="mb-5 text-lg font-semibold">{t('services_title')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <ServiceCard
              icon={Home}
              title={t('airbnb.title')}
              status={airbnbStatus}
              detail={airbnbActive ? t('airbnb.count', { n: propertyCount }) : undefined}
              highlighted={airbnbActive}
            >
              {airbnbActive ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/properties">
                    {t('airbnb.manage')} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button asChild variant="default" size="sm">
                  <Link href="/properties">{t('airbnb.start')}</Link>
                </Button>
              )}
            </ServiceCard>

            <ServiceCard
              icon={Sparkles}
              title={t('cleaning.title')}
              status={
                activeSubs > 0 ? t('cleaning.summary', { n: activeSubs }) : t('cleaning.none_body')
              }
              highlighted={activeSubs > 0}
            >
              <Button asChild variant="default" size="sm">
                <Link href="/book">{t('cleaning.book')}</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/calculator?service=cleaning">{t('cleaning.quote')}</Link>
              </Button>
            </ServiceCard>
          </div>
        </section>

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
      </div>
    </main>
  );
}

function ServiceCard({
  icon: Icon,
  title,
  status,
  detail,
  highlighted,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  status: string;
  detail?: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={highlighted ? 'border-primary/30' : undefined}>
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="font-display font-semibold leading-tight">{title}</h3>
        </div>
        <p className="text-muted-foreground text-sm">{status}</p>
        {detail && <p className="text-muted-foreground/80 text-xs">{detail}</p>}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">{children}</div>
      </CardContent>
    </Card>
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
