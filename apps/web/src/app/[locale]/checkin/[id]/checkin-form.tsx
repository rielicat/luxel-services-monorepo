'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  CigaretteOff,
  House,
  PartyPopper,
  PawPrint,
  Users,
} from 'lucide-react';
import { LuxelLogo, LuxelMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { arrivalSlots, departureSlots, nightsBetween } from '@luxel/core/checkin/slots';
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
  lines?: string[];
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
  maxGuests: number;
  askCount?: boolean;
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
type Errors = Record<string, string>;

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

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const OPTION_BASE = cn(
  'ease-lux flex min-h-12 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm transition-colors duration-200 active:scale-[0.97]',
  FOCUS,
);
const OPTION_ON = 'border-primary bg-primary text-primary-foreground shadow-soft font-semibold';
const OPTION_OFF =
  'border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent font-medium';

const TITLE = 'text-balance font-serif text-2xl font-medium tracking-tight';
const EYEBROW = 'text-primary text-xs font-semibold uppercase tracking-wide tabular-nums';

const newGuest = (docType: DocType): GuestDraft => ({ fullName: '', docType, docNumber: '' });
const clock = (time: string | null): string | null => (time ? time.slice(0, 5) : null);
const maskDoc = (n: string): string => n.replace(/\s+/g, '').slice(-4);
const named = (g: GuestDraft): boolean => Boolean(g.fullName.trim());

function PrivacyLink({ className }: { className?: string }) {
  const t = useTranslations('checkin');
  const locale = useLocale();
  return (
    <a
      href={`/privacy?lang=${locale}`}
      target="_blank"
      rel="noreferrer"
      className={cn('rounded-sm underline underline-offset-2', FOCUS, className)}
    >
      {t('privacy_link')}
    </a>
  );
}

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

function GroupError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-destructive text-sm font-medium">
      {message}
    </p>
  );
}

function Field({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('checkin');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && <span className="text-muted-foreground font-normal"> {t('optional')}</span>}
      </Label>
      {error && (
        <p id={`${id}-err`} className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
      {children}
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
  invalid,
  describedById,
}: {
  id: string;
  labelId: string;
  options: Array<{ value: V; label: string }>;
  value: string;
  onChange: (v: V) => void;
  className?: string;
  invalid?: boolean;
  describedById?: string;
}) {
  const selected = options.findIndex((o) => o.value === value);
  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedById}
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
            className={cn(OPTION_BASE, on ? OPTION_ON : OPTION_OFF)}
          >
            {on && <Check className="h-3.5 w-3.5 shrink-0" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function StayStrip({ stay, line }: { stay: Stay; line: string | null }) {
  return (
    <div className="border-border bg-card shadow-soft flex items-center gap-3 rounded-xl border p-3">
      <span className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
        <House className="h-5 w-5" />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <h1 className="font-display truncate text-sm font-semibold">{stay.propertyName}</h1>
        {line && <p className="text-muted-foreground truncate text-xs tabular-nums">{line}</p>}
      </div>
    </div>
  );
}

function Welcome({ stay, line, times }: { stay: Stay; line: string | null; times: string | null }) {
  const t = useTranslations('checkin');
  return (
    <header className="grid gap-4">
      <LuxelLogo markClassName="h-7 w-7" />

      <Card className="grid gap-3 p-4">
        <div className="flex gap-3">
          <span className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
            <House className="h-5 w-5" />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <h1 className="font-display text-balance font-semibold leading-snug">
              {stay.propertyName}
            </h1>
            {stay.address && <p className="text-muted-foreground text-sm">{stay.address}</p>}
          </div>
        </div>
        {(line || times) && (
          <div className="border-border flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-3">
            {line && <p className="text-sm font-medium tabular-nums">{line}</p>}
            {times && <p className="text-muted-foreground text-xs tabular-nums">{times}</p>}
          </div>
        )}
      </Card>

      <p className="text-muted-foreground text-sm">{t('notice')}</p>
    </header>
  );
}

function Roster({
  guests,
  step,
  onJump,
}: {
  guests: GuestDraft[];
  step: number;
  onJump: (i: number) => void;
}) {
  const t = useTranslations('checkin');
  const [open, setOpen] = useState(false);
  const onRecord = guests.map((g, i) => i !== step && named(g));
  const done = onRecord.filter(Boolean).length;
  if (!done) return null;

  return (
    <div className="border-border bg-card shadow-soft rounded-xl border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="roster-panel"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'ease-lux flex min-h-12 w-full items-center gap-2.5 rounded-xl px-4 py-2 text-left transition-colors duration-200',
          FOCUS,
        )}
      >
        <Users className="text-primary h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">
          {t('roster_count', { done, total: guests.length })}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'text-muted-foreground ease-lux ml-auto h-4 w-4 shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      <ul id="roster-panel" hidden={!open} className="border-border border-t p-1.5">
        {guests.map((g, i) =>
          onRecord[i] ? (
            <li key={i}>
              <button
                type="button"
                onClick={() => onJump(i)}
                className={cn(
                  'ease-lux hover:bg-accent flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors duration-200',
                  FOCUS,
                )}
              >
                <Check className="text-primary h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{g.fullName.trim()}</span>
              </button>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div aria-hidden className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'ease-lux h-1.5 rounded-full transition-all duration-200',
            i === step ? 'bg-primary w-6' : i < step ? 'bg-primary w-1.5' : 'bg-border w-1.5',
          )}
        />
      ))}
    </div>
  );
}

