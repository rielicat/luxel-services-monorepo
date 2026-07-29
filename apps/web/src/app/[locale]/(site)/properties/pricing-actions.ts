'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';
import { isAddonActive } from '@/lib/addons/store';
import { resolvePricelabsRef, linkPricelabsListing } from '@/lib/pricelabs/link';
import { getPricelabsPrices, updatePricelabsListing } from '@/lib/pricelabs/client';

/**
 * Host-facing pricing controls. Every action takes a PROPERTY id and resolves
 * the PriceLabs listing through `resolvePricelabsRef`, which authorises
 * ownership first — a caller can never name a listing directly, so one
 * customer's request can never touch another's rates.
 */

const santiagoToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const plusDays = (d: string, n: number) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export type RecommendedDay = { date: string; priceClp: number; minStay: number | null };

/** PriceLabs' recommendations for the caller's own listing. */
export async function getRecommendedPrices(
  propertyId: unknown,
): Promise<{ ok: boolean; days?: RecommendedDay[]; error?: string }> {
  const id = z.string().uuid().safeParse(propertyId);
  if (!id.success) return { ok: false, error: 'validation' };
  const cid = await currentCustomerId();
  if (!cid) return { ok: false, error: 'unauthorized' };
  const ref = await resolvePricelabsRef(cid, id.data);
  if (!ref) return { ok: false, error: 'not_linked' };

  const from = santiagoToday();
  const rows = await getPricelabsPrices(ref, from, plusDays(from, 30));
  if (!rows) return { ok: false, error: 'upstream' };
  return {
    ok: true,
    days: rows
      .filter((d) => d.price != null && d.price > 0)
      .map((d) => ({ date: d.date, priceClp: Math.round(d.price!), minStay: d.min_stay ?? null })),
  };
}

const SettingsSchema = z.object({
  propertyId: z.string().uuid(),
  // CLP, whole pesos. Bounded to keep a typo from publishing an absurd rate.
  base: z.number().int().min(1_000).max(50_000_000).optional(),
  min: z.number().int().min(1_000).max(50_000_000).optional(),
  max: z.number().int().min(1_000).max(50_000_000).optional(),
});

/** The host's own floor/ceiling/base for their listing. */
export async function updatePricingSettings(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const p = SettingsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'validation' };
  const { propertyId, base, min, max } = p.data;
  if (min != null && max != null && min > max) return { ok: false, error: 'min_over_max' };
  if (base != null && min != null && base < min) return { ok: false, error: 'base_under_min' };
  if (base != null && max != null && base > max) return { ok: false, error: 'base_over_max' };

  const cid = await currentCustomerId();
  if (!cid) return { ok: false, error: 'unauthorized' };
  const ref = await resolvePricelabsRef(cid, propertyId);
  if (!ref) return { ok: false, error: 'not_linked' };

  const ok = await updatePricelabsListing(ref, { base, min, max });
  if (!ok) return { ok: false, error: 'upstream' };
  revalidatePath('/properties');
  return { ok: true };
}

/** Re-checks whether the listing has appeared under Luxel's account yet — i.e.
 *  whether the host has granted manager access. Ownership-gated. */
export async function refreshPricingLink(
  propertyId: unknown,
): Promise<{ ok: boolean; status?: string }> {
  const id = z.string().uuid().safeParse(propertyId);
  if (!id.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  // resolvePricelabsRef can't be used here: it requires an existing mapping,
  // and the whole point is to create one. Enforce the same two gates directly.
  if (!(await ownsProperty(cid, id.data))) return { ok: false };
  if (!(await isAddonActive(id.data, 'dynamic_pricing'))) return { ok: false };

  const status = await linkPricelabsListing(id.data);
  revalidatePath('/properties');
  return { ok: true, status };
}
