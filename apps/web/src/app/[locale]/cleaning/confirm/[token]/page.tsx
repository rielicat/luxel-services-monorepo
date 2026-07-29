import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CheckCircle2, Sparkles, XCircle } from 'lucide-react';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { ConfirmButton } from './confirm-button';

export const dynamic = 'force-dynamic';

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

  const { data: cleaning } = await supabase
    .from('cleanings')
    .select('id, cleaning_date, status, crew_confirmed_at, property_id')
    .eq('confirm_token', token)
    .maybeSingle();
  if (!cleaning) notFound();

  const { data: property } = await supabase
    .from('properties')
    .select('nickname, address, comuna, checkin_time, checkout_time')
    .eq('id', cleaning.property_id)
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
        <h1 className="font-display text-xl font-semibold">{t('title')}</h1>
      </div>

      <div className="border-border grid gap-1 rounded-xl border p-4">
        <p className="text-lg font-semibold capitalize">{fmt(cleaning.cleaning_date as string)}</p>
        {window && <p className="text-primary text-sm font-medium">{t('window', { window })}</p>}
        <p className="text-sm">{property?.nickname}</p>
        {where && <p className="text-muted-foreground text-sm">{where}</p>}
      </div>

      {cleaning.status === 'skipped' ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <XCircle className="h-4 w-4" /> {t('skipped')}
        </p>
      ) : cleaning.crew_confirmed_at ? (
        <p className="text-success flex items-center gap-2 text-base font-semibold">
          <CheckCircle2 className="h-5 w-5" /> {t('already')}
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{t('body')}</p>
          <ConfirmButton token={token} />
        </>
      )}
    </main>
  );
}
