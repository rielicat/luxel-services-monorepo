import { Radio } from 'lucide-react';
import { getLeads } from '@/lib/stats';
import { fmtDateTime } from '@/lib/utils';
import { Card, Pill } from '@/components/ui';
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
      <div className="mb-6">
        <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Radio className="text-primary h-5 w-5" /> Leads
        </h1>
        <p className="text-muted-foreground text-sm">
          {leads.length} en total · {counts.new ?? 0} nuevos · {counts.converted ?? 0} convertidos
        </p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left text-xs uppercase">
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Comuna</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-border/60 hover:bg-muted/40 border-b">
                  <td className="px-4 py-3">
                    <Pill>{SOURCE_LABEL[l.source] ?? l.source}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.email ?? l.phone ?? '—'}</div>
                    {l.email && l.phone && (
                      <div className="text-muted-foreground text-xs">{l.phone}</div>
                    )}
                    {l.message && (
                      <div className="text-muted-foreground max-w-xs truncate text-xs">
                        {l.message}
                      </div>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">{l.commune ?? '—'}</td>
                  <td className="text-muted-foreground px-4 py-3 text-xs">
                    {fmtDateTime(l.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <LeadStatus id={l.id} status={l.status} />
                  </td>
                </tr>
              ))}
              {!leads.length && (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-4 py-10 text-center">
                    Aún no hay leads.
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
