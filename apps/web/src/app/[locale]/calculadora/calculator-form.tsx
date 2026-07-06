'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Home, Sparkles, Ruler, MapPin, Package, Truck, Repeat, Check, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { AddressAutocomplete } from '@/components/address-autocomplete';
import { QuoteResult } from './quote-result';
import { OutOfAreaLeadForm } from './out-of-area-form';
import { getQuoteAction, type QuoteActionResult } from './actions';
import {
  estimateQuote,
  discountPct,
  type QuoteView,
  type Frequency,
  type Tools,
} from '@/lib/quote-view';
import { track } from '@/lib/analytics/client';
import { EVENTS } from '@/lib/analytics/events';
import { formatCLP, cn } from '@/lib/utils';
import type { ServiceType } from '@luxel/shared';
import type { PricingConfig } from '@luxel/pricing';
import type { GeocodeSuggestion } from '@/app/api/geocode/route';

const FREQUENCIES: Frequency[] = ['one_time', 'weekly', 'biweekly', 'monthly'];
const SERVICE_ICONS: Record<string, LucideIcon> = { regular: Home, deep: Sparkles };
const SIZE_PRESETS: { key: string; m2: number }[] = [
  { key: 'studio', m2: 30 },
  { key: 'apartment', m2: 60 },
  { key: 'house', m2: 120 },
  { key: 'office', m2: 200 },
];

