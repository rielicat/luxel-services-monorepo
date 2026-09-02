import { describe, it, expect } from 'vitest';
import nodeCrypto from 'node:crypto';

process.env.LUXEL_PII_KEY = nodeCrypto.randomBytes(32).toString('hex');

describe('guest list line', async () => {
  const { formatDocument, guestListLine } = await import('../src/lib/checkin/guest-list');
  const { encryptPII } = await import('../src/lib/crypto/pii');

  it('punctuates a RUT and leaves other documents alone', () => {
    expect(formatDocument('rut', '123456789')).toBe('12.345.678-9');
    expect(formatDocument('rut', '12.345.678-9')).toBe('12.345.678-9');
    expect(formatDocument('rut', '9876543k')).toBe('9.876.543-K');
    expect(formatDocument('passport', 'AB123456')).toBe('AB123456');
  });

  it('lists lead and companions on one line, decrypting each document', () => {
    const line = guestListLine([
      {
        full_name: 'María Pérez',
        doc_type: 'rut',
        doc_number_enc: encryptPII('12345678-9'),
        doc_last4: '78-9',
      },
      {
        full_name: 'Pedro Pérez',
        doc_type: 'passport',
        doc_number_enc: encryptPII('AB123456'),
        doc_last4: '3456',
      },
      { full_name: 'Sin Documento', doc_type: null, doc_number_enc: null, doc_last4: null },
    ]);
    expect(line).toBe('María Pérez · 12.345.678-9 | Pedro Pérez · AB123456 | Sin Documento');
    expect(line).not.toMatch(/\n/);
  });

  it('degrades to the last four when a document will not decrypt', () => {
    const line = guestListLine([
      { full_name: 'Ana', doc_type: 'rut', doc_number_enc: 'not-ciphertext', doc_last4: '78-9' },
    ]);
    expect(line).toBe('Ana · ···78-9');
  });
});
