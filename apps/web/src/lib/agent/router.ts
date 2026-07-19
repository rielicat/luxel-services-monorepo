import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { suggestPricing } from '@/lib/revenue/suggest';
import { generateReport } from '@/lib/revenue/report';

export type AgentResult = {
  ok: true;
  intent: 'report' | 'block' | 'pricing' | 'help';
  text: string;
};

const ISO = /(\d{4}-\d{2}-\d{2})/g;
const DAY = 86_400_000;

/**
 * "Ask the agent to do anything" — a deterministic command router over the
 * property's own tools (report, block a date, pricing status). Ownership is
 * verified by the calling action. With an OpenAI key this could parse free-form
 * language; the router keeps it testable and works with no key.
 */
export async function runAgentCommand(propertyId: string, command: string): Promise<AgentResult> {
  const cmd = command.toLowerCase();
  const dates = [...command.matchAll(ISO)].map((m) => m[1]);

  if (/report|reporte|informe/.test(cmd)) {
    const from = dates[0];
    if (!from) {
      return {
        ok: true,
        intent: 'report',
        text: 'Indica el rango, ej.: "reporte de 2027-01-01 a 2027-01-31".',
      };
    }
    const to = dates[1] ?? from;
    return { ok: true, intent: 'report', text: await generateReport(propertyId, from, to) };
  }

  if (/bloq|block/.test(cmd)) {
    const date = dates[0];
    if (!date)
      return { ok: true, intent: 'block', text: 'Indica la fecha, ej.: "bloquea 2027-01-15".' };
    const end = new Date(new Date(`${date}T00:00:00Z`).getTime() + DAY).toISOString().slice(0, 10);
    const supabase = createSupabaseServiceRoleClient();
    await supabase.from('calendar_blocks').insert({
      property_id: propertyId,
      starts_on: date,
      ends_on: end,
      source: 'manual',
      summary: 'Bloqueado por el anfitrión (agente)',
    });
    return { ok: true, intent: 'block', text: `Listo, bloqueé ${date} en tu calendario.` };
  }

  if (/precio|price|optimiz|tarifa/.test(cmd)) {
    const ins = await suggestPricing(propertyId);
    return {
      ok: true,
      intent: 'pricing',
      text: `Ocupación próximos 30 días: ${ins.occupancy_pct}%. Tienes ${ins.underbooked} noches abiertas en las próximas 2 semanas. Precio base $${ins.base_clp.toLocaleString('es-CL')}; generé sugerencias por fecha (fin de semana +15%, última hora −10%).`,
    };
  }

  return {
    ok: true,
    intent: 'help',
    text: 'Puedo: generar un reporte (con fechas), bloquear una fecha, o revisar/optimizar precios.',
  };
}
