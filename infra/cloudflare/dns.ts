import * as cloudflare from '@pulumi/cloudflare';
import { zoneId, zoneName, apexIps, wwwTarget, dmarcPolicy } from './config';
import { importId } from './imports';

/** Apex A record name derived from the IP so code and importer agree. */
const apexName = (ip: string) => `apex-a-${ip.replace(/\./g, '-')}`;

// Apex (serviciosluxel.cl) → Vercel. DNS-only: Vercel terminates TLS, so these
// must NOT be proxied. TTL 1 = automatic.
export const apexRecords = apexIps.map(
  (ip) =>
    new cloudflare.DnsRecord(
      apexName(ip),
      {
        zoneId,
        name: zoneName,
        type: 'A',
        content: ip,
        ttl: 1,
        proxied: false,
        comment: 'Vercel apex — managed by Pulumi',
      },
      { import: importId(apexName(ip)) },
    ),
);

// www → Vercel (per-project CNAME target). DNS-only.
export const wwwRecord = new cloudflare.DnsRecord(
  'www',
  {
    zoneId,
    name: `www.${zoneName}`,
    type: 'CNAME',
    content: wwwTarget,
    ttl: 1,
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

// NOTE: MX, SPF and the DKIM (cf2024-1) TXT records are managed automatically by
// Cloudflare Email Routing — intentionally not declared here to avoid conflicts.
