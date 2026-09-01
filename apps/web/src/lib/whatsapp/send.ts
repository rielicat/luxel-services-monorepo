import 'server-only';

/**
 * Every WhatsApp send goes through the Cloudflare worker, which owns the Cloud
 * API credentials and the business number — the web app holds only the worker's
 * /send URL and a shared token. Inbound (Meta's webhook) is likewise the worker's.
 */

/** True when the worker send bridge is configured. */
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

/**
 * Asks the worker to forward `text` to the operator's WhatsApp. Returns the
 * provider message id (wamid) so the operator's reply can be routed back by
 * reply-context. Never throws.
 */
export function sendWhatsAppViaWorker(text: string): Promise<string | null> {
  return postToWorker({ text: text.slice(0, 4000) });
}

/** The intents the worker knows how to send. It maps each to the Meta template
 *  name registered for it; the web never learns those names. */
export type WhatsAppTemplateKind = 'concierge_arrival' | 'cleaning_booking';

/**
 * Sends an approved Meta template to one number (E.164 digits) through the
 * worker. A template is the ONLY way to open a conversation with someone who
 * has not written to us in the last 24 hours — which is every conserje and
 * every cleaner, every time. Never throws.
 */
export function sendWhatsAppTemplate(
  to: string,
  kind: WhatsAppTemplateKind,
  params: string[],
): Promise<string | null> {
  return postToWorker({ to, template: { kind, params } });
}
