import { describe, it, expect } from 'vitest';
import {
  MAX_PARTY,
  SLOT_RE,
  arrivalSlots,
  departureSlots,
  guestSlots,
  nightsBetween,
} from '../src/lib/checkin/slots';

describe('arrivalSlots', () => {
  it('steps 90 minutes from check-in and closes with a late slot', () => {
    expect(arrivalSlots('15:00')).toEqual(['15:00', '16:30', '18:00', '19:30', '21:00', '22:30+']);
  });
  it('defaults to 15:00 and accepts HH:MM:SS', () => {
    expect(arrivalSlots(null)).toEqual(arrivalSlots('15:00'));
    expect(arrivalSlots('garbage')).toEqual(arrivalSlots('15:00'));
    expect(arrivalSlots('16:00:00')).toEqual([
      '16:00',
      '17:30',
      '19:00',
      '20:30',
      '22:00',
      '22:30+',
    ]);
  });
  it('only emits values the server accepts', () => {
    for (const s of [...arrivalSlots('14:00'), ...arrivalSlots('23:00')])
      expect(s).toMatch(SLOT_RE);
    expect(arrivalSlots('23:00')).toEqual(['22:30+']);
  });
});

describe('departureSlots', () => {
  it('ends at check-out stepping back 90 minutes', () => {
    expect(departureSlots('11:00')).toEqual(['06:30', '08:00', '09:30', '11:00']);
    expect(departureSlots(null)).toEqual(departureSlots('11:00'));
    expect(departureSlots('12:00:00')).toEqual(['07:30', '09:00', '10:30', '12:00']);
  });
  it('never goes below 05:00', () => {
    expect(departureSlots('06:00')).toEqual(['06:00']);
    expect(departureSlots('07:30')).toEqual(['06:00', '07:30']);
    for (const s of departureSlots('10:00')) expect(s).toMatch(SLOT_RE);
  });
});

describe('guestSlots', () => {
  it('clamps the expected party between one and the cap', () => {
    expect(guestSlots(null, 6)).toBe(1);
    expect(guestSlots(undefined, 6)).toBe(1);
    expect(guestSlots(0, 6)).toBe(1);
    expect(guestSlots(4, 6)).toBe(4);
    expect(guestSlots(10, 6)).toBe(6);
    expect(guestSlots(3, 0)).toBe(1);
    expect(guestSlots(40, MAX_PARTY)).toBe(MAX_PARTY);
  });
});

describe('nightsBetween', () => {
  it('counts nights from ISO dates', () => {
    expect(nightsBetween('2026-09-06', '2026-09-15')).toBe(9);
    expect(nightsBetween('2026-09-18T00:00:00-04:00', '2026-09-20')).toBe(2);
    expect(nightsBetween('2026-09-06', '2026-09-06')).toBe(0);
    expect(nightsBetween('2026-09-15', '2026-09-06')).toBe(0);
    expect(nightsBetween('nope', '2026-09-06')).toBe(0);
  });
});
