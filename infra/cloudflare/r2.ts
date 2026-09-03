import * as cloudflare from '@pulumi/cloudflare';
import {
  accountId,
  cleaningMediaBucket,
  cleaningMediaLocation,
  cleaningMediaRetentionDays,
} from './config';
import { importId } from './adopt';

const DAY_SECONDS = 24 * 60 * 60;
const WALKTHROUGH_PREFIX = 'walkthrough/';

export const cleaningMedia = new cloudflare.R2Bucket(
  'cleaning-media',
  {
    accountId,
    name: cleaningMediaBucket,
    location: cleaningMediaLocation,
    storageClass: 'Standard',
  },
  { import: importId('cleaning-media') },
);

export const cleaningMediaLifecycle = new cloudflare.R2BucketLifecycle(
  'cleaning-media-lifecycle',
  {
    accountId,
    bucketName: cleaningMediaBucket,
    rules: [
      {
        id: 'expire-walkthroughs',
        enabled: true,
        conditions: { prefix: WALKTHROUGH_PREFIX },
        deleteObjectsTransition: {
          condition: { type: 'Age', maxAge: cleaningMediaRetentionDays * DAY_SECONDS },
        },
        abortMultipartUploadsTransition: { condition: { type: 'Age', maxAge: DAY_SECONDS } },
      },
    ],
  },
  { dependsOn: [cleaningMedia] },
);
