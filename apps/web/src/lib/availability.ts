import 'server-only';
import { createSupabaseServiceRoleClient } from './supabase/server';
import type { Timeblock } from '@luxel/shared';

export interface TimeblockAvailability {
  timeblock: Timeblock;
  capacity: number;
  booked: number;
  available: number;
}

export interface DayAvailability {
  date: string; // ISO yyyy-mm-dd
  operationPointId: string;
  timeblocks: TimeblockAvailability[];
}

const TIMEBLOCKS: Timeblock[] = ['manana', 'tarde'];

/**
 * Compute available timeblocks for a given date and operation point.
 * Capacity = active crews at that operation point.
 * Booked   = bookings on (date, timeblock, op_point) not in cancelled state.
 */
export async function getDayAvailability(
  date: string,
  operationPointId: string,
): Promise<DayAvailability> {
  const supabase = createSupabaseServiceRoleClient();

  const [{ count: crewCount }, { data: bookings }] = await Promise.all([
    supabase
      .from('crews')
      .select('*', { count: 'exact', head: true })
      .eq('operation_point_id', operationPointId)
      .eq('active', true),
    supabase
      .from('bookings')
      .select('timeblock')
      .eq('operation_point_id', operationPointId)
      .eq('scheduled_date', date)
      .neq('status', 'cancelled'),
  ]);

  const capacity = crewCount ?? 0;
  const bookedByBlock: Record<Timeblock, number> = { manana: 0, tarde: 0 };
  for (const b of bookings ?? []) {
    if (b.timeblock === 'manana' || b.timeblock === 'tarde') bookedByBlock[b.timeblock]++;
  }

  return {
    date,
    operationPointId,
    timeblocks: TIMEBLOCKS.map((tb) => ({
      timeblock: tb,
      capacity,
      booked: bookedByBlock[tb],
      available: Math.max(0, capacity - bookedByBlock[tb]),
    })),
  };
}
