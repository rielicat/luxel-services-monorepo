'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Check,
  ChevronDown,
  CigaretteOff,
  House,
  PartyPopper,
  PawPrint,
  Plus,
  TriangleAlert,
  User,
} from 'lucide-react';
import { LuxelLogo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  NATIONALITIES,
  arrivalSlots,
  departureSlots,
  nightsBetween,
  type Nationality,
} from '@/lib/checkin/slots';
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
  nationality: string | null;
  docType: string | null;
  docLast4: string | null;
}

export interface CheckinFormProps {
  token: string;
  requireId: boolean;
  alreadyDone: boolean;
  stay: Stay;
  expectedGuests: number;
  maxGuests: number;
  rules: Rules;
  registered?: RegisteredGuest[];
  arrivalTime?: string | null;
  departureTime?: string | null;
}

type GuestDraft = {
  fullName: string;
  docType: DocType;
  docNumber: string;
  nationality: '' | Nationality;
};
type Parking = '' | 'yes' | 'no';

const INTL_LOCALE: Record<string, string> = { es: 'es-CL', en: 'en', pt: 'pt-BR' };

const NAT_KEY = {
  CL: 'nat_cl',
  AR: 'nat_ar',
  PE: 'nat_pe',
  CO: 'nat_co',
  VE: 'nat_ve',
  BR: 'nat_br',
  BO: 'nat_bo',
  EC: 'nat_ec',
  MX: 'nat_mx',
  US: 'nat_us',
  ES: 'nat_es',
  other: 'nat_other',
} as const satisfies Record<Nationality, string>;

const DOC_KEY = {
  rut: 'doc_rut',
  passport: 'doc_passport',
  dni: 'doc_dni',
  other: 'doc_other',
} as const satisfies Record<DocType, string>;
const DOC_TYPES = Object.keys(DOC_KEY) as DocType[];

const isNationality = (v: string): v is Nationality =>
  (NATIONALITIES as readonly string[]).includes(v);
const isDocType = (v: string): v is DocType => v in DOC_KEY;

const ARROW_STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};
const GUEST_ERROR = /^g(\d+)-(name|doc)$/;

const newGuest = (): GuestDraft => ({
  fullName: '',
  docType: 'rut',
  docNumber: '',
  nationality: '',
});
const clock = (time: string | null): string | null => (time ? time.slice(0, 5) : null);
const maskDoc = (n: string): string => n.replace(/\s+/g, '').slice(-4);
const fieldCls = (invalid: boolean) =>
  cn('h-12 text-base', invalid && 'border-destructive focus-visible:border-destructive');

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

function GroupLabel({
  id,
  invalid,
  children,
}: {
  id: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span id={id} className={cn('text-sm font-medium leading-none', invalid && 'text-destructive')}>
      {children}
    </span>
  );
}

function Field({
  id,
  label,
  optional,
  hint,
  invalid,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations('checkin');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className={cn(invalid && 'text-destructive')}>
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
  invalid,
  className,
}: {
  id: string;
  labelId: string;
  options: Array<{ value: V; label: string }>;
  value: string;
  onChange: (v: V) => void;
  invalid?: boolean;
  className?: string;
}) {
  const selected = options.findIndex((o) => o.value === value);
  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-invalid={invalid || undefined}
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
              'focus-visible:ring-ring/60 min-h-11 rounded-lg border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
              on
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card hover:border-primary/40',
              invalid && !on && 'border-destructive/60',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function NationalitySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: '' | Nationality;
  onChange: (v: '' | Nationality) => void;
}) {
  const t = useTranslations('checkin');
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as '' | Nationality)}
        className="border-input bg-card focus-visible:border-primary focus-visible:ring-ring/25 shadow-xs h-12 w-full appearance-none rounded-lg border px-3 pr-10 text-base focus-visible:outline-none focus-visible:ring-[3px]"
      >
        <option value="">{t('nationality_select')}</option>
        {NATIONALITIES.map((c) => (
          <option key={c} value={c}>
            {t(NAT_KEY[c])}
          </option>
        ))}
      </select>
      <ChevronDown className="text-muted-foreground pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
    </div>
  );
}

