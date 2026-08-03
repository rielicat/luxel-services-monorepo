import 'server-only';
import { sendHospitableMessage } from './hospitable';
import { providerApiKey } from './credentials';

/**
 * The narrow SEND port used by the AI messaging pipeline: given a thread id and
 * a body, deliver it. Deliberately not called ChannelProvider — that name now
 * belongs to the full read/write contract in ./types.ts, and two same-named
 * interfaces over the same domain is how the wrong one gets implemented.
 *
 * This port is the older, smaller seam. When the sync moves onto the full
 * contract, ChannelProvider.sendMessage absorbs it and this file goes away.
 */
export interface SendOpts {
  token?: string | null;
}

export interface MessageSender {
  name: string;
  /** Sends a reply into the guest thread. Returns a provider message id, or null. */
  send(externalThreadId: string | null, body: string, opts?: SendOpts): Promise<string | null>;
}

const hospitable: MessageSender = {
  name: 'hospitable',
  async send(externalThreadId, body, opts) {
    const token = opts?.token ?? providerApiKey();
    if (!token || !externalThreadId) return null;
    return sendHospitableMessage(token, externalThreadId, body);
  },
};

// Local/dev adapter — records the send so the pipeline is exercisable end-to-end.
const local: MessageSender = {
  name: 'local',
  async send() {
    return `local_${Date.now()}`;
  },
};

export function getMessageSender(name: string): MessageSender {
  return name === 'hospitable' ? hospitable : local;
}
