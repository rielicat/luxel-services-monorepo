'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { currentCustomerId, ownsProperty } from '@/lib/host/owner';
import { isAddonActive } from '@/lib/addons/store';
import { resolvePricelabsRef, linkPricelabsListing } from '@/lib/pricelabs/link';
import { updatePricelabsListing } from '@/lib/pricelabs/client';

const SettingsSchema = z.object({
  propertyId: z.string().uuid(),
  base: z.number().int().min(1_000).max(50_000_000).optional(),
  min: z.number().int().min(1_000).max(50_000_000).optional(),
  max: z.number().int().min(1_000).max(50_000_000).optional(),
});

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

export async function refreshPricingLink(
  propertyId: unknown,
): Promise<{ ok: boolean; status?: string }> {
  const id = z.string().uuid().safeParse(propertyId);
  if (!id.success) return { ok: false };
  const cid = await currentCustomerId();
  if (!cid) return { ok: false };
  if (!(await ownsProperty(cid, id.data))) return { ok: false };
  if (!(await isAddonActive(id.data, 'dynamic_pricing'))) return { ok: false };

  const status = await linkPricelabsListing(id.data);
  revalidatePath('/properties');
  return { ok: true, status };
}
