'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase';

type Result = { ok: boolean };

const CreateSchema = z.object({
  name: z.string().min(2).max(120),
  operationPointId: z.string().uuid(),
});

export async function createOperator(input: {
  name: string;
  operationPointId: string;
}): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false };
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const supabase = createServiceClient();
  const { error } = await supabase.from('operators').insert({
    name: parsed.data.name.trim(),
    operation_point_id: parsed.data.operationPointId,
  });
  revalidatePath('/crew');
  return { ok: !error };
}

export async function setOperatorActive(input: { id: string; active: boolean }): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false };
  if (!z.string().uuid().safeParse(input.id).success) return { ok: false };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('operators')
    .update({ active: input.active })
    .eq('id', input.id);
  revalidatePath('/crew');
  return { ok: !error };
}

export async function renameOperator(input: { id: string; name: string }): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false };
  const parsed = z
    .object({ id: z.string().uuid(), name: z.string().min(2).max(120) })
    .safeParse(input);
  if (!parsed.success) return { ok: false };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('operators')
    .update({ name: parsed.data.name.trim() })
    .eq('id', parsed.data.id);
  revalidatePath('/crew');
  return { ok: !error };
}
