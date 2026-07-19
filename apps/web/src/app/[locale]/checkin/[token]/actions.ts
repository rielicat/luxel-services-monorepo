'use server';

import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { encryptPII, last4 } from '@/lib/crypto/pii';
import { notifyCheckin } from '@/lib/checkin/notify';

// No Chilean law mandates a fixed retention for guest ID, so we purpose-bound it:
// kept for the stay + a dispute/chargeback window, then a job deletes it.
const RETENTION_DAYS = 90;

const Schema = z.object({
  token: z.string().min(10).max(64),
  guestName: z.string().min(1).max(120),
  guestEmail: z.string().email().max(120),
  guestPhone: z.string().max(30).optional(),
  partySize: z.number().int().positive().max(30).optional(),
  arrivalAt: z.string().datetime().optional(),
  docType: z.enum(['rut', 'passport', 'dni', 'other']).optional(),
  docNumber: z.string().min(3).max(40).optional(),
  nationality: z.string().max(60).optional(),
  dateOfBirth: z.string().date().optional(),
  consent: z.literal(true),
});

type Result = { ok: boolean; error?: string };

export async function submitCheckin(input: unknown): Promise<Result> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const d = parsed.data;
  const supabase = createSupabaseServiceRoleClient();

  const { data: checkin } = await supabase
    .from('checkins')
    .select('id, status, property_id')
    .eq('token', d.token)
    .maybeSingle();
  if (!checkin) return { ok: false, error: 'not_found' };
  if (checkin.status !== 'pending') return { ok: false, error: 'already_submitted' };

  // Re-check the property's ID requirement server-side — never trust the client.
  const { data: access } = await supabase
    .from('property_access')
    .select('require_id')
    .eq('property_id', checkin.property_id)
    .maybeSingle();
  const idProvided = Boolean(d.docType && d.docNumber);
  if (access?.require_id && !idProvided) return { ok: false, error: 'id_required' };

  const now = new Date();
  const { error: e1 } = await supabase
    .from('checkins')
    .update({
      status: 'submitted',
      guest_name: d.guestName,
      guest_email: d.guestEmail,
      guest_phone: d.guestPhone ?? null,
      party_size: d.partySize ?? null,
      arrival_at: d.arrivalAt ?? null,
      submitted_at: now.toISOString(),
    })
    .eq('id', checkin.id);
  if (e1) return { ok: false, error: 'store' };

  // Store the minimized identity only when provided; the number is encrypted and
  // never persisted in plaintext (only a last-4 for host display).
  if (idProvided) {
    const purgeAfter = new Date(now.getTime() + RETENTION_DAYS * 86_400_000);
    const { error: e2 } = await supabase.from('checkin_identity').upsert(
      {
        checkin_id: checkin.id,
        doc_type: d.docType!,
        doc_number_enc: encryptPII(d.docNumber!),
        doc_last4: last4(d.docNumber!),
        nationality: d.nationality ?? null,
        date_of_birth: d.dateOfBirth ?? null,
        purge_after: purgeAfter.toISOString(),
      },
      { onConflict: 'checkin_id' },
    );
    if (e2) return { ok: false, error: 'store_id' };
  }

  await notifyCheckin(checkin.id);
  return { ok: true };
}
