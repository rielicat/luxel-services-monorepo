import { describe, it, expect } from 'vitest';
import { threadOperationId, threadSessionId } from '@luxel/core/agent/thread-store';

const THREAD = '11111111-2222-3333-4444-555555555555';
const FIRST = 'aaaaaaaa-0000-0000-0000-000000000001';
const SECOND = 'aaaaaaaa-0000-0000-0000-000000000002';

describe('thread ingest keys', () => {
  it('keys a digest to the newest message, so a new reply re-digests the thread', () => {
    expect(threadOperationId(THREAD, FIRST)).not.toBe(threadOperationId(THREAD, SECOND));
  });

  it('keeps one session id per thread, so every digest of it groups together', () => {
    expect(threadSessionId(THREAD)).toBe(`thread:${THREAD}`);
    expect(threadOperationId(THREAD, FIRST).startsWith(threadSessionId(THREAD))).toBe(true);
  });
});
