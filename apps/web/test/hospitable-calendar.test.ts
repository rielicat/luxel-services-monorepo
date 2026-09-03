import { describe, it, expect, afterEach, vi } from 'vitest';
import { setHospitableCalendar } from '@luxel/shared/hospitable-calendar';

const CALENDAR_URL = 'https://public.api.hospitable.com/v2/properties/prop-uuid-1/calendar';

interface Call {
  url: string;
  method: string;
  auth: string;
  body: unknown;
}

function stubFetch(handler: (call: Call) => Response): Call[] {
  const calls: Call[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const call: Call = {
      url,
      method: (init?.method ?? 'GET').toUpperCase(),
      auth: new Headers(init?.headers).get('authorization') ?? '',
      body: JSON.parse((init?.body as string) ?? 'null'),
    };
    calls.push(call);
    return handler(call);
  });
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('setHospitableCalendar', () => {
  it('PUTs the dates the caller asked for, and nothing else', async () => {
    const calls = stubFetch(() => new Response(null, { status: 200 }));
    const result = await setHospitableCalendar('tok-1', 'prop-uuid-1', [
      { date: '2027-03-03', available: false },
      { date: '2027-03-04', available: false },
    ]);

    expect(result).toEqual({ ok: true, status: 200, detail: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(CALENDAR_URL);
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.auth).toBe('Bearer tok-1');
    expect(calls[0]!.body).toEqual({
      dates: [
        { date: '2027-03-03', available: false },
        { date: '2027-03-04', available: false },
      ],
    });
  });

  it('reports the refusal instead of throwing, so the operator learns why', async () => {
    stubFetch(() => new Response('{"message":"The dates field is invalid."}', { status: 422 }));
    const result = await setHospitableCalendar('tok-1', 'prop-uuid-1', [
      { date: '2027-03-03', available: false },
    ]);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
    expect(result.detail).toContain('invalid');
  });

  it('never throws into the caller when the network fails', async () => {
    stubFetch(() => {
      throw new Error('socket hang up');
    });
    await expect(
      setHospitableCalendar('tok-1', 'prop-uuid-1', [{ date: '2027-03-03', available: false }]),
    ).resolves.toEqual({ ok: false, status: 0, detail: null });
  });

  it('does not call Hospitable at all for an empty range', async () => {
    const calls = stubFetch(() => new Response(null, { status: 200 }));
    const result = await setHospitableCalendar('tok-1', 'prop-uuid-1', []);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
