import 'server-only';
import { currentUser, clerkClient } from '@clerk/nextjs/server';

// NOTE: LUXEL_ADMIN_ORG_ID/SLUG are read at request time, but Vercel snapshots
// env vars at build time — after changing them (in the Vercel IaC), the admin
// project must be redeployed to pick up the new value.

/**
 * Operator access is gated on Clerk **organization membership** — staff are
 * added to the Luxel org in the Clerk dashboard, so the whitelist lives in Clerk
 * (invite/remove people there), not in an env allow-list.
 *
 * Identify the org by EITHER (ID is the most robust — unaffected by slug settings):
 *   LUXEL_ADMIN_ORG_ID    org_… id of the Clerk org whose members are operators
 *   LUXEL_ADMIN_ORG_SLUG  its slug (alternative to the id)
 *
 * Locked by default: if neither is set, nobody is admin.
 */
export function adminOrgId(): string {
  return (process.env.LUXEL_ADMIN_ORG_ID ?? '').trim();
}
export function adminOrgSlug(): string {
  return (process.env.LUXEL_ADMIN_ORG_SLUG ?? '').trim();
}

/**
 * Returns the operator's email + org role if they belong to the admin org, else
 * null. Membership is checked server-side, so it doesn't depend on an "active
 * organization" being set in the session.
 */
export async function requireAdmin(): Promise<{ email: string; role: string } | null> {
  const orgId = adminOrgId();
  const orgSlug = adminOrgSlug();
  if (!orgId && !orgSlug) return null;

  const user = await currentUser();
  if (!user) return null;

  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({
    userId: user.id,
    limit: 100,
  });
  const membership = memberships.data.find(
    (m) => (orgId && m.organization.id === orgId) || (orgSlug && m.organization.slug === orgSlug),
  );
  if (!membership) return null;

  const email =
    user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? '';
  return { email, role: membership.role };
}
