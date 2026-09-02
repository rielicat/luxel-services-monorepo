import 'server-only';

export function providerApiKey(): string | null {
  return process.env.PROVIDER_API_KEY ?? process.env.HOSPITABLE_API_TOKEN ?? null;
}

export function operatorCredentials(): string[] {
  const seen = [process.env.PROVIDER_API_KEY, process.env.HOSPITABLE_API_TOKEN].filter(
    (v): v is string => Boolean(v),
  );
  return [...new Set(seen)];
}
