import esCL from './es-CL.json';
import adminEsCL from './admin-es-CL.json';
import checkinEn from './checkin.en.json';
import checkinPt from './checkin.pt.json';

export const messages = esCL;
export type Messages = typeof esCL;

export const adminMessages = adminEsCL;

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
