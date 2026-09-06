import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const recordEvent = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@luxel/core/analytics/store', () => ({ recordEvent }));

const { capture } = await import('@luxel/core/analytics/server');

describe('how many times a server event reaches PostHog', () => {
  beforeEach(() => {
    recordEvent.mockClear();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}')),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  });

  it('hands the event to the one store path and posts nothing itself', async () => {
    await capture('plan_requested', 'user_1', { plan: 'commission' }, { customerId: 'cus_1' });

    expect(recordEvent).toHaveBeenCalledTimes(1);
    expect(recordEvent).toHaveBeenCalledWith({
      event: 'plan_requested',
      distinctId: 'user_1',
      customerId: 'cus_1',
      properties: { plan: 'commission' },
      source: 'server',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('waits for the write, so a caller that awaits it is not racing the response', async () => {
    let settled = false;
    recordEvent.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 5));
      settled = true;
    });

    await capture('chat_message_sent', 'anon_1');

    expect(settled).toBe(true);
  });
});
