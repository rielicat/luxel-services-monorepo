import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLEANING_REMIND_PATH } from '@luxel/shared/cleaning-remind';
import { CLEANING_REMIND_CRON } from '../../../workers/whatsapp/src/remind';
import { CHECKIN_RECONCILE_CRON } from '../../../workers/whatsapp/src/reconcile';

const root = join(__dirname, '../../../workers/whatsapp');
const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8');
const index = readFileSync(join(root, 'src/index.ts'), 'utf8');

const declaredCrons = () => {
  const line = wrangler.match(/^crons = \[(.+)\]$/m)?.[1] ?? '';
  return [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

describe('cleaning reminder wiring', () => {
  it('runs on a schedule the worker actually declares', () => {
    expect(declaredCrons()).toContain(CLEANING_REMIND_CRON);
  });

  it('keeps its own schedule apart from the reconcile and the nightly pass', () => {
    const declared = declaredCrons();
    expect(CLEANING_REMIND_CRON).not.toBe(CHECKIN_RECONCILE_CRON);
    expect(
      declared.filter((c) => c !== CLEANING_REMIND_CRON && c !== CHECKIN_RECONCILE_CRON),
    ).not.toHaveLength(0);
  });

  it('runs once a day, never on a sub-daily schedule', () => {
    const [minute, hour] = CLEANING_REMIND_CRON.split(' ');
    expect(minute).not.toContain('*');
    expect(hour).not.toContain('*');
  });

  it('returns before the nightly jobs when the reminder schedule fires', () => {
    const scheduled = index.slice(index.indexOf('async scheduled'));
    const branch = scheduled.indexOf('CLEANING_REMIND_CRON');
    const nightly = scheduled.indexOf('purgeExpiredWalkthroughs');
    expect(branch).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(nightly);
  });

  it('posts to an internal route, never to a public one', () => {
    expect(CLEANING_REMIND_PATH.startsWith('/api/')).toBe(true);
  });
});
