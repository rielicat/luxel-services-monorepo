import * as cloudflare from '@pulumi/cloudflare';
import { zoneId, zoneName, vercelTarget, panelTarget, dmarcPolicy } from './config';
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

export const panelRecord = panelTarget
  ? new cloudflare.DnsRecord(
      'panel',
      {
        zoneId,
        name: `panel.${zoneName}`,
        type: 'CNAME',
        content: panelTarget,
        ttl: 1,
        proxied: false,
        comment: 'Admin panel → Vercel — managed by Pulumi',
      },
      { import: importId('panel') },
    )
  : undefined;
