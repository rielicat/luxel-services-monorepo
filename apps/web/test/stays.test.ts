import { describe, it, expect } from 'vitest';
import { buildStays, type LiveDay } from '../src/app/[locale]/(site)/properties/stays-timeline';
import type { Block } from '../src/app/[locale]/(site)/properties/properties-client';

const TODAY = '2026-07-28';

const day = (date: string, over: Partial<LiveDay> = {}): LiveDay => ({
  date,
  available: false,
  reserved: true,
  priceClp: 100_000,
  minStay: null,
  ...over,
});

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
    out.push(day(d, over));
    d = new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  }
  return out;
};

describe('buildStays', () => {
  it('splits back-to-back reservations at block boundaries instead of merging runs', () => {
    const liveDays = range('2026-07-28', '2026-08-08');
    const blocks = [block('2026-07-28', '2026-08-01'), block('2026-08-01', '2026-08-08')];
    const stays = buildStays(liveDays, blocks, TODAY);
    expect(stays.map((s) => [s.from, s.to, s.nights])).toEqual([
      ['2026-07-28', '2026-08-01', 4],
      ['2026-08-01', '2026-08-08', 7],
    ]);
  });

  it('never invents revenue for a stay whose past nights are outside the calendar window', () => {
    const liveDays = range('2026-07-28', '2026-08-03');
    const stays = buildStays(liveDays, [block('2026-07-20', '2026-08-03')], TODAY);
    expect(stays).toHaveLength(1);
    expect(stays[0]!.revenueClp).toBeNull();
    expect(stays[0]!.inProgress).toBe(true);
    expect(stays[0]!.nights).toBe(14);
  });

  it('prices a fully covered future stay from the real nightly rates', () => {
    const liveDays = range('2026-07-28', '2026-08-20');
    const stays = buildStays(liveDays, [block('2026-08-01', '2026-08-04')], TODAY);
    const stay = stays.find((s) => s.from === '2026-08-01')!;
    expect(stay.revenueClp).toBe(300_000);
    expect(stay.inProgress).toBe(false);
  });

  it('surfaces reserved days with no synced block as a fallback run', () => {
    const liveDays = [
      ...range('2026-07-28', '2026-08-01'),
      ...range('2026-08-01', '2026-08-04', { reserved: false, available: true }),
      ...range('2026-08-04', '2026-08-06'),
    ];
    const stays = buildStays(liveDays, [block('2026-07-28', '2026-08-01')], TODAY);
    expect(stays.map((s) => [s.from, s.to, s.revenueClp])).toEqual([
      ['2026-07-28', '2026-08-01', 400_000],
      ['2026-08-04', '2026-08-06', 200_000],
    ]);
  });

  it('a checkout today is no longer "en curso"', () => {
    const stays = buildStays(null, [block('2026-07-25', '2026-07-28')], TODAY);
    expect(stays).toHaveLength(1);
    expect(stays[0]!.inProgress).toBe(false);
    expect(stays[0]!.revenueClp).toBeNull();
  });
});
