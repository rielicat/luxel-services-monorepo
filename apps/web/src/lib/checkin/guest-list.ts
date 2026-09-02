import 'server-only';
import { decryptPII } from '@/lib/crypto/pii';

export function formatDocument(docType: string | null, num: string): string {
  if (docType !== 'rut') return num;
  const clean = num.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return num;
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${clean.slice(-1)}`;
}

export type GuestRow = {
  full_name: string;
  doc_type: string | null;
  doc_number_enc: string | null;
  doc_last4: string | null;
};

export function guestListLine(guests: GuestRow[]): string {
  return guests
    .map((g) => {
      let doc: string | null = null;
      if (g.doc_number_enc) {
        try {
          doc = formatDocument(g.doc_type, decryptPII(g.doc_number_enc));
        } catch {
          doc = g.doc_last4 ? `···${g.doc_last4}` : null;
        }
      }
      return doc ? `${g.full_name} · ${doc}` : g.full_name;
    })
    .join(' | ');
}
