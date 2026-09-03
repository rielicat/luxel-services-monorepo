import type { ComponentType } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Home, ArrowRight, UserRound } from 'lucide-react';
import { getAccountContext } from '@/lib/customer';
import { getPlan, type PlanRow } from '@/lib/plans';
import { isPlanKey } from '@/lib/plan-pricing';
import { planName, planPriceLine } from '@/lib/plan-copy';
import { fetchProperties } from '@/lib/host/queries';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TrackView } from '@/components/analytics/track-view';
import { EVENTS } from '@/lib/analytics/events';

export const dynamic = 'force-dynamic';

export default async function CuentaPage() {
  const ctx = await getAccountContext();
  if (!ctx) redirect('/sign-in');

  const t = await getTranslations('account');
  const tp = await getTranslations('plans');

  let plan: PlanRow | null = null;
  let propertyCount = 0;

  if (ctx.customer) {
    const [planRow, properties] = await Promise.all([
      getPlan(ctx.customer.id),
      fetchProperties(ctx.customer.id),
    ]);
    plan = planRow;
    propertyCount = properties.length;
  }

  const firstName = ctx.profile.full_name?.split(' ')[0];
  const airbnbOpen = Boolean(plan && plan.status !== 'cancelled');
  const airbnbActive = plan?.status === 'active';
  const planKey = isPlanKey(plan?.plan) ? plan.plan : null;

  const airbnbStatus =
    plan?.status === 'requested'
      ? t('airbnb.requested')
      : plan?.status === 'active'
        ? t('airbnb.active')
        : plan?.status === 'cancelled'
          ? t('airbnb.cancelled_body')
          : t('airbnb.none_body');
  const airbnbDetail = airbnbOpen
    ? [
        planKey && planName(tp),
        planKey && `${planPriceLine(tp)} · ${tp('per_listing')}`,
        t('airbnb.count', { n: propertyCount }),
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

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
          <Button asChild variant="outline" className="w-fit">
            <Link href="/account/profile">
              <UserRound className="h-4 w-4" /> {t('profile.title')}
            </Link>
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
              detail={airbnbDetail}
              highlighted={airbnbActive}
            >
              {airbnbOpen ? (
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
          </div>
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
