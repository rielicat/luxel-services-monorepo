import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAccountContext } from '@/lib/customer';
import { getPlan, type PlanRow } from '@/lib/plans';
import { planPriceLine } from '@/lib/plan-copy';
import { Card } from '@/components/ui/card';
import { TrackView } from '@/components/analytics/track-view';
import { EVENTS } from '@/lib/analytics/events';
import { ProfileForm } from './profile-form';
import { PlanSettings } from './plan-settings';

export const dynamic = 'force-dynamic';

export default async function CuentaPage() {
  const ctx = await getAccountContext();
  if (!ctx) redirect('/sign-in');

  const t = await getTranslations('account');
  const tp = await getTranslations('plans');

  const plan: PlanRow | null = ctx.customer ? await getPlan(ctx.customer.id) : null;

  const name = ctx.profile.full_name?.trim();
  const email = ctx.profile.email;
  const initials =
    (name || email || 'U')
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U';

  return (
    <main className="pb-16">
      <TrackView event={EVENTS.ACCOUNT_VIEWED} />

      <section className="bg-aurora border-border/50 border-b">
        <div className="container max-w-3xl py-10 sm:py-12">
          <h1 className="font-display animate-fade-in-up text-3xl font-bold tracking-tight sm:text-4xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">{t('subtitle')}</p>
        </div>
      </section>

      <div className="container grid max-w-3xl gap-10 pt-10">
        <Section title={t('profile.title')} description={t('profile.subtitle')}>
          <Card className="shadow-soft overflow-hidden">
            <div className="border-border/60 flex items-center gap-4 border-b p-6">
              <span className="bg-primary text-primary-foreground flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{name || email}</p>
                <p className="text-muted-foreground truncate text-sm">{email}</p>
              </div>
            </div>
            <ProfileForm initial={ctx.profile} />
          </Card>
        </Section>

        <Section
          title={t('plan.title')}
          description={`${planPriceLine(tp)} · ${tp('per_listing')}`}
        >
          <PlanSettings plan={plan} />
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}
