'use server';

import { getDayAvailability } from '@/lib/availability';
import type { Timeblock } from '@luxel/shared';

export interface DayAvailabilityDTO {
  date: string;
  operationPointId: string;
  timeblocks: Array<{
    timeblock: Timeblock;
    capacity: number;
    booked: number;
    available: number;
  }>;
}

export async function fetchAvailabilityAction(
  date: string,
  operationPointId: string,
): Promise<DayAvailabilityDTO> {
  return getDayAvailability(date, operationPointId);
}
