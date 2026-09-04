import { describe, it, expect } from 'vitest';
import { sanitizeForMemory, scrubContacts } from '@luxel/core/agent/sanitize';

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
    expect(scrubContacts('llama al (56) 9 3298-0445')).toBe('llama al [teléfono]');
  });

  it('keeps a chilean amount, which a phone pattern would eat', () => {
    expect(scrubContacts('arrienda en $1.200.000 y paga $144.000')).toBe(
      'arrienda en $1.200.000 y paga $144.000',
    );
    expect(scrubContacts('quedan 1.056.000 al mes')).toBe('quedan 1.056.000 al mes');
    expect(scrubContacts('el 2026 fue mejor que el 2025')).toBe('el 2026 fue mejor que el 2025');
  });
});
