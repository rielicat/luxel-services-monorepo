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

/**
 * Every value currently configured as an operator credential, most-preferred
 * first — normally one, two during a rotation.
 *
 * `hospitableAccess` decides tenancy scope by asking "is this stored token
 * Luxel's or the customer's?", and comparing against only the ACTIVE value gets
 * that wrong the moment the credential rotates: a legacy row holding the
 * PREVIOUS operator token stops matching, is reclassified as the customer's
 * own, and so bypasses the assignment filter — mirroring every listing the
 * operator account can reach into that one tenant. Keeping the old variable set
 * for the duration of a rotation closes that window.
 */
export function operatorCredentials(): string[] {
  const seen = [process.env.PROVIDER_API_KEY, process.env.HOSPITABLE_API_TOKEN].filter(
    (v): v is string => Boolean(v),
  );
  return [...new Set(seen)];
}
