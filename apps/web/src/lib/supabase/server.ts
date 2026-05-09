import { createServerClient } from '@supabase/ssr';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client authenticated with a Clerk-signed JWT.
 *
 * Requires a JWT template named `supabase` in the Clerk dashboard with claims:
 *   { "role": "authenticated", "aud": "authenticated", "sub": "{{user.id}}" }
 *
 * Supabase RLS policies then check `auth.jwt() ->> 'sub'` against `customers.clerk_user_id`.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { getToken } = await auth();
  const supabaseAccessToken = await getToken({
    template: process.env.CLERK_JWT_TEMPLATE_NAME ?? 'supabase',
  });

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: supabaseAccessToken ? { Authorization: `Bearer ${supabaseAccessToken}` } : {},
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; middleware will refresh.
          }
        },
      },
    },
  );
}

/**
 * Service-role client for trusted server contexts (webhooks, cron, admin tasks only).
 * Bypasses RLS — never expose to the browser.
 */
export function createSupabaseServiceRoleClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    },
  );
}
