import { z } from 'zod';
import { WALKTHROUGH_MAX_BYTES } from '@luxel/shared/cleaning-media';
import type { InventoryDraftStatus } from '@luxel/shared/cleaning-inventory';
import { analyseWalkthrough, geminiConfigured } from '@luxel/core/ai/gemini';
import { createWalkthroughReadUrl, walkthroughObjectRequest } from '@luxel/core/cleaning/media';
import {
  claimDraft,
  cleaningByToken,
  crewLinkEditable,
  previousConfirmedInventory,
  storedWalkthrough,
  writeDraft,
  type CleaningRef,
} from '@luxel/core/cleaning/inventory';
import { createSupabaseServiceRoleClient } from '@luxel/core/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({ token: z.string().uuid() });
const BUDGET_MS = 50_000;

const reply = (status: InventoryDraftStatus, code = 200) =>
  Response.json({ status }, { status: code });

async function currentDraftStatus(cleaning: CleaningRef): Promise<InventoryDraftStatus | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('cleaning_inventory_draft')
    .select('status')
    .eq('cleaning_id', cleaning.id)
    .maybeSingle();
  return (data?.status as InventoryDraftStatus | undefined) ?? null;
}

async function fetchVideo(key: string, signal: AbortSignal): Promise<ArrayBuffer | null> {
  const ticket = await createWalkthroughReadUrl(key);
  if (!ticket) return null;
  const request = walkthroughObjectRequest(ticket);
  const res = await fetch(request.url, { signal, cache: 'no-store', headers: request.headers });
  if (!res.ok) return null;
  const body = await res.arrayBuffer();
  if (!body.byteLength || body.byteLength > WALKTHROUGH_MAX_BYTES) return null;
  return body;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad_request' }, { status: 400 });

  const cleaning = await cleaningByToken(parsed.data.token);
  if (!cleaning || !crewLinkEditable(cleaning)) {
    return Response.json({ error: 'unknown' }, { status: 404 });
  }

  const walkthrough = await storedWalkthrough(cleaning.id);
  if (!walkthrough) return reply('failed');

  if (!geminiConfigured()) {
    await writeDraft(cleaning, {
      status: 'unavailable',
      items: [],
      differences: [],
      model: null,
    });
    return reply('unavailable');
  }

  const existing = await currentDraftStatus(cleaning);
  if (existing === 'ready') return reply('ready');
  if (!(await claimDraft(cleaning))) return reply(existing ?? 'pending');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BUDGET_MS);
  try {
    const video = await fetchVideo(walkthrough.objectKey, controller.signal);
    if (!video) {
      await writeDraft(cleaning, { status: 'failed', items: [], differences: [], model: null });
      return reply('failed');
    }
    const baseline = await previousConfirmedInventory(cleaning.propertyId, cleaning.id);
    const analysis = await analyseWalkthrough({
      video,
      contentType: walkthrough.contentType,
      baseline,
      signal: controller.signal,
    });
    if (!analysis || !analysis.items.length) {
      await writeDraft(cleaning, { status: 'failed', items: [], differences: [], model: null });
      return reply('failed');
    }
    await writeDraft(cleaning, {
      status: 'ready',
      items: analysis.items,
      differences: analysis.differences,
      model: analysis.model,
    });
    return reply('ready');
  } catch {
    await writeDraft(cleaning, { status: 'failed', items: [], differences: [], model: null });
    return reply('failed');
  } finally {
    clearTimeout(timer);
  }
}
