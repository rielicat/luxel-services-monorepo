'use server';

import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { createLead } from '@/lib/leads';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

const Schema = z.object({
  email: z.string().email().max(120),
  phone: z.string().max(30).optional(),
  serviceSlug: z.string().max(40).optional(),
  squareMeters: z.number().int().positive().max(2000).optional(),
  addressLine: z.string().max(200).optional(),
  commune: z.string().max(80).optional(),
  sessionId: z.string().max(64).optional(),
});

export type OutOfAreaLeadInput = z.infer<typeof Schema>;

export async function captureOutOfAreaLead(input: OutOfAreaLeadInput): Promise<{ ok: boolean }> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const { userId } = await auth();
  let customerId: string | null = null;
  if (userId) {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase
      .from('customers')
      .select('id')
      .eq('clerk_user_id', userId)
      .maybeSingle();
    customerId = data?.id ?? null;
  }

  const r = await createLead({
    source: 'out_of_area',
    email: parsed.data.email,
    phone: parsed.data.phone ?? null,
    serviceSlug: parsed.data.serviceSlug ?? null,
    squareMeters: parsed.data.squareMeters ?? null,
    addressLine: parsed.data.addressLine ?? null,
    commune: parsed.data.commune ?? null,
    sessionId: parsed.data.sessionId ?? null,
    customerId,
  });
  return { ok: r.ok };
}
