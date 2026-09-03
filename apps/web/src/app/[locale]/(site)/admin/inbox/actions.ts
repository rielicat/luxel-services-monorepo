'use server';

import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { isClerkAdmin } from '@/lib/auth/admin';
import {
  discardReplyDraft,
  listInboxThreads,
  sendReplyDraft,
  simulateThreadReply,
  type InboxThread,
  type ReplyDraft,
} from '@/lib/messaging/drafts';

export type { InboxThread, ReplyDraft };

export interface InboxActionResult {
  ok: boolean;
  reason?: string;
  draft?: ReplyDraft;
}

async function requireAdmin(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId || !(await isClerkAdmin(userId))) return null;
  return userId;
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
  const actor = await requireAdmin();
  if (!actor) return { ok: false, reason: 'denied' };
  if (!IdSchema.safeParse(threadId).success) return { ok: false, reason: 'invalid' };

  const result = await simulateThreadReply(threadId);
  if (result.ok) revalidatePath('/admin/inbox');
  return result;
}

export async function approveDraft(input: {
  draftId: string;
  body: string;
}): Promise<InboxActionResult> {
  const actor = await requireAdmin();
  if (!actor) return { ok: false, reason: 'denied' };

  const parsed = SendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: 'invalid' };

  const result = await sendReplyDraft(parsed.data.draftId, parsed.data.body, actor);
  if (result.ok) revalidatePath('/admin/inbox');
  return result;
}

export async function rejectDraft(input: {
  draftId: string;
  handoff: boolean;
}): Promise<InboxActionResult> {
  const actor = await requireAdmin();
  if (!actor) return { ok: false, reason: 'denied' };
  if (!IdSchema.safeParse(input.draftId).success) return { ok: false, reason: 'invalid' };

  const result = await discardReplyDraft(input.draftId, actor, input.handoff);
  if (result.ok) revalidatePath('/admin/inbox');
  return result;
}
