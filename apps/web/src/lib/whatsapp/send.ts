import 'server-only';

const GRAPH = 'https://graph.facebook.com/v21.0';

/** True when the WhatsApp Cloud API + an operator number are configured. */
export function whatsappBridgeConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && operatorNumber(),
  );
}

/** The Luxel operator/team WhatsApp number (digits only) that receives handoffs. */
export function operatorNumber(): string | null {
  const n = process.env.LUXEL_OPERATOR_WHATSAPP?.replace(/[^\d]/g, '');
  return n && n.length >= 8 ? n : null;
}

/**
 * Sends a text via the WhatsApp Cloud API. Returns the provider message id
 * (wamid) so the operator's reply can be routed back by reply-context. Never
 * throws — a failed forward degrades to a persisted message + "te responderemos".
 */
export async function sendWhatsAppText(to: string, body: string): Promise<string | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return null;
  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/[^\d]/g, ''),
        type: 'text',
        text: { body: body.slice(0, 4000), preview_url: false },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { messages?: { id: string }[] };
    return json.messages?.[0]?.id ?? null;
  } catch {
    return null;
  }
}
