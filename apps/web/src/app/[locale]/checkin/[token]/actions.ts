'use server';

import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { encryptPII, last4 } from '@/lib/crypto/pii';
import { notifyCheckin } from '@/lib/checkin/notify';
import { MAX_PARTY, NATIONALITIES, SLOT_RE } from '@/lib/checkin/slots';
import { santiagoToday } from '@/lib/checkin/window';

const GuestSchema = z.object({
  fullName: z.string().min(1).max(120),
  docType: z.enum(['rut', 'passport', 'dni', 'other']).optional(),
  docNumber: z.string().min(3).max(40).optional(),
  nationality: z.enum(NATIONALITIES).optional(),
});

const Schema = z.object({
  token: z.string().min(10).max(64),
  guests: z.array(GuestSchema).min(1).max(MAX_PARTY),
  email: z.string().email().max(120),
  phone: z.string().max(30).optional(),
  arrivalTime: z.string().regex(SLOT_RE),
  departureTime: z.string().regex(SLOT_RE).optional(),
  parking: z.boolean().optional(),
  vehiclePlate: z.string().max(12).optional(),
  consent: z.literal(true),
});

export type CheckinInput = z.input<typeof Schema>;

type Result = { ok: boolean; error?: string };

export async function submitCheckin(input: unknown): Promise<Result> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const d = parsed.data;
  const lead = d.guests[0]!;
  const supabase = createSupabaseServiceRoleClient();

  const { data: checkin } = await supabase
    .from('checkins')
    .select('id, status, property_id, arrival_date, departure_date')
    .eq('token', d.token)
    .maybeSingle();
  if (!checkin) return { ok: false, error: 'not_found' };
  if (checkin.status !== 'pending') return { ok: false, error: 'already_submitted' };
  const todaySantiago = santiagoToday();
  if (checkin.departure_date && todaySantiago > (checkin.departure_date as string)) {
    return { ok: false, error: 'expired' };
  }

  const { data: access } = await supabase
    .from('property_access')
    .select('require_id')
    .eq('property_id', checkin.property_id)
    .maybeSingle();
  if (access?.require_id && d.guests.some((g) => !g.docType || !g.docNumber)) {
    return { ok: false, error: 'id_required' };
  }

  let rows: Array<Record<string, unknown>>;
  try {
    rows = d.guests.map((g, i) => ({
      checkin_id: checkin.id,
      is_lead: i === 0,
      full_name: g.fullName,
      nationality: g.nationality ?? null,
      doc_type: g.docType && g.docNumber ? g.docType : null,
      doc_number_enc: g.docNumber ? encryptPII(g.docNumber) : null,
      doc_last4: g.docNumber ? last4(g.docNumber) : null,
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
      guest_email: d.email,
      guest_phone: d.phone ?? null,
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

  await supabase.from('checkin_guests').delete().eq('checkin_id', checkin.id);
  const { error: e3 } = await supabase.from('checkin_guests').insert(rows);
  if (e3) return { ok: false, error: 'store_guests' };

  await notifyCheckin(checkin.id);
  return { ok: true };
}
