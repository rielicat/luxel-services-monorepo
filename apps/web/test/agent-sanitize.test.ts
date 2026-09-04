import { describe, it, expect } from 'vitest';
import { sanitizeForMemory, scrubContacts } from '@luxel/core/agent/sanitize';
import { pricingScopeKey, propertyScopeKey } from '@luxel/core/agent/scope';

describe('agent memory sanitizer', () => {
  it('caps a stored note and normalises whitespace', () => {
    const long = 'dato '.repeat(400);
    expect(sanitizeForMemory(long, []).length).toBeLessThanOrEqual(600);
    expect(sanitizeForMemory('  a\n\n b  ', [])).toBe('a b');
  });

  it('removes a secret before anything else', () => {
    expect(sanitizeForMemory('el código es 4821', ['4821'])).not.toContain('4821');
  });

  it('scrubs an email and a phone number', () => {
    expect(scrubContacts('escribe a hola@luxel.cl')).toBe('escribe a [correo]');
    expect(scrubContacts('llama al +56 9 3298 0445')).toBe('llama al [teléfono]');
    expect(scrubContacts('llama al 932980445.')).toBe('llama al [teléfono].');
    expect(scrubContacts('llama al 9 3298-0445')).toBe('llama al [teléfono]');
    expect(scrubContacts('llama al +56912345678')).toBe('llama al [teléfono]');
  });

  it('scrubs a phone that a line break split', () => {
    expect(sanitizeForMemory('llama al +56 9\n3298\t0445 hoy', [])).toBe('llama al [teléfono] hoy');
  });

  it('keeps a chilean amount, which a phone pattern would eat', () => {
    expect(scrubContacts('arrienda en $1.200.000 y paga $144.000')).toBe(
      'arrienda en $1.200.000 y paga $144.000',
    );
    expect(scrubContacts('quedan 1.056.000 al mes')).toBe('quedan 1.056.000 al mes');
    expect(scrubContacts('el 2026 fue mejor que el 2025')).toBe('el 2026 fue mejor que el 2025');
  });

  it('keeps a date, which the pricing pass writes into every note', () => {
    expect(scrubContacts('libre del 2026-09-15 al 2026-09-22')).toBe(
      'libre del 2026-09-15 al 2026-09-22',
    );
    expect(scrubContacts('llega el 01-09-2026')).toBe('llega el 01-09-2026');
    expect(scrubContacts('hueco 2026-09-15 a 2026-09-17 (2 noches)')).toBe(
      'hueco 2026-09-15 a 2026-09-17 (2 noches)',
    );
    expect(sanitizeForMemory('a las 2026-09-04 18:31:30', [])).toContain('2026-09-04');
  });
});

describe('memory scope keys', () => {
  it('keeps pricing notes out of the scope the guest agent recalls', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(pricingScopeKey(id)).not.toBe(propertyScopeKey(id));
  });
});
