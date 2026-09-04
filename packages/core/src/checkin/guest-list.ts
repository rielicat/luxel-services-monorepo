import 'server-only';
import { formatDocument } from '@luxel/shared/document';
import { decryptPII } from '../crypto/pii';

export { formatDocument };

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
