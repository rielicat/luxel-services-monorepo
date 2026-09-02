import { GUEST_LOCALES, type GuestLocale } from '@luxel/shared/i18n';

export function guestLang(raw: string | null | undefined): GuestLocale | null {
  const code = (raw ?? '').trim().toLowerCase().slice(0, 2);
  return (GUEST_LOCALES as readonly string[]).includes(code) ? (code as GuestLocale) : null;
}

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
