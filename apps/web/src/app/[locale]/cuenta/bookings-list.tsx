import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCLP } from '@/lib/utils';

interface Booking {
  id: string;
  scheduled_date: string;
  timeblock: 'manana' | 'tarde';
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  total_price_clp: number;
  square_meters: number;
}

const STATUS_LABEL: Record<Booking['status'], string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const STATUS_VARIANT: Record<
  Booking['status'],
  'default' | 'secondary' | 'success' | 'warning' | 'destructive'
> = {
  pending: 'warning',
  confirmed: 'default',
  in_progress: 'default',
  completed: 'success',
  cancelled: 'destructive',
};

export function BookingsList({ bookings }: { bookings: Booking[] }) {
  const t = useTranslations('calendar');

  if (bookings.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-6 text-sm">
          Aún no tienes reservas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {bookings.map((b) => (
        <Card key={b.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">
                {new Intl.DateTimeFormat('es-CL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  // scheduled_date is a pure calendar date (no time); render it in
                  // UTC so a UTC-parsed midnight isn't shifted back a day by the
                  // local timezone.
                  timeZone: 'UTC',
                }).format(new Date(b.scheduled_date))}
              </p>
              <p className="text-muted-foreground text-sm">
                {t(`timeblock_${b.timeblock}` as 'timeblock_manana')} · {b.square_meters} m²
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium tabular-nums">
                {formatCLP(b.total_price_clp)}
              </span>
              <Badge variant={STATUS_VARIANT[b.status]}>{STATUS_LABEL[b.status]}</Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
