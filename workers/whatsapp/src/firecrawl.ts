import { FIRECRAWL_API_BASE, FIRECRAWL_PROFILE_NAME } from '@luxel/shared/hospitable-invite';

export interface FirecrawlEnv {
  FIRECRAWL_API_KEY?: string;
}

export interface InteractResult {
  ok: boolean;
  output: string;
}

const OPEN_TIMEOUT_MS = 120_000;
const CLOSE_TIMEOUT_MS = 20_000;
const SLACK_MS = 20_000;

function key(env: FirecrawlEnv): string | null {
  return env.FIRECRAWL_API_KEY?.trim() || null;
}

export function firecrawlConfigured(env: FirecrawlEnv): boolean {
  return key(env) !== null;
}

async function call<T>(
  env: FirecrawlEnv,
  path: string,
  method: 'POST' | 'DELETE',
  body: Record<string, unknown> | null,
  timeoutMs: number,
): Promise<T | null> {
  const token = key(env);
  if (!token) return null;
  try {
    const res = await fetch(`${FIRECRAWL_API_BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.error('firecrawl.request_failed', { path, status: res.status });
      return null;
    }
    return (await res.json().catch(() => null)) as T | null;
  } catch (err) {
    console.error('firecrawl.request_error', {
      path,
      message: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
}

export async function openSession(env: FirecrawlEnv, url: string): Promise<string | null> {
  const body = await call<{ success?: boolean; data?: { metadata?: { scrapeId?: unknown } } }>(
    env,
    '/scrape',
    'POST',
    {
      url,
      formats: ['markdown'],
      storeInCache: false,
      profile: { name: FIRECRAWL_PROFILE_NAME, saveChanges: true },
    },
    OPEN_TIMEOUT_MS,
  );
  const scrapeId = body?.data?.metadata?.scrapeId;
  return typeof scrapeId === 'string' && scrapeId ? scrapeId : null;
}

export async function interact(
  env: FirecrawlEnv,
  scrapeId: string,
  prompt: string,
  timeoutSeconds: number,
): Promise<InteractResult | null> {
  const body = await call<{
    success?: boolean;
    output?: unknown;
    killed?: boolean;
    exitCode?: unknown;
  }>(
    env,
    `/scrape/${encodeURIComponent(scrapeId)}/interact`,
    'POST',
    { prompt, timeout: timeoutSeconds },
    timeoutSeconds * 1000 + SLACK_MS,
  );
  if (!body) return null;
  const output = typeof body.output === 'string' ? body.output : '';
  return { ok: body.success !== false && body.killed !== true, output };
}

export async function closeSession(env: FirecrawlEnv, scrapeId: string): Promise<boolean> {
  const body = await call<{ success?: boolean }>(
    env,
    `/scrape/${encodeURIComponent(scrapeId)}/interact`,
    'DELETE',
    null,
    CLOSE_TIMEOUT_MS,
  );
  return body !== null;
}
