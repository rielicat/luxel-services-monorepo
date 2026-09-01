import { createServerClient } from '@supabase/ssr';

/**
 * Public-read client (publishable key, no auth header).
 *
 * Use this for tables that have a public read policy: `pricing_config`,
 * `service_types`, `operation_points`, `faq_entries`. Doesn't require the
 * secret key, so a fresh dev environment with only URL + publishable key
 * can render the landing + calculator pages.
 */
export function createSupabasePublicClient() {
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publishableKey!, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}

/**
 * Secret-key client for trusted server contexts (webhooks, cron, admin tasks,
 * customer creation that has to bypass RLS). Never expose to the browser.
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
