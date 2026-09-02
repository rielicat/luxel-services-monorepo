'use server';

import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { encryptPII, last4 } from '@/lib/crypto/pii';
import { notifyCheckin } from '@/lib/checkin/notify';
import { ACCESS_COLUMNS, shapeAccess, type AccessInfo } from '@/lib/checkin/access';
import { accessWindowOpen, santiagoToday } from '@/lib/checkin/window';

const GuestSchema = z.object({
  fullName: z.string().min(1).max(120),
  docType: z.enum(['rut', 'passport', 'dni', 'other']).optional(),
  docNumber: z.string().min(3).max(40).optional(),
});

const Schema = z.object({
  token: z.string().min(10).max(64),
  guestName: z.string().min(1).max(120),
  guestEmail: z.string().email().max(120),
  guestPhone: z.string().max(30).optional(),
  arrivalAt: z.string().datetime().optional(),
  docType: z.enum(['rut', 'passport', 'dni', 'other']).optional(),
  docNumber: z.string().min(3).max(40).optional(),
  companions: z.array(GuestSchema).max(29).default([]),
  parking: z.boolean().optional(),
  vehiclePlate: z.string().max(12).optional(),
  consent: z.literal(true),
});

type Result = { ok: boolean; error?: string; access?: AccessInfo };

export async function submitCheckin(input: unknown): Promise<Result> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const d = parsed.data;
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
    .select(ACCESS_COLUMNS)
    .eq('property_id', checkin.property_id)
    .maybeSingle();
  const everyone = [
    { fullName: d.guestName, docType: d.docType, docNumber: d.docNumber },
    ...d.companions,
  ];
  if (access?.require_id && everyone.some((g) => !g.docType || !g.docNumber)) {
    return { ok: false, error: 'id_required' };
  }

  const now = new Date();
  const { error: e1 } = await supabase
    .from('checkins')
    .update({
      status: 'submitted',
      guest_name: d.guestName,
      guest_email: d.guestEmail,
      guest_phone: d.guestPhone ?? null,
      party_size: everyone.length,
      arrival_at: d.arrivalAt ?? null,
      parking: d.parking ?? null,
      vehicle_plate:
        d.parking && d.vehiclePlate?.trim() ? d.vehiclePlate.trim().toUpperCase() : null,
      submitted_at: now.toISOString(),
    })
    .eq('id', checkin.id);
  if (e1) return { ok: false, error: 'store' };

  await supabase.from('checkin_guests').delete().eq('checkin_id', checkin.id);
  const { error: e3 } = await supabase.from('checkin_guests').insert(
    everyone.map((g, i) => ({
      checkin_id: checkin.id,
      is_lead: i === 0,
      full_name: g.fullName,
      doc_type: g.docType && g.docNumber ? g.docType : null,
      doc_number_enc: g.docNumber ? encryptPII(g.docNumber) : null,
      doc_last4: g.docNumber ? last4(g.docNumber) : null,
    })),
  );
  if (e3) return { ok: false, error: 'store_guests' };

  await notifyCheckin(checkin.id);

  const reveal = accessWindowOpen(checkin.arrival_date as string | null, todaySantiago);
  return { ok: true, access: reveal ? (shapeAccess(access) ?? undefined) : undefined };
}
