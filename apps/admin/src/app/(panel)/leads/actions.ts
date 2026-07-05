'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase';

const Schema = z.object({
  id: z.string().uuid(),
  status: z.enum(['new', 'contacted', 'converted', 'lost']),
});

export async function updateLeadStatus(input: {
  id: string;
  status: string;
}): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false };

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('leads')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id);

  revalidatePath('/leads');
  revalidatePath('/');
  return { ok: !error };
}
