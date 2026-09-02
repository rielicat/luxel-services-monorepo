import { describe, it, expect } from 'vitest';
import { channelPlugin } from '../src/lib/channels/registry';

describe('channel plugin registry', () => {
  it('resolves Hospitable and returns null for anything unregistered', () => {
    expect(channelPlugin('hospitable')?.id).toBe('hospitable');
    expect(channelPlugin('  Hospitable ')?.id).toBe('hospitable');
    expect(channelPlugin('beds24')).toBeNull();
  });

  it('declares the capabilities that gate real behaviour', () => {
    const p = channelPlugin('hospitable')!;
    expect(p.capabilities.sendsGuestMessages).toBe(true);
    expect(p.capabilities.hasHostIdentity).toBe(true);
    expect(typeof p.autoAssign).toBe('function');
  });
});
