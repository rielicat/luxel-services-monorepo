/**
 * Canonical public origin for links that LEAVE the app — a check-in link in an
 * Airbnb thread, a crew confirmation by email. Those land somewhere with no page
 * context, so a relative path would not resolve; they need a real origin.
 *
 * Nothing to configure: Vercel injects the host. Production resolves to the
 * project's own domain, and a preview resolves to ITSELF, so testing against a
 * preview can never mint guest links pointing at production.
 */

/** Last resort, so production can never emit a localhost link to a guest even if
 *  Vercel's system environment variables are disabled for the project. */
const PRODUCTION_ORIGIN = 'https://serviciosluxel.cl';

export function appUrl(): string {
  if (process.env.VERCEL_ENV === 'production') {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return host ? `https://${host}` : PRODUCTION_ORIGIN;
  }
  // A preview deployment points at its own hostname.
  const preview = process.env.VERCEL_URL;
  if (preview) return `https://${preview}`;
  return 'http://localhost:3000';
}
