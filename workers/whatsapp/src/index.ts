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

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface Env {
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_APP_SECRET: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  SUPABASE_URL: string;
  // sb_secret_* opaque token (post-2025 rotation). Workers only — never exposed to clients.
  // Worker secrets are set via `wrangler secret put SUPABASE_SECRET_KEY`.
  SUPABASE_SECRET_KEY: string;
  // Operator/team number (E.164) whose replies bridge back into the web chat.
  LUXEL_OPERATOR_WHATSAPP?: string;
}

interface InboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  // Present when the sender replied to a specific message — used to route an
  // operator's reply back to the originating web-chat session.
  context?: { id: string };
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
    'sha256=' + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  if (signatureHeader.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < signatureHeader.length; i++) {
    diff |= signatureHeader.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

type Thread = { session_id: string; customer_id: string | null };

/** Which web session an operator's WhatsApp reply belongs to. Prefers the exact
 *  forwarded message it replied to; otherwise only auto-routes when there is a
 *  SINGLE active thread (never guesses between concurrent chats → no cross-leak). */
async function resolveOperatorThread(
  supabase: SupabaseClient,
  contextId: string | undefined,
): Promise<Thread | null> {
  if (contextId) {
    const { data } = await supabase
      .from('messages')
      .select('session_id, customer_id')
      .eq('whatsapp_message_id', contextId)
      .eq('metadata->>to_operator', 'true')
      .maybeSingle();
    const row = data as Thread | null;
    if (row?.session_id)
      return { session_id: row.session_id, customer_id: row.customer_id ?? null };
  }
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('messages')
    .select('session_id, customer_id')
    .eq('metadata->>to_operator', 'true')
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30);
  const rows = (recent ?? []) as Thread[];
  const distinct = new Set(rows.map((r) => r.session_id));
  if (distinct.size === 1 && rows[0]) {
    return { session_id: rows[0].session_id, customer_id: rows[0].customer_id ?? null };
  }
  return null;
}

async function persistInbound(env: Env, payload: WhatsAppWebhookPayload): Promise<void> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });

  const operatorDigits = env.LUXEL_OPERATOR_WHATSAPP?.replace(/[^\d]/g, '') ?? '';

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value.messages ?? []) {
        if (msg.type !== 'text' || !msg.text?.body) continue;

        const fromDigits = msg.from.replace(/[^\d]/g, '');
        const fromOperator = Boolean(operatorDigits) && fromDigits === operatorDigits;

        // 1) A reply from the operator → route it back to the web session.
        if (fromOperator) {
          const target = await resolveOperatorThread(supabase, msg.context?.id);
          if (target) {
            await supabase.from('messages').upsert(
              {
                customer_id: target.customer_id ?? null,
                session_id: target.session_id,
                direction: 'out',
                channel: 'whatsapp',
                body: msg.text.body,
                whatsapp_message_id: msg.id,
                metadata: { from_operator: true, wa_from: msg.from },
              },
              { onConflict: 'whatsapp_message_id', ignoreDuplicates: true },
            );
            continue;
          }
          // Operator message we can't safely route (multiple open threads and no
          // reply-to) — fall through and store it as a plain inbound below.
        }

        // 2) Otherwise a direct inbound from a customer — attribute by phone (E.164).
        const wa = msg.from.startsWith('+') ? msg.from : `+${msg.from}`;
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', wa)
          .maybeSingle();

        await supabase.from('messages').upsert(
          {
            customer_id: customer?.id ?? null,
            direction: 'in',
            channel: 'whatsapp',
            body: msg.text.body,
            whatsapp_message_id: msg.id,
            metadata: { wa_from: msg.from, wa_timestamp: msg.timestamp },
          },
          { onConflict: 'whatsapp_message_id', ignoreDuplicates: true },
        );
      }
    }
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
        persistInbound(env, payload).catch((err) => console.error('whatsapp.persist_failed', err)),
      );

      return new Response('ok', { status: 200 });
    }

    return new Response('Method not allowed', { status: 405 });
  },
} satisfies ExportedHandler<Env>;
