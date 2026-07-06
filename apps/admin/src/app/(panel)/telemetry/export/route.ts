import { requireAdmin } from '@/lib/admin';
import { getEventsForExport } from '@/lib/stats';

export const dynamic = 'force-dynamic';

function cell(v: unknown): string {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return new Response('Unauthorized', { status: 403 });

  const url = new URL(req.url);
  const event = url.searchParams.get('event') || undefined;
  const days = Math.min(Math.max(1, Number(url.searchParams.get('days')) || 30), 365);

  const rows = await getEventsForExport(event, days);

  const header = [
    'created_at',
    'event',
    'source',
    'path',
    'session_id',
    'anon_id',
    'country',
    'properties',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [r.created_at, r.event, r.source, r.path, r.session_id, r.anon_id, r.country, r.properties]
        .map(cell)
        .join(','),
    );
  }

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="luxel-events-${days}d.csv"`,
      'cache-control': 'no-store',
    },
  });
}
