import 'server-only';
import {
  parseChecklistSteps,
  parseInventoryDifferences,
  parseInventoryItems,
  sameInventory,
  type CleaningChecklistStep,
  type InventoryDifference,
  type InventoryDraftStatus,
  type InventoryItem,
} from '@luxel/shared/cleaning-inventory';
import { isWalkthroughKey } from '@luxel/shared/cleaning-media';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { santiagoToday, shiftDate } from '../checkin/window';

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRAFT_CLAIM_MS = 90_000;
const NAME_MAX = 60;
const NOTE_MAX = 500;

export const CHECKLIST_TABLE = 'cleaning_checklist';
export const DRAFT_TABLE = 'cleaning_inventory_draft';
export const INVENTORY_TABLE = 'cleaning_inventory';
export const WALKTHROUGH_TABLE = 'cleaning_walkthrough';

export interface CleaningRef {
  id: string;
  propertyId: string;
  cleaningDate: string;
  status: string;
  crewConfirmedAt: string | null;
}

export interface WalkthroughState {
  id: string;
  status: string;
  bytes: number | null;
  durationSeconds: number | null;
  recordedAt: string | null;
}

export interface DraftState {
  id: string;
  status: InventoryDraftStatus;
  items: InventoryItem[];
  differences: InventoryDifference[];
}

export interface ConfirmedState {
  source: 'ai' | 'crew';
  items: InventoryItem[];
  note: string | null;
  confirmedAt: string;
  confirmedByName: string | null;
}

export interface CrewState {
  cleaning: CleaningRef;
  steps: CleaningChecklistStep[];
  walkthrough: WalkthroughState | null;
  draft: DraftState | null;
  confirmed: ConfirmedState | null;
}

export function isCleaningToken(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return trimmed || null;
}

export async function cleaningByToken(
  token: unknown,
  client?: Supabase,
): Promise<CleaningRef | null> {
  if (!isCleaningToken(token)) return null;
  const supabase = client ?? createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('cleanings')
    .select('id, property_id, cleaning_date, status, crew_confirmed_at')
    .eq('confirm_token', token)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    propertyId: data.property_id as string,
    cleaningDate: data.cleaning_date as string,
    status: data.status as string,
    crewConfirmedAt: (data.crew_confirmed_at as string | null) ?? null,
  };
}

export function walkthroughKeyBelongsTo(key: unknown, cleaningId: string): key is string {
  return (
    typeof key === 'string' &&
    isWalkthroughKey(key) &&
    key.startsWith(`walkthrough/${cleaningId.toLowerCase()}/`)
  );
}

function toDraft(row: Record<string, unknown> | null): DraftState | null {
  if (!row) return null;
  return {
    id: row.id as string,
    status: row.status as InventoryDraftStatus,
    items: parseInventoryItems(row.items),
    differences: parseInventoryDifferences(row.differences),
  };
}

export async function readCrewState(token: unknown, client?: Supabase): Promise<CrewState | null> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const cleaning = await cleaningByToken(token, supabase);
  if (!cleaning) return null;

  const [checklist, walkthrough, draft, confirmed] = await Promise.all([
    supabase
      .from(CHECKLIST_TABLE)
      .select('done_steps')
      .eq('cleaning_id', cleaning.id)
      .maybeSingle(),
    supabase
      .from(WALKTHROUGH_TABLE)
      .select('id, status, bytes, duration_seconds, recorded_at')
      .eq('cleaning_id', cleaning.id)
      .eq('status', 'stored')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from(DRAFT_TABLE)
      .select('id, status, items, differences')
      .eq('cleaning_id', cleaning.id)
      .maybeSingle(),
    supabase
      .from(INVENTORY_TABLE)
      .select('source, items, note, confirmed_at, confirmed_by_name')
      .eq('cleaning_id', cleaning.id)
      .maybeSingle(),
  ]);

  return {
    cleaning,
    steps: parseChecklistSteps(checklist.data?.done_steps),
    walkthrough: walkthrough.data
      ? {
          id: walkthrough.data.id as string,
          status: walkthrough.data.status as string,
          bytes: (walkthrough.data.bytes as number | null) ?? null,
          durationSeconds: (walkthrough.data.duration_seconds as number | null) ?? null,
          recordedAt: (walkthrough.data.recorded_at as string | null) ?? null,
        }
      : null,
    draft: toDraft(draft.data as Record<string, unknown> | null),
    confirmed: confirmed.data
      ? {
          source: confirmed.data.source === 'ai' ? 'ai' : 'crew',
          items: parseInventoryItems(confirmed.data.items),
          note: (confirmed.data.note as string | null) ?? null,
          confirmedAt: confirmed.data.confirmed_at as string,
          confirmedByName: (confirmed.data.confirmed_by_name as string | null) ?? null,
        }
      : null,
  };
}

