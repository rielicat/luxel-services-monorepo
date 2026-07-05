'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Zap } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatCLP } from '@/lib/utils';
import type { ServiceType } from '@luxel/shared';
import type { PricingConfig } from '@luxel/pricing';
import type { GeocodeSuggestion } from '@/app/api/geocode/route';

const FREQUENCIES: Frequency[] = ['one_time', 'weekly', 'biweekly', 'monthly'];

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
    <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
      <Card className="shadow-soft animate-fade-in-up">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">{t('title')}</CardTitle>
          <p className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
            <Zap className="text-secondary h-3.5 w-3.5" /> {t('realtime_hint')}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-7">
            {/* Service type */}
            <div className="grid gap-3">
              <Label>{t('fields.service_type')}</Label>
              <RadioGroup
                value={serviceTypeSlug}
                onValueChange={setServiceTypeSlug}
                className="grid gap-2.5 sm:grid-cols-3"
              >
                {serviceTypes.map((s) => (
                  <Label
                    key={s.id}
                    htmlFor={`svc-${s.slug}`}
                    className="border-input hover:border-primary/40 hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/50 has-[:checked]:shadow-soft flex cursor-pointer flex-col gap-1 rounded-xl border p-3.5 transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <RadioGroupItem id={`svc-${s.slug}`} value={s.slug} />
                      <span className="font-medium">
                        {tService(`${s.slug}.name` as 'regular.name')}
                      </span>
                    </div>
                    <span className="text-muted-foreground pl-6 text-xs">
                      {tService(`${s.slug}.desc` as 'regular.desc')}
                    </span>
                    <span className="text-primary pl-6 text-xs font-semibold">
                      {t('from_prefix')} {formatCLP(s.baseRateClp)}
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {/* Square meters */}
            <div className="grid gap-3">
              <div className="flex items-baseline justify-between">
                <Label>{t('fields.square_meters')}</Label>
                <span className="text-primary font-display text-lg font-bold tabular-nums">
                  {squareMeters} m²
                </span>
              </div>
              <Slider
                min={20}
                max={300}
                step={5}
                value={[squareMeters]}
                onValueChange={(v) => setSquareMeters(v[0]!)}
              />
            </div>

            {/* Address */}
            <AddressAutocomplete
              label={t('fields.address')}
              required
              onSelect={(s) => {
                setSelectedLocation(s);
                setAddressLabel(s.shortName + (s.commune ? `, ${s.commune}` : ''));
              }}
              onClear={() => setSelectedLocation(null)}
            />

            {/* Tools */}
            <div className="grid gap-3">
              <Label>{t('fields.tools')}</Label>
              <RadioGroup
                value={toolsProvidedBy}
                onValueChange={(v) => setToolsProvidedBy(v as Tools)}
                className="grid gap-2.5 sm:grid-cols-2"
              >
                <ChoiceCard
                  id="tools-customer"
                  value="customer"
                  label={t('fields.tools_customer')}
                />
                <ChoiceCard id="tools-company" value="company" label={t('fields.tools_company')} />
              </RadioGroup>
            </div>

            {/* Frequency */}
            <div className="grid gap-3">
              <Label>{t('fields.frequency')}</Label>
              <RadioGroup
                value={frequency}
                onValueChange={(v) => setFrequency(v as Frequency)}
                className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
              >
                {FREQUENCIES.map((f) => {
                  const pct = discountPct(f, config);
                  return (
                    <Label
                      key={f}
                      htmlFor={`freq-${f}`}
                      className="border-input hover:border-primary/40 hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/50 flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-3 transition-all"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <RadioGroupItem id={`freq-${f}`} value={f} />
                        {t(`fields.frequency_${f}` as 'fields.frequency_one_time')}
                      </span>
                      {pct > 0 && (
                        <span className="bg-lime text-lime-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                          −{pct}%
                        </span>
                      )}
                    </Label>
                  );
                })}
              </RadioGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="animate-fade-in-up grid content-start gap-4 [animation-delay:120ms] lg:sticky lg:top-24 lg:self-start">
        <QuoteResult
          view={view}
          frequency={frequency}
          pending={pending}
          error={error}
          config={config}
          cta={{ serviceTypeId: serviceType?.id, squareMeters }}
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

function ChoiceCard({ id, value, label }: { id: string; value: string; label: string }) {
  return (
    <Label
      htmlFor={id}
      className="border-input hover:border-primary/40 hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/50 flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 transition-all"
    >
      <RadioGroupItem id={id} value={value} />
      <span className="text-sm">{label}</span>
    </Label>
  );
}
