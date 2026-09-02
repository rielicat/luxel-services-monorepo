import { describe, it, expect } from 'vitest';
import { pruneWouldWipeEverything } from '../src/lib/channels/relink';

describe('pruneWouldWipeEverything', () => {
  it('flags a provider switch — no overlap between stored and remote', () => {
    const stored = ['a6eb2c65-0000-4000-8000-000000000001'];
    const remote = ['345504'];
    expect(pruneWouldWipeEverything(stored, remote)).toBe(true);
  });

  it('allows a normal prune when the sets overlap', () => {
    const stored = ['p1', 'p2', 'p3'];
    const remote = ['p1', 'p3'];
    expect(pruneWouldWipeEverything(stored, remote)).toBe(false);
  });

  it('does not fire on a first sync, when nothing is stored yet', () => {
    expect(pruneWouldWipeEverything([], ['345504'])).toBe(false);
  });

  it('defers to the existing empty-set guard rather than duplicating it', () => {
    expect(pruneWouldWipeEverything(['p1'], [])).toBe(false);
  });

  it('allows a full replacement only when at least one id survives', () => {
    const stored = ['p1', 'p2'];
    expect(pruneWouldWipeEverything(stored, ['p2', 'p9', 'p10'])).toBe(false);
    expect(pruneWouldWipeEverything(stored, ['p9', 'p10'])).toBe(true);
  });
});
