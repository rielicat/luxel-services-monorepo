import 'server-only';
import { decryptPII } from '@/lib/crypto/pii';

/** 12345678K → 12.345.678-K, the way a conserje reads a RUT off a carnet.
 *  Anything that is not a RUT is left exactly as the guest typed it. */
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

/** "Nombre · 12.345.678-9 | Nombre · 9.876.543-2": one line, because a template
 *  parameter cannot hold a newline. A document that will not decrypt degrades to
 *  its last four rather than dropping the guest from the list. */
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
