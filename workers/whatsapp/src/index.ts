/**
 * Luxel WhatsApp Webhook (Cloudflare Worker)
 *
 * Routes:
 *   GET  /webhook  → Meta verification handshake (`hub.challenge`)
 *   POST /webhook  → inbound message events; HMAC-SHA256 signature verified before parsing
 *
 * Behavior:
 *   - Verifies the Meta `x-hub-signature-256` header (constant-time compare)
 *   - For every inbound text message: tries to attribute by phone (E.164) to a customer,
 *     persists into public.messages (channel='whatsapp', direction='in'),
 *     then Supabase Realtime fans out to any web client listening on that customer's channel.
 *   - Outbound replies are sent from the Next.js API (so an authenticated user can reply).
 */

import { createClient } from '@supabase/supabase-js';

export interface Env {
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_APP_SECRET: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface InboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: InboundMessage[];
      };
      field: string;
    }>;
  }>;
}

async function verifySignature(
  secret: string,
  signatureHeader: string | null,
  body: string,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected =
    'sha256=' +
    [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  if (signatureHeader.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < signatureHeader.length; i++) {
    diff |= signatureHeader.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function persistInbound(env: Env, payload: WhatsAppWebhookPayload): Promise<void> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  type Row = {
    customer_id: string | null;
    direction: 'in';
    channel: 'whatsapp';
    body: string;
    whatsapp_message_id: string;
    metadata: Record<string, unknown>;
  };
  const rows: Row[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value.messages ?? [];
      for (const msg of messages) {
        if (msg.type !== 'text' || !msg.text?.body) continue;

        // Best-effort attribution: match by phone (we expect E.164 stored on customers.phone).
        const wa = msg.from.startsWith('+') ? msg.from : `+${msg.from}`;
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', wa)
          .maybeSingle();

        rows.push({
          customer_id: customer?.id ?? null,
          direction: 'in',
          channel: 'whatsapp',
          body: msg.text.body,
          whatsapp_message_id: msg.id,
          metadata: { wa_from: msg.from, wa_timestamp: msg.timestamp },
        });
      }
    }
  }

  if (rows.length > 0) {
    await supabase.from('messages').upsert(rows, {
      onConflict: 'whatsapp_message_id',
      ignoreDuplicates: true,
    });
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== '/webhook') return new Response('Not found', { status: 404 });

    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    if (req.method === 'POST') {
      const body = await req.text();
      const ok = await verifySignature(
        env.WHATSAPP_APP_SECRET,
        req.headers.get('x-hub-signature-256'),
        body,
      );
      if (!ok) return new Response('Invalid signature', { status: 401 });

      let payload: WhatsAppWebhookPayload;
      try {
        payload = JSON.parse(body) as WhatsAppWebhookPayload;
      } catch {
        return new Response('Bad JSON', { status: 400 });
      }

      // Acknowledge to Meta within 5s; persist in the background.
      ctx.waitUntil(
        persistInbound(env, payload).catch((err) =>
          console.error('whatsapp.persist_failed', err),
        ),
      );

      return new Response('ok', { status: 200 });
    }

    return new Response('Method not allowed', { status: 405 });
  },
} satisfies ExportedHandler<Env>;
