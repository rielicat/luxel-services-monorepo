/**
 * Luxel WhatsApp Webhook (Cloudflare Worker)
 *
 * Routes:
 *   GET  /webhook  → Meta verification handshake (`hub.challenge`)
 *   POST /webhook  → inbound message events; HMAC-SHA256 signature verified before parsing
 *   POST /send     → outbound, from the web app only (shared token): free text to the
 *                    operator, or an approved template to a conserje / cleaner
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
  // Shared secret the Next.js app presents to POST /send. Set via
  // `wrangler secret put INTERNAL_SEND_TOKEN`.
  INTERNAL_SEND_TOKEN?: string;
  // Optional Cloudflare rate-limit binding backstopping /send if the shared token
  // ever leaks (declared in wrangler.toml). Absent locally/in tests → skipped.
  SEND_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
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

// The recency fallback auto-routes a non-reply operator message only when the
// SAME single web session is the only one that has bridged to the operator in
// this window. Kept wide (60 min) on purpose: a short window let an older
// concurrent chat's anchor age out, collapsing the distinct-session set to 1 and
// leaking one customer's answer into another's chat. A wider window means a
// second recent handoff reliably disables the guess instead of misrouting.
const FALLBACK_WINDOW_MS = 60 * 60 * 1000;

/** Which web session an operator's WhatsApp reply belongs to. Prefers the exact
 *  bridged message it quoted; otherwise only auto-routes when there is a SINGLE
 *  active thread (never guesses between concurrent chats → no cross-leak). */
async function resolveOperatorThread(
  supabase: SupabaseClient,
  contextId: string | undefined,
): Promise<Thread | null> {
  // Exact match: the operator quoted a specific bridged message. Match ANY of our
  // rows carrying that id — the forwarded anchor OR one of our own prior replies —
  // so quoting an earlier answer in a thread still resolves to the right session.
  if (contextId) {
    const { data } = await supabase
      .from('messages')
      .select('session_id, customer_id')
      .eq('whatsapp_message_id', contextId)
      .not('session_id', 'is', null)
      .maybeSingle();
    const row = data as Thread | null;
    if (row?.session_id)
      return { session_id: row.session_id, customer_id: row.customer_id ?? null };
  }
  const since = new Date(Date.now() - FALLBACK_WINDOW_MS).toISOString();
  const { data: recent } = await supabase
    .from('messages')
    .select('session_id, customer_id')
    .eq('metadata->>to_operator', 'true')
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);
  const rows = (recent ?? []) as Thread[];
  const distinct = new Set(rows.map((r) => r.session_id));
  if (distinct.size === 1 && rows[0]) {
    return { session_id: rows[0].session_id, customer_id: rows[0].customer_id ?? null };
  }
  return null;
}

/** Human-readable stand-in for a non-text operator reply so the customer sees
 *  that a person answered instead of silence. */
function operatorPlaceholder(type: string): string {
  switch (type) {
    case 'image':
      return '📷 [imagen]';
    case 'audio':
    case 'voice':
      return '🎙️ [mensaje de voz]';
    case 'video':
      return '🎬 [video]';
    case 'document':
      return '📎 [archivo]';
    case 'sticker':
      return '[sticker]';
    default:
      return '[mensaje]';
  }
}

