export interface LegalRow {
  name: string;
  detail: string;
}

export interface LegalSection {
  id: string;
  title: string;
  plain: string;
  body: string[];
  rows: LegalRow[];
}

export interface LegalDoc {
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
  sibling_label: string;
  sibling_title: string;
  sections: LegalSection[];
}
