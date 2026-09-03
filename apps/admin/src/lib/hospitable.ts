import 'server-only';

export {
  listHospitableCalendar,
  setHospitableCalendar,
  type CalendarDay,
  type CalendarWrite,
  type CalendarResult,
} from '@luxel/shared/hospitable-calendar';

export function providerApiKey(): string | null {
  return process.env.PROVIDER_API_KEY ?? process.env.HOSPITABLE_API_TOKEN ?? null;
}
