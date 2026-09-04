import { describe, it, expect } from 'vitest';
import { formatDocument } from '@luxel/shared/document';

describe('document formatter', () => {
  it('punctuates a RUT the guest typed without dots', () => {
    expect(formatDocument('rut', '123456789')).toBe('12.345.678-9');
    expect(formatDocument('rut', '12345678-9')).toBe('12.345.678-9');
  });

  it('upper-cases a k check digit', () => {
    expect(formatDocument('rut', '9876543k')).toBe('9.876.543-K');
  });

  it('leaves an already formatted RUT alone', () => {
    expect(formatDocument('rut', '12.345.678-9')).toBe('12.345.678-9');
  });

  it('returns a value too short to punctuate untouched', () => {
    expect(formatDocument('rut', '')).toBe('');
    expect(formatDocument('rut', '7')).toBe('7');
  });

  it('never touches a document that is not a RUT', () => {
    expect(formatDocument('passport', 'AB123456')).toBe('AB123456');
    expect(formatDocument(null, '123456789')).toBe('123456789');
  });
});
