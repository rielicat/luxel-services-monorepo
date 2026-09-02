import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';

export async function isClerkAdmin(userId: string): Promise<boolean> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return user.publicMetadata?.role === 'admin';
  } catch {
    return false;
  }
}
