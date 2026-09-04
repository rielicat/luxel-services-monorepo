import 'server-only';
import { sendHospitableInquiryMessage, sendHospitableMessage } from './hospitable';
import { providerApiKey } from './credentials';

export type ThreadKind = 'reservation' | 'inquiry';

interface SendOpts {
  token?: string | null;
  kind?: ThreadKind;
}

interface MessageSender {
  name: string;
  send(externalThreadId: string | null, body: string, opts?: SendOpts): Promise<string | null>;
}

const hospitable: MessageSender = {
  name: 'hospitable',
  async send(externalThreadId, body, opts) {
    const token = opts?.token ?? providerApiKey();
    if (!token || !externalThreadId) return null;
    return opts?.kind === 'inquiry'
      ? sendHospitableInquiryMessage(token, externalThreadId, body)
      : sendHospitableMessage(token, externalThreadId, body);
  },
};

const local: MessageSender = {
  name: 'local',
  async send() {
    return `local_${Date.now()}`;
  },
};

export function getMessageSender(name: string): MessageSender {
  return name === 'hospitable' ? hospitable : local;
}
