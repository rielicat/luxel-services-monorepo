import 'server-only';
import { WHATSAPP_TEXT_MAX, type WhatsAppTemplateKind } from '@luxel/shared/whatsapp';

export function whatsappBridgeConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_WORKER_SEND_URL && process.env.INTERNAL_SEND_TOKEN);
}

async function postToWorker(body: Record<string, unknown>): Promise<string | null> {
  const url = process.env.WHATSAPP_WORKER_SEND_URL;
  const token = process.env.INTERNAL_SEND_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { wamid?: string | null };
    return json.wamid ?? null;
  } catch {
    return null;
  }
}

export function sendWhatsAppViaWorker(text: string): Promise<string | null> {
  return postToWorker({ text: text.slice(0, WHATSAPP_TEXT_MAX) });
}

export function sendWhatsAppTemplate(
  to: string,
  kind: WhatsAppTemplateKind,
  params: string[],
  buttons?: string[],
): Promise<string | null> {
  return postToWorker({
    to,
    template: { kind, params, ...(buttons?.length ? { buttons } : {}) },
  });
}
