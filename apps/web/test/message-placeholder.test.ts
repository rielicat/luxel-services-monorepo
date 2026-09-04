import { describe, it, expect } from 'vitest';
import { isPlaceholderMessageId, placeholderMessageId } from '@luxel/core/channels/hospitable';

describe('outbound message identity', () => {
  it('marks an id we minted ourselves, so the mirror can adopt that row', () => {
    expect(isPlaceholderMessageId(placeholderMessageId())).toBe(true);
  });

  it('never mistakes a real Hospitable id for one of ours', () => {
    expect(isPlaceholderMessageId('1273199774')).toBe(false);
    expect(isPlaceholderMessageId(null)).toBe(false);
    expect(isPlaceholderMessageId(undefined)).toBe(false);
    expect(isPlaceholderMessageId('')).toBe(false);
  });
});
