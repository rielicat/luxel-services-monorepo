import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppTemplate, whatsappBridgeConfigured } from '@/lib/whatsapp/send';
import { longDateEs, stayRangeEs } from '@/lib/checkin/copy';
import { toE164Digits } from '@/lib/phone';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any, 'public', any>;

/**
 * Tells the property's cleaning crew about a NEW booking, over WhatsApp, once.
 *
 * Fires from the same place the guest's booking message does — a freshly
 * inserted check-in row — so "the crew knows" and "the guest was told" cannot
 * drift apart. Send-once through `checkins.crew_notified_at`, stamped only after
 * at least one delivery: a run that fails leaves the row open for the next sync.
 * Never throws.
 */
export async function notifyCleaningCrewOfBooking(
  supabase: Supabase,
  reservationUid: string,
): Promise<number> {
  if (!whatsappBridgeConfigured()) return 0;
  try {
    const { data: checkin } = await supabase
      .from('checkins')
      .select('id, property_id, arrival_date, departure_date, expected_guests, crew_notified_at')
      .eq('reservation_uid', reservationUid)
      .maybeSingle();
    if (!checkin || checkin.crew_notified_at || !checkin.arrival_date || !checkin.departure_date)
      return 0;

    const [{ data: prop }, { data: access }, { data: contacts }] = await Promise.all([
      supabase
        .from('properties')
        .select('nickname, address, comuna, checkout_time')
        .eq('id', checkin.property_id)
        .maybeSingle(),
      supabase
        .from('property_access')
        .select('unit')
        .eq('property_id', checkin.property_id)
        .maybeSingle(),
      supabase
        .from('property_contacts')
        .select('whatsapp')
        .eq('property_id', checkin.property_id)
        .eq('role', 'cleaning'),
    ]);
    if (!prop) return 0;
    const numbers = [
      ...new Set(
        (contacts ?? [])
          .map((c) => toE164Digits(c.whatsapp as string | null))
          .filter((n): n is string => Boolean(n)),
      ),
    ];
    if (!numbers.length) return 0;

    const where = [prop.address, prop.comuna].filter(Boolean).join(', ');
    const params = [
      prop.nickname as string,
      stayRangeEs(checkin.arrival_date as string, checkin.departure_date as string),
      access?.unit ? `Depto. ${access.unit}` : (prop.nickname as string),
      where || '—',
      checkin.expected_guests != null ? String(checkin.expected_guests) : '—',
      `${longDateEs(checkin.departure_date as string)}${prop.checkout_time ? ` ${prop.checkout_time}` : ''}`,
    ];

    let sent = 0;
    for (const to of numbers) {
      if (await sendWhatsAppTemplate(to, 'cleaning_booking', params)) sent += 1;
    }
    if (sent) {
      await supabase
        .from('checkins')
        .update({ crew_notified_at: new Date().toISOString() })
        .eq('id', checkin.id);
    }
    return sent;
  } catch {
    return 0;
  }
}
