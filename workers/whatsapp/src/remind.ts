import { CLEANING_REMIND_PATH, type CleaningRemindResult } from '@luxel/shared/cleaning-remind';

export const CLEANING_REMIND_CRON = '0 12 * * *';

export interface RemindEnv {
  LUXEL_APP_URL?: string;
  INTERNAL_SEND_TOKEN?: string;
}

const TIMEOUT_MS = 120_000;

function appOrigin(env: RemindEnv): string | null {
  const raw = env.LUXEL_APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export async function runCleaningReminder(env: RemindEnv): Promise<CleaningRemindResult | null> {
  const origin = appOrigin(env);
  const token = env.INTERNAL_SEND_TOKEN;
  if (!origin || !token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}${CLEANING_REMIND_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: '{}',
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('cleaning.remind_call_failed', { status: res.status });
      return null;
    }
    return (await res.json()) as CleaningRemindResult;
  } catch (err) {
    console.error('cleaning.remind_call_error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
