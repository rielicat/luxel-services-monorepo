export const POSTHOG_HOST = 'https://t.serviciosluxel.cl';

export function posthogHost(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  const raw = env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  if (!raw?.startsWith('http')) return POSTHOG_HOST;
  return raw.replace(/\/+$/, '');
}
