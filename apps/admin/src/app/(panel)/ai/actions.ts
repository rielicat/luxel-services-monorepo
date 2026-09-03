'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase';

const FLAGS = ['ai_replies', 'ai_reviews'] as const;

const FlagSchema = z.enum(FLAGS);

const OneSchema = z.object({
  id: z.string().uuid(),
  flag: FlagSchema,
  value: z.boolean(),
});

const ManySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  flag: FlagSchema,
  value: z.boolean(),
});

const AllSchema = z.object({
  flag: FlagSchema,
  value: z.boolean(),
});

export interface AiFlagResult {
  ok: boolean;
  error?: string;
  changed?: number;
}

function eventName(flag: string, value: boolean): string {
  return `${flag}_${value ? 'on' : 'off'}`;
}

async function recordAiEvent(
  actor: string,
  flag: string,
  value: boolean,
  properties: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('analytics_events').insert({
    event: eventName(flag, value),
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
}): Promise<AiFlagResult> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.ai_flag_denied', { id: input.id, flag: input.flag });
    return { ok: false, error: 'denied' };
  }

  const parsed = OneSchema.safeParse(input);
  if (!parsed.success) {
    console.warn('admin.ai_flag_invalid', { id: input.id, flag: input.flag });
    return { ok: false, error: 'invalid' };
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
    return { ok: false, error: 'write_failed' };
  }

  await recordAiEvent(admin.email, parsed.data.flag, parsed.data.value, {
    propertyId: parsed.data.id,
  });
  revalidatePath('/ai');
  return { ok: true, changed: 1 };
}

export async function setSelectedPropertiesAiFlag(input: {
  ids: string[];
  flag: string;
  value: boolean;
}): Promise<AiFlagResult> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.ai_flag_selection_denied', { flag: input.flag });
    return { ok: false, error: 'denied' };
  }

  if (!input.ids.length) return { ok: false, error: 'no_selection' };

  const parsed = ManySchema.safeParse(input);
  if (!parsed.success) {
    console.warn('admin.ai_flag_selection_invalid', { flag: input.flag, count: input.ids.length });
    return { ok: false, error: 'invalid' };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('properties')
    .update({ [parsed.data.flag]: parsed.data.value })
    .in('id', parsed.data.ids)
    .select('id');

  if (error) {
    console.error('admin.ai_flag_selection_failed', {
      flag: parsed.data.flag,
      count: parsed.data.ids.length,
      message: error.message,
    });
    return { ok: false, error: 'write_failed' };
  }

  const changed = ((data ?? []) as unknown[]).length;
  await recordAiEvent(admin.email, parsed.data.flag, parsed.data.value, {
    properties: changed,
    scope: 'selection',
  });
  revalidatePath('/ai');
  return { ok: true, changed };
}

export async function setAllPropertiesAiFlag(input: {
  flag: string;
  value: boolean;
}): Promise<AiFlagResult> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.ai_flag_all_denied', { flag: input.flag });
    return { ok: false, error: 'denied' };
  }

  const parsed = AllSchema.safeParse(input);
  if (!parsed.success) {
    console.warn('admin.ai_flag_all_invalid', { flag: input.flag });
    return { ok: false, error: 'invalid' };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('properties')
    .update({ [parsed.data.flag]: parsed.data.value })
    .neq(parsed.data.flag, parsed.data.value)
    .select('id');

  if (error) {
    console.error('admin.ai_flag_all_failed', { flag: parsed.data.flag, message: error.message });
    return { ok: false, error: 'write_failed' };
  }

  const changed = ((data ?? []) as unknown[]).length;
  await recordAiEvent(admin.email, parsed.data.flag, parsed.data.value, {
    properties: changed,
    scope: 'all',
  });
  revalidatePath('/ai');
  return { ok: true, changed };
}

function splitOperation(raw: string): { flag: string; value: boolean } {
  const [flag = '', value = ''] = raw.split(':');
  return { flag, value: value === 'true' };
}

function resultUrl(result: AiFlagResult, hash = ''): string {
  const params = new URLSearchParams(
    result.ok ? { ok: String(result.changed ?? 0) } : { failed: result.error ?? 'write_failed' },
  );
  return `/ai?${params.toString()}${hash}`;
}

export async function submitAiFlag(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const result = await setPropertyAiFlag({
    id,
    flag: String(formData.get('flag') ?? ''),
    value: String(formData.get('value') ?? '') === 'true',
  });
  redirect(resultUrl(result, `#p-${id}`));
}

export async function submitAiFlagForSelection(formData: FormData): Promise<void> {
  const { flag, value } = splitOperation(String(formData.get('operation') ?? ''));
  const result = await setSelectedPropertiesAiFlag({
    ids: formData.getAll('ids').map(String),
    flag,
    value,
  });
  redirect(resultUrl(result));
}

export async function submitAiFlagForAll(formData: FormData): Promise<void> {
  const { flag, value } = splitOperation(String(formData.get('operation') ?? ''));
  const result = await setAllPropertiesAiFlag({ flag, value });
  redirect(resultUrl(result));
}
