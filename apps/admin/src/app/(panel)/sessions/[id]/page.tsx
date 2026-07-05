import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionEvents } from '@/lib/stats';
import { fmtDateTime } from '@/lib/utils';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const events = await getSessionEvents(id);
  const first = events[0];
  const last = events[events.length - 1];

  return (
    <div>
      <Link
        href="/sessions"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Sesiones
      </Link>

      <h1 className="font-display text-xl font-extrabold tracking-tight">
        Sesión <span className="font-mono text-base">{id.slice(0, 12)}…</span>
      </h1>
      <p className="text-muted-foreground text-sm">
        {events.length} eventos
        {first && last && ` · ${fmtDateTime(first.created_at)} → ${fmtDateTime(last.created_at)}`}
        {first?.country && ` · ${first.country}`}
      </p>

      <Card className="mt-6">
        <div className="p-5">
          <ol className="border-border relative ml-3 border-l">
            {events.map((e) => (
              <li key={e.id} className="mb-5 ml-6 last:mb-0">
                <span className="bg-primary ring-background absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ring-4" />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-sm font-semibold">{e.event}</span>
                  <span className="text-muted-foreground text-xs">{fmtDateTime(e.created_at)}</span>
                  <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-[10px]">
                    {e.source}
                  </span>
                </div>
                {e.path && <div className="text-muted-foreground font-mono text-xs">{e.path}</div>}
                {e.properties && Object.keys(e.properties).length > 0 && (
                  <pre className="text-muted-foreground bg-muted/60 mt-1 max-w-full overflow-x-auto rounded p-2 text-[11px]">
                    {JSON.stringify(e.properties, null, 0)}
                  </pre>
                )}
              </li>
            ))}
            {!events.length && <li className="text-muted-foreground ml-6 text-sm">Sin eventos.</li>}
          </ol>
        </div>
      </Card>
    </div>
  );
}
