import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. The operator app only ever reads server-side
 * (dashboards, telemetry) and updates lead status — all trusted, admin-gated.
 * Never expose this client or its key to the browser.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
