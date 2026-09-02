import { describe, it, expect } from 'vitest';
import { longDateEs, stayRangeEs } from '../src/lib/checkin/copy';

describe('check-in date copy', () => {
  it('writes long Chilean dates for the crew and conserje messages', () => {
    expect(longDateEs('2026-06-03')).toBe('03 de junio');
    expect(longDateEs('2026-12-31')).toBe('31 de diciembre');
  });

  it('writes the stay range the conserje template expects', () => {
    expect(stayRangeEs('2026-08-29', '2026-09-02')).toBe('del 29 de agosto al 02 de septiembre');
  });
});
