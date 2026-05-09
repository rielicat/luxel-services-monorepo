import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from './supabase/server';

export interface CustomerRow {
  id: string;
  clerk_user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  preferred_locale: string;
}

/**
 * Returns the Supabase customer row for the signed-in Clerk user, creating it
 * lazily on first access. The Clerk webhook is the primary path; this is a
 * fallback so a missed webhook doesn't break the account page.
 */
export async function getOrCreateCustomer(): Promise<CustomerRow | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createSupabaseServiceRoleClient();
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (existing) return existing as CustomerRow;

  const user = await currentUser();
  if (!user) return null;

  const email = user.emailAddresses[0]?.emailAddress ?? '';
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || null;
  const phone = user.phoneNumbers[0]?.phoneNumber ?? null;

  const { data: created } = await supabase
    .from('customers')
    .insert({ clerk_user_id: userId, email, full_name: fullName, phone })
    .select('*')
    .single();
  return (created ?? null) as CustomerRow | null;
}
