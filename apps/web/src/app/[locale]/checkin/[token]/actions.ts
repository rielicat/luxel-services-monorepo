'use server';

import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { encryptPII, last4 } from '@/lib/crypto/pii';
import { notifyCheckin } from '@/lib/checkin/notify';

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
  consent: z.literal(true),
});

/** What the confirmation screen needs for a zero-friction arrival: the access
 *  details, revealed immediately after a valid submit (and also emailed). */
export interface AccessInfo {
  method: 'keyless' | 'physical_concierge' | 'physical_none';
  keylessCode: string | null;
  keylessInstructions: string | null;
  conciergeName: string | null;
  conciergeHours: string | null;
}

type Result = { ok: boolean; error?: string; access?: AccessInfo };

export async function submitCheckin(input: unknown): Promise<Result> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const d = parsed.data;
  const supabase = createSupabaseServiceRoleClient();

  const { data: checkin } = await supabase
    .from('checkins')
    .select('id, status, property_id, departure_date')
    .eq('token', d.token)
    .maybeSingle();
  if (!checkin) return { ok: false, error: 'not_found' };
  if (checkin.status !== 'pending') return { ok: false, error: 'already_submitted' };
  // Auto-issued links die with the stay: after departure the token is inert,
  // so a leaked or stale link can never surface access info later.
  const todaySantiago = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
  }).format(new Date());
  if (checkin.departure_date && todaySantiago > (checkin.departure_date as string)) {
    return { ok: false, error: 'expired' };
  }

  // Re-check the property's ID requirement server-side — never trust the client.
  // When the host requires ID (declared legal basis), EVERY incoming guest
  // must carry a document; otherwise documents are optional.
  const { data: access } = await supabase
    .from('property_access')
    .select(
      'method, keyless_code, keyless_instructions, concierge_name, concierge_hours, require_id',
    )
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

  return {
    ok: true,
    access: access
      ? {
          method: access.method as AccessInfo['method'],
          keylessCode: access.method === 'keyless' ? (access.keyless_code ?? null) : null,
          keylessInstructions:
            access.method === 'keyless' ? (access.keyless_instructions ?? null) : null,
          conciergeName:
            access.method === 'physical_concierge' ? (access.concierge_name ?? null) : null,
          conciergeHours:
            access.method === 'physical_concierge' ? (access.concierge_hours ?? null) : null,
        }
      : undefined,
  };
}
