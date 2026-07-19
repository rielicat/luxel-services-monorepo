import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { listHospitableProperties, listHospitableReservations } from './hospitable';
import { suggestCleaningsFromCheckouts } from '@/lib/cleaning/schedule';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface HospitableSyncResult {
  ok: boolean;
  properties: number;
  reservations: number;
  cleanings: number;
}

/**
 * Full sync of a customer's Hospitable account into Luxel:
 *  1) properties → upsert into `properties` (matched by external_listing_id),
 *  2) accepted reservations (-60d … +400d) → `calendar_blocks` (source 'import',
 *     external_uid 'hosp:<code>', full-refresh of the hosp: namespace so
 *     cancellations disappear),
 *  3) refresh check-out-driven cleaning suggestions per property.
 * The reservation's conversation id is kept on the block summary side-table-free
 * via guest_threads.external_thread_id when messaging starts (Phase-2 pipeline).
 */
export async function syncHospitableAccount(
  customerId: string,
  token: string,
  now: Date = new Date(),
): Promise<HospitableSyncResult> {
  const supabase = createSupabaseServiceRoleClient();
  const remote = await listHospitableProperties(token);
  if (!remote) return { ok: false, properties: 0, reservations: 0, cleanings: 0 };

  let reservationCount = 0;
  let cleaningCount = 0;

  for (const rp of remote) {
    const coords = rp.address?.coordinates;
    const lat = coords?.latitude != null ? Number(coords.latitude) : null;
    const lng = coords?.longitude != null ? Number(coords.longitude) : null;

    // 1) Upsert the Luxel property, matched by the Hospitable property id.
    const { data: existing } = await supabase
      .from('properties')
      .select('id')
      .eq('owner_id', customerId)
      .eq('external_listing_id', rp.id)
      .maybeSingle();

    const fields = {
      nickname: rp.public_name || rp.name || 'Propiedad Airbnb',
      address: rp.address?.street ?? null,
      comuna: rp.address?.city ?? null,
      bedrooms: rp.capacity?.bedrooms ?? null,
      bathrooms: rp.capacity?.bathrooms ?? null,
      platform: 'airbnb',
      external_listing_id: rp.id,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      updated_at: new Date().toISOString(),
    };

    let propertyId: string;
    if (existing) {
      propertyId = existing.id as string;
      await supabase.from('properties').update(fields).eq('id', propertyId);
    } else {
      const { data: created } = await supabase
        .from('properties')
        .insert({ owner_id: customerId, ...fields })
        .select('id')
        .single();
      if (!created) continue;
      propertyId = created.id as string;
      await supabase
        .from('property_access')
        .insert({ property_id: propertyId, method: 'physical_none' });
    }

    // 2) Reservations → calendar blocks (full refresh of the hosp: namespace).
    const startDate = iso(new Date(now.getTime() - 60 * DAY));
    const endDate = iso(new Date(now.getTime() + 400 * DAY));
    const reservations = await listHospitableReservations(token, rp.id, startDate, endDate);
    if (reservations) {
      const accepted = reservations.filter((r) => {
        const cat = r.reservation_status?.current?.category ?? r.status ?? '';
        return ['accepted', 'active', 'confirmed'].includes(String(cat).toLowerCase());
      });
      await supabase
        .from('calendar_blocks')
        .delete()
        .eq('property_id', propertyId)
        .like('external_uid', 'hosp:%');
      if (accepted.length) {
        await supabase.from('calendar_blocks').insert(
          accepted.map((r) => ({
            property_id: propertyId,
            starts_on: r.arrival_date.slice(0, 10),
            ends_on: r.departure_date.slice(0, 10),
            source: 'import',
            summary: `Airbnb ${r.code}`,
            external_uid: `hosp:${r.id}`,
          })),
        );
      }
      reservationCount += accepted.length;
    }

    // 3) Cleaning suggestions from the fresh check-outs.
    const c = await suggestCleaningsFromCheckouts(propertyId);
    cleaningCount += c.suggested;
  }

  await supabase
    .from('channel_connections')
    .update({ last_synced_at: new Date().toISOString(), status: 'connected' })
    .eq('customer_id', customerId)
    .eq('provider', 'hospitable');

  return {
    ok: true,
    properties: remote.length,
    reservations: reservationCount,
    cleanings: cleaningCount,
  };
}
