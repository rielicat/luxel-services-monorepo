import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  WHATSAPP_TEMPLATE_KINDS,
  WHATSAPP_TEXT_MAX,
  type WhatsAppTemplateKind,
} from '@luxel/shared/whatsapp';
import {
  CLEANING_MEDIA_OBJECT_PATH,
  CLEANING_MEDIA_READ_URL_PATH,
  CLEANING_MEDIA_UPLOAD_URL_PATH,
} from '@luxel/shared/cleaning-media';
import { CLEANING_REVIEW_START_PATH } from '@luxel/shared/cleaning-review';
import { HOSPITABLE_INVITE_START_PATH } from '@luxel/shared/hospitable-invite';
import { timingSafeEqual } from './crypto';
import {
  handleObjectGet,
  handleObjectPreflight,
  handleObjectPut,
  handleReadUrl,
  handleUploadUrl,
  purgeExpiredWalkthroughs,
  type MediaEnv,
} from './media';
import { driveQueuedReviews, handleReviewStart, type ReviewEnv } from './review';
import { handleInviteStart, inviteConfigured, startInviteInstance, type InviteEnv } from './invite';
import { runNightlyDistill } from './distill';

interface Env extends MediaEnv, ReviewEnv, InviteEnv {
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_APP_SECRET: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  LUXEL_OPERATOR_WHATSAPP?: string;
  SEND_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

interface InboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { payload: string; text: string };
  interactive?: { type?: string; button_reply?: { id: string; title: string } };
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

  return timingSafeEqual(signatureHeader, expected);
}

type Thread = { session_id: string; customer_id: string | null };

const FALLBACK_WINDOW_MS = 60 * 60 * 1000;

async function resolveOperatorThread(
  supabase: SupabaseClient,
  contextId: string | undefined,
): Promise<Thread | null> {
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

const CREW_REPLY =
  /^clean:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(yes|no)$/i;

function buttonPayload(msg: InboundMessage): string | null {
  if (msg.type === 'button') return msg.button?.payload ?? null;
  if (msg.type === 'interactive') return msg.interactive?.button_reply?.id ?? null;
  return null;
}

async function handleCrewReply(
  env: Env,
  supabase: SupabaseClient,
  from: string,
  payload: string,
): Promise<void> {
  const m = CREW_REPLY.exec(payload.trim());
  if (!m) return;
  const token = m[1]!.toLowerCase();
  const answer = m[2]!.toLowerCase();
  const { data: cleaning } = await supabase
    .from('cleanings')
    .select('id, property_id, cleaning_date, crew_confirmed_at')
    .eq('confirm_token', token)
    .eq('status', 'scheduled')
    .maybeSingle();
  if (!cleaning) return;
  const now = new Date().toISOString();

  if (answer === 'yes') {
    if (!cleaning.crew_confirmed_at) {
      await supabase.from('cleanings').update({ crew_confirmed_at: now }).eq('id', cleaning.id);
    }
    await sendText(env, from, '¡Gracias! Aseo confirmado ✅');
    return;
  }

  await supabase.from('cleanings').update({ crew_declined_at: now }).eq('id', cleaning.id);
  await sendText(env, from, 'Entendido. Avisamos al equipo Luxel para coordinar.');
  const operator = env.LUXEL_OPERATOR_WHATSAPP?.replace(/[^\d]/g, '') ?? '';
  if (!operator) return;
  const { data: prop } = await supabase
    .from('properties')
    .select('nickname')
    .eq('id', cleaning.property_id)
    .maybeSingle();
  await sendText(
    env,
    operator,
    `⚠️ Aseo ${cleaning.cleaning_date} · ${prop?.nickname ?? '—'}: +${from.replace(/[^\d]/g, '')} no puede asistir.`,
  );
}

async function persistInbound(env: Env, payload: WhatsAppWebhookPayload): Promise<void> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });

  const operatorDigits = env.LUXEL_OPERATOR_WHATSAPP?.replace(/[^\d]/g, '') ?? '';

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value.messages ?? []) {
        if (msg.type === 'button' || msg.type === 'interactive') {
          const reply = buttonPayload(msg);
          if (reply) await handleCrewReply(env, supabase, msg.from, reply);
          continue;
        }

        const fromDigits = msg.from.replace(/[^\d]/g, '');
        const fromOperator = Boolean(operatorDigits) && fromDigits === operatorDigits;

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
          console.warn('whatsapp.operator_reply_unrouted', {
            id: msg.id,
            context: msg.context?.id ?? null,
          });
        }

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

const TEMPLATES: Record<WhatsAppTemplateKind, string> = {
  concierge_arrival: 'luxel_conserje_registro',
  cleaning_confirm: 'luxel_aseo_confirmacion',
};
const TEMPLATE_LANG = 'es';
const BUTTON_PAYLOAD_MAX = 128;

function templateParam(s: string): string {
  return (
    s
      .replace(/[\r\n\t]+/g, ' · ')
      .replace(/ {4,}/g, ' ')
      .trim()
      .slice(0, 1024) || '—'
  );
}

