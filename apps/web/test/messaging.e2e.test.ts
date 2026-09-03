import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

process.env.TEST_CLERK_ID = `test-msg-${nodeCrypto.randomUUID()}`;
delete process.env.OPENAI_API_KEY;
process.env.LUXEL_DEV_MOCK = '1';

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
) => Promise<{ ok: boolean; action?: string; threadId?: string; draftId?: string }>;
let sendReplyDraft: (
  id: string,
  body: string,
  actor: string,
) => Promise<{ ok: boolean; reason?: string }>;
let simulateThreadReply: (
  threadId: string,
) => Promise<{ ok: boolean; reason?: string; draft?: { id: string; body: string } }>;
let seedImportedProperty: (i: unknown) => Promise<{ ok: boolean; id?: string }>;
let updatePropertyContext: (i: unknown) => Promise<{ ok: boolean }>;
let customerId: string;

beforeAll(async () => {
  if (!LIVE) return;
  handleInboundMessage = (await import('../src/lib/channels/pipeline')).handleInboundMessage;
  const drafts = await import('../src/lib/messaging/drafts');
  sendReplyDraft = drafts.sendReplyDraft;
  simulateThreadReply = drafts.simulateThreadReply;
  seedImportedProperty = (await import('./helpers/seed')).seedImportedProperty;
  updatePropertyContext = (await import('../src/app/[locale]/(site)/properties/copilot-actions'))
    .updatePropertyContext;
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
  it('auto-replies to a benign message when the property sends without review', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Mensajes' });
    const propertyId = prop.id!;
    await updatePropertyContext({ propertyId, answers: { wifi: 'Hay wifi en todo el depto.' } });
    await admin.from('properties').update({ ai_review: false }).eq('id', propertyId);

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

  it('holds the reply as a pending draft by default, and nothing reaches the guest', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Borrador' });
    const propertyId = prop.id!;
    await updatePropertyContext({ propertyId, answers: { wifi: 'Hay wifi en todo el depto.' } });

    const r = await handleInboundMessage({
      propertyId,
      externalThreadId: 't-draft',
      body: '¿Hay wifi?',
    });
    expect(r.action).toBe('drafted');
    expect(r.draftId).toBeTruthy();

    const { data: msgs } = await admin
      .from('guest_messages')
      .select('source')
      .eq('thread_id', r.threadId!);
    expect(msgs).toHaveLength(1);
    expect(msgs![0].source).toBe('guest');

    const { data: draft } = await admin
      .from('guest_reply_drafts')
      .select('status, body, origin')
      .eq('id', r.draftId!)
      .single();
    expect(draft!.status).toBe('pending');
    expect(draft!.origin).toBe('inbound');
    expect(String(draft!.body).length).toBeGreaterThan(0);
  });

  it('sends the draft only when an operator approves it', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Aprobado' });
    const r = await handleInboundMessage({
      propertyId: prop.id!,
      externalThreadId: 't-approve',
      body: '¿Hay wifi?',
    });
    expect(r.action).toBe('drafted');

    const sent = await sendReplyDraft(
      r.draftId!,
      'Sí, hay wifi. Te dejo la clave al llegar.',
      'op',
    );
    expect(sent.ok).toBe(true);

    const { data: msgs } = await admin
      .from('guest_messages')
      .select('source, body')
      .eq('thread_id', r.threadId!)
      .order('created_at', { ascending: true });
    expect(msgs).toHaveLength(2);
    expect(msgs![1].source).toBe('host');

    const { data: draft } = await admin
      .from('guest_reply_drafts')
      .select('status, decided_by')
      .eq('id', r.draftId!)
      .single();
    expect(draft!.status).toBe('sent');
    expect(draft!.decided_by).toBe('op');

    const again = await sendReplyDraft(r.draftId!, 'Otra vez', 'op');
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('already_decided');
  });

  it('simulates a reply for a thread already on record without sending it', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto Simulado' });
    const r = await handleInboundMessage({
      propertyId: prop.id!,
      externalThreadId: 't-sim',
      body: '¿Hay wifi?',
    });

    const sim = await simulateThreadReply(r.threadId!);
    expect(sim.ok).toBe(true);
    expect(sim.draft!.id).not.toBe(r.draftId);

    const { data: drafts } = await admin
      .from('guest_reply_drafts')
      .select('id, status, origin')
      .eq('thread_id', r.threadId!);
    const pending = drafts!.filter((d) => d.status === 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].origin).toBe('simulation');

    const { data: msgs } = await admin
      .from('guest_messages')
      .select('source')
      .eq('thread_id', r.threadId!);
    expect(msgs).toHaveLength(1);
  });

  it('routes to a Luxel human when the AI is off for the property, nothing auto-sent', async () => {
    const prop = await seedImportedProperty({ nickname: 'Depto IA Apagada' });
    await updatePropertyContext({
      propertyId: prop.id,
      answers: { wifi: 'Hay wifi en todo el depto.' },
    });
    await admin.from('properties').update({ ai_enabled: false }).eq('id', prop.id!);

    const r = await handleInboundMessage({
      propertyId: prop.id!,
      externalThreadId: 't-off',
      body: '¿Hay wifi?',
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
    const prop = await seedImportedProperty({ nickname: 'Depto Molesto' });
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
    expect(msgs).toHaveLength(1);
    expect(msgs![0].source).toBe('guest');
  });
});
