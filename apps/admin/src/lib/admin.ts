import 'server-only';
import { currentUser, clerkClient } from '@clerk/nextjs/server';

/**
 * Operator access is gated on Clerk **organization membership** — staff are
 * added to the Luxel org in the Clerk dashboard, so the whitelist lives in Clerk
 * (invite/remove people there), not in an env allow-list.
 *
 *   LUXEL_ADMIN_ORG_SLUG  slug of the Clerk org whose members are operators
 *
 * Locked by default: if LUXEL_ADMIN_ORG_SLUG is unset, nobody is admin.
 */
export function adminOrgSlug(): string {
  return (process.env.LUXEL_ADMIN_ORG_SLUG ?? '').trim();
}

/**
 * Returns the operator's email + org role if they belong to the admin org, else
 * null. Membership is checked server-side, so it doesn't depend on an "active
 * organization" being set in the session.
 */
export async function requireAdmin(): Promise<{ email: string; role: string } | null> {
  const slug = adminOrgSlug();
  if (!slug) return null;

  const user = await currentUser();
  if (!user) return null;

  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({
    userId: user.id,
    limit: 100,
  });
  const membership = memberships.data.find((m) => m.organization.slug === slug);
  if (!membership) return null;

  const email =
    user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? '';
  return { email, role: membership.role };
}
