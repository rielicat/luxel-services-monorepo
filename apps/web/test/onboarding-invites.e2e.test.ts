import { describe, it, expect, beforeAll, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const LIVE = Boolean(SUPABASE_URL && SERVICE_KEY);

const TOKEN = 'test-internal-token';
process.env.INTERNAL_SEND_TOKEN = TOKEN;
process.env.TEST_CLERK_ID = `test-invites-${nodeCrypto.randomUUID()}`;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: process.env.TEST_CLERK_ID }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: unknown) => fn }));

const admin = LIVE
  ? createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } })
  : null;

let POST: (req: Request) => Promise<Response>;

const call = (body: unknown, token: string | null = TOKEN) =>
  POST(
    new Request('https://luxel.test/api/onboarding/invites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-luxel-internal-token': token } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

async function seedHost(label: string): Promise<string> {
  const { data, error } = await admin!
    .from('customers')
    .insert({
      clerk_user_id: `${process.env.TEST_CLERK_ID}-${label}`,
      email: `${label}-${nodeCrypto.randomUUID()}@test.cl`,
      full_name: label,
      created_at: '2020-01-01T00:00:00Z',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'seed failed');
  return data.id as string;
}

async function askToConnect(customerId: string, at = '2020-01-02T00:00:00Z'): Promise<void> {
  const { error } = await admin!
    .from('host_connection')
    .upsert(
      { customer_id: customerId, state: 'not_started', requested_at: at },
      { onConflict: 'customer_id' },
    );
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  if (!LIVE) return;
  ({ POST } = await import('../src/app/api/onboarding/invites/route'));
});

describe.skipIf(!LIVE)('the invitation queue the agent works from', () => {
  it('refuses a caller without the internal token', async () => {
    expect((await call({ op: 'pending' }, null)).status).toBe(401);
    expect((await call({ op: 'pending' }, 'wrong-token')).status).toBe(401);
  });

  it('lists only the hosts who asked to connect', async () => {
    const silent = await seedHost('silent');
    const asked = await seedHost('asked');
    await askToConnect(asked);

    const res = await call({ op: 'pending' });
    expect(res.status).toBe(200);
    const { hosts } = (await res.json()) as { hosts: { customerId: string }[] };
    const ids = hosts.map((h) => h.customerId);
    expect(ids).toContain(asked);
    expect(ids).not.toContain(silent);
  });

  it('records the invitation, moves the host to invite_sent and leaves the queue', async () => {
    const id = await seedHost('delivered');
    await askToConnect(id);
    const url = 'https://app.hospitable.com/invite/abc123';

    const res = await call({ op: 'deliver', customerId: id, inviteUrl: url });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, state: 'invite_sent' });

    const { data: row } = await admin!
      .from('host_connection')
      .select('state, invite_url, invite_sent_at')
      .eq('customer_id', id)
      .maybeSingle();
    expect(row!.state).toBe('invite_sent');
    expect(row!.invite_url).toBe(url);
    expect(row!.invite_sent_at).not.toBeNull();

    const after = (await (await call({ op: 'pending' })).json()) as {
      hosts: { customerId: string }[];
    };
    expect(after.hosts.map((h) => h.customerId)).not.toContain(id);
  });

  it('writes an audit event naming who delivered it', async () => {
    const id = await seedHost('audited');
    await askToConnect(id);
    await call({
      op: 'deliver',
      customerId: id,
      inviteUrl: 'https://app.hospitable.com/invite/xyz',
      source: 'cloud-agent',
    });
    const { data } = await admin!
      .from('analytics_events')
      .select('event, properties')
      .eq('customer_id', id)
      .eq('event', 'host_invite_delivered')
      .maybeSingle();
    expect(data!.properties).toMatchObject({ actor: 'cloud-agent' });
  });

  it('takes a delivery with no link, because Hospitable mails the host itself', async () => {
    const id = await seedHost('mailed');
    await askToConnect(id);
    const res = await call({ op: 'deliver', customerId: id, source: 'cloud-agent' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, state: 'invite_sent' });

    const { data: row } = await admin!
      .from('host_connection')
      .select('state, invite_url, invite_sent_at')
      .eq('customer_id', id)
      .maybeSingle();
    expect(row!.state).toBe('invite_sent');
    expect(row!.invite_url).toBeNull();
    expect(row!.invite_sent_at).not.toBeNull();
  });

  it('refuses an unknown customer, a non-https link and a host already connected', async () => {
    const unknown = await call({
      op: 'deliver',
      customerId: nodeCrypto.randomUUID(),
      inviteUrl: 'https://app.hospitable.com/invite/nope',
    });
    expect(unknown.status).toBe(404);

    const id = await seedHost('guarded');
    const insecure = await call({
      op: 'deliver',
      customerId: id,
      inviteUrl: 'http://app.hospitable.com/invite/plain',
    });
    expect(insecure.status).toBe(400);

    await admin!
      .from('host_connection')
      .upsert(
        { customer_id: id, state: 'connected', connected_at: new Date().toISOString() },
        { onConflict: 'customer_id' },
      );
    const settled = await call({
      op: 'deliver',
      customerId: id,
      inviteUrl: 'https://app.hospitable.com/invite/late',
    });
    expect(settled.status).toBe(409);
    expect(await settled.json()).toEqual({ ok: false, error: 'already_connected' });
  });
});
