import { describe, it, expect } from 'vitest';
import { privacyDoc, type PrivacyDoc } from '@luxel/shared/privacy';
import { GUEST_LOCALES, type GuestLocale } from '@luxel/shared/i18n';

const DOCS = GUEST_LOCALES.map((l) => [l, privacyDoc(l)] as const);
const es = privacyDoc('es');

const tokensIn = (doc: PrivacyDoc): string[] => {
  const found = new Set<string>();
  const scan = (text: string) => {
    for (const m of text.matchAll(/\[[^\]]+\]/g)) found.add(m[0]);
  };
  doc.draft_body.forEach(scan);
  for (const s of doc.sections) {
    scan(s.title);
    scan(s.plain);
    s.body.forEach(scan);
    for (const r of s.rows) {
      scan(r.name);
      scan(r.detail);
    }
  }
  return [...found].sort();
};

describe('privacy catalogs', () => {
  it.each(DOCS)('%s parses with the same shape as the Spanish original', (_l, doc) => {
    expect(Object.keys(doc).sort()).toEqual(Object.keys(es).sort());
    expect(doc.draft_body.length).toBe(es.draft_body.length);
    expect(doc.sections.map((s) => s.id)).toEqual(es.sections.map((s) => s.id));
    doc.sections.forEach((s, i) => {
      expect(s.body.length, `${s.id} body`).toBe(es.sections[i]!.body.length);
      expect(s.rows.length, `${s.id} rows`).toBe(es.sections[i]!.rows.length);
    });
  });

  it.each(DOCS)('%s leaves no copy blank', (_l, doc) => {
    const strings = [
      doc.meta_title,
      doc.meta_description,
      doc.title,
      doc.lead,
      doc.updated_value,
      doc.version_value,
      doc.draft_title,
      doc.toc_title,
      ...doc.draft_body,
      ...doc.sections.flatMap((s) => [s.id, s.title, s.plain, ...s.body]),
      ...doc.sections.flatMap((s) => s.rows.flatMap((r) => [r.name, r.detail])),
    ];
    for (const value of strings) expect(value.trim().length).toBeGreaterThan(0);
  });

  it('leaves no unfilled placeholder anywhere in the published copy', () => {
    for (const [locale, doc] of DOCS) expect(tokensIn(doc), locale).toEqual([]);
  });

  it('moves the version and the date together, in every language', () => {
    for (const [locale, doc] of DOCS) {
      expect(doc.version_value, locale).toBe(es.version_value);
      expect(doc.updated_value.trim().length, locale).toBeGreaterThan(0);
    }
  });

  it('names the contact address in every language', () => {
    for (const [locale, doc] of DOCS) {
      expect(JSON.stringify(doc), locale).toContain('info@serviciosluxel.cl');
    }
  });

  it('carries a section for each obligation the page has to cover', () => {
    const ids = es.sections.map((s) => s.id);
    for (const id of [
      'responsable',
      'ley',
      'datos-huesped',
      'datos-anfitrion',
      'datos-equipo',
      'datos-visitante',
      'bases',
      'terceros',
      'transferencias',
      'video',
      'mensajes',
      'automatizado',
      'retencion',
      'seguridad',
      'derechos',
      'reclamo',
      'ninos',
      'cambios',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it('states the retention numbers the code actually implements', () => {
    const retention = es.sections.find((s) => s.id === 'retencion');
    const text = JSON.stringify(retention);
    expect(text).toContain('90 días');
    expect(text).toContain('30 días');
  });

  it('resolves a document for every guest language', () => {
    for (const locale of GUEST_LOCALES) {
      const doc: PrivacyDoc = privacyDoc(locale as GuestLocale);
      expect(doc.sections.length).toBe(es.sections.length);
    }
  });
});