function StepHeading({
  headingRef,
  step,
  total,
  children,
}: {
  headingRef: React.RefObject<HTMLHeadingElement>;
  step: number;
  total: number;
  children: React.ReactNode;
}) {
  const t = useTranslations('checkin');
  return (
    <div className="grid gap-2">
      <StepDots step={step} total={total} />
      <h2 ref={headingRef} tabIndex={-1} className="focus:outline-none">
        <span className={cn(EYEBROW, 'block')}>{t('step_of', { i: step + 1, n: total })}</span>{' '}
        <span className={cn(TITLE, 'mt-1 block')}>{children}</span>
      </h2>
    </div>
  );
}

function GuestStep({
  index,
  guest,
  errors,
  nameRef,
  docRef,
  onChange,
  setError,
}: {
  index: number;
  guest: GuestDraft;
  errors: Errors;
  nameRef: React.RefObject<HTMLInputElement>;
  docRef: React.RefObject<HTMLInputElement>;
  onChange: (patch: Partial<GuestDraft>) => void;
  setError: (key: string, message: string | null) => void;
}) {
  const t = useTranslations('checkin');
  const nameErr = errors.name;
  const docErr = errors.doc;

  return (
    <Card className="grid gap-5 p-4 sm:p-5">
      <Field id="g-name" label={t('name')} error={nameErr}>
        <Input
          id="g-name"
          ref={nameRef}
          value={guest.fullName}
          onChange={(e) => {
            onChange({ fullName: e.target.value });
            setError('name', null);
          }}
          onBlur={() => setError('name', guest.fullName.trim() ? null : t('error_name'))}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            docRef.current?.focus();
          }}
          maxLength={120}
          aria-required
          aria-invalid={nameErr ? true : undefined}
          aria-describedby={nameErr ? 'g-name-err' : undefined}
          autoCapitalize="words"
          autoComplete={index === 0 ? 'name' : `section-guest-${index} name`}
          enterKeyHint="next"
          placeholder={t('name_ph')}
          className={cn(
            'h-12 text-base',
            nameErr && 'border-destructive focus-visible:border-destructive',
          )}
        />
      </Field>

      <div className="grid gap-1.5">
        <GroupLabel id="g-doctype-label">{t('doc_type')}</GroupLabel>
        <Chips
          id="g-doctype"
          labelId="g-doctype-label"
          options={DOC_TYPES.map((v) => ({ value: v, label: t(DOC_KEY[v]) }))}
          value={guest.docType}
          onChange={(v) => onChange({ docType: v })}
          className="grid-cols-2"
        />
      </div>

      <Field id="g-doc" label={t('doc_number')} error={docErr}>
        <Input
          id="g-doc"
          ref={docRef}
          value={guest.docNumber}
          onChange={(e) => {
            onChange({ docNumber: e.target.value });
            setError('doc', null);
          }}
          onBlur={() =>
            setError('doc', guest.docNumber.trim().length >= MIN_DOC ? null : t('error_doc'))
          }
          inputMode="text"
          maxLength={40}
          aria-required
          aria-invalid={docErr ? true : undefined}
          aria-describedby={docErr ? 'g-doc-err' : undefined}
          autoCapitalize={guest.docType === 'rut' ? 'none' : 'characters'}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder={t(guest.docType === 'rut' ? 'doc_number_ph' : 'doc_number_ph_other')}
          className={cn(
            'h-12 text-base tabular-nums tracking-wider',
            docErr && 'border-destructive focus-visible:border-destructive',
          )}
        />
      </Field>
    </Card>
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

  const written = rules.lines ?? [];
  const stated = written.join(' ').toLowerCase();
  const ruleItems: Array<{ label: string; Icon: typeof PawPrint }> = [];
  const says = (re: RegExp) => re.test(stated);
  if (rules.noSmoking && !says(/\bfuma/)) {
    ruleItems.push({ label: t('rule_no_smoking'), Icon: CigaretteOff });
  }
  if (rules.noPets && !says(/\b(mascotas?|perros?|gatos?)\b/)) {
    ruleItems.push({ label: t('rule_no_pets'), Icon: PawPrint });
  }
  if (rules.noEvents && !says(/\b(fiestas?|eventos?)\b/)) {
    ruleItems.push({ label: t('rule_no_events'), Icon: PartyPopper });
  }

  return (
    <div className="grid gap-4">
      <LuxelLogo markClassName="h-7 w-7" />

      <Card className="grid justify-items-center gap-3 p-6 text-center">
        <span className="bg-success/15 flex h-12 w-12 items-center justify-center rounded-full">
          <LuxelMark className="h-6 w-6" />
        </span>
        <h1 className="text-balance font-serif text-2xl font-medium tracking-tight">
          {t('done_title')}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{t('done_body')}</p>
      </Card>

      {rows.length > 0 && (
        <Card className="px-4">
          <dl className="divide-border divide-y">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 py-3">
                <dt className="text-muted-foreground shrink-0 text-sm">{k}</dt>
                <dd className="text-right text-sm font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {registered.length > 0 && (
        <Card className="p-4">
          <h2 className="font-display mb-2 text-base font-semibold">{t('registered_title')}</h2>
          <ul className="divide-border divide-y">
            {registered.map((g, i) => {
              const docLabel = g.docType && isDocType(g.docType) ? t(DOC_KEY[g.docType]) : null;
              const last = g.docLast4 ? `···${g.docLast4}` : null;
              const detail = [docLabel, last].filter(Boolean).join(' ');
              return (
                <li key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="text-muted-foreground w-5 shrink-0 text-xs tabular-nums">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm font-medium">{g.fullName}</span>
                  {g.isLead && (
                    <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
                      {t('lead_badge')}
                    </span>
                  )}
                  {detail && (
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                      {detail}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {(written.length > 0 || ruleItems.length > 0) && (
        <Card className="p-4">
          <h2 className="font-display mb-2 text-base font-semibold">{t('rules_title')}</h2>
          <ul className="grid gap-2">
            {written.map((line) => (
              <li key={line} className="text-sm leading-relaxed">
                {line}
              </li>
            ))}
            {ruleItems.map(({ label, Icon }) => (
              <li key={label} className="flex items-center gap-3">
                <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="text-sm">{label}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-muted-foreground text-xs">{t('missing_someone')}</p>
      <p className="text-muted-foreground text-xs">
        <PrivacyLink />
      </p>
    </div>
  );
}

export function CheckinForm({
  id,
  alreadyDone,
  stay,
  expectedGuests,
  maxGuests,
  askCount = false,
  rules,
  registered: initialRegistered = [],
  arrivalTime: initialArrival = null,
  departureTime: initialDeparture = null,
}: CheckinFormProps) {
  const t = useTranslations('checkin');
  const locale = useLocale();
  const defaultDocType: DocType = locale === 'es' ? 'rut' : 'passport';

  const [done, setDone] = useState(alreadyDone);
  const [registered, setRegistered] = useState<RegisteredGuest[]>(initialRegistered);
  const [counted, setCounted] = useState(!askCount);
  const [guests, setGuests] = useState<GuestDraft[]>(() =>
    Array.from({ length: askCount ? 0 : expectedGuests }, () => newGuest(defaultDocType)),
  );
  const [step, setStep] = useState(0);
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [parking, setParking] = useState<Parking>('');
  const [plate, setPlate] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [nav, setNav] = useState(0);
  const [pending, startTransition] = useTransition();

  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const navigating = useRef(false);

  useEffect(() => {
    if (!nav) return;
    navigating.current = true;
    window.scrollTo({ top: 0, behavior: 'instant' });
    headingRef.current?.focus({ preventScroll: true });
    navigating.current = false;
  }, [nav]);

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
  const onDetails = counted && step === guests.length;
  const welcome = !counted || (!askCount && step === 0);

  const setError = (key: string, msg: string | null) => {
    if (navigating.current) return;
    setErrors((prev) => {
      if (msg) return { ...prev, [key]: msg };
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const focusInvalid = (found: Errors) => {
    if (found.name && nameRef.current) {
      nameRef.current.focus();
      return;
    }
    if (found.doc && docRef.current) {
      docRef.current.focus();
      return;
    }
    const group = found.arrival
      ? 'arrival'
      : found.departure
        ? 'departure'
        : found.parking
          ? 'parking'
          : null;
    if (group) document.getElementById(group)?.querySelector('button')?.focus();
  };

  const guestErrors = (g: GuestDraft): Errors => {
    const found: Errors = {};
    if (!g.fullName.trim()) found.name = t('error_name');
    if (g.docNumber.trim().length < MIN_DOC) found.doc = t('error_doc');
    return found;
  };

  const detailErrors = (): Errors => {
    const found: Errors = {};
    if (!arrival) found.arrival = t('error_time');
    if (!departure) found.departure = t('error_time');
    if (!parking) found.parking = t('error_parking');
    return found;
  };

  const goTo = (next: number) => {
    setGuests((list) => {
      const from = list[step];
      const to = list[next];
      if (!from || !to || to.fullName || to.docNumber || to.docType === from.docType) return list;
      return list.map((g, j) => (j === next ? { ...g, docType: from.docType } : g));
    });
    setStep(next);
    setErrors({});
    setMessage(null);
    setNav((n) => n + 1);
  };

  const chooseCount = (n: number) => {
    setGuests((list) =>
      n <= list.length
        ? list.slice(0, n)
        : [
            ...list,
            ...Array.from({ length: n - list.length }, () =>
              newGuest(list[list.length - 1]?.docType ?? defaultDocType),
            ),
          ],
    );
    setCounted(true);
    setStep(0);
    setErrors({});
    setMessage(null);
    setNav((n) => n + 1);
  };

  const onBack = () => {
    if (step > 0) {
      goTo(step - 1);
      return;
    }
    setCounted(false);
    setErrors({});
    setMessage(null);
    setNav((n) => n + 1);
  };

  const updateGuest = (i: number, patch: Partial<GuestDraft>) =>
    setGuests((list) => list.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  const send = () => {
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
        window.scrollTo({ top: 0, behavior: 'instant' });
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

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!counted) return;

    if (!onDetails) {
      const found = guestErrors(guests[step]!);
      if (Object.keys(found).length) {
        setErrors(found);
        focusInvalid(found);
        return;
      }
      goTo(step + 1);
      return;
    }

    const found = detailErrors();
    if (Object.keys(found).length) {
      setErrors(found);
      focusInvalid(found);
      return;
    }

    send();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      {welcome ? (
        <Welcome stay={stay} line={stayLine} times={times} />
      ) : (
        <StayStrip stay={stay} line={stayLine} />
      )}

      {!counted ? (
        <section className="grid gap-4">
          <h2
            id="count-title"
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-base font-semibold focus:outline-none"
          >
            {t('count_title')}
          </h2>
          <div role="group" aria-labelledby="count-title" className="flex flex-wrap gap-2">
            {Array.from({ length: Math.max(maxGuests, 1) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-label={n === 1 ? t('count_one') : t('count_many', { n })}
                onClick={() => chooseCount(n)}
                className={cn(
                  'border-border bg-card shadow-xs hover:border-primary/40 hover:bg-accent ease-lux h-11 min-w-11 rounded-lg border px-2 text-base font-semibold tabular-nums transition-colors duration-200 active:scale-[0.97]',
                  FOCUS,
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <Roster guests={guests} step={step} onJump={goTo} />

          {onDetails ? (
            <section className="grid gap-3">
              <StepHeading headingRef={headingRef} step={step} total={steps}>
                {t('details_title')}
              </StepHeading>
              <Card className="divide-border divide-y">
                <div className="grid gap-3 p-4">
                  <GroupLabel id="arrival-label">{t('arrival')}</GroupLabel>
                  <GroupError id="arrival-err" message={errors.arrival} />
                  <Chips
                    id="arrival"
                    labelId="arrival-label"
                    options={arrivalSlots(stay.checkinTime).map((v) => ({ value: v, label: v }))}
                    value={arrival}
                    onChange={(v) => {
                      setArrival(v);
                      setError('arrival', null);
                    }}
                    className="grid-cols-3 tabular-nums"
                    invalid={Boolean(errors.arrival)}
                    describedById={errors.arrival ? 'arrival-err' : undefined}
                  />
                </div>

                <div className="grid gap-3 p-4">
                  <GroupLabel id="departure-label">{t('departure')}</GroupLabel>
                  <GroupError id="departure-err" message={errors.departure} />
                  <Chips
                    id="departure"
                    labelId="departure-label"
                    options={departureSlots(stay.checkoutTime).map((v) => ({
                      value: v,
                      label: v,
                    }))}
                    value={departure}
                    onChange={(v) => {
                      setDeparture(v);
                      setError('departure', null);
                    }}
                    className="grid-cols-2 tabular-nums"
                    invalid={Boolean(errors.departure)}
                    describedById={errors.departure ? 'departure-err' : undefined}
                  />
                </div>

                <div className="grid gap-3 p-4">
                  <GroupLabel id="parking-label">{t('parking')}</GroupLabel>
                  <GroupError id="parking-err" message={errors.parking} />
                  <Chips
                    id="parking"
                    labelId="parking-label"
                    options={[
                      { value: 'yes' as const, label: t('parking_yes') },
                      { value: 'no' as const, label: t('parking_no') },
                    ]}
                    value={parking}
                    onChange={(v) => {
                      setParking(v);
                      setError('parking', null);
                    }}
                    className="grid-cols-2"
                    invalid={Boolean(errors.parking)}
                    describedById={errors.parking ? 'parking-err' : undefined}
                  />
                  {parking === 'yes' && (
                    <div className="animate-fade-in">
                      <Field id="plate" label={t('plate')} optional>
                        <Input
                          id="plate"
                          autoCapitalize="characters"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          maxLength={12}
                          enterKeyHint="done"
                          placeholder={t('plate_ph')}
                          value={plate}
                          onChange={(e) => setPlate(e.target.value)}
                          className="h-12 text-base uppercase tracking-wider"
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </Card>
            </section>
          ) : (
            <section className="grid gap-3">
              <StepHeading headingRef={headingRef} step={step} total={steps}>
                {t('guest_title')}
              </StepHeading>
              <GuestStep
                index={step}
                guest={guests[step]!}
                errors={errors}
                nameRef={nameRef}
                docRef={docRef}
                onChange={(patch) => updateGuest(step, patch)}
                setError={setError}
              />
            </section>
          )}

          <div className="bg-background/90 border-border fixed inset-x-0 bottom-0 z-10 border-t pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:pb-0 sm:pt-8 sm:backdrop-blur-none">
            <div className="mx-auto grid w-full max-w-md gap-2 px-4 sm:max-w-lg sm:px-0">
              {message && (
                <p role="alert" className="text-destructive text-sm font-medium">
                  {message}
                </p>
              )}
              <div className="flex gap-2 sm:justify-end">
                {(step > 0 || askCount) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xl"
                    className="shrink-0 px-3 sm:px-5"
                    onClick={onBack}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t('back')}
                  </Button>
                )}
                <Button
                  type="submit"
                  size="xl"
                  className="min-w-0 flex-1 px-4 sm:flex-none sm:px-10"
                  disabled={pending}
                >
                  {onDetails ? (pending ? t('sending') : t('submit')) : t('next')}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </form>
  );
}
