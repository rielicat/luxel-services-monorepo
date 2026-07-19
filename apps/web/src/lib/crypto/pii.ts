import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * AES-256-GCM at-rest encryption for guest ID numbers — the Ley 21.719 security
 * duty (Art. 14 quinquies) for the required-but-minimized identity we store. The
 * plaintext document number is never persisted; only this ciphertext + a last-4.
 *
 * LUXEL_PII_KEY is a 32-byte key given as 64-char hex or base64; any other value
 * is stretched to 32 bytes via SHA-256 so a passphrase also works. Fails closed
 * (throws) when unset — we never fall back to storing plaintext.
 */
function key(): Buffer {
  const raw = process.env.LUXEL_PII_KEY;
  if (!raw) throw new Error('LUXEL_PII_KEY is not set');
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === 32) return b64;
  return createHash('sha256').update(raw).digest();
}

export function encryptPII(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decryptPII(enc: string): string {
  const raw = Buffer.from(enc, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Last 4 characters of a document number, for host-facing display only. */
export function last4(s: string): string {
  return s.replace(/\s+/g, '').slice(-4);
}
