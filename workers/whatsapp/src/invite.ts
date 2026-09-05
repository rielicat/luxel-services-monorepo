import {
  HOSPITABLE_UI_FALLBACK_URL,
  INVITE_ACTION_TIMEOUT_S,
  INVITE_AGENT_SOURCE,
  INVITE_BATCH_LIMIT,
  INVITE_PROBE_TIMEOUT_S,
  ONBOARDING_INVITES_PATH,
  invitePrompt,
  loginPrompt,
  parseAwaitingHosts,
  probePrompt,
  readAuthProbe,
  readInviteAttempt,
  readInviteVerify,
  verifyPrompt,
  type AuthProbe,
  type InviteTarget,
} from '@luxel/shared/hospitable-invite';
import { timingSafeEqual } from './crypto';
import { firecrawlConfigured, interact, type FirecrawlEnv } from './firecrawl';

export interface InviteParams {
  trigger: 'connect' | 'cron';
}

export interface InviteEnv extends FirecrawlEnv {
  INTERNAL_SEND_TOKEN?: string;
  LUXEL_APP_URL?: string;
  HOSPITABLE_UI_URL?: string;
  HOSPITABLE_UI_EMAIL?: string;
  HOSPITABLE_UI_PASSWORD?: string;
  HOSPITABLE_INVITE?: Workflow<InviteParams>;
}

const QUEUE_TIMEOUT_MS = 20_000;
const DELIVER_TIMEOUT_MS = 20_000;
const INSTANCE_BUCKET_MS = 5 * 60_000;

export function inviteEntryUrl(env: InviteEnv): string {
  const raw = env.HOSPITABLE_UI_URL?.trim();
  if (!raw) return HOSPITABLE_UI_FALLBACK_URL;
  try {
    return new URL(raw).toString();
  } catch {
    return HOSPITABLE_UI_FALLBACK_URL;
  }
}

function appOrigin(env: InviteEnv): string | null {
  const raw = env.LUXEL_APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function inviteConfigured(env: InviteEnv): boolean {
  return Boolean(
    firecrawlConfigured(env) &&
    env.HOSPITABLE_UI_EMAIL?.trim() &&
    env.HOSPITABLE_UI_PASSWORD?.trim() &&
    appOrigin(env) &&
    env.INTERNAL_SEND_TOKEN?.trim(),
  );
}

export function inviteAuthorised(env: InviteEnv, req: Request): boolean {
  const token = req.headers.get('x-luxel-internal-token');
  return Boolean(
    env.INTERNAL_SEND_TOKEN && token && timingSafeEqual(token, env.INTERNAL_SEND_TOKEN),
  );
}

export function inviteInstanceId(now: number = Date.now()): string {
  return `inv-${Math.floor(now / INSTANCE_BUCKET_MS).toString(36)}`;
}

async function postToApp<T>(
  env: InviteEnv,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ status: number; body: T | null } | null> {
  const origin = appOrigin(env);
  const token = env.INTERNAL_SEND_TOKEN;
  if (!origin || !token) return null;
  try {
    const res = await fetch(`${origin}${ONBOARDING_INVITES_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as T | null };
  } catch (err) {
    console.error('onboarding.queue_call_error', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
}

export async function fetchInviteQueue(env: InviteEnv): Promise<InviteTarget[]> {
  const res = await postToApp<{ hosts?: unknown }>(
    env,
    { op: 'pending', limit: INVITE_BATCH_LIMIT },
    QUEUE_TIMEOUT_MS,
  );
  if (!res || res.status !== 200) {
    if (res) console.error('onboarding.queue_read_failed', { status: res.status });
    return [];
  }
  return parseAwaitingHosts(res.body?.hosts);
}

export async function postDelivery(env: InviteEnv, customerId: string): Promise<boolean> {
  const res = await postToApp<{ ok?: boolean; error?: string }>(
    env,
    { op: 'deliver', customerId, source: INVITE_AGENT_SOURCE },
    DELIVER_TIMEOUT_MS,
  );
  if (!res) return false;
  if (res.status === 200) return true;
  if (res.status === 409) return true;
  console.error('onboarding.deliver_failed', { customerId, status: res.status });
  return false;
}

export async function probeAuth(env: InviteEnv, scrapeId: string): Promise<AuthProbe> {
  const result = await interact(env, scrapeId, probePrompt(), INVITE_PROBE_TIMEOUT_S);
  if (!result?.ok) return 'unknown';
  return readAuthProbe(result.output);
}

export async function signIn(env: InviteEnv, scrapeId: string): Promise<AuthProbe> {
  const email = env.HOSPITABLE_UI_EMAIL?.trim();
  const password = env.HOSPITABLE_UI_PASSWORD?.trim();
  if (!email || !password) return 'unknown';
  const result = await interact(
    env,
    scrapeId,
    loginPrompt(email, password),
    INVITE_ACTION_TIMEOUT_S,
  );
  if (!result?.ok) return 'unknown';
  return readAuthProbe(result.output);
}

export async function sendInvite(
  env: InviteEnv,
  scrapeId: string,
  target: InviteTarget,
): Promise<'sent' | 'failed' | 'unknown'> {
  const result = await interact(env, scrapeId, invitePrompt(target), INVITE_ACTION_TIMEOUT_S);
  if (!result?.ok) return 'unknown';
  return readInviteAttempt(result.output);
}

export async function verifyInvite(
  env: InviteEnv,
  scrapeId: string,
  target: InviteTarget,
): Promise<boolean> {
  const result = await interact(env, scrapeId, verifyPrompt(target), INVITE_ACTION_TIMEOUT_S);
  if (!result?.ok) return false;
  return readInviteVerify(result.output);
}

export async function startInviteInstance(
  env: InviteEnv,
  trigger: InviteParams['trigger'],
): Promise<{ started: boolean; instanceId: string } | null> {
  const workflow = env.HOSPITABLE_INVITE;
  if (!workflow) return null;
  const instanceId = inviteInstanceId();
  try {
    await workflow.create({ id: instanceId, params: { trigger } });
    return { started: true, instanceId };
  } catch {
    return { started: false, instanceId };
  }
}

export async function handleInviteStart(req: Request, env: InviteEnv): Promise<Response> {
  if (!inviteAuthorised(env, req)) return new Response('Unauthorized', { status: 401 });
  if (!env.HOSPITABLE_INVITE) {
    return Response.json({ error: 'invite_unavailable' }, { status: 503 });
  }
  if (!inviteConfigured(env)) {
    return Response.json({ error: 'invite_unconfigured' }, { status: 503 });
  }
  const started = await startInviteInstance(env, 'connect');
  if (!started) return Response.json({ error: 'invite_unavailable' }, { status: 503 });
  return Response.json(started, { headers: { 'cache-control': 'no-store' } });
}
