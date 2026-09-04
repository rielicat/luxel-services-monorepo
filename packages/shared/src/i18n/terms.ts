import type { GuestLocale } from './index';
import type { LegalDoc } from './legal';
import termsEs from './terms.es.json';
import termsEn from './terms.en.json';
import termsPt from './terms.pt.json';

export type TermsDoc = LegalDoc;

const TERMS: Record<GuestLocale, TermsDoc> = {
  es: termsEs,
  en: termsEn,
  pt: termsPt,
};

export function termsDoc(locale: GuestLocale): TermsDoc {
  return TERMS[locale];
}