function parseButtons(raw: unknown): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const b of raw) {
    if (typeof b !== 'string' || !b || b.length > BUTTON_PAYLOAD_MAX || /[\r\n]/.test(b))
      return null;
    out.push(b);
  }
  return out;
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

function sendText(env: Env, to: string, text: string): Promise<string | null> {
  return graphSend(env, {
    to,
    type: 'text',
    text: { body: text.slice(0, WHATSAPP_TEXT_MAX), preview_url: false },
  });
}

function sendTemplate(
  env: Env,
  to: string,
  name: string,
  params: string[],
  buttons: string[],
): Promise<string | null> {
  return graphSend(env, {
    to,
    type: 'template',
    template: {
      name,
      language: { code: TEMPLATE_LANG },
      components: [
        { type: 'body', parameters: params.map((p) => ({ type: 'text', text: templateParam(p) })) },
        ...buttons.map((payload, i) => ({
          type: 'button',
          sub_type: 'quick_reply',
          index: String(i),
          parameters: [{ type: 'payload', payload }],
        })),
      ],
    },
  });
}

async function handleSend(req: Request, env: Env): Promise<Response> {
  const token = req.headers.get('x-luxel-internal-token');
  if (!env.INTERNAL_SEND_TOKEN || !token || !timingSafeEqual(token, env.INTERNAL_SEND_TOKEN)) {
    return new Response('Unauthorized', { status: 401 });
  }
  let body: {
    to?: unknown;
    text?: unknown;
    template?: { kind?: unknown; params?: unknown; buttons?: unknown };
  };
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

  if (env.SEND_LIMITER) {
    const { success } = await env.SEND_LIMITER.limit({ key: `send:${to}` });
    if (!success) return new Response('Too Many Requests', { status: 429 });
  }

  if (body.template) {
    const kind = String(body.template.kind ?? '');
    const name = (WHATSAPP_TEMPLATE_KINDS as readonly string[]).includes(kind)
      ? TEMPLATES[kind as WhatsAppTemplateKind]
      : undefined;
    const params = Array.isArray(body.template.params)
      ? body.template.params.map((p) => String(p ?? ''))
      : null;
    const buttons = parseButtons(body.template.buttons);
    if (!name || !params || !buttons) {
      return Response.json({ error: 'bad_template' }, { status: 400 });
    }
    return Response.json({ wamid: await sendTemplate(env, to, name, params, buttons) });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return Response.json({ error: 'empty' }, { status: 400 });
  return Response.json({ wamid: await sendText(env, to, text) });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/send' && req.method === 'POST') return handleSend(req, env);
    if (url.pathname === CLEANING_MEDIA_UPLOAD_URL_PATH && req.method === 'POST') {
      return handleUploadUrl(req, env);
    }
    if (url.pathname === CLEANING_MEDIA_READ_URL_PATH && req.method === 'POST') {
      return handleReadUrl(req, env);
    }
    if (url.pathname === CLEANING_REVIEW_START_PATH && req.method === 'POST') {
      return handleReviewStart(req, env);
    }
    if (url.pathname === HOSPITABLE_INVITE_START_PATH && req.method === 'POST') {
      return handleInviteStart(req, env);
    }
    if (url.pathname === CLEANING_MEDIA_OBJECT_PATH) {
      if (req.method === 'OPTIONS') return handleObjectPreflight(env, req);
      if (req.method === 'PUT') return handleObjectPut(req, env);
      if (req.method === 'GET') return handleObjectGet(req, env);
      return new Response('Method not allowed', { status: 405 });
    }
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

      ctx.waitUntil(
        persistInbound(env, payload).catch((err) => console.error('whatsapp.persist_failed', err)),
      );

      return new Response('ok', { status: 200 });
    }

    return new Response('Method not allowed', { status: 405 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      purgeExpiredWalkthroughs(env)
        .then((purged) => {
          if (purged) console.warn('cleaning.walkthrough_purged', { purged });
        })
        .catch((err) => console.error('cleaning.walkthrough_purge_failed', err)),
    );
    ctx.waitUntil(
      driveQueuedReviews(env)
        .then((driven) => {
          if (driven) console.warn('cleaning.review_swept', { driven });
        })
        .catch((err) => console.error('cleaning.review_sweep_failed', err)),
    );
    if (inviteConfigured(env)) {
      ctx.waitUntil(
        startInviteInstance(env, 'cron')
          .then((started) => {
            if (started?.started) console.warn('onboarding.invite_swept', started);
          })
          .catch((err) => console.error('onboarding.invite_sweep_failed', err)),
      );
    }
    ctx.waitUntil(
      runNightlyDistill(env)
        .then((result) => {
          if (result) console.warn('agent.distilled', result);
        })
        .catch((err) => console.error('agent.distill_failed', err)),
    );
  },
} satisfies ExportedHandler<Env>;

export { CleaningReviewWorkflow } from './review-workflow';
export { HospitableInviteWorkflow } from './invite-workflow';
