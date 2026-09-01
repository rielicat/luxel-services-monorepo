/**
 * The host's check-in message puts the door code and wifi password in the
 * thread by design. The AI reads threads as experience; it must never read
 * those.
 */
import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../src/lib/ai/redact';

describe('redactSecrets', () => {
  it('removes every occurrence of every secret, whatever the case', () => {
    const text =
      'La entrada es digital y el código es: 366754. Wifi: Luxel | Contraseña: AirHost*247262';
    const out = redactSecrets(text, ['366754', 'airhost*247262']);
    expect(out).not.toContain('366754');
    expect(out).not.toContain('AirHost*247262');
    expect(out).toContain('[dato de acceso]');
  });
  it('ignores secrets too short to be anything but noise', () => {
    expect(redactSecrets('sala 12 piso 4', ['12', '4', ''])).toBe('sala 12 piso 4');
  });
  it('treats secrets as literals, not patterns', () => {
    expect(redactSecrets('code a.c here', ['a.c'])).toBe('code [dato de acceso] here');
    expect(redactSecrets('abc', ['a.c'])).toBe('abc');
  });
});
