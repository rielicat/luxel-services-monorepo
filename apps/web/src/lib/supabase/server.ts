import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

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

  // Prefer the new sb_publishable_* key, fall back to the legacy anon key during rotation.
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publishableKey!, {
    global: {
      headers: supabaseAccessToken ? { Authorization: `Bearer ${supabaseAccessToken}` } : {},
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — safe to ignore; middleware will refresh.
        }
      },
    },
  });
}

/**
 * Secret-key client for trusted server contexts (webhooks, cron, admin tasks only).
 * Bypasses RLS — never expose to the browser.
 *
 * Prefers the new sb_secret_* key; falls back to the legacy SUPABASE_SERVICE_ROLE_KEY
 * during the rotation window so old deployments don't break.
 */
export function createSupabaseServiceRoleClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey!, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
