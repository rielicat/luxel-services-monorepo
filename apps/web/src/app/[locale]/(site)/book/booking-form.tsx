'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  Home,
  Sparkles,
  Ruler,
  MapPin,
  Package,
  User,
  Truck,
  Repeat,
  CalendarDays,
  Wallet,
  CreditCard,
  Landmark,
  Check,
  ChevronDown,
  ClipboardList,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { AddressAutocomplete } from '@/components/address-autocomplete';
import { cn, formatCLP } from '@/lib/utils';
import type { ServiceType } from '@luxel/shared';
import type { PricingConfig } from '@luxel/pricing';
import { discountPct, type Frequency } from '@/lib/quote-view';
import { fetchAvailabilityAction, type DayAvailabilityDTO } from '../calendar/actions';
import { createBookingAction } from './actions';
import { track } from '@/lib/analytics/client';
import { EVENTS } from '@/lib/analytics/events';

const FREQUENCIES: Frequency[] = ['one_time', 'weekly', 'biweekly', 'monthly'];
const SERVICE_ICONS: Record<string, LucideIcon> = { regular: Home, deep: Sparkles };
const SIZE_PRESETS: { key: string; m2: number }[] = [
  { key: 'studio', m2: 30 },
  { key: 'apartment', m2: 60 },
  { key: 'house', m2: 120 },
  { key: 'office', m2: 200 },
];

const PAYMENT_META: Record<
  string,
  { icon: LucideIcon; tint: string; nameKey: string; descKey: string }
> = {
  mercadopago: {
    icon: Wallet,
    tint: '#009EE3',
    nameKey: 'payment_mercadopago',
    descKey: 'payment_mercadopago_desc',
  },
  transbank: {
    icon: Landmark,
    tint: '#E4322B',
    nameKey: 'payment_transbank',
    descKey: 'payment_transbank_desc',
  },
  stripe: {
    icon: CreditCard,
    tint: '#635BFF',
    nameKey: 'payment_stripe',
    descKey: 'payment_stripe_desc',
  },
};

interface Props {
  serviceTypes: ServiceType[];
  operationPointId: string;
  config: PricingConfig;
  paymentProviders: string[];
  initial: {
    serviceTypeId?: string;
    frequency?: Frequency;
    squareMeters?: number;
    toolsProvidedBy?: 'customer' | 'company';
    addressLine?: string;
    commune?: string;
  };
}

