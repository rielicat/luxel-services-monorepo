'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarCheck, Repeat, User, Truck, Check } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ServiceType } from '@luxel/shared';
import { fetchAvailabilityAction, type DayAvailabilityDTO } from '../calendario/actions';
import { createBookingAction } from './actions';
import { track } from '@/lib/analytics/client';
import { EVENTS } from '@/lib/analytics/events';

type PlanFrequency = 'weekly' | 'biweekly' | 'monthly';
const PLAN_FREQS: PlanFrequency[] = ['weekly', 'biweekly', 'monthly'];

interface Props {
  serviceTypes: ServiceType[];
  operationPointId: string;
  initial: {
    serviceTypeId?: string;
    frequency?: 'one_time' | 'weekly' | 'biweekly' | 'monthly';
    squareMeters?: number;
    toolsProvidedBy?: 'customer' | 'company';
    addressLine?: string;
    commune?: string;
  };
}

export function BookingForm({ serviceTypes, operationPointId, initial }: Props) {
  const t = useTranslations('booking');
  const tCal = useTranslations('calendar');
  const tCalc = useTranslations('calculator.fields');
  const tService = useTranslations('service');
  const tErr = useTranslations('errors');

  const initFreq = initial.frequency ?? 'one_time';
  const [bookingType, setBookingType] = useState<'individual' | 'plan'>(
    initFreq === 'one_time' ? 'individual' : 'plan',
  );
  const [planFrequency, setPlanFrequency] = useState<PlanFrequency>(
    initFreq !== 'one_time' ? initFreq : 'weekly',
  );
  const effectiveFrequency = bookingType === 'individual' ? 'one_time' : planFrequency;

  const [serviceTypeId, setServiceTypeId] = useState(
    initial.serviceTypeId ?? serviceTypes[0]?.id ?? '',
  );
  const [toolsProvidedBy, setToolsProvidedBy] = useState<'customer' | 'company'>(
    initial.toolsProvidedBy ?? 'customer',
  );

  const [date, setDate] = useState<Date | undefined>();
  const [timeblock, setTimeblock] = useState<'manana' | 'tarde' | null>(null);
  const [availability, setAvailability] = useState<DayAvailabilityDTO | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    if (!date || !timeblock) return;
    const fd = new FormData(e.currentTarget);
    fd.set('scheduledDate', date.toISOString().slice(0, 10));
    fd.set('timeblock', timeblock);
    fd.set('frequency', effectiveFrequency);
    fd.set('serviceTypeId', serviceTypeId);
    fd.set('toolsProvidedBy', toolsProvidedBy);
    startTransition(async () => {
      const r = await createBookingAction(fd);
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
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-2">
      <div className="grid content-start gap-6">
        {/* Individual vs plan */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('type_title')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TypeCard
                active={bookingType === 'individual'}
                onClick={() => setBookingType('individual')}
                icon={CalendarCheck}
                title={t('individual')}
                desc={t('individual_desc')}
              />
              <TypeCard
                active={bookingType === 'plan'}
                onClick={() => setBookingType('plan')}
                icon={Repeat}
                title={t('plan')}
                desc={t('plan_desc')}
              />
            </div>
            {bookingType === 'plan' && (
              <div className="animate-fade-in-up grid gap-2">
                <Label className="text-muted-foreground text-xs">{t('plan_frequency')}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PLAN_FREQS.map((f) => (
                    <button
                      type="button"
                      key={f}
                      onClick={() => setPlanFrequency(f)}
                      className={cn(
                        'rounded-xl border p-2 text-sm font-medium transition-colors',
                        planFrequency === f
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-input text-muted-foreground hover:border-primary/40',
                      )}
                    >
                      {tCalc(`frequency_${f}` as 'frequency_weekly')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service details (prefilled from the quote) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('details_title')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>{tCalc('service_type')}</Label>
              <RadioGroup
                value={serviceTypeId}
                onValueChange={setServiceTypeId}
                className="grid gap-2 sm:grid-cols-2"
              >
                {serviceTypes.map((s) => (
                  <Label
                    key={s.id}
                    htmlFor={`svc-${s.id}`}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-xl border-2 p-3 text-sm transition-all',
                      serviceTypeId === s.id
                        ? 'border-primary bg-accent/40'
                        : 'border-input hover:border-primary/40',
                    )}
                  >
                    <RadioGroupItem id={`svc-${s.id}`} value={s.id} className="sr-only" />
                    <span className="font-medium">
                      {tService(`${s.slug}.name` as 'regular.name')}
                    </span>
                    {serviceTypeId === s.id && <Check className="text-primary ml-auto h-4 w-4" />}
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="addressLine">{t('address_line')}</Label>
                <Input
                  id="addressLine"
                  name="addressLine"
                  required
                  defaultValue={initial.addressLine}
                  placeholder="Av. Providencia 123"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="commune">{tCalc('commune')}</Label>
                <Input
                  id="commune"
                  name="commune"
                  required
                  defaultValue={initial.commune}
                  placeholder="Providencia"
                />
              </div>
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
              <RadioGroup
                value={toolsProvidedBy}
                onValueChange={(v) => setToolsProvidedBy(v as 'customer' | 'company')}
                className="grid gap-2 sm:grid-cols-2"
              >
                <ToolCard
                  value="customer"
                  icon={User}
                  label={tCalc('tools_customer')}
                  active={toolsProvidedBy === 'customer'}
                />
                <ToolCard
                  value="company"
                  icon={Truck}
                  label={tCalc('tools_company')}
                  active={toolsProvidedBy === 'company'}
                />
              </RadioGroup>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('date_title')}</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              disabled={{ before: new Date() }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            {!date && <p className="text-muted-foreground text-sm">{tCal('select_date')}</p>}
            {date && !availability && (
              <p className="text-muted-foreground text-sm">{t('loading_availability')}</p>
            )}
            {date && availability && (
              <div className="grid gap-3">
                <h3 className="text-sm font-medium">{tCal('available_blocks')}</h3>
                <div className="grid gap-2">
                  {availability.timeblocks.map((b) => (
                    <button
                      key={b.timeblock}
                      type="button"
                      disabled={b.available === 0}
                      onClick={() => setTimeblock(b.timeblock)}
                      className={cn(
                        'flex items-center justify-between rounded-xl border p-3 text-left transition-colors',
                        timeblock === b.timeblock ? 'border-primary bg-accent/40' : 'border-border',
                        b.available === 0 ? 'opacity-50' : 'hover:bg-muted/50',
                      )}
                    >
                      <span>{tCal(`timeblock_${b.timeblock}` as 'timeblock_manana')}</span>
                      {b.available > 0 ? (
                        <Badge variant="success">
                          {b.available} {t('slots')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{t('no_slots')}</Badge>
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
            <CardTitle className="text-base">{t('payment_title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              name="paymentProvider"
              defaultValue="mercadopago"
              required
              className="grid gap-2 sm:grid-cols-2"
            >
              <Label className="border-input has-[:checked]:border-primary has-[:checked]:bg-accent/40 flex cursor-pointer items-center gap-2 rounded-xl border p-3">
                <RadioGroupItem value="mercadopago" /> MercadoPago
              </Label>
              <Label className="border-input has-[:checked]:border-primary has-[:checked]:bg-accent/40 flex cursor-pointer items-center gap-2 rounded-xl border p-3">
                <RadioGroupItem value="stripe" /> Tarjeta (Stripe)
              </Label>
            </RadioGroup>
          </CardContent>
        </Card>

        <Button type="submit" disabled={pending || !date || !timeblock} size="lg">
          {pending ? t('submitting') : t('submit')}
        </Button>

        {submitError && <p className="text-destructive text-sm">{submitError}</p>}
      </div>
    </form>
  );
}

function TypeCard({
  active,
  onClick,
  icon: Icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CalendarCheck;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-2xl border-2 p-3.5 text-left transition-all',
        active
          ? 'border-primary bg-accent/50 shadow-soft'
          : 'border-input hover:border-primary/40 hover:bg-accent/30',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          active ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="grid gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground text-xs leading-snug">{desc}</span>
      </span>
    </button>
  );
}

function ToolCard({
  value,
  icon: Icon,
  label,
  active,
}: {
  value: string;
  icon: typeof User;
  label: string;
  active: boolean;
}) {
  return (
    <Label
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-xl border-2 p-3 text-sm transition-all',
        active ? 'border-primary bg-accent/40' : 'border-input hover:border-primary/40',
      )}
    >
      <RadioGroupItem value={value} className="sr-only" />
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          active ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="font-medium">{label}</span>
    </Label>
  );
}
