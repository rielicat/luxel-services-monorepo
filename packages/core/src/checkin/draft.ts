import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptPII, last4 } from '../crypto/pii';
import {
  looksMaskedDoc,
  maskedDoc,
  type CheckinDraft,
  type CheckinDraftInput,
  type CheckinDraftWrite,
} from './draft-shape';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any, 'public', any>;

const VERSION = 2;

interface StoredGuest {
  uid: string;
  fullName: string;
  docType: string;
  docEnc: string | null;
  docLast4: string | null;
}

interface StoredPayload {
  v: number;
  partySize: number;
  guests: StoredGuest[];
  arrivalTime: string;
  departureTime: string;
  parking: string;
  vehiclePlate: string;
}

interface StoredRow {
  rev: number;
  payload: StoredPayload | null;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const count = (v: unknown): number =>
  Number.isInteger(v) && (v as number) > 0 ? (v as number) : 0;

async function readRow(supabase: Supabase, checkinId: string): Promise<StoredRow> {
  const { data } = await supabase
    .from('checkin_draft')
    .select('rev, payload')
    .eq('checkin_id', checkinId)
    .maybeSingle();
  if (!data) return { rev: 0, payload: null };
  const payload = (data.payload ?? null) as StoredPayload | null;
  const usable = payload && payload.v === VERSION && Array.isArray(payload.guests) ? payload : null;
  return { rev: count(data.rev), payload: usable };
}

export async function readCheckinDraft(
  supabase: Supabase,
  checkinId: string,
): Promise<CheckinDraft | null> {
  const { rev, payload } = await readRow(supabase, checkinId);
  if (!payload) {
    if (!rev) return null;
    return {
      rev,
      partySize: 0,
      guests: [],
      arrivalTime: '',
      departureTime: '',
      parking: '',
      vehiclePlate: '',
    };
  }
  return {
    rev,
    partySize: count(payload.partySize),
    guests: payload.guests.map((g, i) => ({
      uid: text(g?.uid) || `g${i}`,
      fullName: text(g?.fullName),
      docType: text(g?.docType),
      docMask: g?.docLast4 ? maskedDoc(g.docLast4) : null,
    })),
    arrivalTime: text(payload.arrivalTime),
    departureTime: text(payload.departureTime),
    parking: text(payload.parking),
    vehiclePlate: text(payload.vehiclePlate),
  };
}

export async function writeCheckinDraft(
  supabase: Supabase,
  checkinId: string,
  input: CheckinDraftInput,
): Promise<CheckinDraftWrite> {
  const previous = await readRow(supabase, checkinId);
  if (input.rev !== previous.rev) return { ok: false, reason: 'stale', rev: previous.rev };

  const byUid = new Map((previous.payload?.guests ?? []).map((g) => [text(g?.uid), g]));
  const guests: StoredGuest[] = input.guests.map((g) => {
    const typed = g.docNumber.trim();
    const kept = byUid.get(g.uid) ?? null;
    const base = { uid: g.uid, fullName: g.fullName.slice(0, 120), docType: g.docType };
    if (!typed) return { ...base, docEnc: null, docLast4: null };
    if (looksMaskedDoc(typed)) {
      return { ...base, docEnc: kept?.docEnc ?? null, docLast4: kept?.docLast4 ?? null };
    }
    return { ...base, docEnc: encryptPII(typed), docLast4: last4(typed) };
  });

  const rev = previous.rev + 1;
  const payload: StoredPayload = {
    v: VERSION,
    partySize: input.partySize,
    guests,
    arrivalTime: input.arrivalTime,
    departureTime: input.departureTime,
    parking: input.parking,
    vehiclePlate: input.vehiclePlate,
  };

  if (!previous.rev) {
    const { error } = await supabase
      .from('checkin_draft')
      .insert({ checkin_id: checkinId, rev, payload });
    if (!error) return { ok: true, rev };
    const after = await readRow(supabase, checkinId);
    return after.rev
      ? { ok: false, reason: 'stale', rev: after.rev }
      : { ok: false, reason: 'refused' };
  }

  const { data: moved, error } = await supabase
    .from('checkin_draft')
    .update({ rev, payload })
    .eq('checkin_id', checkinId)
    .eq('rev', previous.rev)
    .select('rev');
  if (error) return { ok: false, reason: 'refused' };
  if (!moved?.length) {
    const after = await readRow(supabase, checkinId);
    return { ok: false, reason: 'stale', rev: after.rev };
  }
  return { ok: true, rev };
}

export async function clearCheckinDrafts(supabase: Supabase, checkinIds: string[]): Promise<void> {
  if (!checkinIds.length) return;
  await supabase.from('checkin_draft').delete().in('checkin_id', checkinIds);
}
