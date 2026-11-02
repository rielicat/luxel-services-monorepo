export const CLEANING_REMIND_PATH = '/api/cleaning/remind';

export interface CleaningRemindResult {
  ok: boolean;
  date: string;
  due: number;
  reminded: number;
  failed: number;
}
