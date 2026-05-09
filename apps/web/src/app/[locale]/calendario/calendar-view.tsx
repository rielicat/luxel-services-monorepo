'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchAvailabilityAction, type DayAvailabilityDTO } from './actions';

interface Props {
  operationPointId: string;
}

export function CalendarView({ operationPointId }: Props) {
  const t = useTranslations('calendar');
  const [selected, setSelected] = useState<Date | undefined>();
  const [availability, setAvailability] = useState<DayAvailabilityDTO | null>(null);
  const [pending, startTransition] = useTransition();

  const onSelect = (date: Date | undefined) => {
    setSelected(date);
    setAvailability(null);
    if (!date) return;
    const iso = date.toISOString().slice(0, 10);
    startTransition(async () => {
      const r = await fetchAvailabilityAction(iso, operationPointId);
      setAvailability(r);
    });
  };

  return (
    <div className="grid gap-8 md:grid-cols-[auto_1fr]">
      <Card className="w-fit">
        <CardContent className="p-0">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={onSelect}
            disabled={{ before: new Date() }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          {!selected && <p className="text-muted-foreground text-sm">{t('select_date')}</p>}
          {selected && pending && (
            <p className="text-muted-foreground text-sm">Cargando disponibilidad…</p>
          )}
          {selected && availability && availability.timeblocks.every((b) => b.available === 0) && (
            <p className="text-muted-foreground text-sm">{t('no_availability')}</p>
          )}
          {availability && availability.timeblocks.some((b) => b.available > 0) && (
            <div className="grid gap-3">
              <h3 className="text-sm font-medium">{t('available_blocks')}</h3>
              <div className="grid gap-2">
                {availability.timeblocks.map((b) => (
                  <div
                    key={b.timeblock}
                    className="border-border flex items-center justify-between rounded-md border p-3"
                  >
                    <span>{t(`timeblock_${b.timeblock}` as 'timeblock_manana')}</span>
                    {b.available > 0 ? (
                      <Badge variant="success">
                        {b.available} de {b.capacity} disponibles
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Sin cupos</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
