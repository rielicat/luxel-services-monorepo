import { describe, it, expect } from 'vitest';
import { coalesceBurst } from '@luxel/core/channels/burst';

const newestFirst = [
  { id: 'm3', body: 'Está quebrado' },
  { id: 'm2', body: 'Hola, solo informar que el vidrio de la mesa' },
  { id: 'm1', body: '   ' },
];

describe('a burst of guest messages', () => {
  it('reaches the agent as one message, oldest first', () => {
    const burst = coalesceBurst(newestFirst);
    expect(burst.text).toBe('Hola, solo informar que el vidrio de la mesa\nEstá quebrado');
  });

  it('drops an empty message rather than sending a blank line', () => {
    expect(coalesceBurst(newestFirst).ids).toEqual(['m2', 'm3']);
    expect(coalesceBurst([{ id: 'a', body: null }])).toEqual({ ids: [], text: '' });
  });

  it('keys the draft to the newest message of the burst', () => {
    const burst = coalesceBurst(newestFirst);
    expect(burst.ids[burst.ids.length - 1]).toBe('m3');
  });

  it('passes a single message through unchanged', () => {
    expect(coalesceBurst([{ id: 'x', body: 'Hola' }])).toEqual({ ids: ['x'], text: 'Hola' });
  });
});
