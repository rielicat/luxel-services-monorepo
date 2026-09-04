import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { longDateEs, stayRangeEs } from '@luxel/core/checkin/copy';
import { checkinMessages, GUEST_LOCALES } from '@luxel/shared/i18n';

const SURFACE = [
  '../src/app/[locale]/checkin/[id]/checkin-form.tsx',
  '../src/app/[locale]/checkin/[id]/page.tsx',
  '../src/app/[locale]/checkin/preview/page.tsx',
].map((rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));

const usedKeys = (): string[] => {
  const found = new Set<string>();
  for (const src of SURFACE) {
    for (const m of src.matchAll(/\bt\(\s*'([a-z0-9_]+)'/g)) found.add(m[1]!);
    for (const m of src.matchAll(/\bt\([^)]*\?\s*'([a-z0-9_]+)'\s*:\s*'([a-z0-9_]+)'/g)) {
      found.add(m[1]!);
      found.add(m[2]!);
    }
    for (const m of src.matchAll(/^const DOC_KEY = \{([^}]*)\}/gms)) {
      for (const kv of m[1]!.matchAll(/'([a-z0-9_]+)'/g)) found.add(kv[1]!);
    }
  }
  return [...found].sort();
};

const catalogs = GUEST_LOCALES.map((l) => [l, checkinMessages(l).checkin] as const);
const esKeys = Object.keys(checkinMessages('es').checkin).sort();

describe('check-in date copy', () => {
  it('writes long Chilean dates for the crew and conserje messages', () => {
    expect(longDateEs('2026-06-03')).toBe('03 de junio');
    expect(longDateEs('2026-12-31')).toBe('31 de diciembre');
  });

  it('writes the stay range the conserje template expects', () => {
    expect(stayRangeEs('2026-08-29', '2026-09-02')).toBe('del 29 de agosto al 02 de septiembre');
  });
});

describe('check-in catalogs', () => {
  it.each(catalogs)('%s carries the same key set as the Spanish original', (_l, cat) => {
    expect(Object.keys(cat).sort()).toEqual(esKeys);
  });

  it.each(catalogs)('%s leaves no copy blank', (_l, cat) => {
    for (const [key, value] of Object.entries(cat)) {
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it('resolves every key the check-in surface asks for, in every language', () => {
    const used = usedKeys();
    expect(used.length).toBeGreaterThan(0);
    for (const [locale, cat] of catalogs) {
      expect(
        used.filter((k) => !(k in cat)),
        locale,
      ).toEqual([]);
    }
  });

  it('keeps no key the check-in surface stopped using', () => {
    const used = usedKeys();
    expect(esKeys.filter((k) => !used.includes(k))).toEqual([]);
  });

  it('keeps the privacy link the collection notice depends on', () => {
    for (const [locale, cat] of catalogs) {
      expect(cat, locale).toHaveProperty('privacy_link');
      expect(SURFACE[0]).toContain('/privacy?lang=');
    }
  });
});
