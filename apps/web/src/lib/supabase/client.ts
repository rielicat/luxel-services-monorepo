import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client. Uses the publishable key (sb_publishable_*) —
 * RLS gates everything, and the Authorization header is added per-request once
 * the user has a Clerk JWT.
 *
 * Falls back to the legacy NEXT_PUBLIC_SUPABASE_ANON_KEY env var if the new
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY isn't set, easing the rotation window.
 */
export function createSupabaseBrowserClient() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key!);
}
