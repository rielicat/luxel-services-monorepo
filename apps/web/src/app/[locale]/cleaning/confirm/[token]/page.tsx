import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CheckCircle2, Sparkles, XCircle } from 'lucide-react';
import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';
import { geminiConfigured } from '@luxel/core/ai/gemini';
import { cleaningMediaConfigured } from '@luxel/core/cleaning/media';
import { withinCrewWindow, readCrewState } from '@luxel/core/cleaning/inventory';
import { ConfirmButton } from './confirm-button';
import { CrewFlow } from './crew-flow';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

const fmt = (d: string) =>
  new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${d}T00:00:00Z`));

export default async function CleaningConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const t = await getTranslations('crew');
  const supabase = createSupabaseServiceRoleClient();

  const state = await readCrewState(token, supabase);
  if (!state) notFound();
  const { cleaning } = state;

  if (!withinCrewWindow(cleaning)) {
    return (
      <main className="mx-auto grid max-w-lg gap-5 px-4 py-12">
        <div className="flex items-center gap-2.5">
          <span className="bg-muted text-muted-foreground flex h-10 w-10 items-center justify-center rounded-lg">
            <XCircle className="h-5 w-5" />
          </span>
          <h1 className="font-display text-xl font-semibold">{t('closedTitle')}</h1>
        </div>
        <p className="text-muted-foreground text-sm">{t('closedBody')}</p>
        <a
          href="/privacy?lang=es"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2 transition-colors"
        >
          {t('privacy_link')}
        </a>
      </main>
    );
  }

  const { data: property } = await supabase
    .from('properties')
    .select('nickname, address, comuna, checkin_time, checkout_time')
    .eq('id', cleaning.propertyId)
    .maybeSingle();
  const where = [property?.address, property?.comuna].filter(Boolean).join(', ');
  const window =
    property?.checkout_time && property?.checkin_time
      ? `${property.checkout_time}–${property.checkin_time}`
      : null;

  return (
    <main className="mx-auto grid max-w-lg gap-5 px-4 py-12">
      <div className="flex items-center gap-2.5">
        <span className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
          <Sparkles className="h-5 w-5" />
        </span>
        <h1 className="font-display text-xl font-semibold">
          {cleaning.crewConfirmedAt && cleaning.status !== 'skipped' ? t('flowTitle') : t('title')}
        </h1>
      </div>

      <div className="border-border grid gap-1 rounded-xl border p-4">
        <p className="text-lg font-semibold capitalize">{fmt(cleaning.cleaningDate)}</p>
        {window && <p className="text-primary text-sm font-medium">{t('window', { window })}</p>}
        <p className="text-sm">{property?.nickname}</p>
        {where && <p className="text-muted-foreground text-sm">{where}</p>}
      </div>

      {cleaning.status === 'skipped' ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <XCircle className="h-4 w-4" /> {t('skipped')}
        </p>
      ) : cleaning.crewConfirmedAt ? (
        <>
          <p className="text-success flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" /> {t('already')}
          </p>
          <CrewFlow
            token={token}
            initial={state}
            captureEnabled={cleaningMediaConfigured()}
            aiEnabled={geminiConfigured()}
          />
        </>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{t('body')}</p>
          <ConfirmButton token={token} />
        </>
      )}

      <a
        href="/privacy?lang=es"
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2 transition-colors"
      >
        {t('privacy_link')}
      </a>
    </main>
  );
}
