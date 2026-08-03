/**
 * Re-keying a mirror from one provider's ids to another's is the difference
 * between a migration and a deletion. These pin the two invariants that make it
 * safe: never guess a match, and never let a disjoint remote set look like
 * "everything was removed upstream".
 */
import { describe, it, expect } from 'vitest';
import { pruneWouldWipeEverything } from '../src/lib/channels/relink';

describe('pruneWouldWipeEverything', () => {
  it('flags a provider switch — no overlap between stored and remote', () => {
    // The real case: stored rows carry Hospitable UUIDs, Beds24 returns 345504.
    // Pruning here deletes the property and cascades to access codes, cleaning
    // history and guest check-in records while the sync reports success.
    const stored = ['a6eb2c65-0000-4000-8000-000000000001'];
    const remote = ['345504'];
    expect(pruneWouldWipeEverything(stored, remote)).toBe(true);
  });

  it('allows a normal prune when the sets overlap', () => {
    // One listing genuinely removed upstream, two still present — that IS a
    // prune, and blocking it would leave dead listings on the grid forever.
    const stored = ['p1', 'p2', 'p3'];
    const remote = ['p1', 'p3'];
    expect(pruneWouldWipeEverything(stored, remote)).toBe(false);
  });

  it('does not fire on a first sync, when nothing is stored yet', () => {
    expect(pruneWouldWipeEverything([], ['345504'])).toBe(false);
  });

  it('defers to the existing empty-set guard rather than duplicating it', () => {
    // An empty remote set is already refused upstream; this must not claim it.
    expect(pruneWouldWipeEverything(['p1'], [])).toBe(false);
  });

  it('allows a full replacement only when at least one id survives', () => {
    const stored = ['p1', 'p2'];
    expect(pruneWouldWipeEverything(stored, ['p2', 'p9', 'p10'])).toBe(false);
    expect(pruneWouldWipeEverything(stored, ['p9', 'p10'])).toBe(true);
  });
});
