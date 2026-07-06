import { zoneName } from './config';
import { apexRecords, wwwRecord, dmarcRecord } from './dns';
import { settings, rules, catchAll } from './email';

export const zone = zoneName;
export const apex = apexRecords.map((r) => r.id);
export const www = wwwRecord.id;
export const dmarc = dmarcRecord.id;
export const emailSettingsId = settings?.id;
export const emailRuleCount = rules.length;
export const catchAllId = catchAll?.id;
