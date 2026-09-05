'use server';

import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';
import { encryptPII, last4 } from '@luxel/core/crypto/pii';
import { notifyCheckin } from '@luxel/core/checkin/notify';
import { MAX_PARTY, SLOT_RE, guestSlots } from '@luxel/core/checkin/slots';
import { santiagoToday } from '@luxel/core/checkin/window';
import { findCheckin } from '@luxel/core/checkin/resolve';
import { clearCheckinDrafts, readCheckinDraft, writeCheckinDraft } from '@luxel/core/checkin/draft';
import { looksMaskedDoc, type CheckinDraftWrite } from '@luxel/core/checkin/draft-shape';

const DocType = z.enum(['rut', 'passport', 'dni', 'other']);

const GuestSchema = z.object({
  fullName: z.string().min(1).max(120),
  docType: DocType,
  docNumber: z
    .string()
    .min(3)
    .max(40)
    .refine((v) => !looksMaskedDoc(v)),
});

const DraftSchema = z.object({
  id: z.string().min(4).max(64),
  rev: z.number().int().min(0).max(1_000_000),
  partySize: z.number().int().min(0).max(MAX_PARTY),
  guests: z
    .array(
      z.object({
        uid: z.string().min(1).max(64),
        fullName: z.string().max(120),
        docType: DocType,
        docNumber: z.string().max(40),
      }),
    )
    .max(MAX_PARTY),
  arrivalTime: z.string().max(8),
  departureTime: z.string().max(8),
  parking: z.enum(['', 'yes', 'no']),
  vehiclePlate: z.string().max(12),
});

const Schema = z.object({
  id: z.string().min(4).max(64),
  guests: z.array(GuestSchema).min(1).max(MAX_PARTY),
  arrivalTime: z.string().regex(SLOT_RE),
  departureTime: z.string().regex(SLOT_RE).optional(),
  parking: z.boolean().optional(),
  vehiclePlate: z.string().max(12).optional(),
});

type Result = { ok: boolean; error?: string; expected?: number };

export async function submitCheckin(input: unknown): Promise<Result> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const d = parsed.data;
  const lead = d.guests[0]!;
  const supabase = createSupabaseServiceRoleClient();

  const checkin = await findCheckin(
    supabase,
    d.id,
    'id, status, property_id, arrival_date, departure_date, revoked_at, expected_guests',
  );
  if (!checkin) return { ok: false, error: 'not_found' };
  if (checkin.revoked_at) return { ok: false, error: 'expired' };
  if (checkin.status !== 'pending') return { ok: false, error: 'already_submitted' };
  const todaySantiago = santiagoToday();
  if (checkin.departure_date && todaySantiago > (checkin.departure_date as string)) {
    return { ok: false, error: 'expired' };
  }

  const draft = await readCheckinDraft(supabase, checkin.id as string);
  const { data: property } = await supabase
    .from('properties')
    .select('max_guests')
    .eq('id', checkin.property_id as string)
    .maybeSingle();
  const roomFor = Math.min(
    Math.max((property?.max_guests as number | null) ?? MAX_PARTY, 1),
    MAX_PARTY,
  );
  const expected = checkin.expected_guests as number | null;
  const target =
    expected && expected > 0
      ? guestSlots(expected, roomFor)
      : Math.min(draft?.partySize ?? 0, roomFor);
  if (target > 0 && d.guests.length !== target) {
    return { ok: false, error: 'party_size', expected: target };
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

  await clearCheckinDrafts(supabase, [checkin.id as string]);
  await notifyCheckin(checkin.id as string);
  return { ok: true };
}

export async function saveCheckinDraft(input: unknown): Promise<CheckinDraftWrite> {
  const parsed = DraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: 'refused' };
  const d = parsed.data;
  const supabase = createSupabaseServiceRoleClient();

  const checkin = await findCheckin(supabase, d.id, 'id, status, departure_date, revoked_at');
  if (!checkin || checkin.revoked_at || checkin.status !== 'pending') {
    return { ok: false, reason: 'refused' };
  }
  const todaySantiago = santiagoToday();
  if (checkin.departure_date && todaySantiago > (checkin.departure_date as string)) {
    return { ok: false, reason: 'refused' };
  }

  const id = checkin.id as string;
  let written: CheckinDraftWrite;
  try {
    written = await writeCheckinDraft(supabase, id, {
      rev: d.rev,
      partySize: d.partySize,
      guests: d.guests,
      arrivalTime: d.arrivalTime,
      departureTime: d.departureTime,
      parking: d.parking,
      vehiclePlate: d.vehiclePlate,
    });
  } catch {
    console.error('checkin.draft_encrypt_failed', { checkinId: id });
    return { ok: false, reason: 'refused' };
  }
  if (!written.ok) return written;

  const { data: after } = await supabase
    .from('checkins')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (after?.status !== 'pending') {
    await clearCheckinDrafts(supabase, [id]);
    return { ok: false, reason: 'refused' };
  }
  return written;
}
