import esCL from './es-CL.json';
import checkinEn from './checkin.en.json';
import checkinPt from './checkin.pt.json';

export const messages = esCL;
export type Messages = typeof esCL;

export const SUPPORTED_LOCALES = ['es'] as const;
export const DEFAULT_LOCALE = 'es' as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * The guest check-in page is the one surface not in es-CL: it renders in the
 * guest's own language while the rest of the site stays Spanish. Only the
 * `checkin` namespace is translated. The Record type makes the compiler check
 * that every locale carries exactly the Spanish keys — a missing key here is a
 * build error, not a `checkin.parking` string shown to a guest.
 */
export const GUEST_LOCALES = ['es', 'en', 'pt'] as const;
export type GuestLocale = (typeof GUEST_LOCALES)[number];

const CHECKIN: Record<GuestLocale, typeof esCL.checkin> = {
  es: esCL.checkin,
  en: checkinEn,
  pt: checkinPt,
};

export function checkinMessages(locale: GuestLocale): { checkin: typeof esCL.checkin } {
  return { checkin: CHECKIN[locale] };
}