export function CalculatorForm({
  serviceTypes,
  config,
}: {
  serviceTypes: ServiceType[];
  config: PricingConfig;
}) {
  const t = useTranslations('calculator');
  const tService = useTranslations('service');

  const [serviceTypeSlug, setServiceTypeSlug] = useState(serviceTypes[0]?.slug ?? 'regular');
  const [squareMeters, setSquareMeters] = useState(60);
  const [selectedLocation, setSelectedLocation] = useState<GeocodeSuggestion | null>(null);
  const [addressLabel, setAddressLabel] = useState('');
  const [toolsProvidedBy, setToolsProvidedBy] = useState<Tools>('customer');
  const [frequency, setFrequency] = useState<Frequency>('one_time');
  const [serverResult, setServerResult] = useState<QuoteActionResult | null>(null);
  const [pending, setPending] = useState(false);

  const serviceType = serviceTypes.find((s) => s.slug === serviceTypeSlug) ?? serviceTypes[0];

  // Instant client-side estimate (no distance) — reacts to every control change.
  const estimate = useMemo<QuoteView | null>(
    () =>
      serviceType
        ? estimateQuote(serviceType, squareMeters, toolsProvidedBy, frequency, config)
        : null,
    [serviceType, squareMeters, toolsProvidedBy, frequency, config],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const startedRef = useRef(false);

  // Exact server quote (with distance + coverage), debounced, once an address exists.
  // A per-run `cancelled` flag invalidates both the pending timer and any in-flight
  // request when inputs change / the address is cleared / the component unmounts,
  // so a stale response can never repopulate the panel.
  useEffect(() => {
    if (!selectedLocation) {
      setServerResult(null);
      setPending(false);
      return;
    }
    let cancelled = false;
    setPending(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (cancelled) return;
      if (!startedRef.current) {
        startedRef.current = true;
        track(EVENTS.QUOTE_STARTED, { service_slug: serviceTypeSlug, square_meters: squareMeters });
      }
      void (async () => {
        const r = await getQuoteAction({
          serviceTypeSlug,
          squareMeters,
          address: addressLabel,
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
          toolsProvidedBy,
          frequency,
        });
        if (cancelled) return;
        setServerResult(r);
        setPending(false);
        if (r.ok && r.quote) {
          track(EVENTS.QUOTE_CALCULATED, {
            amount_clp: r.quote.totalClp,
            service_slug: serviceTypeSlug,
            square_meters: squareMeters,
            frequency,
            tools_provided_by: toolsProvidedBy,
          });
        } else if (r.error === 'out_of_area') {
          track(EVENTS.QUOTE_OUT_OF_AREA, { service_slug: serviceTypeSlug });
        }
      })();
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(debounceRef.current);
    };
  }, [selectedLocation, serviceTypeSlug, squareMeters, toolsProvidedBy, frequency, addressLabel]);

  // While a recompute is in flight, show the fresh client estimate for the
  // CURRENT controls (dimmed) instead of clinging to the stale server value.
  // Once settled, prefer the exact server result.
  const view: QuoteView | null = pending
    ? estimate
    : serverResult
      ? serverResult.ok && serverResult.quote
        ? {
            perVisitClp: serverResult.quote.totalClp,
            breakdown: serverResult.quote.breakdown,
            distanceKm: serverResult.quote.distanceKm,
            exact: true,
          }
        : null
      : estimate;

  // Only surface an error once the matching request has settled — never a stale
  // out-of-area/generic from a previous address while recomputing.
  const error: 'out_of_area' | 'generic' | null =
    !pending && serverResult && !serverResult.ok
      ? serverResult.error === 'out_of_area'
        ? 'out_of_area'
        : 'generic'
      : null;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_400px]">
      <div className="grid gap-4">
        {/* Step 1 — service */}
        <StepCard n={1} icon={Home} title={t('steps.service')}>
          <RadioGroup
            value={serviceTypeSlug}
            onValueChange={setServiceTypeSlug}
            className="grid gap-3 sm:grid-cols-2"
          >
            {serviceTypes.map((s) => {
              const selected = s.slug === serviceTypeSlug;
              const Icon = SERVICE_ICONS[s.slug] ?? Sparkles;
              return (
                <Label
                  key={s.id}
                  htmlFor={`svc-${s.slug}`}
                  className={cn(
                    'relative flex cursor-pointer flex-col gap-2 rounded-2xl border-2 p-4 transition-all',
                    selected
                      ? 'border-primary bg-accent/50 shadow-soft'
                      : 'border-input hover:border-primary/40 hover:bg-accent/30',
                  )}
                >
                  <RadioGroupItem id={`svc-${s.slug}`} value={s.slug} className="sr-only" />
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
                  <span className="text-primary text-sm font-bold">
                    {t('from_prefix')} {formatCLP(s.baseRateClp)}
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
        </StepCard>

        {/* Step 2 — size */}
        <StepCard n={2} icon={Ruler} title={t('steps.size')}>
          <div className="grid gap-4">
            <div className="flex items-end justify-between">
              <span className="text-muted-foreground text-xs">{t('size_hint')}</span>
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
                  onClick={() => setSquareMeters(p.m2)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    squareMeters === p.m2
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {t(`presets.${p.key}` as 'presets.studio')} · {p.m2} m²
                </button>
              ))}
            </div>
          </div>
        </StepCard>

        {/* Step 3 — address */}
        <StepCard n={3} icon={MapPin} title={t('steps.address')}>
          <AddressAutocomplete
            label={t('fields.address')}
            required
            onSelect={(s) => {
              setSelectedLocation(s);
              setAddressLabel(s.shortName + (s.commune ? `, ${s.commune}` : ''));
            }}
            onClear={() => setSelectedLocation(null)}
          />
        </StepCard>

        {/* Step 4 — tools */}
        <StepCard n={4} icon={Package} title={t('steps.tools')}>
          <RadioGroup
            value={toolsProvidedBy}
            onValueChange={(v) => setToolsProvidedBy(v as Tools)}
            className="grid gap-3 sm:grid-cols-2"
          >
            <ChoiceCard
              id="tools-customer"
              value="customer"
              icon={User}
              label={t('fields.tools_customer')}
              selected={toolsProvidedBy === 'customer'}
            />
            <ChoiceCard
              id="tools-company"
              value="company"
              icon={Truck}
              label={t('fields.tools_company')}
              selected={toolsProvidedBy === 'company'}
            />
          </RadioGroup>
        </StepCard>

        {/* Step 5 — frequency */}
        <StepCard n={5} icon={Repeat} title={t('steps.frequency')}>
          <RadioGroup
            value={frequency}
            onValueChange={(v) => setFrequency(v as Frequency)}
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
                      variant="lime"
                      className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px]"
                    >
                      {t('popular')}
                    </Badge>
                  )}
                  <span className="text-sm font-semibold">
                    {t(`fields.frequency_${f}` as 'fields.frequency_one_time')}
                  </span>
                  {pct > 0 ? (
                    <span className="bg-lime text-lime-foreground rounded-full px-2 py-0.5 text-[10px] font-bold">
                      −{pct}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-[10px]">{t('one_time_hint')}</span>
                  )}
                </Label>
              );
            })}
          </RadioGroup>
        </StepCard>
      </div>

      {/* Live quote — sticky */}
      <div className="animate-fade-in-up grid content-start gap-4 [animation-delay:120ms] lg:sticky lg:top-24 lg:self-start">
        <QuoteResult
          view={view}
          frequency={frequency}
          pending={pending}
          error={error}
          config={config}
          cta={{
            serviceTypeId: serviceType?.id,
            serviceTypeSlug,
            squareMeters,
            toolsProvidedBy,
            addressLine: selectedLocation?.shortName,
            commune: selectedLocation?.commune,
            lat: selectedLocation?.lat,
            lng: selectedLocation?.lng,
          }}
        />
        {error === 'out_of_area' && (
          <OutOfAreaLeadForm
            serviceSlug={serviceTypeSlug}
            squareMeters={squareMeters}
            addressLine={addressLabel}
            commune={selectedLocation?.commune}
          />
        )}
      </div>
    </div>
  );
}

function StepCard({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: number;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      className="shadow-soft animate-fade-in-up border-border/60"
      style={{ animationDelay: `${n * 60}ms` }}
    >
      <CardContent className="grid gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
            {n}
          </span>
          <div className="flex items-center gap-2">
            <Icon className="text-secondary h-4 w-4" />
            <h3 className="font-display text-base font-semibold">{title}</h3>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function ChoiceCard({
  id,
  value,
  icon: Icon,
  label,
  selected,
}: {
  id: string;
  value: string;
  icon: LucideIcon;
  label: string;
  selected: boolean;
}) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 transition-all',
        selected
          ? 'border-primary bg-accent/50 shadow-soft'
          : 'border-input hover:border-primary/40 hover:bg-accent/30',
      )}
    >
      <RadioGroupItem id={id} value={value} className="sr-only" />
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
          selected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-medium">{label}</span>
      {selected && <Check className="text-primary ml-auto h-4 w-4" />}
    </Label>
  );
}
