'use server';

import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { encryptPII, last4 } from '@/lib/crypto/pii';
import { notifyCheckin } from '@/lib/checkin/notify';
import { MAX_PARTY, SLOT_RE } from '@/lib/checkin/slots';
import { santiagoToday } from '@/lib/checkin/window';
import { findCheckin } from '@/lib/checkin/resolve';

const GuestSchema = z.object({
  fullName: z.string().min(1).max(120),
  docType: z.enum(['rut', 'passport', 'dni', 'other']),
  docNumber: z.string().min(3).max(40),
});

const Schema = z.object({
  id: z.string().min(4).max(64),
  guests: z.array(GuestSchema).min(1).max(MAX_PARTY),
  arrivalTime: z.string().regex(SLOT_RE),
  departureTime: z.string().regex(SLOT_RE).optional(),
  parking: z.boolean().optional(),
  vehiclePlate: z.string().max(12).optional(),
});

export type CheckinInput = z.input<typeof Schema>;

type Result = { ok: boolean; error?: string };

export async function submitCheckin(input: unknown): Promise<Result> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const d = parsed.data;
  const lead = d.guests[0]!;
  const supabase = createSupabaseServiceRoleClient();

  const checkin = await findCheckin(
    supabase,
    d.id,
    'id, status, property_id, arrival_date, departure_date, revoked_at',
  );
  if (!checkin) return { ok: false, error: 'not_found' };
  if (checkin.revoked_at) return { ok: false, error: 'expired' };
  if (checkin.status !== 'pending') return { ok: false, error: 'already_submitted' };
  const todaySantiago = santiagoToday();
  if (checkin.departure_date && todaySantiago > (checkin.departure_date as string)) {
    return { ok: false, error: 'expired' };
  }

  let rows: Array<Record<string, unknown>>;
  try {
    rows = d.guests.map((g, i) => ({
      checkin_id: checkin.id as string,
      is_lead: i === 0,
      full_name: g.fullName,
      doc_type: g.docType,
      doc_number_enc: encryptPII(g.docNumber),
      doc_last4: last4(g.docNumber),
    }));
  } catch {
    console.error('checkin.encrypt_failed', { checkinId: checkin.id });
    return { ok: false, error: 'store_guests' };
  }

  const now = new Date();
  const { data: claimed, error: e1 } = await supabase
    .from('checkins')
    .update({
      status: 'submitted',
      guest_name: lead.fullName,
      party_size: d.guests.length,
      arrival_time: d.arrivalTime,
      departure_time: d.departureTime ?? null,
      parking: d.parking ?? null,
      vehicle_plate:
        d.parking && d.vehiclePlate?.trim() ? d.vehiclePlate.trim().toUpperCase() : null,
      submitted_at: now.toISOString(),
    })
    .eq('id', checkin.id)
    .eq('status', 'pending')
    .select('id');
  if (e1) return { ok: false, error: 'store' };
  if (!claimed?.length) return { ok: false, error: 'already_submitted' };

  await supabase
    .from('checkin_guests')
    .delete()
    .eq('checkin_id', checkin.id as string);
  const { error: e3 } = await supabase.from('checkin_guests').insert(rows);
  if (e3) return { ok: false, error: 'store_guests' };

  await notifyCheckin(checkin.id as string);
  return { ok: true };
}
