import { createServerClient } from '@supabase/ssr';

export function createSupabaseServiceRoleClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey!, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
