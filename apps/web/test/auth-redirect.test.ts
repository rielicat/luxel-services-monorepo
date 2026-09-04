import { describe, it, expect } from 'vitest';
import { safeRedirect } from '@/components/auth/clerk-error';

describe('safeRedirect', () => {
  it('keeps a same-origin path with its query and hash', () => {
    expect(safeRedirect('/properties')).toBe('/properties');
    expect(safeRedirect('/properties/abc-123')).toBe('/properties/abc-123');
    expect(safeRedirect('/account?tab=1#x')).toBe('/account?tab=1#x');
  });

  it('refuses anything the URL parser resolves to another origin', () => {
    for (const raw of [
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      '/\r/evil.com',
      '/\\\\evil.com',
      'https://evil.com',
      'javascript:alert(1)',
    ]) {
      expect(safeRedirect(raw)).toBe('/properties');
    }
  });

  it('refuses a missing, empty or relative value', () => {
    expect(safeRedirect(null)).toBe('/properties');
    expect(safeRedirect('')).toBe('/properties');
    expect(safeRedirect('properties')).toBe('/properties');
  });
});