export async function saveChecklist(
  cleaning: CleaningRef,
  steps: CleaningChecklistStep[],
  client?: Supabase,
): Promise<boolean> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const { error } = await supabase.from(CHECKLIST_TABLE).upsert(
    {
      cleaning_id: cleaning.id,
      property_id: cleaning.propertyId,
      done_steps: steps,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'cleaning_id' },
  );
  return !error;
}

export async function recordWalkthroughPending(
  cleaning: CleaningRef,
  key: string,
  contentType: string,
  client?: Supabase,
): Promise<string | null> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  await supabase
    .from(WALKTHROUGH_TABLE)
    .update({ status: 'failed', retention_until: new Date().toISOString() })
    .eq('cleaning_id', cleaning.id)
    .eq('status', 'pending');
  const { data } = await supabase
    .from(WALKTHROUGH_TABLE)
    .insert({
      cleaning_id: cleaning.id,
      property_id: cleaning.propertyId,
      status: 'pending',
      object_key: key,
      content_type: contentType,
    })
    .select('id')
    .single();
  return (data?.id as string | undefined) ?? null;
}

export async function markWalkthroughStored(
  cleaning: CleaningRef,
  key: string,
  bytes: number,
  durationSeconds: number | null,
  recordedByName: string | null,
  client?: Supabase,
): Promise<string | null> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from(WALKTHROUGH_TABLE)
    .update({
      status: 'stored',
      bytes,
      duration_seconds: durationSeconds,
      recorded_by_name: recordedByName,
      recorded_at: new Date().toISOString(),
    })
    .eq('cleaning_id', cleaning.id)
    .eq('object_key', key)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function storedWalkthrough(
  cleaningId: string,
  client?: Supabase,
): Promise<{ id: string; objectKey: string; contentType: string } | null> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from(WALKTHROUGH_TABLE)
    .select('id, object_key, content_type')
    .eq('cleaning_id', cleaningId)
    .eq('status', 'stored')
    .not('object_key', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const objectKey = data?.object_key as string | undefined;
  if (!data || !objectKey || !walkthroughKeyBelongsTo(objectKey, cleaningId)) return null;
  return {
    id: data.id as string,
    objectKey,
    contentType: (data.content_type as string | null) ?? 'video/mp4',
  };
}

export async function resetDraft(
  cleaning: CleaningRef,
  walkthroughId: string | null,
  status: InventoryDraftStatus,
  client?: Supabase,
): Promise<boolean> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const { error } = await supabase.from(DRAFT_TABLE).upsert(
    {
      cleaning_id: cleaning.id,
      property_id: cleaning.propertyId,
      walkthrough_id: walkthroughId,
      status,
      items: [],
      differences: [],
      model: null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'cleaning_id' },
  );
  return !error;
}

