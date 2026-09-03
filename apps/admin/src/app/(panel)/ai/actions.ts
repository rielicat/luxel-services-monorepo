'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase';

const FLAGS = ['ai_enabled', 'ai_review'] as const;

const Schema = z.object({
  id: z.string().uuid(),
  flag: z.enum(FLAGS),
  value: z.boolean(),
});

const BulkSchema = z.object({
  flag: z.enum(FLAGS),
  value: z.boolean(),
});

const EVENT: Record<string, string> = {
  'ai_enabled:true': 'ai_enabled_on',
  'ai_enabled:false': 'ai_enabled_off',
  'ai_review:true': 'ai_review_on',
  'ai_review:false': 'ai_review_off',
};

async function recordAiEvent(
  actor: string,
  flag: string,
  value: boolean,
  properties: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('analytics_events').insert({
    event: EVENT[`${flag}:${value}`] ?? 'ai_flag_changed',
    distinct_id: `operator:${actor}`,
    properties: { ...properties, actor: 'operator' },
    source: 'server',
  });
  if (error) console.warn('admin.ai_event_failed', { flag, message: error.message });
}

export async function setPropertyAiFlag(input: {
  id: string;
  flag: string;
  value: boolean;
}): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.ai_flag_denied', { id: input.id, flag: input.flag });
    return { ok: false };
  }

  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    console.warn('admin.ai_flag_invalid', { id: input.id, flag: input.flag });
    return { ok: false };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('properties')
    .update({ [parsed.data.flag]: parsed.data.value })
    .eq('id', parsed.data.id)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    console.error('admin.ai_flag_write_failed', {
      id: parsed.data.id,
      flag: parsed.data.flag,
      message: error?.message ?? 'no row updated',
    });
    return { ok: false };
  }

  await recordAiEvent(admin.email, parsed.data.flag, parsed.data.value, {
    propertyId: parsed.data.id,
  });
  revalidatePath('/ai');
  return { ok: true };
}

export async function setAllPropertiesAiFlag(input: {
  flag: string;
  value: boolean;
}): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.ai_flag_bulk_denied', { flag: input.flag });
    return { ok: false };
  }

  const parsed = BulkSchema.safeParse(input);
  if (!parsed.success) {
    console.warn('admin.ai_flag_bulk_invalid', { flag: input.flag });
    return { ok: false };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('properties')
    .update({ [parsed.data.flag]: parsed.data.value })
    .neq(parsed.data.flag, parsed.data.value)
    .select('id');

  if (error) {
    console.error('admin.ai_flag_bulk_failed', {
      flag: parsed.data.flag,
      message: error.message,
    });
    return { ok: false };
  }

  await recordAiEvent(admin.email, parsed.data.flag, parsed.data.value, {
    properties: ((data ?? []) as unknown[]).length,
    scope: 'all',
  });
  revalidatePath('/ai');
  return { ok: true };
}

export async function submitAiFlag(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const { ok } = await setPropertyAiFlag({
    id,
    flag: String(formData.get('flag') ?? ''),
    value: String(formData.get('value') ?? '') === 'true',
  });
  redirect(ok ? `/ai#p-${id}` : `/ai?failed=${encodeURIComponent(id)}#p-${id}`);
}

export async function submitAiFlagForAll(formData: FormData): Promise<void> {
  const { ok } = await setAllPropertiesAiFlag({
    flag: String(formData.get('flag') ?? ''),
    value: String(formData.get('value') ?? '') === 'true',
  });
  redirect(ok ? '/ai' : '/ai?failed=all');
}
