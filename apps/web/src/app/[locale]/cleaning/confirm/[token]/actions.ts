'use server';

import { after } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';
import {
  parseChecklistSteps,
  parseInventoryItems,
  type InventoryItem,
} from '@luxel/shared/cleaning-inventory';
import {
  WALKTHROUGH_MAX_BYTES,
  isWalkthroughContentType,
  type WalkthroughContentType,
} from '@luxel/shared/cleaning-media';
import { geminiConfigured } from '@luxel/core/ai/gemini';
import { cleaningMediaConfigured, createWalkthroughUpload } from '@luxel/core/cleaning/media';
import {
  cleaningByToken,
  cleanText,
  crewLinkEditable,
  crewLinkReadable,
  confirmInventory,
  markWalkthroughStored,
  readCrewState,
  recordWalkthroughPending,
  resetDraft,
  saveChecklist,
  storedWalkthrough,
  walkthroughKeyBelongsTo,
  withinCrewWindow,
  type CleaningRef,
  type CrewState,
} from '@luxel/core/cleaning/inventory';
import { queueCleaningReview, startCleaningReview } from '@luxel/core/cleaning/review';

const Token = z.string().uuid();
const NAME_MAX = 60;
const NOTE_MAX = 500;

export interface UploadTicketResult {
  ok: boolean;
  error?: string;
  key?: string;
  uploadUrl?: string;
  ticket?: string;
  maxBytes?: number;
}

async function workable(token: unknown): Promise<CleaningRef | null> {
  const parsed = Token.safeParse(token);
  if (!parsed.success) return null;
  const cleaning = await cleaningByToken(parsed.data);
  if (!cleaning || !crewLinkEditable(cleaning)) return null;
  return cleaning;
}

export async function confirmCleaningAttendance(input: unknown): Promise<{ ok: boolean }> {
  const p = Token.safeParse(input);
  if (!p.success) return { ok: false };
  const cleaning = await cleaningByToken(p.data);
  if (!cleaning || cleaning.status === 'skipped' || !withinCrewWindow(cleaning)) {
    return { ok: false };
  }
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('cleanings')
    .update({ crew_confirmed_at: new Date().toISOString() })
    .eq('confirm_token', p.data)
    .eq('status', 'scheduled')
    .is('crew_confirmed_at', null)
    .select('id');
  return { ok: !error && (data?.length ?? 0) > 0 };
}

export async function loadCrewState(input: unknown): Promise<CrewState | null> {
  const p = Token.safeParse(input);
  if (!p.success) return null;
  const state = await readCrewState(p.data);
  if (!state || !crewLinkReadable(state.cleaning)) return null;
  return state;
}

export async function saveCleaningChecklist(
  token: unknown,
  steps: unknown,
): Promise<{ ok: boolean }> {
  const cleaning = await workable(token);
  if (!cleaning) return { ok: false };
  return { ok: await saveChecklist(cleaning, parseChecklistSteps(steps)) };
}

export async function startWalkthroughUpload(
  token: unknown,
  contentType: unknown,
  bytes: unknown,
): Promise<UploadTicketResult> {
  const cleaning = await workable(token);
  if (!cleaning) return { ok: false, error: 'unknown' };
  if (!cleaningMediaConfigured()) return { ok: false, error: 'unavailable' };
  if (typeof contentType !== 'string' || !isWalkthroughContentType(contentType)) {
    return { ok: false, error: 'unsupported' };
  }
  const size = typeof bytes === 'number' && Number.isFinite(bytes) ? Math.round(bytes) : 0;
  if (size <= 0) return { ok: false, error: 'empty' };
  if (size > WALKTHROUGH_MAX_BYTES) return { ok: false, error: 'too_large' };

  const ticket = await createWalkthroughUpload(
    cleaning.id,
    contentType as WalkthroughContentType,
    size,
  );
  if (!ticket) return { ok: false, error: 'unavailable' };
  const recorded = await recordWalkthroughPending(cleaning, ticket.key, contentType);
  if (!recorded) return { ok: false, error: 'unavailable' };
  return {
    ok: true,
    key: ticket.key,
    uploadUrl: ticket.uploadUrl,
    ticket: ticket.ticket,
    maxBytes: ticket.maxBytes,
  };
}

export async function finishWalkthroughUpload(
  token: unknown,
  key: unknown,
  bytes: unknown,
  durationSeconds: unknown,
  name: unknown,
): Promise<{ ok: boolean; analysing?: boolean }> {
  const cleaning = await workable(token);
  if (!cleaning) return { ok: false };
  if (!walkthroughKeyBelongsTo(key, cleaning.id)) return { ok: false };
  const size = typeof bytes === 'number' && Number.isFinite(bytes) ? Math.round(bytes) : 0;
  if (size <= 0 || size > WALKTHROUGH_MAX_BYTES) return { ok: false };
  const seconds =
    typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)
      ? Math.max(0, Math.round(durationSeconds))
      : null;

  const walkthroughId = await markWalkthroughStored(
    cleaning,
    key,
    size,
    seconds,
    cleanText(name, NAME_MAX),
  );
  if (!walkthroughId) return { ok: false };

  const analysing = geminiConfigured();
  await resetDraft(cleaning, walkthroughId, analysing ? 'pending' : 'unavailable');
  return { ok: true, analysing };
}

export async function confirmCleaningInventory(
  token: unknown,
  items: unknown,
  note: unknown,
  name: unknown,
): Promise<{ ok: boolean; error?: string; source?: 'ai' | 'crew' }> {
  const parsedToken = Token.safeParse(token);
  if (!parsedToken.success) return { ok: false, error: 'unknown' };
  const cleaning = await cleaningByToken(parsedToken.data);
  if (!cleaning || !crewLinkReadable(cleaning)) return { ok: false, error: 'unknown' };
  const parsed: InventoryItem[] = parseInventoryItems(items);
  if (!parsed.length) return { ok: false, error: 'empty' };
  if (!crewLinkEditable(cleaning)) return { ok: true };
  const result = await confirmInventory(cleaning, {
    items: parsed,
    note: cleanText(note, NOTE_MAX),
    name: cleanText(name, NAME_MAX),
  });
  if (!result.ok) return { ok: false, error: 'write_failed' };
  await scheduleReview(cleaning);
  return { ok: true, source: result.source };
}

async function scheduleReview(cleaning: CleaningRef): Promise<void> {
  try {
    const walkthrough = await storedWalkthrough(cleaning.id);
    const run = await queueCleaningReview(cleaning, walkthrough?.id ?? null);
    if (run) after(() => startCleaningReview(run));
  } catch {}
}
