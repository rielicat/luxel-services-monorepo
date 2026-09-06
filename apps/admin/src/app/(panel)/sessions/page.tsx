import Link from 'next/link';
import { Users2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { getSessions } from '@/lib/stats';
import { fmtDateTime, relativeTime } from '@/lib/utils';
import { DataTable, EmptyRow, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  const sessions = await getSessions(30, 100);
  const converted = sessions.filter((s) => s.converted).length;

  return (
    <div>
      <PageHeader icon={Users2} title="Sesiones">
        {sessions.length} sesiones · {converted} convirtieron · últimos 30 días
      </PageHeader>

      <DataTable
        head={[
          'Sesión',
          'Recorrido',
          'Eventos',
          'Inicio',
          'Actividad',
          <span key="conv" className="sr-only">
            Conversión
          </span>,
        ]}
      >
        {sessions.map((s) => (
          <tr key={s.session_id} className="border-border/60 hover:bg-muted/40 border-b">
            <td className="px-4 py-3">
              <Link
                href={`/sessions/${s.session_id}`}
                className="font-mono text-xs hover:underline"
              >
                {s.session_id.slice(0, 8)}…
              </Link>
              {s.distinct_id && !s.distinct_id.startsWith('anon') && (
                <div className="text-muted-foreground text-[10px]">
                  {s.distinct_id.startsWith('user_') ? 'registrado' : ''}
                </div>
              )}
            </td>
            <td className="px-4 py-3">
              <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
                <span className="max-w-[120px] truncate">{s.first_path ?? '—'}</span>
                <ArrowRight className="h-3 w-3 shrink-0" />
                <span className="max-w-[120px] truncate">{s.last_path ?? '—'}</span>
              </span>
            </td>
            <td className="px-4 py-3 tabular-nums">{s.events}</td>
            <td className="text-muted-foreground px-4 py-3 text-xs">{fmtDateTime(s.started_at)}</td>
            <td className="text-muted-foreground px-4 py-3 text-xs">{relativeTime(s.last_at)}</td>
            <td className="px-4 py-3">
              {s.converted && (
                <span className="bg-success/15 text-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
                  <CheckCircle2 className="h-3 w-3" /> convirtió
                </span>
              )}
            </td>
          </tr>
        ))}
        {!sessions.length && <EmptyRow span={6}>Aún no hay sesiones.</EmptyRow>}
      </DataTable>
    </div>
  );
}
