import { Radio } from 'lucide-react';
import { getLeads } from '@/lib/stats';
import { fmtDateTime } from '@/lib/utils';
import { DataTable, EmptyRow, PageHeader, Pill } from '@/components/ui';
import { LeadStatus } from '@/components/lead-status';

export const dynamic = 'force-dynamic';

const SOURCE_LABEL: Record<string, string> = {
  chat_handoff: 'Chat → humano',
  newsletter: 'Newsletter',
  contact: 'Contacto',
};

export default async function LeadsPage() {
  const leads = await getLeads();
  const counts = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader icon={Radio} title="Leads">
        {leads.length} en total · {counts.new ?? 0} nuevos · {counts.converted ?? 0} convertidos
      </PageHeader>

      <DataTable head={['Origen', 'Contacto', 'Comuna', 'Fecha', 'Estado']}>
        {leads.map((l) => (
          <tr key={l.id} className="border-border/60 hover:bg-muted/40 border-b">
            <td className="px-4 py-3">
              <Pill>{SOURCE_LABEL[l.source] ?? l.source}</Pill>
            </td>
            <td className="px-4 py-3">
              <div className="font-medium">{l.email ?? l.phone ?? '—'}</div>
              {l.email && l.phone && <div className="text-muted-foreground text-xs">{l.phone}</div>}
              {l.message && (
                <div className="text-muted-foreground max-w-xs truncate text-xs">{l.message}</div>
              )}
            </td>
            <td className="text-muted-foreground px-4 py-3">{l.commune ?? '—'}</td>
            <td className="text-muted-foreground px-4 py-3 text-xs">{fmtDateTime(l.created_at)}</td>
            <td className="px-4 py-3">
              <LeadStatus id={l.id} status={l.status} />
            </td>
          </tr>
        ))}
        {!leads.length && <EmptyRow span={5}>Aún no hay leads.</EmptyRow>}
      </DataTable>
    </div>
  );
}
