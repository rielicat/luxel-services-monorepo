export const DOC_MASK = '···';

const MASK_CHARS = /[·•…]/;

export function looksMaskedDoc(value: string): boolean {
  return MASK_CHARS.test(value);
}

export interface CheckinDraftGuestInput {
  uid: string;
  fullName: string;
  docType: string;
  docNumber: string;
}

export interface CheckinDraftInput {
  rev: number;
  partySize: number;
  guests: CheckinDraftGuestInput[];
  arrivalTime: string;
  departureTime: string;
  parking: string;
  vehiclePlate: string;
}

export interface CheckinDraftGuest {
  uid: string;
  fullName: string;
  docType: string;
  docNumber: string;
}

export interface CheckinDraft {
  rev: number;
  partySize: number;
  guests: CheckinDraftGuest[];
  arrivalTime: string;
  departureTime: string;
  parking: string;
  vehiclePlate: string;
}

export type CheckinDraftWrite =
  | { ok: true; rev: number }
  | { ok: false; reason: 'stale'; rev: number }
  | { ok: false; reason: 'refused' };
