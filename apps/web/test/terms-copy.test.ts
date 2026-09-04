import { describe, it, expect } from 'vitest';
import { termsDoc, type TermsDoc } from '@luxel/shared/terms';
import { privacyDoc } from '@luxel/shared/privacy';
import { PLAN_COMMISSION_PCT } from '@luxel/shared/plan-pricing';
import { GUEST_LOCALES, type GuestLocale } from '@luxel/shared/i18n';

const DOCS = GUEST_LOCALES.map((l) => [l, termsDoc(l)] as const);
const es = termsDoc('es');

const leaves = (doc: TermsDoc): string[] => [
  doc.meta_title,
  doc.meta_description,
  doc.title,
  doc.lead,
  doc.updated_label,
  doc.updated_value,
  doc.version_label,
  doc.version_value,
  doc.lang_label,
  doc.draft_title,
  doc.toc_title,
  doc.sibling_label,
  doc.sibling_title,
  ...doc.draft_body,
  ...doc.sections.flatMap((s) => [s.id, s.title, s.plain, ...s.body]),
  ...doc.sections.flatMap((s) => s.rows.flatMap((r) => [r.name, r.detail])),
];

const prose = (doc: TermsDoc): string => leaves(doc).join('\n');

describe('terms catalogs', () => {
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
    for (const value of leaves(doc)) expect(value.trim().length).toBeGreaterThan(0);
  });

  it('leaves no unfilled placeholder anywhere in the published copy', () => {
    for (const [locale, doc] of DOCS) {
      const found = leaves(doc).flatMap((v) => [...v.matchAll(/\[[^\]]+\]/g)].map((m) => m[0]));
      expect(found, locale).toEqual([]);
    }
  });

  it('names the contact address in every language', () => {
    for (const [locale, doc] of DOCS)
      expect(prose(doc), locale).toContain('info@serviciosluxel.cl');
  });

  it('carries a section for each obligation the page has to cover', () => {
    const ids = es.sections.map((s) => s.id);
    for (const id of [
      'quienes-somos',
      'alcance',
      'servicio',
      'hospitable',
      'plan',
      'base-comision',
      'cobro',
      'alta-y-baja',
      'retracto',
      'compromisos-anfitrion',
      'compromisos-luxel',
      'precio',
      'mensajes-y-ia',
      'aseo',
      'gastos',
      'danos',
      'huespedes',
      'equipo',
      'datos',
      'responsabilidad',
      'cambios',
      'ley',
      'contacto',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it('states the one commission the pricing code actually charges', () => {
    const pct = `${PLAN_COMMISSION_PCT * 100}%`;
    for (const [locale, doc] of DOCS) expect(prose(doc), locale).toContain(pct);
    expect(prose(es)).toContain('IVA incluido');
  });

  it('never says Airbnb pays Luxel, deducts the fee or splits the payout', () => {
    const banned: Record<GuestLocale, string[]> = {
      es: ['Airbnb nos paga', 'co-anfitrión', 'copanfitrión', 'reparte el pago', 'divide el pago'],
      en: [
        'Airbnb pays Luxel',
        'Airbnb pays us',
        'co-host',
        'splits the payout',
        'deducts our fee',
      ],
      pt: ['Airbnb nos paga', 'Airbnb paga a Luxel', 'coanfitrião', 'divide o pagamento'],
    };
    for (const [locale, doc] of DOCS) {
      const text = prose(doc).toLowerCase();
      for (const phrase of banned[locale]) {
        expect(text, `${locale} / ${phrase}`).not.toContain(phrase.toLowerCase());
      }
    }
    expect(prose(es)).toContain('Airbnb te paga a ti');
    expect(prose(termsDoc('en'))).toContain('Airbnb pays you');
  });

  it('keeps the banned marketing phrases out of every language', () => {
    for (const [locale, doc] of DOCS) {
      const text = prose(doc).toLowerCase();
      for (const phrase of [
        '0% comisión',
        'tarifa plana',
        '14 días gratis',
        'prueba gratis',
        'm²',
      ]) {
        expect(text, `${locale} / ${phrase}`).not.toContain(phrase);
      }
    }
  });

  it('names no city in any language', () => {
    const cities = [
      'santiago',
      'valparaíso',
      'valparaiso',
      'viña del mar',
      'concepción',
      'concepcion',
      'antofagasta',
      'temuco',
      'la serena',
      'puerto varas',
      'iquique',
      'pucón',
      'pucon',
    ];
    for (const [locale, doc] of DOCS) {
      const text = prose(doc).toLowerCase();
      for (const city of cities) expect(text, `${locale} / ${city}`).not.toContain(city);
    }
  });

  it('states the exit notice the account copy already promises', () => {
    const exit = (doc: TermsDoc) => doc.sections.find((s) => s.id === 'alta-y-baja')!;
    expect(exit(es).body.join('\n')).toContain('30 días');
    expect(exit(termsDoc('en')).body.join('\n')).toContain('30 days');
    expect(exit(termsDoc('pt')).body.join('\n')).toContain('30 dias');
  });

  it('points every reader at the privacy policy', () => {
    for (const [locale, doc] of DOCS) {
      expect(prose(doc), locale).toContain('/privacy');
      expect(doc.sibling_title.trim().length, locale).toBeGreaterThan(0);
    }
  });

  it('keeps the two legal documents on one version scheme', () => {
    for (const [locale, doc] of DOCS) {
      expect(doc.version_value, locale).toBe(es.version_value);
      expect(privacyDoc(locale as GuestLocale).sibling_title.trim().length).toBeGreaterThan(0);
    }
  });

  it('resolves a document for every guest language', () => {
    for (const locale of GUEST_LOCALES) {
      const doc: TermsDoc = termsDoc(locale as GuestLocale);
      expect(doc.sections.length).toBe(es.sections.length);
    }
  });
});
