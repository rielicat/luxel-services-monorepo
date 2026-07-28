/**
 * End-to-end proof of the Phase-2 AI messaging loop: an inbound guest message is
 * stored, the AI (dev-mock) drafts + auto-sends via the local channel, or hands
 * off to a human on frustration; the host can reply and save a learned answer.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-msg-${nodeCrypto.randomUUID()}`;
delete process.env.OPENAI_API_KEY;
process.env.LUXEL_DEV_MOCK = '1'; // dev-mock AI drafting + local channel send

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

type Inbound = {
  propertyId: string;
  channel?: string;
  externalThreadId?: string | null;
  guestName?: string | null;
  body: string;
};

let admin: ReturnType<typeof createClient>;
let handleInboundMessage: (
  i: Inbound,
) => Promise<{ ok: boolean; action?: string; threadId?: string }>;
let hostReply: (i: unknown) => Promise<{ ok: boolean }>;
let saveLearnedAnswer: (i: unknown) => Promise<{ ok: boolean }>;
let createProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let updateGuestInfo: (i: unknown) => Promise<{ ok: boolean }>;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  handleInboundMessage = (await import('../src/lib/channels/pipeline')).handleInboundMessage;
  const m = await import('../src/app/[locale]/(site)/properties/messaging-actions');
  hostReply = m.hostReply;
  saveLearnedAnswer = m.saveLearnedAnswer;
  createProperty = (await import('./helpers/seed')).createProperty;
  updateGuestInfo = (await import('../src/app/[locale]/(site)/properties/copilot-actions'))
    .updateGuestInfo;
  admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

  const { data } = await admin
    .from('customers')
    .insert({
      clerk_user_id: process.env.TEST_CLERK_ID!,
      email: 'msg@test.cl',
      full_name: 'Msg Host',
    })
    .select('id')
    .single();
  customerId = data!.id as string;
});

afterEach(async () => {
  if (!LIVE || !customerId) return;
  await admin.from('properties').delete().eq('owner_id', customerId);
});

describe.skipIf(!LIVE)('AI guest messaging loop (end to end)', () => {
  it('auto-replies to a benign message and stores the thread', async () => {
    const prop = await createProperty({ nickname: 'Depto Mensajes' });
    const propertyId = prop.id!;
    await updateGuestInfo({ propertyId, guestInfo: 'WiFi: LuxelGuest / clave 1234.' });

    const r = await handleInboundMessage({
      propertyId,
      externalThreadId: 't-1',
      body: '¿Hay wifi?',
    });
    expect(r.ok).toBe(true);
    expect(r.action).toBe('sent');

    const { data: msgs } = await admin
      .from('guest_messages')
      .select('direction, source')
      .eq('thread_id', r.threadId!)
      .order('created_at', { ascending: true });
    expect(msgs!.map((m) => `${m.source}:${m.direction}`)).toEqual(['guest:in', 'ai:out']);
  });

  it('respects the host AI switch: disabled → straight to the inbox, nothing auto-sent', async () => {
    const prop = await createProperty({ nickname: 'Depto IA Apagada' });
    await updateGuestInfo({ propertyId: prop.id, guestInfo: 'WiFi: LuxelGuest / clave 1234.' });
    await admin.from('properties').update({ ai_enabled: false }).eq('id', prop.id!);

    const r = await handleInboundMessage({
      propertyId: prop.id!,
      externalThreadId: 't-off',
      body: '¿Hay wifi?', // benign — would auto-reply if the AI were on
    });
    expect(r.action).toBe('handoff');

    const { data: thread } = await admin
      .from('guest_threads')
      .select('status')
      .eq('id', r.threadId!)
      .single();
    expect(thread!.status).toBe('needs_host');
    const { data: msgs } = await admin
      .from('guest_messages')
      .select('source')
      .eq('thread_id', r.threadId!);
    expect(msgs).toHaveLength(1);
    expect(msgs![0].source).toBe('guest');
  });

  it('hands off to a human on frustration and does not auto-send', async () => {
    const prop = await createProperty({ nickname: 'Depto Molesto' });
    const r = await handleInboundMessage({
      propertyId: prop.id!,
      externalThreadId: 't-2',
      body: 'Esto es pésimo, quiero hablar con una persona',
    });
    expect(r.action).toBe('handoff');

    const { data: thread } = await admin
      .from('guest_threads')
      .select('status')
      .eq('id', r.threadId!)
      .single();
    expect(thread!.status).toBe('needs_host');
    const { data: msgs } = await admin
      .from('guest_messages')
      .select('source')
      .eq('thread_id', r.threadId!);
    expect(msgs).toHaveLength(1); // only the inbound; nothing auto-sent
    expect(msgs![0].source).toBe('guest');
  });

  it('lets the host reply and reopen the thread, and save a learned answer', async () => {
    const prop = await createProperty({ nickname: 'Depto Host' });
    const propertyId = prop.id!;
    const r = await handleInboundMessage({
      propertyId,
      externalThreadId: 't-3',
      body: 'quiero hablar con una persona',
    });
    expect(r.action).toBe('handoff');

    expect((await hostReply({ threadId: r.threadId, body: 'Hola, con gusto te ayudo.' })).ok).toBe(
      true,
    );
    const { data: thread } = await admin
      .from('guest_threads')
      .select('status')
      .eq('id', r.threadId!)
      .single();
    expect(thread!.status).toBe('open');
    const { data: msgs } = await admin
      .from('guest_messages')
      .select('source, direction')
      .eq('thread_id', r.threadId!);
    expect(msgs!.some((m) => m.source === 'host' && m.direction === 'out')).toBe(true);

    expect(
      (await saveLearnedAnswer({ propertyId, question: '¿Hay wifi?', answer: 'Sí, clave 1234.' }))
        .ok,
    ).toBe(true);
    const { count } = await admin
      .from('learned_answers')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', propertyId);
    expect(count).toBe(1);
  });
});