export function BookingForm({
  serviceTypes,
  operationPointId,
  config,
  paymentProviders,
  initial,
}: Props) {
  const t = useTranslations('booking');
  const tc = useTranslations('calculator');
  const tCalc = useTranslations('calculator.fields');
  const tCal = useTranslations('calendar');
  const tService = useTranslations('service');
  const tErr = useTranslations('errors');

  const [frequency, setFrequency] = useState<Frequency>(initial.frequency ?? 'one_time');
  const [serviceTypeId, setServiceTypeId] = useState(
    initial.serviceTypeId ?? serviceTypes[0]?.id ?? '',
  );
  const [squareMeters, setSquareMeters] = useState(initial.squareMeters ?? 60);
  const [addressLine, setAddressLine] = useState(initial.addressLine ?? '');
  const [commune, setCommune] = useState(initial.commune ?? '');
  const [toolsProvidedBy, setToolsProvidedBy] = useState<'customer' | 'company'>(
    initial.toolsProvidedBy ?? 'customer',
  );
  const [date, setDate] = useState<Date | undefined>();
  const [timeblock, setTimeblock] = useState<'manana' | 'tarde' | null>(null);
  const [availability, setAvailability] = useState<DayAvailabilityDTO | null>(null);
  const [paymentProvider, setPaymentProvider] = useState(paymentProviders[0] ?? '');

  const carried: [number, unknown][] = [
    [1, initial.serviceTypeId],
    [2, initial.squareMeters],
    [3, initial.addressLine],
    [4, initial.toolsProvidedBy],
    [5, initial.frequency],
  ];
  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => new Set(carried.filter(([, v]) => Boolean(v)).map(([n]) => n)),
  );
  const collapse = (n: number) => setCollapsed((prev) => new Set(prev).add(n));
  const toggle = (n: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const firstUnfilled = carried.find(([, v]) => !v)?.[0] ?? 6;
  useEffect(() => {
    if (firstUnfilled > 1) {
      document
        .getElementById(`book-step-${firstUnfilled}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedService = useMemo(
    () => serviceTypes.find((s) => s.id === serviceTypeId),
    [serviceTypes, serviceTypeId],
  );

  useEffect(() => {
    track(EVENTS.BOOKING_STARTED, {
      service_type_id: initial.serviceTypeId,
      frequency: initial.frequency,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!date) return;
    const iso = date.toISOString().slice(0, 10);
    setAvailability(null);
    setTimeblock(null);
    fetchAvailabilityAction(iso, operationPointId).then(setAvailability);
  }, [date, operationPointId]);

  const addressDone = Boolean(addressLine.trim() && commune.trim());
  const whenDone = Boolean(date && timeblock);
  const canSubmit = addressDone && whenDone && Boolean(paymentProvider);

  const freqLabel = (f: Frequency) => tCalc(`frequency_${f}` as 'frequency_weekly');
  const serviceName = selectedService
    ? tService(`${selectedService.slug}.name` as 'regular.name')
    : t('summary_pending');

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    if (!date || !timeblock) return;
    const fd = new FormData();
    fd.set('scheduledDate', date.toISOString().slice(0, 10));
    fd.set('timeblock', timeblock);
    fd.set('frequency', frequency);
    fd.set('serviceTypeId', serviceTypeId);
    fd.set('toolsProvidedBy', toolsProvidedBy);
    fd.set('squareMeters', String(squareMeters));
    fd.set('addressLine', addressLine);
    fd.set('commune', commune);
    fd.set('paymentProvider', paymentProvider);
    startTransition(async () => {
      const r = await createBookingAction(fd);
      if (r && !r.ok) {
        setSubmitError(
          r.error === 'no_availability'
            ? t('slot_taken')
            : r.error === 'out_of_area'
              ? tErr('out_of_service_area')
              : r.error === 'unauthorized'
                ? tErr('unauthorized')
                : tErr('generic'),
        );
      }
    });
  };

  const stepProps = (n: number, done: boolean, summary: string) => ({
    n,
    done,
    summary,
    expanded: !collapsed.has(n),
    onToggle: () => toggle(n),
  });

  return (
    <form onSubmit={onSubmit} className="grid items-start gap-8 lg:grid-cols-[1fr_360px]">
      <div className="grid gap-3">
        <AccordionStep
          {...stepProps(1, Boolean(selectedService), serviceName)}
          icon={Sparkles}
          title={t('step_service')}
        >
          <RadioGroup
            value={serviceTypeId}
            onValueChange={(v) => {
              setServiceTypeId(v);
              collapse(1);
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            {serviceTypes.map((s) => {
              const selected = s.id === serviceTypeId;
              const Icon = SERVICE_ICONS[s.slug] ?? Sparkles;
              return (
                <Label
                  key={s.id}
                  htmlFor={`svc-${s.id}`}
                  className={cn(
                    'flex cursor-pointer flex-col gap-2 rounded-2xl border-2 p-4 transition-all',
                    selected
                      ? 'border-primary bg-accent/50 shadow-soft'
                      : 'border-input hover:border-primary/40 hover:bg-accent/30',
                  )}
                >
                  <RadioGroupItem id={`svc-${s.id}`} value={s.id} className="sr-only" />
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                        selected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-primary/10 text-primary',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    {selected && <Check className="text-primary h-5 w-5" />}
                  </div>
                  <span className="font-display font-semibold">
                    {tService(`${s.slug}.name` as 'regular.name')}
                  </span>
                  <span className="text-muted-foreground text-xs leading-snug">
                    {tService(`${s.slug}.desc` as 'regular.desc')}
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
        </AccordionStep>

        <AccordionStep
          {...stepProps(2, true, `${squareMeters} m²`)}
          icon={Ruler}
          title={t('step_size')}
        >
          <div className="grid gap-4">
            <div className="flex items-end justify-between">
              <span className="text-muted-foreground text-xs">{tc('size_hint')}</span>
              <span className="text-primary font-display text-4xl font-extrabold tabular-nums leading-none">
                {squareMeters}
                <span className="text-muted-foreground ml-1 text-lg font-bold">m²</span>
              </span>
            </div>
            <Slider
              min={20}
              max={300}
              step={5}
              value={[squareMeters]}
              onValueChange={(v) => setSquareMeters(v[0]!)}
            />
            <div className="flex flex-wrap gap-2">
              {SIZE_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.key}
                  onClick={() => {
                    setSquareMeters(p.m2);
                    collapse(2);
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    squareMeters === p.m2
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {tc(`presets.${p.key}` as 'presets.studio')} · {p.m2} m²
                </button>
              ))}
            </div>
          </div>
        </AccordionStep>

        <AccordionStep
          {...stepProps(
            3,
            addressDone,
            addressDone ? `${addressLine}, ${commune}` : t('summary_pending'),
          )}
          icon={MapPin}
          title={t('step_address')}
        >
          <AddressAutocomplete
            label={t('address_line')}
            required
            defaultValue={
              addressLine ? `${addressLine}${commune ? `, ${commune}` : ''}` : undefined
            }
            onSelect={(s) => {
              setAddressLine(s.shortName);
              setCommune(s.commune ?? '');
              collapse(3);
            }}
            onClear={() => {
              setAddressLine('');
              setCommune('');
            }}
          />
        </AccordionStep>

        <AccordionStep
          {...stepProps(
            4,
            true,
            toolsProvidedBy === 'company' ? tCalc('tools_company') : tCalc('tools_customer'),
          )}
          icon={Package}
          title={t('step_tools')}
        >
          <RadioGroup
            value={toolsProvidedBy}
            onValueChange={(v) => {
              setToolsProvidedBy(v as 'customer' | 'company');
              collapse(4);
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <ToolCard
              value="customer"
              icon={User}
              label={tCalc('tools_customer')}
              sub={tCalc('tools_customer_hint')}
              active={toolsProvidedBy === 'customer'}
            />
            <ToolCard
              value="company"
              icon={Truck}
              label={tCalc('tools_company')}
              sub={tCalc('tools_company_hint')}
              price={`+${formatCLP(config.toolsSurchargeClp)}`}
              active={toolsProvidedBy === 'company'}
            />
          </RadioGroup>
        </AccordionStep>

        <AccordionStep
          {...stepProps(5, true, freqLabel(frequency))}
          icon={Repeat}
          title={t('step_frequency')}
        >
          <RadioGroup
            value={frequency}
            onValueChange={(v) => {
              setFrequency(v as Frequency);
              collapse(5);
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {FREQUENCIES.map((f) => {
              const pct = discountPct(f, config);
              const selected = frequency === f;
              const popular = f === 'weekly';
              return (
                <Label
                  key={f}
                  htmlFor={`freq-${f}`}
                  className={cn(
                    'relative flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center transition-all',
                    selected
                      ? 'border-primary bg-accent/50 shadow-soft'
                      : 'border-input hover:border-primary/40 hover:bg-accent/30',
                  )}
                >
                  <RadioGroupItem id={`freq-${f}`} value={f} className="sr-only" />
                  {popular && (
                    <Badge
                      variant="default"
                      className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px]"
                    >
                      {tc('popular')}
                    </Badge>
                  )}
                  <span className="text-sm font-semibold">{freqLabel(f)}</span>
                  {pct > 0 ? (
                    <span className="bg-lime text-lime-foreground rounded-full px-2 py-0.5 text-[10px] font-bold">
                      −{pct}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-[10px]">{tc('one_time_hint')}</span>
                  )}
                </Label>
              );
            })}
          </RadioGroup>
        </AccordionStep>

        <AccordionStep
          {...stepProps(
            6,
            whenDone,
            whenDone && date
              ? `${formatDate(date)} · ${tCal(`timeblock_${timeblock}` as 'timeblock_manana')}`
              : t('summary_pending'),
          )}
          icon={CalendarDays}
          title={t('step_when')}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border p-1">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={{ before: new Date() }}
              />
            </div>
            <div className="grid content-start gap-2">
              <Label className="text-muted-foreground text-xs">{tCal('available_blocks')}</Label>
              {!date && <p className="text-muted-foreground text-sm">{tCal('select_date')}</p>}
              {date && !availability && (
                <p className="text-muted-foreground text-sm">{t('loading_availability')}</p>
              )}
              {date &&
                availability?.timeblocks.map((b) => {
                  const active = timeblock === b.timeblock;
                  const full = b.available === 0;
                  return (
                    <button
                      key={b.timeblock}
                      type="button"
                      disabled={full}
                      onClick={() => {
                        setTimeblock(b.timeblock);
                        collapse(6);
                      }}
                      className={cn(
                        'flex items-center justify-between rounded-xl border-2 p-3 text-left transition-all',
                        active
                          ? 'border-primary bg-accent/50 shadow-soft'
                          : 'border-input hover:border-primary/40',
                        full && 'hover:border-input cursor-not-allowed opacity-50',
                      )}
                    >
                      <span className="text-sm font-medium">
                        {tCal(`timeblock_${b.timeblock}` as 'timeblock_manana')}
                      </span>
                      {full ? (
                        <Badge variant="secondary">{t('no_slots')}</Badge>
                      ) : (
                        <Badge variant="success">
                          {b.available} {t('slots')}
                        </Badge>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        </AccordionStep>

        <AccordionStep
          {...stepProps(
            7,
            Boolean(paymentProvider),
            paymentProvider
              ? t(`payment_${paymentProvider}` as 'payment_mercadopago')
              : t('summary_pending'),
          )}
          icon={Wallet}
          title={t('payment_title')}
        >
          {paymentProviders.length ? (
            <RadioGroup
              value={paymentProvider}
              onValueChange={(v) => {
                setPaymentProvider(v);
                collapse(7);
              }}
              className="grid gap-2.5"
            >
              {paymentProviders.map((p) => {
                const m = PAYMENT_META[p];
                if (!m) return null;
                return (
                  <PaymentCard
                    key={p}
                    value={p}
                    icon={m.icon}
                    tint={m.tint}
                    name={t(m.nameKey as 'payment_mercadopago')}
                    desc={t(m.descKey as 'payment_mercadopago_desc')}
                  />
                );
              })}
            </RadioGroup>
          ) : (
            <p className="text-muted-foreground text-sm">{t('payment_none')}</p>
          )}
        </AccordionStep>
      </div>

      <aside className="animate-fade-in-up [animation-delay:120ms] lg:sticky lg:top-24 lg:self-start">
        <Card className="shadow-card border-border/60">
          <CardContent className="grid gap-4 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <ClipboardList className="text-secondary h-4 w-4" />
              <h3 className="font-display text-base font-semibold">{t('summary_title')}</h3>
            </div>

            <dl className="grid gap-2.5 text-sm">
              <SummaryRow label={tCalc('service_type')} value={serviceName} />
              <SummaryRow label={tCalc('square_meters')} value={`${squareMeters} m²`} />
              <SummaryRow label={t('step_frequency')} value={freqLabel(frequency)} />
              <SummaryRow
                label={tCalc('tools')}
                value={
                  toolsProvidedBy === 'company' ? tCalc('tools_company') : tCalc('tools_customer')
                }
              />
              <SummaryRow
                label={t('summary_where')}
                value={addressDone ? `${addressLine}, ${commune}` : t('summary_pending')}
              />
              <SummaryRow
                label={t('summary_when')}
                value={
                  whenDone && date
                    ? `${formatDate(date)} · ${tCal(`timeblock_${timeblock}` as 'timeblock_manana')}`
                    : t('summary_pending')
                }
              />
            </dl>

            <div className="border-border/60 border-t pt-3">
              <p className="text-muted-foreground text-xs leading-snug">
                {t('summary_price_note')}
              </p>
            </div>

            <Button type="submit" disabled={pending || !canSubmit} size="lg" className="w-full">
              {pending ? t('submitting') : t('submit')}
            </Button>
            {submitError && <p className="text-destructive text-sm">{submitError}</p>}
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
}

function AccordionStep({
  n,
  icon: Icon,
  title,
  expanded,
  done,
  summary,
  onToggle,
  children,
}: {
  n: number;
  icon: LucideIcon;
  title: string;
  expanded: boolean;
  done: boolean;
  summary: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card
      id={`book-step-${n}`}
      className={cn(
        'shadow-soft scroll-mt-24 overflow-hidden',
        expanded ? 'border-primary/30 ring-primary/10 ring-2' : 'border-border/60',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="hover:bg-muted/30 flex w-full items-center gap-3 p-4 text-left transition-colors"
      >
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            done ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
          )}
        >
          {done ? <Check className="h-4 w-4" /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <Icon className="text-secondary h-4 w-4 shrink-0" />
            <span className="font-display text-sm font-semibold sm:text-base">{title}</span>
          </span>
          {!expanded && (
            <span className="text-muted-foreground mt-0.5 block truncate text-sm">{summary}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'text-muted-foreground h-4 w-4 shrink-0 transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>
      {expanded && <div className="grid gap-4 px-4 pb-5 sm:px-6 sm:pb-6">{children}</div>}
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function ToolCard({
  value,
  icon: Icon,
  label,
  sub,
  price,
  active,
}: {
  value: string;
  icon: LucideIcon;
  label: string;
  sub?: string;
  price?: string;
  active: boolean;
}) {
  return (
    <Label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 transition-all',
        active ? 'border-primary bg-accent/50 shadow-soft' : 'border-input hover:border-primary/40',
      )}
    >
      <RadioGroupItem value={value} className="sr-only" />
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
          active ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        {sub && <span className="text-muted-foreground block text-xs leading-tight">{sub}</span>}
      </span>
      {price ? (
        <span
          className={cn(
            'shrink-0 text-sm font-semibold tabular-nums',
            active ? 'text-primary' : 'text-foreground',
          )}
        >
          {price}
        </span>
      ) : (
        active && <Check className="text-primary h-4 w-4 shrink-0" />
      )}
    </Label>
  );
}

function PaymentCard({
  value,
  icon: Icon,
  tint,
  name,
  desc,
}: {
  value: string;
  icon: LucideIcon;
  tint: string;
  name: string;
  desc: string;
}) {
  return (
    <Label className="border-input has-[:checked]:border-primary has-[:checked]:bg-accent/40 has-[:checked]:shadow-soft flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 transition-all">
      <RadioGroupItem value={value} className="peer sr-only" />
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ backgroundColor: tint }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">{name}</span>
        <span className="text-muted-foreground block text-xs leading-tight">{desc}</span>
      </span>
      <Check className="text-primary ml-auto hidden h-4 w-4 shrink-0 peer-data-[state=checked]:block" />
    </Label>
  );
}
