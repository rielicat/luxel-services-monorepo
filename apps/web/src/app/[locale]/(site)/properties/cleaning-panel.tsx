'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, X, Building2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { setCleaningStatus, updateCleaningStaff } from './cleaning-actions';

export type Cleaning = {
  id: string;
  cleaning_date: string;
  status: string;
  price_clp: number | null;
  source: string;
};

const clp = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString('es-CL')}`);
const fmt = (d: string) =>
  new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${d}T00:00:00Z`));

export function CleaningPanel({
  propertyId,
  cleanings,
  turnoverPrice,
  managedBy,
  contactName,
  contactEmail,
  contactWhatsapp,
}: {
  propertyId: string;
  cleanings: Cleaning[];
  turnoverPrice: number | null;
  managedBy: 'luxel' | 'own';
  contactName: string | null;
  contactEmail: string | null;
  contactWhatsapp: string | null;
}) {
  const t = useTranslations('cleaning');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<'luxel' | 'own'>(managedBy);
  const [name, setName] = useState(contactName ?? '');
  const [email, setEmail] = useState(contactEmail ?? '');
  const [whatsapp, setWhatsapp] = useState(contactWhatsapp ?? '');
  const [saved, setSaved] = useState(false);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const saveStaff = (nextMode: 'luxel' | 'own') =>
    run(async () => {
      const r = await updateCleaningStaff({
        propertyId,
        managedBy: nextMode,
        contactName: name,
        contactEmail: email,
        contactWhatsapp: whatsapp,
      });
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });

  const upcoming = [...cleanings]
    .filter((c) => c.status !== 'skipped' && c.status !== 'done')
    .sort((a, b) => a.cleaning_date.localeCompare(b.cleaning_date));

  return (
    <div className="grid gap-4">
      {/* Who runs the turnovers — one decision, two clear options. */}
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            { id: 'luxel', icon: Building2, title: t('mode_luxel'), body: t('mode_luxel_body') },
            { id: 'own', icon: UserRound, title: t('mode_own'), body: t('mode_own_body') },
          ] as const
        ).map(({ id, icon: Icon, title, body }) => (
          <button
            key={id}
            type="button"
            disabled={pending}
            onClick={() => {
              setMode(id);
              if (id === 'luxel') saveStaff('luxel');
            }}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              mode === id
                ? 'border-primary/50 bg-accent/60'
                : 'border-border hover:border-primary/30',
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="text-primary h-4 w-4" /> {title}
            </span>
            <span className="text-muted-foreground mt-1 block text-xs">{body}</span>
          </button>
        ))}
      </div>

      {mode === 'own' && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            placeholder={t('staff_name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            type="email"
            placeholder={t('staff_email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            placeholder={t('staff_whatsapp')}
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            className="justify-self-start sm:col-span-3"
            disabled={pending}
            onClick={() => saveStaff('own')}
          >
            {saved ? t('staff_saved') : t('staff_save')}
          </Button>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        {mode === 'own' ? t('notify_own') : t('notify_luxel')}
        {turnoverPrice != null &&
          mode === 'luxel' &&
          ` ${t('price_note', { price: clp(turnoverPrice) })}`}
      </p>

      {/* After each check-out, a cleaning appears here on its own. */}
      <div className="grid gap-2">
        {upcoming.length === 0 && <p className="text-muted-foreground text-sm">{t('none')}</p>}
        {upcoming.map((c) => (
          <div
            key={c.id}
            className="border-border flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
          >
            <div>
              <p className="text-sm font-medium capitalize">{fmt(c.cleaning_date)}</p>
              <p className="text-muted-foreground text-xs">
                {c.status === 'scheduled' ? t('status_scheduled') : t('status_suggested_hint')}
                {c.price_clp != null && ` · ${clp(c.price_clp)}`}
              </p>
            </div>
            <div className="flex gap-2">
              {c.status !== 'scheduled' && (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => setCleaningStatus({ cleaningId: c.id, status: 'scheduled' }))
                  }
                >
                  <Check className="mr-1 h-3.5 w-3.5" /> {t('confirm')}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(() => setCleaningStatus({ cleaningId: c.id, status: 'skipped' }))
                }
              >
                <X className="mr-1 h-3.5 w-3.5" /> {t('skip')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
