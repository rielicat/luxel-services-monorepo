import { redactSecrets } from '../ai/redact';

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const PHONE = /\+?\d[\d -]{6,}\d/g;
const ISO_DATE = /^\d{4}-\d{1,2}-\d{1,2}(\D|$)/;
const DMY_DATE = /^\d{1,2}-\d{1,2}-\d{4}(\D|$)/;

function digitCount(text: string): number {
  return text.match(/\d/g)?.length ?? 0;
}

function looksLikeDate(match: string): boolean {
  return ISO_DATE.test(match) || DMY_DATE.test(match);
}

export function scrubContacts(text: string): string {
  return text
    .replace(EMAIL, '[correo]')
    .replace(PHONE, (match: string, offset: number, whole: string) =>
      whole[offset - 1] === '$' || digitCount(match) < 8 || looksLikeDate(match)
        ? match
        : '[teléfono]',
    );
}

export function sanitizeForMemory(
  text: string,
  secrets: readonly string[],
  maxLength = 600,
): string {
  const flat = redactSecrets(text, secrets).replace(/\s+/g, ' ');
  return scrubContacts(flat).trim().slice(0, maxLength);
}
