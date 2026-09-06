import { zoneName } from './config';
import {
  apexRecord,
  wwwRecord,
  dmarcRecord,
  adminRecord,
  posthogRecord,
  clerkRecords,
} from './dns';
import { settings, rules, catchAll } from './email';
import { cleaningMedia, cleaningMediaLifecycle } from './r2';

export const zone = zoneName;
export const apex = apexRecord.id;
export const www = wwwRecord.id;
export const dmarc = dmarcRecord.id;
export const admin = adminRecord?.id;
export const posthogProxy = posthogRecord?.id;
export const clerkRecordCount = clerkRecords.length;
export const emailSettingsId = settings?.id;
export const emailRuleCount = rules.length;
export const catchAllId = catchAll?.id;
export const cleaningMediaBucketName = cleaningMedia.name;
export const cleaningMediaLifecycleId = cleaningMediaLifecycle.id;
