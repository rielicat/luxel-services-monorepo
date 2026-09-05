'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';
import { requireAdmin } from '@/lib/admin';
import { listHospitableProperties } from '@luxel/core/channels/hospitable';
import {
  assignListing,
  hospitableAccess,
  unassignListing,
  unassignedListingIds,
} from '@luxel/core/channels/scope';
import { reconcileHospitableProperties } from '@luxel/core/channels/hospitable-sync';
import { providerApiKey } from '@luxel/core/channels/credentials';

export type UnclaimedListing = { externalListingId: string; name: string; address: string | null };
export type AssignedListing = {
  externalListingId: string;
  customerId: string;
  customerLabel: string;
  nickname: string | null;
  assignedAt: string;
};
export type AssignableCustomer = { id: string; label: string };

export async function listUnclaimedListings(): Promise<{
  ok: boolean;
  listings?: UnclaimedListing[];
}> {
  if (!(await requireAdmin())) return { ok: false };
  const token = providerApiKey();
  if (!token) return { ok: false };
  const remote = await listHospitableProperties(token);
  if (!remote) return { ok: false };
  const unassigned = await unassignedListingIds(remote.map((r) => r.id));
  if (!unassigned) return { ok: false };
  const free = new Set(unassigned);
  return {
    ok: true,
    listings: remote
      .filter((r) => free.has(r.id))
      .map((r) => ({
        externalListingId: r.id,
        name: r.name || r.public_name || r.id,
        address: [r.address?.street, r.address?.city].filter(Boolean).join(', ') || null,
      })),
  };
}

export async function listAssignments(): Promise<{ ok: boolean; rows?: AssignedListing[] }> {
  if (!(await requireAdmin())) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('listing_assignments')
    .select('external_listing_id, customer_id, assigned_at, customers(email, full_name)')
    .order('assigned_at', { ascending: false });
  if (error) return { ok: false };

  const ids = (data ?? []).map((r) => r.external_listing_id as string);
  const nicknames = new Map<string, string>();
  if (ids.length) {
    const { data: props } = await supabase
      .from('properties')
      .select('external_listing_id, nickname')
      .in('external_listing_id', ids);
    for (const p of props ?? []) {
      nicknames.set(p.external_listing_id as string, p.nickname as string);
    }
  }

  return {
    ok: true,
    rows: (data ?? []).map((r) => {
      const c = r.customers as { email?: string; full_name?: string } | null;
      return {
        externalListingId: r.external_listing_id as string,
        customerId: r.customer_id as string,
        customerLabel: c?.full_name || c?.email || (r.customer_id as string),
        nickname: nicknames.get(r.external_listing_id as string) ?? null,
        assignedAt: r.assigned_at as string,
      };
    }),
  };
}

export async function listAssignableCustomers(): Promise<{
  ok: boolean;
  customers?: AssignableCustomer[];
}> {
  if (!(await requireAdmin())) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('customers')
    .select('id, email, full_name')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return { ok: false };
  return {
    ok: true,
    customers: (data ?? []).map((c) => ({
      id: c.id as string,
      label: (c.full_name as string) || (c.email as string),
    })),
  };
}

const AssignSchema = z.object({
  externalListingId: z.string().min(1).max(200),
  customerId: z.string().uuid(),
  expectedOwnerId: z.string().uuid().nullable(),
});

export async function assignListingToCustomer(
  input: unknown,
): Promise<{ ok: boolean; imported?: number; importOk?: boolean; error?: string }> {
  const p = AssignSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'validation' };
  const admin = await requireAdmin();
  if (!admin) return { ok: false };
  if (
    !(await assignListing(
      p.data.externalListingId,
      p.data.customerId,
      admin.email,
      p.data.expectedOwnerId,
    ))
  ) {
    return { ok: false, error: 'stale' };
  }

  let imported = 0;
  let importOk = true;
  const access = await hospitableAccess(p.data.customerId);
  if (access?.scope === 'central') {
    const r = await reconcileHospitableProperties(p.data.customerId, access.token, 'central').catch(
      () => null,
    );
    importOk = Boolean(r?.ok);
    imported = r?.properties ?? 0;
  }
  revalidatePath('/properties');
  revalidatePath('/listings');
  return { ok: true, imported, importOk };
}

export async function unassignListingFromCustomer(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const p = z
    .object({
      externalListingId: z.string().min(1).max(200),
      expectedCustomerId: z.string().uuid(),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, error: 'validation' };
  if (!(await requireAdmin())) return { ok: false };
  const ok = await unassignListing(p.data.externalListingId, p.data.expectedCustomerId);
  if (ok) {
    revalidatePath('/properties');
    revalidatePath('/listings');
  }
  return ok ? { ok: true } : { ok: false, error: 'stale' };
}
