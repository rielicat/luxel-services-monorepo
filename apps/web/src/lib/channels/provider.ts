import 'server-only';
import { sendHospitableMessage } from './hospitable';
import { providerApiKey } from './credentials';

interface SendOpts {
  token?: string | null;
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
    return sendHospitableMessage(token, externalThreadId, body);
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