export async function claimDraft(cleaning: CleaningRef, client?: Supabase): Promise<boolean> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  const { data: row } = await supabase
    .from(DRAFT_TABLE)
    .select('id, status, claimed_at')
    .eq('cleaning_id', cleaning.id)
    .maybeSingle();

  if (!row) {
    const { data: created } = await supabase
      .from(DRAFT_TABLE)
      .insert({
        cleaning_id: cleaning.id,
        property_id: cleaning.propertyId,
        status: 'pending',
        claimed_at: now,
      })
      .select('id');
    return (created?.length ?? 0) > 0;
  }

  if (row.status === 'ready') return false;
  const claimedAt = row.claimed_at as string | null;
  if (claimedAt && Date.now() - new Date(claimedAt).getTime() <= DRAFT_CLAIM_MS) return false;

  const guarded = supabase
    .from(DRAFT_TABLE)
    .update({ status: 'pending', claimed_at: now })
    .eq('id', row.id as string);
  const { data } = await (
    claimedAt ? guarded.eq('claimed_at', claimedAt) : guarded.is('claimed_at', null)
  ).select('id');
  return (data?.length ?? 0) > 0;
}

export async function writeDraft(
  cleaning: CleaningRef,
  input: {
    status: InventoryDraftStatus;
    items: InventoryItem[];
    differences: InventoryDifference[];
    model: string | null;
  },
  client?: Supabase,
): Promise<boolean> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from(DRAFT_TABLE)
    .update({
      status: input.status,
      items: input.items,
      differences: input.differences,
      model: input.model,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('cleaning_id', cleaning.id);
  return !error;
}

export async function previousConfirmedRecord(
  propertyId: string,
  exceptCleaningId: string,
  client?: Supabase,
): Promise<{ cleaningId: string; items: InventoryItem[] } | null> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from(INVENTORY_TABLE)
    .select('cleaning_id, items')
    .eq('property_id', propertyId)
    .neq('cleaning_id', exceptCleaningId)
    .order('confirmed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { cleaningId: data.cleaning_id as string, items: parseInventoryItems(data.items) };
}

export async function previousConfirmedInventory(
  propertyId: string,
  exceptCleaningId: string,
  client?: Supabase,
): Promise<InventoryItem[]> {
  const record = await previousConfirmedRecord(propertyId, exceptCleaningId, client);
  return record?.items ?? [];
}

export async function confirmedInventoryItems(
  cleaningId: string,
  client?: Supabase,
): Promise<InventoryItem[]> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from(INVENTORY_TABLE)
    .select('items')
    .eq('cleaning_id', cleaningId)
    .maybeSingle();
  return parseInventoryItems(data?.items);
}

export async function confirmInventory(
  cleaning: CleaningRef,
  input: { items: InventoryItem[]; note: string | null; name: string | null },
  client?: Supabase,
): Promise<{ ok: boolean; source?: 'ai' | 'crew' }> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  const { data: draftRow } = await supabase
    .from(DRAFT_TABLE)
    .select('id, status, items')
    .eq('cleaning_id', cleaning.id)
    .maybeSingle();

  const draftReady = draftRow?.status === 'ready';
  const draftItems = draftReady ? parseInventoryItems(draftRow?.items) : [];
  const source: 'ai' | 'crew' =
    draftReady && draftItems.length && sameInventory(draftItems, input.items) ? 'ai' : 'crew';

  const { error } = await supabase.from(INVENTORY_TABLE).upsert(
    {
      cleaning_id: cleaning.id,
      property_id: cleaning.propertyId,
      draft_id: (draftRow?.id as string | undefined) ?? null,
      source,
      items: input.items,
      note: cleanText(input.note, NOTE_MAX),
      confirmed_by_name: cleanText(input.name, NAME_MAX),
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'cleaning_id' },
  );
  if (error) return { ok: false };

  await supabase
    .from('cleanings')
    .update({ status: 'done' })
    .eq('id', cleaning.id)
    .in('status', ['scheduled', 'suggested']);
  return { ok: true, source };
}

export const WORK_WINDOW_DAYS = 3;

export function withinCrewWindow(cleaning: CleaningRef): boolean {
  return santiagoToday() <= shiftDate(cleaning.cleaningDate, WORK_WINDOW_DAYS);
}

export function crewLinkReadable(cleaning: CleaningRef): boolean {
  if (cleaning.status === 'skipped' || !cleaning.crewConfirmedAt) return false;
  return withinCrewWindow(cleaning);
}

export function crewLinkEditable(cleaning: CleaningRef): boolean {
  return crewLinkReadable(cleaning) && cleaning.status !== 'done';
}
