import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

const BY_CODE: Record<string, string> = {
  form_identifier_not_found: 'err_not_found',
  form_identifier_exists: 'err_exists',
  identifier_already_signed_in: 'err_exists',
  form_param_format_invalid: 'err_email_invalid',
  form_code_incorrect: 'err_code_incorrect',
  verification_expired: 'err_code_expired',
  verification_failed: 'err_code_expired',
  form_password_pwned: 'err_password_pwned',
  form_password_length_too_short: 'err_password_short',
  form_password_not_strong_enough: 'err_password_weak',
  captcha_invalid: 'err_captcha',
  captcha_unavailable: 'err_captcha',
};

export function authErrorKey(err: unknown): string {
  if (!isClerkAPIResponseError(err)) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'err_offline';
    return 'err_generic';
  }
  if (err.status === 429) return 'err_too_many';
  for (const e of err.errors) {
    const key = BY_CODE[e.code];
    if (key) return key;
  }
  return 'err_generic';
}

const FALLBACK = '/properties';
const PROBE_ORIGIN = 'https://luxel.invalid';

export function safeRedirect(raw: string | null): string {
  if (!raw || !/^\/[^/\\]/.test(raw)) return FALLBACK;
  try {
    const url = new URL(raw, PROBE_ORIGIN);
    if (url.origin !== PROBE_ORIGIN) return FALLBACK;
    return url.pathname + url.search + url.hash;
  } catch {
    return FALLBACK;
  }
}
