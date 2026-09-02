import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from './supabase/server';

interface CustomerRow {
  id: string;
  clerk_user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
}

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

interface AccountProfile {
  email: string;
  full_name: string | null;
  phone: string | null;
}

interface AccountContext {
  customer: CustomerRow | null;
  profile: AccountProfile;
}

export async function getAccountContext(): Promise<AccountContext | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const customer = await getOrCreateCustomer();
  if (customer) {
    return {
      customer,
      profile: { email: customer.email, full_name: customer.full_name, phone: customer.phone },
    };
  }

  const user = await currentUser();
  return {
    customer: null,
    profile: {
      email: user?.emailAddresses[0]?.emailAddress ?? '',
      full_name: [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || null,
      phone: user?.phoneNumbers[0]?.phoneNumber ?? null,
    },
  };
}
