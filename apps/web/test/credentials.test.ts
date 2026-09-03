import { describe, it, expect, afterEach } from 'vitest';
import { providerApiKey } from '@luxel/core/channels/credentials';

const KEYS = ['PROVIDER_API_KEY', 'HOSPITABLE_API_TOKEN'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

const set = (vals: Partial<Record<(typeof KEYS)[number], string | undefined>>) => {
  for (const k of KEYS) {
    const v = vals[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('providerApiKey', () => {
  it('prefers the provider-neutral name', () => {
    set({ PROVIDER_API_KEY: 'new', HOSPITABLE_API_TOKEN: 'old' });
    expect(providerApiKey()).toBe('new');
  });

  it('still honours the old name alone, so a deploy can precede the env change', () => {
    set({ HOSPITABLE_API_TOKEN: 'old' });
    expect(providerApiKey()).toBe('old');
  });

  it('works on the new name alone, so the old one can be deleted afterwards', () => {
    set({ PROVIDER_API_KEY: 'new' });
    expect(providerApiKey()).toBe('new');
  });

  it('returns null when neither is set — never undefined', () => {
    set({});
    expect(providerApiKey()).toBeNull();
  });
});
