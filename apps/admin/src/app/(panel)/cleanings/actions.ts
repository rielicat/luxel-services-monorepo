'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase';
import { createWalkthroughReadUrl } from '@/lib/media';
import { WALKTHROUGH_TABLE } from '@/lib/cleanings';
import { REVIEW_TABLE, startCleaningReview } from '@/lib/review';

export interface WalkthroughUrlResult {
  ok: boolean;
  error?: string;
  url?: string;
  contentType?: string;
}

const Id = z.string().uuid();

export async function loadWalkthroughUrl(input: unknown): Promise<WalkthroughUrlResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'denied' };
  const parsed = Id.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const supabase = createServiceClient();
  const { data } = await supabase
    .from(WALKTHROUGH_TABLE)
    .select('object_key, content_type, status')
    .eq('id', parsed.data)
    .maybeSingle();
  const key = data?.object_key as string | undefined;
  if (!data || !key) return { ok: false, error: 'purged' };

  const ticket = await createWalkthroughReadUrl(key);
  if (!ticket) return { ok: false, error: 'unavailable' };
  return {
    ok: true,
    url: ticket.url,
    contentType: (data.content_type as string | null) ?? 'video/mp4',
  };
}

export interface RetryReviewResult {
  ok: boolean;
  error?: string;
  started?: boolean;
}

export async function retryCleaningReview(input: unknown): Promise<RetryReviewResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'denied' };
  const parsed = Id.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const supabase = createServiceClient();
  const { data } = await supabase
    .from(REVIEW_TABLE)
    .update({
      status: 'queued',
      reason: null,
      attempts: 0,
      claimed_at: null,
      notified_at: null,
      finished_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data)
    .select('id');
  if (!(data?.length ?? 0)) return { ok: false, error: 'invalid' };

  const instanceId = await startCleaningReview(parsed.data);
  if (instanceId) {
    await supabase
      .from(REVIEW_TABLE)
      .update({ workflow_instance_id: instanceId })
      .eq('id', parsed.data);
  }
  revalidatePath('/cleanings');
  return { ok: true, started: Boolean(instanceId) };
}
