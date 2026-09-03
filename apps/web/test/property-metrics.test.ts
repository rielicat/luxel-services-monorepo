import { describe, it, expect } from 'vitest';
import {
  monthStats,
  type MonthWindow,
} from '../src/app/[locale]/(site)/properties/[id]/detail-client';
import type { LiveDay } from '../src/app/[locale]/(site)/properties/stays-timeline';
import type { Block } from '../src/app/[locale]/(site)/properties/properties-client';

const MONTH: MonthWindow = { from: '2026-09-01', to: '2026-10-01', prevFrom: '2026-08-01' };

const block = (starts_on: string, ends_on: string): Block => ({
  id: `${starts_on}/${ends_on}`,
  starts_on,
  ends_on,
  source: 'import',
  summary: null,
});

const range = (from: string, to: string, over: Partial<LiveDay> = {}): LiveDay[] => {
  const out: LiveDay[] = [];
  let d = from;
  while (d < to) {
    out.push({
      date: d,
      available: false,
      reserved: false,
      priceClp: 100_000,
      minStay: null,
      ...over,
    });
    d = new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  }
  return out;
};

describe('monthStats', () => {
  it('sums the whole running month, not a rolling 30-day window', () => {
    const monthDays = [
      ...range('2026-09-01', '2026-09-11', { reserved: true }),
      ...range('2026-09-11', '2026-10-01', { available: true }),
    ];
    const s = monthStats([], monthDays, MONTH);
    expect(s.revenue).toBe(1_000_000);
    expect(s.occupancy).toBe(33);
    expect(s.adr).toBe(100_000);
  });

  it('counts days already past this month from the mirrored calendar', () => {
    const monthDays = range('2026-09-15', '2026-10-01', { available: true });
    const s = monthStats([block('2026-09-02', '2026-09-07')], monthDays, MONTH);
    expect(s.occupancy).toBe(17);
  });

  it('compares against the previous calendar month, not the previous 30 days', () => {
    const s = monthStats([block('2026-08-01', '2026-08-11')], null, MONTH);
    expect(s.pastOccupancy).toBe(32);
    expect(s.occupancy).toBe(0);
  });

  it('clips a stay that crosses the month boundary to the month itself', () => {
    const s = monthStats([block('2026-08-28', '2026-09-03')], null, MONTH);
    expect(s.occupancy).toBe(7);
    expect(s.pastOccupancy).toBe(13);
  });

  it('reports no revenue and no rate when the live calendar is missing', () => {
    const s = monthStats([block('2026-09-02', '2026-09-07')], null, MONTH);
    expect(s.revenue).toBeNull();
    expect(s.adr).toBeNull();
  });
});
