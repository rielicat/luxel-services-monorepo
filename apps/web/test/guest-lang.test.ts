import { describe, it, expect } from 'vitest';
import { guestLang, resolveGuestLang } from '../src/lib/checkin/lang';
import { checkinMessages, GUEST_LOCALES } from '@luxel/shared/i18n';

describe('guestLang', () => {
  it('narrows tags and casings to a supported code', () => {
    expect(guestLang('pt-BR')).toBe('pt');
    expect(guestLang('PT')).toBe('pt');
    expect(guestLang('en-US')).toBe('en');
    expect(guestLang('fr')).toBeNull();
    expect(guestLang(null)).toBeNull();
  });
});

describe('resolveGuestLang', () => {
  it('prefers what Airbnb knows about the guest', () => {
    expect(resolveGuestLang('pt', 'es-CL,es;q=0.9')).toBe('pt');
  });
  it('sends a known-but-unsupported language to English, not Spanish', () => {
    expect(resolveGuestLang('fr', 'es-CL,es;q=0.9')).toBe('en');
  });
  it('falls back to the browser, then to Spanish when nothing is known', () => {
    expect(resolveGuestLang(null, 'pt-BR,pt;q=0.9,en;q=0.8')).toBe('pt');
    expect(resolveGuestLang(null, 'de-DE,de;q=0.9')).toBe('en');
    expect(resolveGuestLang(null, null)).toBe('es');
    expect(resolveGuestLang('', '')).toBe('es');
  });
});

describe('checkin catalogs', () => {
  it('carry the same keys in every guest language', () => {
    const es = Object.keys(checkinMessages('es').checkin).sort();
    for (const l of GUEST_LOCALES) {
      expect(Object.keys(checkinMessages(l).checkin).sort(), l).toEqual(es);
    }
  });
});
