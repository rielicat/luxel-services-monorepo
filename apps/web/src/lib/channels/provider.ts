import 'server-only';
import { sendHospitableMessage } from './hospitable';
import { providerApiKey } from './credentials';

/**
 * Channel-provider abstraction (the migrate-off seam from the pivot brief). The
 * AI messaging layer talks only to this interface; Hospitable is the first real
 * adapter and a `local` adapter records-only so the loop is testable without a
 * PMS. SaaS model: sends carry the property owner's own token (resolved by the
 * caller via hospitableTokenForCustomer) — env is only the founder/dev fallback.
 */
export interface SendOpts {
  token?: string | null;
}

export interface ChannelProvider {
  name: string;
  /** Sends a reply into the guest thread. Returns a provider message id, or null. */
  send(externalThreadId: string | null, body: string, opts?: SendOpts): Promise<string | null>;
}

const hospitable: ChannelProvider = {
  name: 'hospitable',
  async send(externalThreadId, body, opts) {
    const token = opts?.token ?? providerApiKey();
    if (!token || !externalThreadId) return null;
    return sendHospitableMessage(token, externalThreadId, body);
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
  return name === 'hospitable' ? hospitable : local;
}
