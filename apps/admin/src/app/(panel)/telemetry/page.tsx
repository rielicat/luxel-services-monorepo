import Link from 'next/link';
import { Activity, Download } from 'lucide-react';
import { getEvents, getEventNames } from '@/lib/stats';
import { fmtDateTime } from '@/lib/utils';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const DAY_OPTIONS = [7, 30, 90];

export default async function TelemetryPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; days?: string }>;
}) {
  const sp = await searchParams;
  const event = sp.event;
  const days = DAY_OPTIONS.includes(Number(sp.days)) ? Number(sp.days) : 30;

  const [events, names] = await Promise.all([getEvents(event, 200, days), getEventNames(days)]);

  const href = (next: { event?: string; days?: number }) => {
    const q = new URLSearchParams();
    if (next.event) q.set('event', next.event);
    if (next.days && next.days !== 30) q.set('days', String(next.days));
    const s = q.toString();
    return `/telemetry${s ? `?${s}` : ''}`;
  };
  const exportHref = `/telemetry/export?days=${days}${event ? `&event=${encodeURIComponent(event)}` : ''}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Activity className="text-primary h-5 w-5" /> Telemetría
          </h1>
          <p className="text-muted-foreground text-sm">
            Registro de eventos (owned store) · últimos {days} días
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="border-border inline-flex rounded-lg border p-0.5">
            {DAY_OPTIONS.map((n) => (
              <Link
                key={n}
                href={href({ event, days: n })}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  n === days
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {n}d
              </Link>
            ))}
          </div>
          <a
            href={exportHref}
            className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </a>
        </div>
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip href={href({ days })} active={!event} label="Todos" />
        {names.map((n) => (
          <FilterChip key={n} href={href({ event: n, days })} active={event === n} label={n} />
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left text-xs uppercase">
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="px-4 py-3 font-medium">Ruta</th>
                <th className="px-4 py-3 font-medium">Sesión</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Propiedades</th>
                <th className="px-4 py-3 font-medium">Hora</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-border/60 hover:bg-muted/40 border-b">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{e.event}</td>
                  <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
                    {e.path ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {e.session_id ? (
                      <Link
                        href={`/sessions/${e.session_id}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {e.session_id.slice(0, 8)}…
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs">{e.source}</td>
                  <td className="text-muted-foreground max-w-xs truncate px-4 py-3 font-mono text-[11px]">
                    {e.properties && Object.keys(e.properties).length
                      ? JSON.stringify(e.properties)
                      : '—'}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs">
                    {fmtDateTime(e.created_at)}
                  </td>
                </tr>
              ))}
              {!events.length && (
                <tr>
                  <td colSpan={6} className="text-muted-foreground px-4 py-10 text-center">
                    Sin eventos en este rango.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full border px-3 py-1 font-mono text-xs transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-transparent'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {label}
    </Link>
  );
}
