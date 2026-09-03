import { describe, it, expect } from 'vitest';
import { toE164Digits, formatPhone } from '@luxel/core/phone';

describe('toE164Digits', () => {
  it('normalises every way a Chilean host types a mobile', () => {
    for (const raw of [
      '+56 9 1234 5678',
      '+56912345678',
      '56912345678',
      '9 1234 5678',
      '912345678',
      '0912345678',
      '(9) 1234-5678',
    ]) {
      expect(toE164Digits(raw), raw).toBe('56912345678');
    }
  });

  it('keeps foreign numbers as given, with or without an international prefix', () => {
    expect(toE164Digits('+55 11 99999 9999')).toBe('5511999999999');
    expect(toE164Digits('0055 11 99999 9999')).toBe('5511999999999');
    expect(toE164Digits('5511999999999')).toBe('5511999999999');
  });

  it('rejects things that are not phone numbers', () => {
    for (const raw of ['', '   ', 'abc', '12', null, undefined]) {
      expect(toE164Digits(raw), String(raw)).toBeNull();
    }
  });
});

describe('formatPhone', () => {
  it('shows a Chilean mobile the way people read it', () => {
    expect(formatPhone('+56912345678')).toBe('+56 9 1234 5678');
    expect(formatPhone('5511999999999')).toBe('+5511999999999');
    expect(formatPhone('nope')).toBe('nope');
  });
});
