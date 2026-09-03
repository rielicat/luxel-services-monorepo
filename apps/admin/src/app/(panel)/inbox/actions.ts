'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import {
  discardReplyDraft,
  listInboxThreads,
  sendReplyDraft,
  simulateThreadReply,
  type InboxThread,
  type ReplyDraft,
} from '@luxel/core/messaging/drafts';

export type { InboxThread, ReplyDraft };

export interface InboxActionResult {
  ok: boolean;
  reason?: string;
  draft?: ReplyDraft;
}

const IdSchema = z.string().uuid();
const SendSchema = z.object({
  draftId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export async function loadInbox(): Promise<{ ok: boolean; threads?: InboxThread[] }> {
  if (!(await requireAdmin())) return { ok: false };
  return { ok: true, threads: await listInboxThreads() };
}

export async function simulateReply(threadId: string): Promise<InboxActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, reason: 'denied' };
  if (!IdSchema.safeParse(threadId).success) return { ok: false, reason: 'invalid' };

  const result = await simulateThreadReply(threadId);
  if (result.ok) revalidatePath('/admin/inbox');
  return result;
}

export async function approveDraft(input: {
  draftId: string;
  body: string;
}): Promise<InboxActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, reason: 'denied' };

  const parsed = SendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: 'invalid' };

  const result = await sendReplyDraft(parsed.data.draftId, parsed.data.body, admin.email);
  if (result.ok) revalidatePath('/admin/inbox');
  return result;
}

export async function rejectDraft(input: {
  draftId: string;
  handoff: boolean;
}): Promise<InboxActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, reason: 'denied' };
  if (!IdSchema.safeParse(input.draftId).success) return { ok: false, reason: 'invalid' };

  const result = await discardReplyDraft(input.draftId, admin.email, input.handoff);
  if (result.ok) revalidatePath('/admin/inbox');
  return result;
}
