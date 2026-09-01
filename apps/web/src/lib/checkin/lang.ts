import { GUEST_LOCALES, type GuestLocale } from '@luxel/shared/i18n';

/** Narrows anything language-shaped ('pt-BR', 'PT', 'pt') to a supported code. */
export function guestLang(raw: string | null | undefined): GuestLocale | null {
  const code = (raw ?? '').trim().toLowerCase().slice(0, 2);
  return (GUEST_LOCALES as readonly string[]).includes(code) ? (code as GuestLocale) : null;
}

/**
 * The language a guest sees. The reservation's own guest language wins — it is
 * what Airbnb knows about them — then the browser's Accept-Language. A language
 * we know but do not support (fr, de…) falls to English rather than Spanish: a
 * foreign guest who does not read Spanish is exactly who the fallback is for.
 */
export function resolveGuestLang(
  stored: string | null | undefined,
  acceptLanguage: string | null | undefined,
): GuestLocale {
  const fromStored = guestLang(stored);
  if (fromStored) return fromStored;
  if (stored?.trim()) return 'en';
  const browser = (acceptLanguage ?? '')
    .split(',')
    .map((part) => part.split(';')[0]?.trim() ?? '')
    .filter(Boolean);
  for (const tag of browser) {
    const l = guestLang(tag);
    if (l) return l;
  }
  return browser.length ? 'en' : 'es';
}
