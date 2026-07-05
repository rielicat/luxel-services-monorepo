import 'server-only';
import { currentUser } from '@clerk/nextjs/server';

/**
 * Operator access is granted by EMAIL DOMAIN (staff use @serviciosluxel.cl
 * addresses), with an optional explicit allow-list for external collaborators.
 *
 *   LUXEL_ADMIN_DOMAINS  comma-separated domains (default: serviciosluxel.cl)
 *   LUXEL_ADMIN_EMAILS   optional comma-separated individual emails
 */
export function adminDomains(): string[] {
  const raw = process.env.LUXEL_ADMIN_DOMAINS ?? 'serviciosluxel.cl';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

export function adminEmails(): string[] {
  return (process.env.LUXEL_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowed(email: string): boolean {
  const e = email.toLowerCase();
  const domain = e.split('@')[1] ?? '';
  return adminDomains().includes(domain) || adminEmails().includes(e);
}

/**
 * Returns the operator's email if allowed, else null. Locked by default: if no
 * domains and no emails are configured, nobody is admin.
 *
 * Only VERIFIED emails count — otherwise a user could add an unverified
 * @serviciosluxel.cl address to their account and gain access.
 */
export async function requireAdmin(): Promise<{ email: string } | null> {
  if (adminDomains().length === 0 && adminEmails().length === 0) return null;
  const user = await currentUser();
  if (!user) return null;

  const verified = (user.emailAddresses ?? [])
    .filter((e) => e.verification?.status === 'verified')
    .map((e) => e.emailAddress.toLowerCase());

  const match = verified.find(isAllowed);
  return match ? { email: match } : null;
}
