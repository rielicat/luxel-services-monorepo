import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, UserRound } from 'lucide-react';
import { getAccountContext } from '@/lib/customer';
import { Link } from '@/i18n/routing';
import { ProfileForm } from '../profile-form';

// Auth-gated + reads per-request auth(); never statically prerender or cache.
export const dynamic = 'force-dynamic';

export default async function PerfilPage() {
  const ctx = await getAccountContext();
  if (!ctx) redirect('/sign-in');

  const t = await getTranslations('account');

  return (
    <main className="pb-16">
      <section className="bg-aurora border-border/50 border-b">
        <div className="container max-w-3xl py-10 sm:py-12">
          <Link
            href="/cuenta"
            className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('back_to_account')}
          </Link>
          <div className="animate-fade-in-up flex items-center gap-3">
            <span className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {t('profile.title')}
              </h1>
              <p className="text-muted-foreground text-sm">{t('profile.subtitle')}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="container max-w-3xl pt-10">
        <ProfileForm initial={ctx.profile} />
      </div>
    </main>
  );
}
