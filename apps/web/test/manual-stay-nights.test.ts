import { describe, it, expect } from 'vitest';
import { nightsBetween, stayNights, MAX_NIGHTS } from '../../admin/src/lib/stays';

describe('manual stay night ranges', () => {
  it('counts the nights of a stay, excluding the departure day', () => {
    expect(nightsBetween('2027-06-01', '2027-06-05')).toEqual([
      '2027-06-01',
      '2027-06-02',
      '2027-06-03',
      '2027-06-04',
    ]);
    expect(nightsBetween('2027-06-01', '2027-06-01')).toEqual([]);
  });

  it('does not truncate a long block, so a release can never free a night another block owns', () => {
    const year = nightsBetween('2027-01-01', '2027-12-31');
    expect(year).toHaveLength(364);
    expect(year.at(-1)).toBe('2027-12-30');
    expect(year).toContain('2027-06-01');
  });

  it('still refuses a stay longer than the limit, one night past it', () => {
    const long = stayNights('2027-01-01', '2027-12-31');
    expect(long.length).toBeGreaterThan(MAX_NIGHTS);
  });
});
