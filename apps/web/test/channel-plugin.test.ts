/**
 * The plugin seam. These assertions are what make "swap the provider later"
 * true rather than aspirational: the scheduler resolves a plugin by id, a wrong
 * id fails loudly instead of falling back, and the capability flags that gate
 * real branches are actually declared.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  channelPlugin,
  registeredProviderIds,
  activeChannelPlugin,
  DEFAULT_PROVIDER,
} from '../src/lib/channels/registry';

const original = process.env.CHANNEL_PROVIDER;
const originalCron = process.env.CRON_SECRET;
afterEach(() => {
  if (originalCron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCron;
  if (original === undefined) delete process.env.CHANNEL_PROVIDER;
  else process.env.CHANNEL_PROVIDER = original;
});

describe('channel plugin registry', () => {
  it('registers Hospitable and nothing else', () => {
    expect(registeredProviderIds()).toEqual(['hospitable']);
    expect(channelPlugin('hospitable')?.id).toBe('hospitable');
  });

  it('defaults to Hospitable when CHANNEL_PROVIDER is unset', () => {
    delete process.env.CHANNEL_PROVIDER;
    const r = activeChannelPlugin();
    expect(r.ok).toBe(true);
    expect(r.ok && r.plugin.id).toBe(DEFAULT_PROVIDER);
  });

  it('fails loudly on an unregistered provider instead of falling back', () => {
    // Silently falling back would mirror the WRONG account into the customer's
    // rows — the mirror is keyed per provider, so this must never degrade.
    process.env.CHANNEL_PROVIDER = 'beds24';
    const r = activeChannelPlugin();
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.requested).toBe('beds24');
    expect(channelPlugin('beds24')).toBeNull();
  });

  it('is case- and whitespace-insensitive, so a pasted value still resolves', () => {
    process.env.CHANNEL_PROVIDER = '  Hospitable ';
    expect(activeChannelPlugin().ok).toBe(true);
  });

  it('makes the sync route refuse to run on an unregistered provider', async () => {
    // The guard has to hold at the ROUTE, not just in the registry: a sync that
    // proceeded under the wrong provider would mirror the wrong ids into a
    // customer's rows and then prune against them.
    process.env.CHANNEL_PROVIDER = 'beds24';
    process.env.CRON_SECRET = 'cron-secret-under-test';
    const { GET } = await import('../src/app/api/cron/sync/route');
    const res = await GET(
      new Request('http://localhost/api/cron/sync', {
        headers: { authorization: 'Bearer cron-secret-under-test' },
      }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; registered: string[] };
    expect(body.ok).toBe(false);
    expect(body.registered).toEqual(['hospitable']);

    // Fails closed: no secret configured means the endpoint refuses, rather
    // than accepting anyone who knows the path. It sends guest messages.
    delete process.env.CRON_SECRET;
    expect((await GET(new Request('http://localhost/api/cron/sync'))).status).toBe(401);
  });

  it('declares the capabilities that gate real behaviour', () => {
    const p = channelPlugin('hospitable')!;
    // Without this the product has no check-in delivery and no AI replies.
    expect(p.capabilities.sendsGuestMessages).toBe(true);
    // hasHostIdentity is what the cron route reads before calling autoAssign.
    expect(p.capabilities.hasHostIdentity).toBe(true);
    expect(typeof p.autoAssign).toBe('function');
  });
});
