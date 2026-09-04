import { redactSecrets } from '../ai/redact';

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const PHONE = /\+?\(?\d[\d ()-]{6,}\d/g;

function digitCount(text: string): number {
  return text.match(/\d/g)?.length ?? 0;
}

export function scrubContacts(text: string): string {
  return text
    .replace(EMAIL, '[correo]')
    .replace(PHONE, (match: string, offset: number, whole: string) =>
      whole[offset - 1] === '$' || digitCount(match) < 8 ? match : '[teléfono]',
    );
}

export function sanitizeForMemory(
  text: string,
  secrets: readonly string[],
  maxLength = 600,
): string {
  return scrubContacts(redactSecrets(text, secrets))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
