export interface DistillEnv {
  LUXEL_APP_URL?: string;
  INTERNAL_SEND_TOKEN?: string;
}

export interface DistillResult {
  ok: boolean;
  reason?: string;
  digests: number;
  globalRules: number;
  propertyNotes: number;
}

const TIMEOUT_MS = 280_000;

function appOrigin(env: DistillEnv): string | null {
  const raw = env.LUXEL_APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export async function runNightlyDistill(env: DistillEnv): Promise<DistillResult | null> {
  const origin = appOrigin(env);
  const token = env.INTERNAL_SEND_TOKEN;
  if (!origin || !token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}/api/agent/distill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: '{}',
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('agent.distill_call_failed', { status: res.status });
      return null;
    }
    return (await res.json()) as DistillResult;
  } catch (err) {
    console.error('agent.distill_call_error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
