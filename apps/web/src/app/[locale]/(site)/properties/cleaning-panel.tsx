'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, X, Building2, UserRound, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { setCleaningStatus, updateCleaningStaff } from './cleaning-actions';
import { ContactList, type PropertyContact } from './contact-list';

export type Cleaning = {
  id: string;
  cleaning_date: string;
  status: string;
  price_clp: number | null;
  source: string;
  crew_confirmed_at: string | null;
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
  contacts,
  autoConfirm,
  checkinTime,
  checkoutTime,
}: {
  propertyId: string;
  cleanings: Cleaning[];
  turnoverPrice: number | null;
  managedBy: 'luxel' | 'own';
  contacts: PropertyContact[];
  autoConfirm: boolean;
  checkinTime: string | null;
  checkoutTime: string | null;
}) {
  const t = useTranslations('cleaning');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<'luxel' | 'own'>(managedBy);
  const [auto, setAuto] = useState(autoConfirm);
  const [showAll, setShowAll] = useState(false);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const setStaff = (nextMode: 'luxel' | 'own', nextAuto?: boolean) =>
    run(() =>
      updateCleaningStaff({
        propertyId,
        managedBy: nextMode,
        ...(nextAuto != null ? { autoConfirm: nextAuto } : {}),
      }),
    );

  const window = checkoutTime && checkinTime ? `${checkoutTime}–${checkinTime}` : null;

  const upcoming = [...cleanings]
    .filter((c) => c.status !== 'skipped')
    .sort((a, b) => a.cleaning_date.localeCompare(b.cleaning_date));

  return (
    <div className="grid gap-4">
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
              setStaff(id);
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

      <div className="border-border rounded-lg border p-3">
        <ContactList
          propertyId={propertyId}
          role="cleaning"
          contacts={contacts}
          title={t('contacts_title')}
          body={t('contacts_body')}
          addTitle={t('contact_modal_title')}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{t('auto_title')}</p>
          <p className="text-muted-foreground text-xs">
            {auto ? t('auto_on_body') : t('auto_off_body')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={auto}
          disabled={pending}
          onClick={() => {
            const next = !auto;
            setAuto(next);
            setStaff(mode, next);
          }}
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors',
            auto ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
              auto ? 'left-[22px]' : 'left-0.5',
            )}
          />
        </button>
      </div>

      <p className="text-muted-foreground text-xs">
        {mode === 'own' ? t('notify_own') : t('notify_luxel')}
        {window && ` ${t('window_note', { window })}`}
        {turnoverPrice != null &&
          mode === 'luxel' &&
          ` ${t('price_note', { price: clp(turnoverPrice) })}`}
      </p>

      <div className="grid gap-2">
        {upcoming.length === 0 && <p className="text-muted-foreground text-sm">{t('none')}</p>}
        {upcoming.slice(0, 3).map((c) => (
          <CleaningRow key={c.id} c={c} auto={auto} pending={pending} run={run} window={window} />
        ))}
        {upcoming.length > 3 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-muted-foreground hover:text-foreground w-fit text-xs font-medium transition-colors"
          >
            {t('show_all', { n: upcoming.length })}
          </button>
        )}
      </div>

      <Modal open={showAll} onClose={() => setShowAll(false)} title={t('upcoming_title')}>
        <div className="grid gap-2">
          {upcoming.map((c) => (
            <CleaningRow key={c.id} c={c} auto={auto} pending={pending} run={run} window={window} />
          ))}
        </div>
      </Modal>
    </div>
  );
}

function CleaningRow({
  c,
  auto,
  pending,
  run,
  window,
}: {
  c: Cleaning;
  auto: boolean;
  pending: boolean;
  run: (fn: () => Promise<unknown>) => void;
  window: string | null;
}) {
  const t = useTranslations('cleaning');
  return (
    <div className="border-border flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="capitalize">{fmt(c.cleaning_date)}</span>
          {window && (
            <span className="text-muted-foreground flex items-center gap-1 text-xs font-normal">
              <Clock className="h-3 w-3" /> {window}
            </span>
          )}
        </p>
        <p
          className={cn(
            'text-xs',
            c.status === 'scheduled' && c.crew_confirmed_at
              ? 'text-success'
              : 'text-muted-foreground',
          )}
        >
          {c.status === 'scheduled'
            ? c.crew_confirmed_at
              ? t('status_confirmed')
              : t('status_notified')
            : t('status_suggested_hint')}
          {c.price_clp != null && ` · ${clp(c.price_clp)}`}
        </p>
      </div>
      <div className="flex gap-2">
        {c.status !== 'scheduled' && !auto && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => setCleaningStatus({ cleaningId: c.id, status: 'scheduled' }))}
          >
            <Check className="mr-1 h-3.5 w-3.5" /> {t('confirm')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => setCleaningStatus({ cleaningId: c.id, status: 'skipped' }))}
        >
          <X className="mr-1 h-3.5 w-3.5" /> {t('skip')}
        </Button>
      </div>
    </div>
  );
}