async function persistInbound(env: Env, payload: WhatsAppWebhookPayload): Promise<void> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });

  const operatorDigits = env.LUXEL_OPERATOR_WHATSAPP?.replace(/[^\d]/g, '') ?? '';

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value.messages ?? []) {
        const fromDigits = msg.from.replace(/[^\d]/g, '');
        const fromOperator = Boolean(operatorDigits) && fromDigits === operatorDigits;

        // 1) A reply from the operator → route it back to the web session. Non-text
        //    replies (voice note, image, sticker) become a placeholder so the
        //    customer still sees the operator answered instead of nothing.
        if (fromOperator) {
          const target = await resolveOperatorThread(supabase, msg.context?.id);
          if (target) {
            await supabase.from('messages').upsert(
              {
                customer_id: target.customer_id ?? null,
                session_id: target.session_id,
                direction: 'out',
                channel: 'whatsapp',
                body: msg.text?.body || operatorPlaceholder(msg.type),
                whatsapp_message_id: msg.id,
                metadata: { from_operator: true, wa_from: msg.from, wa_type: msg.type },
              },
              { onConflict: 'whatsapp_message_id', ignoreDuplicates: true },
            );
            continue;
          }
          // Operator message we can't safely route (multiple open threads and no
          // reply-to). Log it so it isn't lost silently, then fall through: a text
          // one is stored as a plain inbound below; a non-text one stops here.
          console.warn('whatsapp.operator_reply_unrouted', {
            id: msg.id,
            context: msg.context?.id ?? null,
          });
        }

        // 2) Otherwise a direct inbound from a customer — text only (media isn't
        //    surfaced to the operator today) — attribute by phone (E.164).
        if (msg.type !== 'text' || !msg.text?.body) continue;
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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Meta template names, by the intent the web app sends. Utility templates the
 * operator registers once in Meta Business Manager, language `es`. A
 * business-initiated message to someone who has not written to us in the last
 * 24 hours MUST be a template — the Cloud API rejects free text — and that is
 * every conserje and every cleaner, every time.
 */
const TEMPLATES: Record<string, string> = {
  concierge_arrival: 'luxel_conserje_llegada',
  cleaning_booking: 'luxel_aseo_nueva_reserva',
};
const TEMPLATE_LANG = 'es';

/** Template parameters may not contain newlines, tabs or 4+ consecutive spaces. */
function templateParam(s: string): string {
  return (
    s
      .replace(/[\r\n\t]+/g, ' · ')
      .replace(/ {4,}/g, ' ')
      .trim()
      .slice(0, 1024) || '—'
  );
}

async function graphSend(env: Env, payload: Record<string, unknown>): Promise<string | null> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return null;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { messages?: { id: string }[] };
    return json.messages?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Free text — only lands inside an open 24h customer-service window. */
function sendText(env: Env, to: string, text: string): Promise<string | null> {
  return graphSend(env, {
    to,
    type: 'text',
    text: { body: text.slice(0, 4000), preview_url: false },
  });
}

function sendTemplate(
  env: Env,
  to: string,
  name: string,
  params: string[],
): Promise<string | null> {
  return graphSend(env, {
    to,
    type: 'template',
    template: {
      name,
      language: { code: TEMPLATE_LANG },
      components: [
        { type: 'body', parameters: params.map((p) => ({ type: 'text', text: templateParam(p) })) },
      ],
    },
  });
}

/**
 * Internal route the Next.js app calls to send WhatsApp: a free-text forward to
 * the operator (no `to`), or a template to any number (`to` + `template`).
 * Authenticated by a shared secret so the endpoint cannot be abused directly.
 */
async function handleSend(req: Request, env: Env): Promise<Response> {
  const token = req.headers.get('x-luxel-internal-token');
  if (!env.INTERNAL_SEND_TOKEN || !token || !timingSafeEqual(token, env.INTERNAL_SEND_TOKEN)) {
    return new Response('Unauthorized', { status: 401 });
  }
  let body: { to?: unknown; text?: unknown; template?: { kind?: unknown; params?: unknown } };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }
  const to =
    typeof body.to === 'string' && body.to.trim()
      ? body.to.replace(/[^\d]/g, '')
      : (env.LUXEL_OPERATOR_WHATSAPP?.replace(/[^\d]/g, '') ?? '');
  if (!to) return Response.json({ error: 'no_destination' }, { status: 400 });

  // Defense-in-depth: the token is deployed across the whole web fleet, so cap
  // sends per destination in case it ever leaks.
  if (env.SEND_LIMITER) {
    const { success } = await env.SEND_LIMITER.limit({ key: `send:${to}` });
    if (!success) return new Response('Too Many Requests', { status: 429 });
  }

  if (body.template) {
    const name = TEMPLATES[String(body.template.kind ?? '')];
    const params = Array.isArray(body.template.params)
      ? body.template.params.map((p) => String(p ?? ''))
      : null;
    if (!name || !params) return Response.json({ error: 'bad_template' }, { status: 400 });
    return Response.json({ wamid: await sendTemplate(env, to, name, params) });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return Response.json({ error: 'empty' }, { status: 400 });
  return Response.json({ wamid: await sendText(env, to, text) });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/send' && req.method === 'POST') return handleSend(req, env);
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
