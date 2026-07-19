import 'server-only';
import { randomBytes } from 'node:crypto';

/** Unguessable per-stay token that acts as the bearer for a guest check-in link. */
export function checkinToken(): string {
  return randomBytes(24).toString('base64url');
}
