import Link from 'next/link';
import { Radio, Users, Activity, Eye, AlertTriangle } from 'lucide-react';
import { getDashboard } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { Card, SectionTitle } from '@/components/ui';
import { BarChart } from '@/components/bar-chart';

export const dynamic = 'force-dynamic';

const DAY_OPTIONS = [7, 30, 90];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;
  const days = DAY_OPTIONS.includes(Number(daysParam)) ? Number(daysParam) : 30;
  const d = await getDashboard(days);

  const chartData = d.daily.map((x) => ({
    label: new Intl.DateTimeFormat('es-CL', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(x.day)),
    value: x.count,
  }));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            Panel de operación
          </h1>
          <p className="text-muted-foreground text-sm">Últimos {d.days} días</p>
        </div>
        <DayRange active={days} basePath="/" />
      </div>

      {d.error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">No se pudo leer la base de datos.</p>
            <p className="text-destructive/90 mt-0.5">
              Suele deberse a que las migraciones de Supabase no están aplicadas en este entorno o a
              que faltan las variables{' '}
              <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> /{' '}
              <code className="font-mono text-xs">SUPABASE_SECRET_KEY</code>. Detalle:{' '}
              <span className="font-mono text-xs">{d.error}</span>
            </p>
          </div>
        </div>
      )}

      {!d.error && d.traffic.events === 0 && (
        <div className="border-warning/30 bg-warning/10 text-warning mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Conexión OK, pero sin eventos en este período.</p>
            <p className="text-warning/90 mt-0.5">
              Si el sitio ya recibe tráfico, verifica que la base de datos de producción tenga las
              migraciones de <code className="font-mono text-xs">supabase/migrations/</code>{' '}
              aplicadas y que el sitio web (no solo el panel) tenga sus variables de Supabase para
              escribir eventos.
            </p>
          </div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<Users className="h-5 w-5" />}
          label="Visitantes únicos"
          value={String(d.traffic.visitors)}
          sub={`${d.traffic.sessions} sesiones`}
        />
        <Kpi
          icon={<Eye className="h-5 w-5" />}
          label="Páginas vistas"
          value={String(d.traffic.pageviews)}
          sub={`${d.traffic.events} eventos`}
        />
        <Kpi
          icon={<Radio className="h-5 w-5" />}
          label="Leads"
          value={String(d.leads.total)}
          sub={`${d.leads.new} nuevos`}
        />
        <Kpi
          icon={<Activity className="h-5 w-5" />}
          label="Eventos"
          value={String(d.traffic.events)}
          sub={`${d.traffic.pageviews} páginas vistas`}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="p-5">
            <SectionTitle>
              <Activity className="text-primary h-4 w-4" /> Tráfico (eventos / día)
            </SectionTitle>
            <div className="mt-4">
              {chartData.length ? (
                <BarChart data={chartData} />
              ) : (
                <p className="text-muted-foreground py-10 text-center text-sm">Aún no hay datos.</p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-5">
            <SectionTitle>Eventos más frecuentes</SectionTitle>
            <div className="mt-4 grid gap-1.5 text-sm">
              {d.eventCounts.slice(0, 8).map((e) => (
                <div key={e.event} className="flex items-center justify-between">
                  <span className="text-muted-foreground truncate font-mono text-xs">
                    {e.event}
                  </span>
                  <span className="font-medium tabular-nums">{e.count}</span>
                </div>
              ))}
              {!d.eventCounts.length && <p className="text-muted-foreground">Sin eventos aún.</p>}
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

function DayRange({ active, basePath }: { active: number; basePath: string }) {
  return (
    <div className="border-border inline-flex rounded-lg border p-0.5">
      {DAY_OPTIONS.map((n) => (
        <Link
          key={n}
          href={`${basePath}?days=${n}`}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            n === active
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {n}d
        </Link>
      ))}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <div className="p-5">
        <div className="text-primary bg-accent flex h-9 w-9 items-center justify-center rounded-lg">
          {icon}
        </div>
        <p className="text-muted-foreground mt-3 text-xs font-medium uppercase tracking-wide">
          {label}
        </p>
        <p className="font-display mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>
      </div>
    </Card>
  );
}
