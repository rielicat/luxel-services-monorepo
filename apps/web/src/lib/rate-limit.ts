const WINDOW_MS = 60_000;
const MAX_KEYS = 5_000;

const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, now: number = Date.now()): boolean {
  const since = now - WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((at) => at > since);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) {
    for (const [existing, times] of hits) {
      if (!times.some((at) => at > since)) hits.delete(existing);
      if (hits.size <= MAX_KEYS) break;
    }
  }
  return true;
}

export function callerKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip') || 'unknown';
}
