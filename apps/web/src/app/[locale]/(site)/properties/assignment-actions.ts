'use server';

import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { isClerkAdmin } from '@/lib/auth/admin';
import { listHospitableProperties } from '@/lib/channels/hospitable';
import { assignListing, unassignedListingIds } from '@/lib/channels/scope';

/**
 * Operator onboarding for the central account. When a host grants Luxel manager
 * access their listings appear under Luxel's credential but belong to nobody
 * yet — invisible to every host until assigned here. Assignment is the tenant
 * boundary, so it is strictly admin-only.
 */

async function requireAdmin(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId || !(await isClerkAdmin(userId))) return null;
  return userId;
}

export type UnclaimedListing = { externalListingId: string; name: string };

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
      })),
  };
}

/** Hand a listing to a customer. From here on the mirror imports it for them
 *  and nobody else can see it. */
export async function assignListingToCustomer(input: unknown): Promise<{ ok: boolean }> {
  const p = z
    .object({ externalListingId: z.string().min(1).max(200), customerId: z.string().uuid() })
    .safeParse(input);
  if (!p.success) return { ok: false };
  const userId = await requireAdmin();
  if (!userId) return { ok: false };
  const ok = await assignListing(p.data.externalListingId, p.data.customerId, userId);
  if (ok) revalidatePath('/properties');
  return { ok };
}
