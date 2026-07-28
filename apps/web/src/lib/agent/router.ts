import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { customerHospitableToken, listHospitableCalendar } from '@/lib/channels/hospitable';
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
    // Real numbers only: the listing's live Airbnb calendar, or an honest miss.
    const supabase = createSupabaseServiceRoleClient();
    const { data: prop } = await supabase
      .from('properties')
      .select('owner_id, external_listing_id')
      .eq('id', propertyId)
      .maybeSingle();
    const token = prop?.owner_id ? await customerHospitableToken(prop.owner_id as string) : null;
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const days =
      token && prop?.external_listing_id
        ? await listHospitableCalendar(
            token,
            prop.external_listing_id as string,
            iso(today),
            iso(new Date(today.getTime() + 30 * DAY)),
          )
        : null;
    if (!days?.length) {
      return {
        ok: true,
        intent: 'pricing',
        text: 'No pude leer el calendario de Airbnb en este momento, así que no tengo tarifas reales que mostrarte. Intenta de nuevo en unos minutos.',
      };
    }
    const reserved = days.filter((d) => d.status?.reason === 'RESERVED').length;
    const open = days.filter((d) => d.status?.available === true);
    const prices = open
      .map((d) => (d.price?.amount != null ? Math.round(d.price.amount / 100) : null))
      .filter((n): n is number => n != null);
    const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;
    const range = prices.length
      ? `Tarifa publicada: ${clp(Math.min(...prices))}–${clp(Math.max(...prices))} por noche.`
      : 'Sin noches abiertas con tarifa publicada.';
    return {
      ok: true,
      intent: 'pricing',
      text: `Según tu calendario de Airbnb: ocupación próximos 30 días ${Math.round((reserved / days.length) * 100)}%, ${open.length} noches abiertas. ${range}`,
    };
  }

  return {
    ok: true,
    intent: 'help',
    text: 'Puedo: generar un reporte (con fechas), bloquear una fecha, o revisar/optimizar precios.',
  };
}
