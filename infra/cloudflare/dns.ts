import * as cloudflare from '@pulumi/cloudflare';
import {
  zoneId,
  zoneName,
  vercelTarget,
  adminTarget,
  dmarcPolicy,
  clerkMailHash,
  slug,
} from './config';
import { importId } from './adopt';

export const apexRecord = new cloudflare.DnsRecord(
  'apex',
  {
    zoneId,
    name: zoneName,
    type: 'CNAME',
    content: vercelTarget,
    ttl: 600,
    proxied: false,
    comment: 'Vercel apex (flattened) — managed by Pulumi',
  },
  { import: importId('apex') },
);

export const wwwRecord = new cloudflare.DnsRecord(
  'www',
  {
    zoneId,
    name: `www.${zoneName}`,
    type: 'CNAME',
    content: vercelTarget,
    ttl: 600,
    proxied: false,
    comment: 'Vercel www — managed by Pulumi',
  },
  { import: importId('www') },
);

export const dmarcRecord = new cloudflare.DnsRecord(
  'dmarc',
  {
    zoneId,
    name: `_dmarc.${zoneName}`,
    type: 'TXT',
    content: `v=DMARC1; p=${dmarcPolicy};`,
    ttl: 1,
    comment: 'DMARC policy — managed by Pulumi',
  },
  { import: importId('dmarc') },
);

export const adminRecord = adminTarget
  ? new cloudflare.DnsRecord(
      'admin',
      {
        zoneId,
        name: `admin.${zoneName}`,
        type: 'CNAME',
        content: adminTarget,
        ttl: 1,
        proxied: false,
        comment: 'Operator panel → Vercel — managed by Pulumi',
      },
      { import: importId('admin') },
    )
  : undefined;

const clerkTargets: Record<string, string> = clerkMailHash
  ? {
      clerk: 'frontend-api.clerk.services',
      accounts: 'accounts.clerk.services',
      clkmail: `mail.${clerkMailHash}.clerk.services`,
      'clk._domainkey': `dkim1.${clerkMailHash}.clerk.services`,
      'clk2._domainkey': `dkim2.${clerkMailHash}.clerk.services`,
    }
  : {};

export const clerkRecords = Object.entries(clerkTargets).map(
  ([host, content]) =>
    new cloudflare.DnsRecord(
      `clerk-${slug(host)}`,
      {
        zoneId,
        name: `${host}.${zoneName}`,
        type: 'CNAME',
        content,
        ttl: 1,
        proxied: false,
        comment: 'Clerk production instance — managed by Pulumi',
      },
      { import: importId(`clerk-${slug(host)}`) },
    ),
);
