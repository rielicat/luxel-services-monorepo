import { describe, it, expect } from 'vitest';
import { bookingMessage, formatDate, longDateEs, stayRangeEs } from '../src/lib/checkin/copy';

describe('dates', () => {
  it('formats the way the host writes them, per language', () => {
    expect(formatDate('es', '2026-06-03')).toBe('3 jun. 2026');
    expect(formatDate('en', '2026-06-03')).toBe('Jun 3, 2026');
    expect(formatDate('pt', '2026-06-03')).toBe('3 de jun. de 2026');
  });
  it('writes the crew range the way the conserje already receives it', () => {
    expect(stayRangeEs('2026-08-29', '2026-09-02')).toBe('del 29 de agosto al 02 de septiembre');
    expect(longDateEs('2027-03-14T00:00:00-04:00')).toBe('14 de marzo');
  });
});

describe('bookingMessage', () => {
  const input = {
    url: 'https://serviciosluxel.cl/checkin/tok_abc',
    arrival: '2026-06-03',
    departure: '2026-06-05',
  };
  it('is the host text with the link and the new timing sentence', () => {
    const es = bookingMessage('es', input);
    expect(
      es.startsWith('¡Gracias por reservar con nosotros del 3 jun. 2026 al 5 jun. 2026!'),
    ).toBe(true);
    expect(es).toContain(`👉🏼 ${input.url}`);
    expect(es).toContain('3 días antes de tu llegada');
  });
  it('speaks Portuguese and English when the guest does', () => {
    const pt = bookingMessage('pt', input);
    expect(
      pt.startsWith('Obrigado por reservar com a gente de 3 de jun. de 2026 a 5 de jun. de 2026!'),
    ).toBe(true);
    expect(pt).toContain(input.url);
    const en = bookingMessage('en', input);
    expect(en.startsWith('Thank you for booking with us from Jun 3, 2026 to Jun 5, 2026!')).toBe(
      true,
    );
    expect(en).toContain(input.url);
  });
  it('never leaks an unrendered placeholder', () => {
    for (const lang of ['es', 'en', 'pt'] as const) {
      expect(bookingMessage(lang, input)).not.toMatch(/undefined|\{|\}/);
    }
  });
});
