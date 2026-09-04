export const DOC_MASK = '···';

const MASK_CHARS = /[·•…]/;
const MASK_STRIP = /[·•…]/g;

export function maskedDoc(docLast4: string): string {
  return `${DOC_MASK}${docLast4}`;
}

export function looksMaskedDoc(value: string): boolean {
  return MASK_CHARS.test(value);
}

export function maskLast4(mask: string): string {
  return mask.replace(MASK_STRIP, '').trim();
}

export function docNeedsRetype(value: string, mask: string | null): boolean {
  const typed = value.trim();
  if (looksMaskedDoc(typed)) return true;
  return Boolean(mask) && typed === maskLast4(mask!);
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
  docMask: string | null;
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
