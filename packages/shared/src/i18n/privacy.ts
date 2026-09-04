import type { GuestLocale } from './index';
import privacyEs from './privacy.es.json';
import privacyEn from './privacy.en.json';
import privacyPt from './privacy.pt.json';

export interface PrivacyRow {
  name: string;
  detail: string;
}

export interface PrivacySection {
  id: string;
  title: string;
  plain: string;
  body: string[];
  rows: PrivacyRow[];
}

export interface PrivacyDoc {
  meta_title: string;
  meta_description: string;
  title: string;
  lead: string;
  updated_label: string;
  updated_value: string;
  version_label: string;
  version_value: string;
  lang_label: string;
  lang_es: string;
  lang_en: string;
  lang_pt: string;
  draft_title: string;
  draft_body: string[];
  toc_title: string;
  sections: PrivacySection[];
}

const PRIVACY: Record<GuestLocale, PrivacyDoc> = {
  es: privacyEs,
  en: privacyEn,
  pt: privacyPt,
};

export function privacyDoc(locale: GuestLocale): PrivacyDoc {
  return PRIVACY[locale];
}
