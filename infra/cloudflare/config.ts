import * as pulumi from '@pulumi/pulumi';

const c = new pulumi.Config();

export interface EmailRule {
  address: string;
  forwardTo: string;
  name?: string;
  enabled?: boolean;
}

export interface CatchAll {
  enabled: boolean;
  action: 'drop' | 'forward';
  forwardTo?: string[];
}

export interface EmailRoutingConfig {
  enabled: boolean;
  destinations: string[];
  rules: EmailRule[];
  catchAll: CatchAll;
}

export const accountId = c.require('accountId');
export const zoneId = c.require('zoneId');
export const zoneName = c.get('zoneName') ?? 'serviciosluxel.cl';
export const vercelTarget = c.require('vercelTarget');
export const adminTarget = c.get('adminTarget') ?? '';
export const dmarcPolicy = c.get('dmarcPolicy') ?? 'none';
export const clerkMailHash = c.get('clerkMailHash') ?? '';
export const posthogProxyTarget = c.get('posthogProxyTarget') ?? '';
export const emailRouting = c.requireObject<EmailRoutingConfig>('emailRouting');
export const cleaningMediaBucket = c.get('cleaningMediaBucket') ?? 'luxel-cleaning-media';
export const cleaningMediaLocation = c.get('cleaningMediaLocation') ?? 'wnam';
export const cleaningMediaRetentionDays = c.getNumber('cleaningMediaRetentionDays') ?? 30;

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
