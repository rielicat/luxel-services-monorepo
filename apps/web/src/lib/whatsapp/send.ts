import 'server-only';

/**
 * Forwarding to WhatsApp goes through the Cloudflare worker (which owns the
 * WhatsApp Cloud API credentials and the operator number) — the web app only
 * needs the worker's /send URL and a shared token, so no WhatsApp secrets live
 * here. Inbound (Meta webhook) is likewise the worker's job.
 */

/** True when the worker send bridge is configured. */
export function whatsappBridgeConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_WORKER_SEND_URL && process.env.INTERNAL_SEND_TOKEN);
}

/**
 * Asks the worker to forward `text` to the operator's WhatsApp. Returns the
 * provider message id (wamid) so the operator's reply can be routed back by
 * reply-context. Never throws.
 */
export async function sendWhatsAppViaWorker(text: string): Promise<string | null> {
  const url = process.env.WHATSAPP_WORKER_SEND_URL;
  const token = process.env.INTERNAL_SEND_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: JSON.stringify({ text: text.slice(0, 4000) }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { wamid?: string | null };
    return json.wamid ?? null;
  } catch {
    return null;
  }
}
