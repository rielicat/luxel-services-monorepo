export function posthogKey(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string | null {
  const candidates = [env.NEXT_PUBLIC_POSTHOG_KEY, env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return null;
}
