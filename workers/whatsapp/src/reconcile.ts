import {
  CHANNEL_RECONCILE_PATH,
  type ChannelReconcileResult,
} from '@luxel/shared/channel-reconcile';

export const CHECKIN_RECONCILE_CRON = '*/15 * * * *';

export interface ReconcileEnv {
  LUXEL_APP_URL?: string;
  INTERNAL_SEND_TOKEN?: string;
}

const TIMEOUT_MS = 120_000;

function appOrigin(env: ReconcileEnv): string | null {
  const raw = env.LUXEL_APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export async function runCheckinReconcile(
  env: ReconcileEnv,
): Promise<ChannelReconcileResult | null> {
  const origin = appOrigin(env);
  const token = env.INTERNAL_SEND_TOKEN;
  if (!origin || !token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}${CHANNEL_RECONCILE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: '{}',
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('channels.reconcile_call_failed', { status: res.status });
      return null;
    }
    return (await res.json()) as ChannelReconcileResult;
  } catch (err) {
    console.error('channels.reconcile_call_error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
