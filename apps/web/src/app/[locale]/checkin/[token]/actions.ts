'use server';

import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { encryptPII, last4 } from '@/lib/crypto/pii';
import { notifyCheckin } from '@/lib/checkin/notify';
import { ACCESS_COLUMNS, shapeAccess, type AccessInfo } from '@/lib/checkin/access';
import { accessWindowOpen, santiagoToday } from '@/lib/checkin/window';

// No Chilean law mandates a fixed retention for guest ID, so we purpose-bound it:
// kept for the stay + a dispute/chargeback window, then a job deletes it.
const RETENTION_DAYS = 90;

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
  nationality: z.string().max(60).optional(),
  companions: z.array(GuestSchema).max(29).default([]),
  parking: z.boolean().optional(),
  vehiclePlate: z.string().max(12).optional(),
  consent: z.literal(true),
});

// No re-export of AccessInfo here: a 'use server' module may only export async
// functions, and a type re-export makes Turbopack drop EVERY export from the
// file — which silently takes the whole check-in page down at runtime.
// Consumers import the type from '@/lib/checkin/access' directly.
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
  // Auto-issued links die with the stay: after departure the token is inert,
  // so a leaked or stale link can never surface access info later.
  const todaySantiago = santiagoToday();
  if (checkin.departure_date && todaySantiago > (checkin.departure_date as string)) {
    return { ok: false, error: 'expired' };
  }

  // Re-check the property's ID requirement server-side — never trust the client.
  // When the host requires ID (declared legal basis), EVERY incoming guest
  // must carry a document; otherwise documents are optional.
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

  // Lead identity (minimized + encrypted), kept for the retention window.
  if (d.docType && d.docNumber) {
    const purgeAfter = new Date(now.getTime() + RETENTION_DAYS * 86_400_000);
    const { error: e2 } = await supabase.from('checkin_identity').upsert(
      {
        checkin_id: checkin.id,
        doc_type: d.docType,
        doc_number_enc: encryptPII(d.docNumber),
        doc_last4: last4(d.docNumber),
        nationality: d.nationality ?? null,
        purge_after: purgeAfter.toISOString(),
      },
      { onConflict: 'checkin_id' },
    );
    if (e2) return { ok: false, error: 'store_id' };
  }

  // Every incoming guest, lead included — docs encrypted when provided.
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

  // Reveal only inside the window Hospitable's rule uses to send the details
  // (3 days before arrival); earlier, the page says when they will arrive.
  const reveal = accessWindowOpen(checkin.arrival_date as string | null, todaySantiago);
  return { ok: true, access: reveal ? (shapeAccess(access) ?? undefined) : undefined };
}
