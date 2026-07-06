import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { getAccountContext } from '@/lib/customer';
import { Link } from '@/i18n/routing';
import { Card } from '@/components/ui/card';
import { ProfileForm } from '../profile-form';

// Auth-gated + reads per-request auth(); never statically prerender or cache.
export const dynamic = 'force-dynamic';

export default async function PerfilPage() {
  const ctx = await getAccountContext();
  if (!ctx) redirect('/sign-in');

  const t = await getTranslations('account');

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
      <section className="bg-aurora border-border/50 border-b">
        <div className="container max-w-3xl py-10 sm:py-12">
          <Link
            href="/cuenta"
            className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('back_to_account')}
          </Link>
          <h1 className="font-display animate-fade-in-up text-3xl font-bold tracking-tight sm:text-4xl">
            {t('profile.title')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">{t('profile.subtitle')}</p>
        </div>
      </section>

      <div className="container max-w-3xl pt-10">
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
      </div>
    </main>
  );
}
