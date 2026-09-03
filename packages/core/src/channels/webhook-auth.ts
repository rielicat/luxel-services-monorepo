import 'server-only';

const DEFAULT_ALLOWED_CIDRS = '38.80.170.0/24';

function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.trim().split('/');
  if (!base) return false;
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(base);
  if (a === null || b === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) >>> 0 === (b & mask) >>> 0;
}

export function sourceIp(headers: Headers): string | null {
  const raw =
    headers.get('x-vercel-forwarded-for') ??
    headers.get('x-forwarded-for') ??
    headers.get('x-real-ip');
  const first = raw?.split(',')[0]?.trim();
  return first || null;
}

type WebhookAuth =
  | { ok: true; via: 'source_ip' | 'open' }
  | { ok: false; via: 'rejected'; ip: string | null };

export function authorizeWebhook(headers: Headers): WebhookAuth {
  const ip = sourceIp(headers);
  const cidrs = (process.env.HOSPITABLE_WEBHOOK_IPS ?? DEFAULT_ALLOWED_CIDRS)
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (ip && cidrs.some((cidr) => ipInCidr(ip, cidr))) {
    return { ok: true, via: 'source_ip' };
  }

  if (!ip) return { ok: true, via: 'open' };

  return { ok: false, via: 'rejected', ip };
}
