'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import type { ServiceType } from '@luxel/shared';
import { fetchAvailabilityAction, type DayAvailabilityDTO } from '../calendario/actions';
import { createBookingAction } from './actions';

interface Props {
  serviceTypes: ServiceType[];
  operationPointId: string;
  initial: {
    serviceTypeId?: string;
    frequency?: 'one_time' | 'weekly' | 'biweekly' | 'monthly';
    squareMeters?: number;
  };
}

export function BookingForm({ serviceTypes, operationPointId, initial }: Props) {
  const t = useTranslations('calendar');
  const tCalc = useTranslations('calculator.fields');
  const tErr = useTranslations('errors');

  const [date, setDate] = useState<Date | undefined>();
  const [timeblock, setTimeblock] = useState<'manana' | 'tarde' | null>(null);
  const [availability, setAvailability] = useState<DayAvailabilityDTO | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;
    const iso = date.toISOString().slice(0, 10);
    setAvailability(null);
    setTimeblock(null);
    fetchAvailabilityAction(iso, operationPointId).then(setAvailability);
  }, [date, operationPointId]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    if (!date || !timeblock) return;
    const fd = new FormData(e.currentTarget);
    fd.set('scheduledDate', date.toISOString().slice(0, 10));
    fd.set('timeblock', timeblock);
    startTransition(async () => {
      const r = await createBookingAction(fd);
      // On success, the action redirects — we only see this branch on error.
      if (r && !r.ok) {
        setSubmitError(
          r.error === 'no_availability'
            ? 'Ese bloque ya no tiene cupos. Elige otro.'
            : r.error === 'out_of_area'
              ? tErr('out_of_service_area')
              : r.error === 'unauthorized'
                ? tErr('unauthorized')
                : tErr('generic'),
        );
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-2">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tCalc('service_type')}</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              name="serviceTypeId"
              defaultValue={initial.serviceTypeId ?? serviceTypes[0]?.id}
              required
              className="grid gap-2"
            >
              {serviceTypes.map((s) => (
                <Label
                  key={s.id}
                  htmlFor={`svc-${s.id}`}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-input p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40"
                >
                  <RadioGroupItem id={`svc-${s.id}`} value={s.id} />
                  <span>{s.slug}</span>
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 p-6">
            <div className="grid gap-2">
              <Label htmlFor="addressLine">Dirección</Label>
              <Input id="addressLine" name="addressLine" required placeholder="Av. Providencia 123" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="commune">Comuna</Label>
              <Input id="commune" name="commune" required placeholder="Providencia" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="squareMeters">{tCalc('square_meters')}</Label>
              <Input
                id="squareMeters"
                name="squareMeters"
                type="number"
                min={20}
                max={2000}
                required
                defaultValue={initial.squareMeters ?? 60}
              />
            </div>
            <div className="grid gap-2">
              <Label>{tCalc('tools')}</Label>
              <RadioGroup name="toolsProvidedBy" defaultValue="customer" required className="grid gap-2 sm:grid-cols-2">
                <Label className="flex cursor-pointer items-center gap-2 rounded-md border border-input p-2 has-[:checked]:border-primary has-[:checked]:bg-accent/40">
                  <RadioGroupItem value="customer" /> {tCalc('tools_customer')}
                </Label>
                <Label className="flex cursor-pointer items-center gap-2 rounded-md border border-input p-2 has-[:checked]:border-primary has-[:checked]:bg-accent/40">
                  <RadioGroupItem value="company" /> {tCalc('tools_company')}
                </Label>
              </RadioGroup>
            </div>
            <input type="hidden" name="frequency" value={initial.frequency ?? 'one_time'} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('select_date')}</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <Calendar mode="single" selected={date} onSelect={setDate} disabled={{ before: new Date() }} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            {!date && <p className="text-sm text-muted-foreground">{t('select_date')}</p>}
            {date && !availability && (
              <p className="text-sm text-muted-foreground">Cargando disponibilidad…</p>
            )}
            {date && availability && (
              <div className="grid gap-3">
                <h3 className="text-sm font-medium">{t('available_blocks')}</h3>
                <div className="grid gap-2">
                  {availability.timeblocks.map((b) => (
                    <button
                      key={b.timeblock}
                      type="button"
                      disabled={b.available === 0}
                      onClick={() => setTimeblock(b.timeblock)}
                      className={`flex items-center justify-between rounded-md border p-3 text-left transition-colors ${
                        timeblock === b.timeblock
                          ? 'border-primary bg-accent/40'
                          : 'border-border'
                      } ${b.available === 0 ? 'opacity-50' : 'hover:bg-muted/50'}`}
                    >
                      <span>{t(`timeblock_${b.timeblock}` as 'timeblock_manana')}</span>
                      {b.available > 0 ? (
                        <Badge variant="success">{b.available} cupos</Badge>
                      ) : (
                        <Badge variant="secondary">Sin cupos</Badge>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pago</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup name="paymentProvider" defaultValue="mercadopago" required className="grid gap-2 sm:grid-cols-2">
              <Label className="flex cursor-pointer items-center gap-2 rounded-md border border-input p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40">
                <RadioGroupItem value="mercadopago" /> MercadoPago
              </Label>
              <Label className="flex cursor-pointer items-center gap-2 rounded-md border border-input p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40">
                <RadioGroupItem value="stripe" /> Tarjeta (Stripe)
              </Label>
            </RadioGroup>
          </CardContent>
        </Card>

        <Button type="submit" disabled={pending || !date || !timeblock} size="lg">
          {pending ? 'Procesando…' : 'Confirmar y pagar'}
        </Button>

        {submitError && <p className="text-sm text-destructive">{submitError}</p>}
      </div>
    </form>
  );
}
