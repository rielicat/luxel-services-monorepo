'use server';

import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { isClerkAdmin } from '@/lib/auth/admin';
import { listHospitableProperties } from '@/lib/channels/hospitable';
import { assignListing, unassignListing, unassignedListingIds } from '@/lib/channels/scope';
import { reconcileHospitableProperties } from '@/lib/channels/hospitable-sync';

/**
 * Operator onboarding for the central account. When a host authorises their
 * Airbnb, EVERY listing on that account imports into Luxel's channel account
 * but belongs to nobody — invisible to every host until assigned here.
 *
 * Assignment IS the tenant boundary, so every action in this file is strictly
 * admin-only and delegates to `lib/channels/scope.ts`, which owns the
 * invariants (a transfer moves the mirror, an offboard deletes it).
 */

async function requireAdmin(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId || !(await isClerkAdmin(userId))) return null;
  return userId;
}

export type UnclaimedListing = { externalListingId: string; name: string; address: string | null };
export type AssignedListing = {
  externalListingId: string;
  customerId: string;
  customerLabel: string;
  nickname: string | null;
  assignedAt: string;
};
export type AssignableCustomer = { id: string; label: string };

/** Listings visible to Luxel's account that no customer owns yet. */
export async function listUnclaimedListings(): Promise<{
  ok: boolean;
  listings?: UnclaimedListing[];
}> {
  if (!(await requireAdmin())) return { ok: false };
  const token = process.env.HOSPITABLE_API_TOKEN;
  if (!token) return { ok: false };
  const remote = await listHospitableProperties(token);
  if (!remote) return { ok: false };
  const free = new Set(await unassignedListingIds(remote.map((r) => r.id)));
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

/** Who owns what today — the current state of the tenant boundary. */
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
});

/** Hand a listing to a customer, then import it immediately so the operator can
 *  see the result instead of waiting for the next sync. */
export async function assignListingToCustomer(
  input: unknown,
): Promise<{ ok: boolean; imported?: number }> {
  const p = AssignSchema.safeParse(input);
  if (!p.success) return { ok: false };
  const userId = await requireAdmin();
  if (!userId) return { ok: false };
  if (!(await assignListing(p.data.externalListingId, p.data.customerId, userId))) {
    return { ok: false };
  }
  let imported = 0;
  const token = process.env.HOSPITABLE_API_TOKEN;
  if (token) {
    const r = await reconcileHospitableProperties(p.data.customerId, token, 'central').catch(
      () => null,
    );
    imported = r?.properties ?? 0;
  }
  revalidatePath('/properties');
  revalidatePath('/admin/listings');
  return { ok: true, imported };
}

/** Offboard a listing: drops the assignment AND its mirrored data. Deliberate
 *  and irreversible — the sync never does this on its own. */
export async function unassignListingFromCustomer(input: unknown): Promise<{ ok: boolean }> {
  const p = z.object({ externalListingId: z.string().min(1).max(200) }).safeParse(input);
  if (!p.success) return { ok: false };
  if (!(await requireAdmin())) return { ok: false };
  const ok = await unassignListing(p.data.externalListingId);
  if (ok) {
    revalidatePath('/properties');
    revalidatePath('/admin/listings');
  }
  return { ok };
}