function GuestCard({
  index,
  guest,
  requireId,
  errors,
  onChange,
  onRemove,
  children,
}: {
  index: number;
  guest: GuestDraft;
  requireId: boolean;
  errors: Set<string>;
  onChange: (patch: Partial<GuestDraft>) => void;
  onRemove?: () => void;
  children?: React.ReactNode;
}) {
  const t = useTranslations('checkin');
  const id = `g${index}`;
  const nameBad = errors.has(`${id}-name`);
  const docBad = errors.has(`${id}-doc`);
  return (
    <div className="border-border bg-card shadow-card grid gap-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 font-semibold">
          <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
            <User className="h-4 w-4" />
          </span>
          {index === 0 ? t('guest_lead') : t('guest_n', { n: index + 1 })}
        </p>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive -mr-2 min-h-11 px-2 text-sm font-medium transition-colors"
          >
            {t('remove')}
          </button>
        )}
      </div>

      <Field id={`${id}-name`} label={t('name')} invalid={nameBad}>
        <Input
          id={`${id}-name`}
          autoComplete="name"
          maxLength={120}
          aria-required
          aria-invalid={nameBad || undefined}
          placeholder={t('name_ph')}
          value={guest.fullName}
          onChange={(e) => onChange({ fullName: e.target.value })}
          className={fieldCls(nameBad)}
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

      <Field id={`${id}-doc`} label={t('doc_number')} optional={!requireId} invalid={docBad}>
        <Input
          id={`${id}-doc`}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={40}
          aria-required={requireId || undefined}
          aria-invalid={docBad || undefined}
          placeholder={t('doc_number_ph')}
          value={guest.docNumber}
          onChange={(e) => onChange({ docNumber: e.target.value })}
          className={fieldCls(docBad)}
        />
      </Field>

      <Field id={`${id}-nat`} label={t('nationality')}>
        <NationalitySelect
          id={`${id}-nat`}
          value={guest.nationality}
          onChange={(v) => onChange({ nationality: v })}
        />
      </Field>

      {children}
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
              const nat =
                g.nationality && isNationality(g.nationality) ? t(NAT_KEY[g.nationality]) : null;
              const docLabel = g.docType && isDocType(g.docType) ? t(DOC_KEY[g.docType]) : null;
              const last = g.docLast4 ? `···${g.docLast4}` : null;
              const doc = [docLabel, last].filter(Boolean).join(' ');
              const detail = [nat, doc].filter(Boolean).join(' · ');
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
  token,
  requireId,
  alreadyDone,
  stay,
  expectedGuests,
  maxGuests,
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
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [parking, setParking] = useState<Parking>('');
  const [plate, setPlate] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Set<string>>(() => new Set());
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

  const touch = (id: string) =>
    setErrors((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const updateGuest = (i: number, patch: Partial<GuestDraft>) => {
    setGuests((list) => list.map((g, j) => (j === i ? { ...g, ...patch } : g)));
    if (patch.fullName !== undefined) touch(`g${i}-name`);
    if (patch.docNumber !== undefined) touch(`g${i}-doc`);
  };

  const removeGuest = (i: number) => {
    setGuests((list) => list.filter((_, j) => j !== i));
    setErrors((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        const m = GUEST_ERROR.exec(id);
        if (!m) {
          next.add(id);
          continue;
        }
        const k = Number(m[1]);
        if (k === i) continue;
        next.add(k > i ? `g${k - 1}-${m[2]}` : id);
      }
      return next;
    });
  };

  const validate = (): string[] => {
    const bad: string[] = [];
    guests.forEach((g, i) => {
      if (!g.fullName.trim()) bad.push(`g${i}-name`);
      const n = g.docNumber.trim().length;
      if ((requireId && n < 3) || (n > 0 && n < 3)) bad.push(`g${i}-doc`);
      if (i === 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) bad.push('email');
    });
    if (!arrival) bad.push('arrival');
    if (!departure) bad.push('departure');
    if (!consent) bad.push('consent');
    return bad;
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const bad = validate();
    setErrors(new Set(bad));
    if (bad.length) {
      setMessage(t('error_incomplete'));
      const el = document.getElementById(bad[0]!);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const target =
        el instanceof HTMLInputElement ? el : el?.querySelector<HTMLElement>('button, input');
      target?.focus({ preventScroll: true });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const r = await submitCheckin({
        token,
        guests: guests.map((g) => {
          const n = g.docNumber.trim();
          return {
            fullName: g.fullName.trim(),
            docType: n ? g.docType : undefined,
            docNumber: n || undefined,
            nationality: g.nationality || undefined,
          };
        }),
        email: email.trim(),
        phone: phone.trim() || undefined,
        arrivalTime: arrival,
        departureTime: departure || undefined,
        parking: parking ? parking === 'yes' : undefined,
        vehiclePlate: parking === 'yes' && plate.trim() ? plate.trim() : undefined,
        consent: true,
      }).catch(() => ({ ok: false, error: 'generic' }));
      if (r.ok) {
        setRegistered(
          guests.map((g, i) => {
            const n = g.docNumber.trim();
            return {
              isLead: i === 0,
              fullName: g.fullName.trim(),
              nationality: g.nationality || null,
              docType: n ? g.docType : null,
              docLast4: n ? maskDoc(n) : null,
            };
          }),
        );
        setDone(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (r.error === 'already_submitted') {
        window.location.reload();
      } else {
        setMessage(
          r.error === 'id_required'
            ? t('error_id_required')
            : r.error === 'expired' || r.error === 'not_found'
              ? t('error_expired')
              : t('error_generic'),
        );
      }
    });
  };

  const emailBad = errors.has('email');

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

      <section aria-labelledby="guests-title" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="guests-title" className="font-display text-lg font-semibold">
            {t('guests_title')}
          </h2>
          {expectedGuests > 1 && (
            <p className="text-muted-foreground text-sm">
              {t('guests_expected', { n: expectedGuests })}
            </p>
          )}
        </div>

        {guests.map((g, i) => (
          <GuestCard
            key={i}
            index={i}
            guest={g}
            requireId={requireId}
            errors={errors}
            onChange={(patch) => updateGuest(i, patch)}
            onRemove={i > 0 ? () => removeGuest(i) : undefined}
          >
            {i === 0 && (
              <>
                <Field id="email" label={t('email')} hint={t('email_help')} invalid={emailBad}>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    maxLength={120}
                    aria-required
                    aria-invalid={emailBad || undefined}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      touch('email');
                    }}
                    className={fieldCls(emailBad)}
                  />
                </Field>
                <Field id="phone" label={t('phone')} optional>
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={30}
                    placeholder={t('phone_ph')}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-12 text-base"
                  />
                </Field>
              </>
            )}
          </GuestCard>
        ))}

        {guests.length < maxGuests && (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full text-base"
            onClick={() => setGuests((list) => [...list, newGuest()])}
          >
            <Plus className="h-4 w-4" /> {t('add_guest')}
          </Button>
        )}
      </section>

      <section className="grid gap-2">
        <GroupLabel id="arrival-label" invalid={errors.has('arrival')}>
          {t('arrival')}
        </GroupLabel>
        <Chips
          id="arrival"
          labelId="arrival-label"
          options={arrivalSlots(stay.checkinTime).map((v) => ({ value: v, label: v }))}
          value={arrival}
          onChange={(v) => {
            setArrival(v);
            touch('arrival');
          }}
          invalid={errors.has('arrival')}
          className="grid-cols-3"
        />
      </section>

      <section className="grid gap-2">
        <GroupLabel id="departure-label" invalid={errors.has('departure')}>
          {t('departure')}
        </GroupLabel>
        <Chips
          id="departure"
          labelId="departure-label"
          options={departureSlots(stay.checkoutTime).map((v) => ({ value: v, label: v }))}
          value={departure}
          onChange={(v) => {
            setDeparture(v);
            touch('departure');
          }}
          invalid={errors.has('departure')}
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

      <label htmlFor="consent" className="flex min-h-11 items-start gap-3 text-sm">
        <input
          id="consent"
          type="checkbox"
          checked={consent}
          aria-invalid={errors.has('consent') || undefined}
          onChange={(e) => {
            setConsent(e.target.checked);
            touch('consent');
          }}
          className="accent-primary mt-0.5 h-5 w-5 shrink-0 rounded"
        />
        <span
          className={cn(
            'text-muted-foreground',
            errors.has('consent') && 'text-destructive font-medium',
          )}
        >
          {t('consent')}
        </span>
      </label>

      <div className="bg-background/90 border-border fixed inset-x-0 bottom-0 z-10 border-t pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto grid w-full max-w-md gap-2 px-4">
          {message && (
            <p role="alert" className="text-destructive text-sm font-medium">
              {message}
            </p>
          )}
          <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
            {pending ? t('sending') : t('submit')}
          </Button>
        </div>
      </div>
    </form>
  );
}
