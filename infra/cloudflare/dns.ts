import * as cloudflare from '@pulumi/cloudflare';
import { zoneId, zoneName, vercelTarget, panelTarget, dmarcPolicy } from './config';
import { importId } from './adopt';

// Apex + www → Vercel via CNAME. Cloudflare flattens the apex CNAME to A records
// at the edge, so `dig` shows A records even though the stored record is a CNAME.
// DNS-only (not proxied): Vercel terminates TLS.
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

// DMARC policy record. New (not currently present): created on first apply.
// p=none is monitor-only and never rejects mail; tighten via `dmarcPolicy`.
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

// panel.serviciosluxel.cl → Vercel (admin app). Only created once `panelTarget`
// is set (after the admin Vercel project exists — see infra/vercel).
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

// NOTE: not managed here (owned elsewhere, left untouched):
//   - MX, SPF, DKIM (cf2024-1) — auto-managed by Email Routing.
//   - _vercel TXT verification records — managed by Vercel domain verification.
