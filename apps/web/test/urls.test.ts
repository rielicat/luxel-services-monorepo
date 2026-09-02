import { describe, it, expect, afterEach } from 'vitest';
import { appUrl } from '../src/lib/urls';

const KEYS = ['VERCEL_ENV', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function setEnv(vals: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const k of KEYS) {
    const v = vals[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('appUrl', () => {
  it('uses the project domain in production', () => {
    setEnv({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'serviciosluxel.cl' });
    expect(appUrl()).toBe('https://serviciosluxel.cl');
  });

  it('points a preview at itself, never at production', () => {
    setEnv({ VERCEL_ENV: 'preview', VERCEL_URL: 'luxel-web-abc123.vercel.app' });
    expect(appUrl()).toBe('https://luxel-web-abc123.vercel.app');
  });

  it('falls back to localhost only when off Vercel entirely', () => {
    setEnv({});
    expect(appUrl()).toBe('http://localhost:3000');
  });

  it('never emits a localhost link in production, even with system vars disabled', () => {
    setEnv({ VERCEL_ENV: 'production' });
    expect(appUrl()).toBe('https://serviciosluxel.cl');
  });
});
