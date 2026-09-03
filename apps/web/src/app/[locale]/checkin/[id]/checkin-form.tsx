'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Check,
  ChevronLeft,
  CigaretteOff,
  House,
  PartyPopper,
  PawPrint,
  TriangleAlert,
  User,
} from 'lucide-react';
import { LuxelLogo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { arrivalSlots, departureSlots, nightsBetween } from '@/lib/checkin/slots';
import { submitCheckin } from './actions';

export type DocType = 'rut' | 'passport' | 'dni' | 'other';

export interface Stay {
  propertyName: string;
  address: string | null;
  arrival: string | null;
  departure: string | null;
  checkinTime: string | null;
  checkoutTime: string | null;
}

export interface Rules {
  noSmoking: boolean;
  noPets: boolean;
  noEvents: boolean;
}

export interface RegisteredGuest {
  isLead: boolean;
  fullName: string;
  docType: string | null;
  docLast4: string | null;
}

export interface CheckinFormProps {
  id: string;
  alreadyDone: boolean;
  stay: Stay;
  expectedGuests: number;
  rules: Rules;
  registered?: RegisteredGuest[];
  arrivalTime?: string | null;
  departureTime?: string | null;
}

type GuestDraft = {
  fullName: string;
  docType: DocType;
  docNumber: string;
};
type Parking = '' | 'yes' | 'no';

const INTL_LOCALE: Record<string, string> = { es: 'es-CL', en: 'en', pt: 'pt-BR' };

const DOC_KEY = {
  rut: 'doc_rut',
  passport: 'doc_passport',
  dni: 'doc_dni',
  other: 'doc_other',
} as const satisfies Record<DocType, string>;
const DOC_TYPES = Object.keys(DOC_KEY) as DocType[];

const isDocType = (v: string): v is DocType => v in DOC_KEY;

const ARROW_STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

const MIN_DOC = 3;

const newGuest = (): GuestDraft => ({ fullName: '', docType: 'rut', docNumber: '' });
const clock = (time: string | null): string | null => (time ? time.slice(0, 5) : null);
const maskDoc = (n: string): string => n.replace(/\s+/g, '').slice(-4);
const guestReady = (g: GuestDraft): boolean =>
  g.fullName.trim().length > 0 && g.docNumber.trim().length >= MIN_DOC;

function useStayLine(stay: Stay): string | null {
  const t = useTranslations('checkin');
  const locale = useLocale();
  if (!stay.arrival || !stay.departure) return null;
  const loc = INTL_LOCALE[locale] ?? 'es-CL';
  const fmt = (iso: string, year: boolean) =>
    new Intl.DateTimeFormat(loc, {
      timeZone: 'America/Santiago',
      day: 'numeric',
      month: 'short',
      ...(year ? { year: 'numeric' as const } : {}),
    }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
  const nights = t('nights', { n: nightsBetween(stay.arrival, stay.departure) });
  return `${fmt(stay.arrival, false)} – ${fmt(stay.departure, true)} · ${nights}`;
}

function GroupLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span id={id} className="text-sm font-medium leading-none">
      {children}
    </span>
  );
}

