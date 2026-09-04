import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { clp } from './plan-copy';
import { comparableMarketReference, MIN_COMPARABLE_LISTINGS } from './pricing-reference';

const DAY = 86_400_000;

const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export async function pricingReference(input: {
  comuna?: string | null;
  bedrooms?: number | null;
}): Promise<{ content: string }> {
  const reference = await comparableMarketReference({
    comuna: input.comuna ?? null,
    bedrooms: input.bedrooms ?? null,
  });
  if (!reference.ok) {
    return {
      content: `Sin muestra comparable suficiente. Luxel exige al menos ${MIN_COMPARABLE_LISTINGS} propiedades administradas antes de promediar. No entregues ninguna cifra y termina el análisis.`,
    };
  }
  return {
    content: `Referencia de ${reference.listings} propiedades comparables, últimos ${reference.windowDays} días: tarifa promedio por noche ${clp(reference.adrClp)}, ocupación ${reference.occupancyPct}%, ingresos por reservas ${clp(reference.monthlyRevenueClp)} al mes por propiedad.`,
  };
}

export async function propertyCalendar(propertyId: string): Promise<{ content: string }> {
  const supabase = createSupabaseServiceRoleClient();
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 90 * DAY).toISOString().slice(0, 10);

  const [{ data: property }, { data: blocks }, { data: revenue }] = await Promise.all([
    supabase
      .from('properties')
      .select('nickname, comuna, bedrooms')
      .eq('id', propertyId)
      .maybeSingle(),
    supabase
      .from('calendar_blocks')
      .select('starts_on, ends_on, origin')
      .eq('property_id', propertyId)
      .eq('source', 'import')
      .gte('ends_on', from)
      .lte('starts_on', to)
      .order('starts_on', { ascending: true }),
    supabase
      .from('reservation_revenue')
      .select('arrival_date, departure_date, nights, host_revenue_clp')
      .eq('property_id', propertyId)
      .gte('departure_date', new Date(today.getTime() - 90 * DAY).toISOString().slice(0, 10))
      .order('arrival_date', { ascending: true }),
  ]);
  if (!property) return { content: 'No encontramos la propiedad.' };

  const window = new Set<string>();
  for (let i = 0; i < 90; i += 1) {
    window.add(new Date(today.getTime() + i * DAY).toISOString().slice(0, 10));
  }

  const booked = new Set<string>();
  const weekendNights = { total: 0, booked: 0 };
  for (const block of blocks ?? []) {
    if (block.origin === 'manual') continue;
    for (
      let d = new Date(`${block.starts_on}T00:00:00Z`);
      d < new Date(`${block.ends_on}T00:00:00Z`);
      d = new Date(d.getTime() + DAY)
    ) {
      const iso = d.toISOString().slice(0, 10);
      if (window.has(iso)) booked.add(iso);
    }
  }
  for (let i = 0; i < 90; i += 1) {
    const day = new Date(today.getTime() + i * DAY);
    const iso = day.toISOString().slice(0, 10);
    const weekday = day.getUTCDay();
    if (weekday === 5 || weekday === 6) {
      weekendNights.total += 1;
      if (booked.has(iso)) weekendNights.booked += 1;
    }
  }

  const nights = (revenue ?? []).reduce((sum, r) => sum + Number(r.nights ?? 0), 0);
  const earned = (revenue ?? []).reduce((sum, r) => sum + Number(r.host_revenue_clp ?? 0), 0);
  const adr = nights > 0 ? Math.round(earned / nights) : null;

  const gaps: string[] = [];
  const sorted = [...(blocks ?? [])].filter((b) => b.origin !== 'manual');
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const end = sorted[i]?.ends_on;
    const next = sorted[i + 1]?.starts_on;
    if (!end || !next) continue;
    const gapDays = Math.round(
      (new Date(`${next}T00:00:00Z`).getTime() - new Date(`${end}T00:00:00Z`).getTime()) / DAY,
    );
    if (gapDays >= 1 && gapDays <= 2) {
      gaps.push(`${end} a ${next} (${gapDays} noche${gapDays === 1 ? '' : 's'})`);
    }
  }

  const startDay = WEEKDAY[today.getUTCDay()] ?? '';

  return {
    content: [
      `Propiedad: ${property.nickname}${property.comuna ? `, ${property.comuna}` : ''}${property.bedrooms != null ? `, ${property.bedrooms} dormitorios` : ''}.`,
      `Ventana: 90 días desde hoy (${startDay}).`,
      `Ocupación próxima: ${booked.size} de 90 noches reservadas.`,
      `Fines de semana: ${weekendNights.booked} de ${weekendNights.total} noches reservadas.`,
      adr != null
        ? `Tarifa media realizada últimos 90 días: ${clp(adr)} por noche sobre ${nights} noches.`
        : 'Sin ingresos registrados en los últimos 90 días.',
      gaps.length
        ? `Huecos cortos entre reservas: ${gaps.slice(0, 8).join('; ')}.`
        : 'Sin huecos cortos.',
    ].join('\n'),
  };
}
