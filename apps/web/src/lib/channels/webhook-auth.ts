import 'server-only';

/**
 * Who is allowed to post an inbound channel event.
 *
 * There is no shared secret, by design. Hospitable's webhook form offers only
 * Name and URL — no custom header, no signing key — so the only place a secret
 * could go is the query string, and a query string is written to access logs.
 * A credential that is recorded in plaintext on every delivery is not one.
 *
 * The check is the source IP, against Hospitable's published range. On Vercel
 * that is trustworthy: they overwrite `x-forwarded-for` and "do not forward
 * external IPs… to prevent IP spoofing", so a client cannot assert its own
 * address.
 *
 * This is NOT what protects the guest threads. That is the handler refusing to
 * take content from the payload at all — an event names a reservation and the
 * thread is read back from Hospitable with our own credential, so a forged
 * request costs an API call rather than a fabricated conversation. See
 * `ingestThread`. This check bounds abuse and cost; the integrity guarantee
 * lives upstream of it.
 */

/** Hospitable's documented sender range. Overridable because a vendor IP change
 *  would otherwise be a silent outage needing a deploy to fix. */
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

/** IPv4 only. An IPv6 caller simply does not match, which is a rejection rather
 *  than an accidental allow. */
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

/**
 * The caller's address as the platform reports it.
 *
 * `x-vercel-forwarded-for` first: it is identical to `x-forwarded-for` except
 * that a proxy placed in front of Vercel cannot overwrite it. Values are read
 * leftmost-first because Vercel replaces the header outright rather than
 * appending to a client-supplied chain.
 */
export function sourceIp(headers: Headers): string | null {
  const raw =
    headers.get('x-vercel-forwarded-for') ??
    headers.get('x-forwarded-for') ??
    headers.get('x-real-ip');
  const first = raw?.split(',')[0]?.trim();
  return first || null;
}

export type WebhookAuth =
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

  // Local development: with no platform headers there is no address to check
  // against. Anything deployed to Vercel always has one, so this cannot widen
  // production — an identifiable caller from outside the range is still
  // refused below.
  if (!ip) return { ok: true, via: 'open' };

  return { ok: false, via: 'rejected', ip };
}
