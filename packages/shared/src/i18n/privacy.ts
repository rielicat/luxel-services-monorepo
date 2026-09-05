import type { GuestLocale } from './index';
import type { LegalDoc } from './legal';
import privacyEs from './privacy.es.json';
import privacyEn from './privacy.en.json';
import privacyPt from './privacy.pt.json';

export type PrivacyDoc = LegalDoc;

const PRIVACY: Record<GuestLocale, PrivacyDoc> = {
  es: privacyEs,
  en: privacyEn,
  pt: privacyPt,
};

export function privacyDoc(locale: GuestLocale): PrivacyDoc {
  return PRIVACY[locale];
}
