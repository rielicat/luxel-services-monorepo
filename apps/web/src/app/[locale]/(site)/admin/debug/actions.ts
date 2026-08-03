'use server';

import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { isClerkAdmin } from '@/lib/auth/admin';
import { checkinToken } from '@/lib/checkin/tokens';
import { listHospitableProperties } from '@/lib/channels/hospitable';
import { listPricelabsListings, pricelabsConfigured } from '@/lib/pricelabs/client';
import { autoAssignListings } from '@/lib/channels/auto-assign';
import { appUrl } from '@/lib/urls';
import { providerApiKey } from '@/lib/channels/credentials';

/**
 * Operator debug bench. Everything here exercises a real integration or mints a
 * real link, so it is admin-only and lives away from the host dashboard —
 * hosts should never see link generators or connectivity probes.
 */

async function requireAdmin(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId || !(await isClerkAdmin(userId))) return null;
  return userId;
}

export type ProbeResult = { name: string; ok: boolean; detail: string };

/** Live connectivity for every external system the product depends on. */
export async function runProbes(): Promise<{ ok: boolean; probes?: ProbeResult[] }> {
  if (!(await requireAdmin())) return { ok: false };
  const probes: ProbeResult[] = [];

  const channelToken = providerApiKey();
  if (!channelToken) {
    probes.push({ name: 'channel', ok: false, detail: 'PROVIDER_API_KEY sin configurar' });
  } else {
    const remote = await listHospitableProperties(channelToken);
    probes.push({
      name: 'channel',
      ok: Boolean(remote),
      detail: remote ? `${remote.length} propiedad(es) visibles` : 'la cuenta central no respondió',
    });
  }

  if (!pricelabsConfigured()) {
    probes.push({ name: 'pricelabs', ok: false, detail: 'PRICELABS_API_KEY sin configurar' });
  } else {
    const rows = await listPricelabsListings();
    probes.push({
      name: 'pricelabs',
      ok: Boolean(rows),
      detail: rows ? `${rows.length} listing(s) en la cuenta` : 'la API no respondió',
    });
  }

  probes.push({
    name: 'email',
    ok: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM),
    detail:
      process.env.RESEND_API_KEY && process.env.RESEND_FROM
        ? 'configurado'
        : 'faltan RESEND_API_KEY / RESEND_FROM — los avisos al personal de aseo no salen',
  });

  const waReady = Boolean(process.env.WHATSAPP_WORKER_SEND_URL && process.env.INTERNAL_SEND_TOKEN);
  probes.push({
    name: 'whatsapp',
    ok: waReady,
    detail: waReady ? 'configurado' : 'faltan WHATSAPP_WORKER_SEND_URL / INTERNAL_SEND_TOKEN',
  });

  const supabase = createSupabaseServiceRoleClient();
  const { count, error } = await supabase
    .from('listing_assignments')
    .select('*', { count: 'exact', head: true });
  probes.push({
    name: 'assignments',
    ok: !error,
    detail: error ? 'no se pudo leer' : `${count ?? 0} propiedad(es) asignadas`,
  });

  return { ok: true, probes };
}

/** Mints a guest check-in link for inspection. Guests get theirs automatically
 *  on reservation import — this exists only to see what they see. */
export async function debugCheckinLink(
  input: unknown,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const p = z.object({ propertyId: z.string().uuid() }).safeParse(input);
  if (!p.success) return { ok: false, error: 'validation' };
  if (!(await requireAdmin())) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const token = checkinToken();
  const { error } = await supabase
    .from('checkins')
    .insert({ property_id: p.data.propertyId, token, status: 'pending' });
  if (error) return { ok: false, error: 'store' };
  return { ok: true, url: `${appUrl()}/checkin/${token}` };
}

/** The crew-facing confirmation page for a real upcoming cleaning. */
export async function debugCleaningLink(
  input: unknown,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const p = z.object({ propertyId: z.string().uuid() }).safeParse(input);
  if (!p.success) return { ok: false, error: 'validation' };
  if (!(await requireAdmin())) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('cleanings')
    .select('confirm_token')
    .eq('property_id', p.data.propertyId)
    .neq('status', 'skipped')
    .order('cleaning_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.confirm_token) return { ok: false, error: 'no_cleaning' };
  return { ok: true, url: `${appUrl()}/cleaning/confirm/${data.confirm_token}` };
}

/** Re-run attribution on demand instead of waiting for the cron. */
export async function debugAutoAssign(): Promise<{
  ok: boolean;
  assigned?: number;
  ambiguous?: number;
}> {
  if (!(await requireAdmin())) return { ok: false };
  const r = await autoAssignListings();
  return { ok: r.ok, assigned: r.assigned, ambiguous: r.ambiguous };
}

export type DebugProperty = { id: string; nickname: string; owner: string };

export async function listDebugProperties(): Promise<{ ok: boolean; rows?: DebugProperty[] }> {
  if (!(await requireAdmin())) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('properties')
    .select('id, nickname, customers(email, full_name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return { ok: false };
  return {
    ok: true,
    rows: (data ?? []).map((p) => {
      const c = p.customers as { email?: string; full_name?: string } | null;
      return {
        id: p.id as string,
        nickname: p.nickname as string,
        owner: c?.full_name || c?.email || '—',
      };
    }),
  };
}
