import 'server-only';
import { currentUser, clerkClient } from '@clerk/nextjs/server';

function adminOrgId(): string {
  return (process.env.LUXEL_ADMIN_ORG_ID ?? '').trim();
}
function adminOrgSlug(): string {
  return (process.env.LUXEL_ADMIN_ORG_SLUG ?? '').trim();
}

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
