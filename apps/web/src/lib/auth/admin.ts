import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';

/**
 * Operator/founder check, controlled entirely in Clerk: the user's
 * `publicMetadata.role` must be "admin" (set it in Clerk Dashboard → Users →
 * <user> → Metadata, or via the backend API). No env allow-lists — who counts
 * as an operator is managed where the users live.
 */
export async function isClerkAdmin(userId: string): Promise<boolean> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return user.publicMetadata?.role === 'admin';
  } catch {
    return false;
  }
}