function Field({
  id,
  label,
  optional,
  hint,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('checkin');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && <span className="text-muted-foreground font-normal"> {t('optional')}</span>}
      </Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function Chips<V extends string>({
  id,
  labelId,
  options,
  value,
  onChange,
  className,
}: {
  id: string;
  labelId: string;
  options: Array<{ value: V; label: string }>;
  value: string;
  onChange: (v: V) => void;
  className?: string;
}) {
  const selected = options.findIndex((o) => o.value === value);
  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={labelId}
      className={cn('grid gap-2', className)}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        const focusable = selected === -1 ? i === 0 : on;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={focusable ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const step = ARROW_STEP[e.key];
              if (!step) return;
              e.preventDefault();
              const next = (i + step + options.length) % options.length;
              onChange(options[next]!.value);
              e.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('button')
                [next]?.focus();
            }}
            className={cn(
              'focus-visible:ring-ring/60 min-h-11 rounded-lg border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2',
              on
                ? 'border-primary bg-primary/10 text-primary font-semibold'
                : 'border-border bg-card text-foreground hover:border-primary/40 font-medium',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function GuestStep({
  index,
  guest,
  onChange,
}: {
  index: number;
  guest: GuestDraft;
  onChange: (patch: Partial<GuestDraft>) => void;
}) {
  const t = useTranslations('checkin');
  const id = `g${index}`;
  return (
    <div className="border-border bg-card shadow-card grid gap-4 rounded-xl border p-4">
      <p className="flex items-center gap-2.5 font-semibold">
        <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <User className="h-4 w-4" />
        </span>
        {index === 0 ? t('guest_lead') : t('guest_n', { n: index + 1 })}
      </p>

      <Field id={`${id}-name`} label={t('name')}>
        <Input
          id={`${id}-name`}
          autoComplete="name"
          maxLength={120}
          aria-required
          placeholder={t('name_ph')}
          value={guest.fullName}
          onChange={(e) => onChange({ fullName: e.target.value })}
          className="h-12 text-base"
        />
      </Field>

      <div className="grid gap-1.5">
        <GroupLabel id={`${id}-doctype-label`}>{t('doc_type')}</GroupLabel>
        <Chips
          id={`${id}-doctype`}
          labelId={`${id}-doctype-label`}
          options={DOC_TYPES.map((v) => ({ value: v, label: t(DOC_KEY[v]) }))}
          value={guest.docType}
          onChange={(v) => onChange({ docType: v })}
          className="grid-cols-2"
        />
      </div>

      <Field id={`${id}-doc`} label={t('doc_number')}>
        <Input
          id={`${id}-doc`}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={40}
          aria-required
          placeholder={t('doc_number_ph')}
          value={guest.docNumber}
          onChange={(e) => onChange({ docNumber: e.target.value })}
          className="h-12 text-base"
        />
      </Field>
    </div>
  );
}

function DoneView({
  stay,
  registered,
  arrivalTime,
  departureTime,
  rules,
}: {
  stay: Stay;
  registered: RegisteredGuest[];
  arrivalTime: string | null;
  departureTime: string | null;
  rules: Rules;
}) {
  const t = useTranslations('checkin');
  const dates = useStayLine(stay);
  const rows: Array<[string, string]> = [];
  if (stay.propertyName) rows.push([t('summary_property'), stay.propertyName]);
  if (dates) rows.push([t('summary_dates'), dates]);
  if (arrivalTime) rows.push([t('summary_arrival'), arrivalTime]);
  if (departureTime) rows.push([t('summary_departure'), departureTime]);

  const ruleItems: Array<{ label: string; Icon: typeof PawPrint }> = [];
  if (rules.noSmoking) ruleItems.push({ label: t('rule_no_smoking'), Icon: CigaretteOff });
  if (rules.noPets) ruleItems.push({ label: t('rule_no_pets'), Icon: PawPrint });
  if (rules.noEvents) ruleItems.push({ label: t('rule_no_events'), Icon: PartyPopper });

  const card = 'border-border bg-card shadow-card rounded-xl border';

  return (
    <div className="grid gap-4">
      <LuxelLogo markClassName="h-5 w-5" />

      <section className={cn(card, 'grid justify-items-center gap-3 p-6 text-center')}>
        <span className="bg-success/15 text-success flex h-14 w-14 items-center justify-center rounded-full">
          <Check className="h-7 w-7" strokeWidth={2.5} />
        </span>
        <h1 className="font-display text-balance text-xl font-semibold">{t('done_title')}</h1>
        <p className="text-muted-foreground text-sm">{t('done_body')}</p>
      </section>

      {rows.length > 0 && (
        <dl className={cn(card, 'divide-border divide-y px-4')}>
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-4 py-3">
              <dt className="text-muted-foreground shrink-0 text-sm">{k}</dt>
              <dd className="text-right text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {registered.length > 0 && (
        <section className={cn(card, 'p-4')}>
          <h2 className="font-display mb-2 text-base font-semibold">{t('registered_title')}</h2>
          <ul className="divide-border divide-y">
            {registered.map((g, i) => {
              const docLabel = g.docType && isDocType(g.docType) ? t(DOC_KEY[g.docType]) : null;
              const last = g.docLast4 ? `···${g.docLast4}` : null;
              const detail = [docLabel, last].filter(Boolean).join(' ');
              return (
                <li key={i} className="flex items-center gap-3 py-3 last:pb-0">
                  <span className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold">
                    {g.fullName.trim().charAt(0).toUpperCase() || '·'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{g.fullName}</span>
                      {g.isLead && (
                        <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
                          {t('lead_badge')}
                        </span>
                      )}
                    </p>
                    {detail && <p className="text-muted-foreground truncate text-sm">{detail}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {ruleItems.length > 0 && (
        <section className={cn(card, 'p-4')}>
          <h2 className="font-display mb-2 text-base font-semibold">{t('rules_title')}</h2>
          <ul className="grid gap-2">
            {ruleItems.map(({ label, Icon }) => (
              <li key={label} className="flex items-center gap-3">
                <span className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm">{label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-muted-foreground text-center text-sm">{t('missing_someone')}</p>
    </div>
  );
}

export function CheckinForm({
  id,
  alreadyDone,
  stay,
  expectedGuests,
  rules,
  registered: initialRegistered = [],
  arrivalTime: initialArrival = null,
  departureTime: initialDeparture = null,
}: CheckinFormProps) {
  const t = useTranslations('checkin');
  const [done, setDone] = useState(alreadyDone);
  const [registered, setRegistered] = useState<RegisteredGuest[]>(initialRegistered);
  const [guests, setGuests] = useState<GuestDraft[]>(() =>
    Array.from({ length: expectedGuests }, newGuest),
  );
  const [step, setStep] = useState(0);
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [parking, setParking] = useState<Parking>('');
  const [plate, setPlate] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const stayLine = useStayLine(stay);

  if (done) {
    return (
      <DoneView
        stay={stay}
        registered={registered}
        arrivalTime={arrival || initialArrival}
        departureTime={departure || initialDeparture}
        rules={rules}
      />
    );
  }

  const checkinAt = clock(stay.checkinTime);
  const checkoutAt = clock(stay.checkoutTime);
  const times =
    checkinAt && checkoutAt ? t('times', { checkin: checkinAt, checkout: checkoutAt }) : null;

  const steps = guests.length + 1;
  const onDetails = step === guests.length;
  const detailsReady = Boolean(arrival && departure && parking);
  const stepReady = onDetails ? detailsReady : guestReady(guests[step]!);
  const allReady = guests.every(guestReady) && detailsReady;

  const goTo = (next: number) => {
    setStep(next);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateGuest = (i: number, patch: Partial<GuestDraft>) =>
    setGuests((list) => list.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!onDetails) {
      if (stepReady) goTo(step + 1);
      return;
    }
    if (!allReady) return;
    setMessage(null);
    startTransition(async () => {
      const r = await submitCheckin({
        id,
        guests: guests.map((g) => ({
          fullName: g.fullName.trim(),
          docType: g.docType,
          docNumber: g.docNumber.trim(),
        })),
        arrivalTime: arrival,
        departureTime: departure,
        parking: parking === 'yes',
        vehiclePlate: parking === 'yes' && plate.trim() ? plate.trim() : undefined,
      }).catch(() => ({ ok: false, error: 'generic' }));
      if (r.ok) {
        setRegistered(
          guests.map((g, i) => ({
            isLead: i === 0,
            fullName: g.fullName.trim(),
            docType: g.docType,
            docLast4: maskDoc(g.docNumber.trim()),
          })),
        );
        setDone(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (r.error === 'already_submitted') {
        window.location.reload();
      } else {
        setMessage(
          r.error === 'expired' || r.error === 'not_found'
            ? t('error_expired')
            : t('error_generic'),
        );
      }
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <header className="grid gap-4">
        <LuxelLogo markClassName="h-5 w-5" />
        <h1 className="font-display text-balance text-2xl font-semibold">{t('title')}</h1>
        <div className="border-border bg-card shadow-card flex gap-3 rounded-xl border p-4">
          <span className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
            <House className="h-5 w-5" />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <p className="font-display text-balance font-semibold leading-snug">
              {stay.propertyName}
            </p>
            {stay.address && <p className="text-muted-foreground text-sm">{stay.address}</p>}
            {stayLine && <p className="text-sm font-medium">{stayLine}</p>}
            {times && <p className="text-muted-foreground text-xs">{times}</p>}
          </div>
        </div>
      </header>

      {step === 0 && (
        <div
          role="note"
          className="border-warning/40 bg-warning/10 text-warning-foreground dark:text-foreground flex gap-3 rounded-xl border p-4"
        >
          <TriangleAlert className="text-warning mt-0.5 h-5 w-5 shrink-0" />
          <div className="grid gap-1 text-sm">
            <p className="font-semibold">{t('notice_title')}</p>
            <p>{t('notice_body')}</p>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <p className="text-muted-foreground text-sm font-medium">
          {t('step_of', { i: step + 1, n: steps })}
        </p>
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / steps) * 100}%` }}
          />
        </div>
      </div>

      {onDetails ? (
        <div className="grid gap-6">
          <h2 className="font-display text-lg font-semibold">{t('details_title')}</h2>

          <section className="grid gap-2">
            <GroupLabel id="arrival-label">{t('arrival')}</GroupLabel>
            <Chips
              id="arrival"
              labelId="arrival-label"
              options={arrivalSlots(stay.checkinTime).map((v) => ({ value: v, label: v }))}
              value={arrival}
              onChange={setArrival}
              className="grid-cols-3"
            />
          </section>

          <section className="grid gap-2">
            <GroupLabel id="departure-label">{t('departure')}</GroupLabel>
            <Chips
              id="departure"
              labelId="departure-label"
              options={departureSlots(stay.checkoutTime).map((v) => ({ value: v, label: v }))}
              value={departure}
              onChange={setDeparture}
              className="grid-cols-4"
            />
          </section>

          <section className="grid gap-3">
            <GroupLabel id="parking-label">{t('parking')}</GroupLabel>
            <Chips
              id="parking"
              labelId="parking-label"
              options={[
                { value: 'yes' as const, label: t('parking_yes') },
                { value: 'no' as const, label: t('parking_no') },
              ]}
              value={parking}
              onChange={setParking}
              className="grid-cols-2"
            />
            {parking === 'yes' && (
              <Field id="plate" label={t('plate')} optional>
                <Input
                  id="plate"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={12}
                  placeholder={t('plate_ph')}
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  className="h-12 text-base uppercase"
                />
              </Field>
            )}
          </section>
        </div>
      ) : (
        <section aria-labelledby="guests-title" className="grid gap-3">
          <div className="grid gap-1">
            <h2 id="guests-title" className="font-display text-lg font-semibold">
              {t('guests_title')}
            </h2>
            {guests.length > 1 && (
              <p className="text-muted-foreground text-sm">
                {t('guests_expected', { n: guests.length })}
              </p>
            )}
          </div>
          <GuestStep
            key={step}
            index={step}
            guest={guests[step]!}
            onChange={(patch) => updateGuest(step, patch)}
          />
        </section>
      )}

      <div className="bg-background/90 border-border fixed inset-x-0 bottom-0 z-10 border-t pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto grid w-full max-w-md gap-2 px-4">
          {message && (
            <p role="alert" className="text-destructive text-sm font-medium">
              {message}
            </p>
          )}
          {onDetails && <p className="text-muted-foreground text-xs">{t('disclaimer')}</p>}
          {!stepReady && <p className="text-muted-foreground text-xs">{t('incomplete_hint')}</p>}
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-12 px-4 text-base"
                onClick={() => goTo(step - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                {t('back')}
              </Button>
            )}
            <Button
              type="submit"
              size="lg"
              className="h-12 flex-1 text-base"
              disabled={pending || (onDetails ? !allReady : !stepReady)}
            >
              {onDetails ? (pending ? t('sending') : t('submit')) : t('next')}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
