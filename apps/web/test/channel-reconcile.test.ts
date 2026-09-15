import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANNEL_RECONCILE_PATH } from '@luxel/shared/channel-reconcile';
import { CHECKIN_RECONCILE_CRON } from '../../../workers/whatsapp/src/reconcile';

const wrangler = readFileSync(join(__dirname, '../../../workers/whatsapp/wrangler.toml'), 'utf8');

describe('check-in reconcile wiring', () => {
  it('runs on a schedule the worker actually declares', () => {
    const line = wrangler.match(/^crons = \[(.+)\]$/m)?.[1] ?? '';
    const declared = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(declared).toContain(CHECKIN_RECONCILE_CRON);
    expect(declared.length).toBeGreaterThan(1);
  });

  it('leaves the nightly jobs a schedule of their own to run on', () => {
    const line = wrangler.match(/^crons = \[(.+)\]$/m)?.[1] ?? '';
    const declared = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(declared.filter((c) => c !== CHECKIN_RECONCILE_CRON)).not.toHaveLength(0);
  });

  it('posts to an internal route, never to a public one', () => {
    expect(CHANNEL_RECONCILE_PATH.startsWith('/api/')).toBe(true);
  });
});
