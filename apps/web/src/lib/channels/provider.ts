import 'server-only';

/**
 * Channel-provider abstraction (the migrate-off seam from the pivot brief). The
 * AI messaging layer talks only to this interface; Hospitable is the first real
 * adapter and a `local` adapter records-only so the loop is testable without a PMS.
 */
export interface ChannelProvider {
  name: string;
  /** Sends a reply into the guest thread. Returns a provider message id, or null. */
  send(externalThreadId: string | null, body: string): Promise<string | null>;
}

// Hospitable — gated on HOSPITABLE_API_TOKEN. The exact endpoint/shape must be
// confirmed against Hospitable's Public API before go-live; this is the wiring.
const hospitable: ChannelProvider = {
  name: 'hospitable',
  async send(externalThreadId, body) {
    const token = process.env.HOSPITABLE_API_TOKEN;
    if (!token || !externalThreadId) return null;
    try {
      const res = await fetch(
        `https://public.api.hospitable.com/v2/reservations/${externalThreadId}/messages`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ body, type: 'text' }),
        },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: { id?: string } };
      return json.data?.id ?? null;
    } catch {
      return null;
    }
  },
};

// Local/dev adapter — records the send so the pipeline is exercisable end-to-end.
const local: ChannelProvider = {
  name: 'local',
  async send() {
    return `local_${Date.now()}`;
  },
};

export function getChannelProvider(name: string): ChannelProvider {
  if (name === 'hospitable' && process.env.HOSPITABLE_API_TOKEN) return hospitable;
  return local;
}
