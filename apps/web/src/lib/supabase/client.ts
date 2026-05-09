import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client. Uses the anon key — RLS gates everything,
 * and the Authorization header is added per-request once the user has a Clerk JWT.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
