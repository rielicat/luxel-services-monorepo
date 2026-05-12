'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { AddressAutocomplete } from '@/components/address-autocomplete';
import { QuoteResult } from './quote-result';
import { getQuoteAction, type QuoteActionResult } from './actions';
import type { ServiceType } from '@luxel/shared';
import type { GeocodeSuggestion } from '@/app/api/geocode/route';

type Frequency = 'one_time' | 'weekly' | 'biweekly' | 'monthly';
type Tools = 'customer' | 'company';

const FREQUENCIES: Frequency[] = ['one_time', 'weekly', 'biweekly', 'monthly'];

export function CalculatorForm({ serviceTypes }: { serviceTypes: ServiceType[] }) {
  const t = useTranslations('calculator');
  const tService = useTranslations('service');
  const [pending, startTransition] = useTransition();

  const [serviceTypeSlug, setServiceTypeSlug] = useState(serviceTypes[0]?.slug ?? 'regular');
  const [squareMeters, setSquareMeters] = useState(60);
  const [selectedLocation, setSelectedLocation] = useState<GeocodeSuggestion | null>(null);
  const [addressLabel, setAddressLabel] = useState('');
  const [toolsProvidedBy, setToolsProvidedBy] = useState<Tools>('customer');
  const [frequency, setFrequency] = useState<Frequency>('one_time');
  const [result, setResult] = useState<QuoteActionResult | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const r = await getQuoteAction({
        serviceTypeSlug,
        squareMeters,
        address: addressLabel,
        lat: selectedLocation?.lat,
        lng: selectedLocation?.lng,
        toolsProvidedBy,
        frequency,
      });
      setResult(r);
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-6">
            {/* Service type */}
            <div className="grid gap-3">
              <Label>{t('fields.service_type')}</Label>
              <RadioGroup
                value={serviceTypeSlug}
                onValueChange={setServiceTypeSlug}
                className="grid gap-2 sm:grid-cols-3"
              >
                {serviceTypes.map((s) => (
                  <Label
                    key={s.id}
                    htmlFor={`svc-${s.slug}`}
                    className="border-input hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-accent/40 flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors"
                  >
                    <RadioGroupItem id={`svc-${s.slug}`} value={s.slug} className="mt-0.5" />
                    <div>
                      <p className="font-medium">{tService(`${s.slug}.name` as 'regular.name')}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {tService(`${s.slug}.desc` as 'regular.desc')}
                      </p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {/* Square meters */}
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between">
                <Label>{t('fields.square_meters')}</Label>
                <span className="text-sm font-medium tabular-nums">{squareMeters} m²</span>
              </div>
              <Slider
                min={20}
                max={300}
                step={5}
                value={[squareMeters]}
                onValueChange={(v) => setSquareMeters(v[0]!)}
              />
            </div>

            {/* Address autocomplete */}
            <AddressAutocomplete
              label={t('fields.address')}
              placeholder="General Jofré 70"
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
                className="grid gap-2 sm:grid-cols-2"
              >
                <Label
                  htmlFor="tools-customer"
                  className="border-input hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-accent/40 flex cursor-pointer items-center gap-2 rounded-md border p-3"
                >
                  <RadioGroupItem id="tools-customer" value="customer" />
                  <span>{t('fields.tools_customer')}</span>
                </Label>
                <Label
                  htmlFor="tools-company"
                  className="border-input hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-accent/40 flex cursor-pointer items-center gap-2 rounded-md border p-3"
                >
                  <RadioGroupItem id="tools-company" value="company" />
                  <span>{t('fields.tools_company')}</span>
                </Label>
              </RadioGroup>
            </div>

            {/* Frequency */}
            <div className="grid gap-3">
              <Label>{t('fields.frequency')}</Label>
              <RadioGroup
                value={frequency}
                onValueChange={(v) => setFrequency(v as Frequency)}
                className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
              >
                {FREQUENCIES.map((f) => (
                  <Label
                    key={f}
                    htmlFor={`freq-${f}`}
                    className="border-input hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-accent/40 flex cursor-pointer items-center gap-2 rounded-md border p-3"
                  >
                    <RadioGroupItem id={`freq-${f}`} value={f} />
                    <span className="text-sm">
                      {t(`fields.frequency_${f}` as 'fields.frequency_one_time')}
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <Button type="submit" disabled={pending} className="sm:w-fit">
              Cotizar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <QuoteResult result={result} pending={pending} frequency={frequency} />
      </div>
    </div>
  );
}
