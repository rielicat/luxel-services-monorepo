import { redactSecrets } from '../ai/redact';

export function scrubContacts(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[correo]')
    .replace(/\+?\d[\d .-]{7,}\d/g, '[teléfono]');
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
