import 'server-only';

/**
 * The operator credential for the PMS account that mirrors every host's
 * listings. Named for the ROLE it plays, not the vendor filling it: the
 * underlying PMS has already changed once, and a vendor name spread across six
 * call sites turns a migration into a rename.
 *
 * The previous name is still honoured, so neither order of operations breaks
 * production — a deploy can land before the environment is updated, and the old
 * variable can be deleted afterwards without a matching deploy.
 */
export function providerApiKey(): string | null {
  return process.env.PROVIDER_API_KEY ?? process.env.HOSPITABLE_API_TOKEN ?? null;
}

/** Names checked, most-preferred first — for operator diagnostics that need to
 *  tell someone WHICH variable to set. */
export const PROVIDER_KEY_NAMES = ['PROVIDER_API_KEY', 'HOSPITABLE_API_TOKEN'] as const;
