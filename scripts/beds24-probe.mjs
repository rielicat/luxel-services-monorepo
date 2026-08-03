#!/usr/bin/env node
/**
 * Read-only reconnaissance against a real Beds24 account.
 *
 * Reports SHAPES, never values: endpoint reachability, field names present,
 * counts, and the credit-limit headers. Nothing it prints identifies a guest or
 * exposes a credential, so its output is safe to paste anywhere.
 *
 *   set -a; source apps/web/.env.local; set +a
 *   node scripts/beds24-probe.mjs
 *
 * What each probe answers, mapped to the requirements in
 * docs/channel-provider-decision.md:
 *   R1 properties      — is there a per-listing host identity to attribute on?
 *   R2 bookings        — arrival/departure/status/confirmation code present?
 *   R3 calendar        — nightly price AND availability readable?
 *   R4 messages read   — does the endpoint exist on THIS plan?
 *   R5 messages send   — checked for reachability only; NOT sent, see below.
 */
const BASE = 'https://beds24.com/api/v2';
const refreshToken = process.env.BEDS24_REFRESH_TOKEN;

if (!refreshToken) {
  console.error('No BEDS24_REFRESH_TOKEN. Run scripts/beds24-setup.mjs first.');
  process.exit(1);
}

const tokenRes = await fetch(`${BASE}/authentication/token`, {
  headers: { refreshToken, accept: 'application/json' },
});
const tokenBody = await tokenRes.json().catch(() => ({}));
if (!tokenRes.ok || !tokenBody?.token) {
  console.error(`Token refresh failed: HTTP ${tokenRes.status}`);
  process.exit(1);
}
const token = tokenBody.token;
console.log(`auth            ok   (access token expires in ${tokenBody.expiresIn ?? '?'}s)\n`);

const shape = (v, depth = 0) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.length ? `[${shape(v[0], depth + 1)}]` : '[]';
  if (typeof v === 'object') {
    if (depth > 1) return '{…}';
    return `{${Object.keys(v).slice(0, 24).join(', ')}}`;
  }
  return typeof v;
};

async function probe(label, path, note = '') {
  const res = await fetch(`${BASE}${path}`, { headers: { token, accept: 'application/json' } });
  const credits = res.headers.get('X-FiveMinCreditLimit-Remaining');
  const cost = res.headers.get('X-RequestCost');
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  const rows = Array.isArray(body?.data) ? body.data : null;
  const status = res.ok ? 'ok  ' : `HTTP ${res.status}`;
  console.log(`${label.padEnd(15)} ${status} ${rows ? `${rows.length} row(s)` : ''} ${note}`);
  if (cost) console.log(`${''.padEnd(16)}cost ${cost}, ${credits ?? '?'} credits left in window`);
  if (rows?.length) console.log(`${''.padEnd(16)}fields ${shape(rows[0])}`);
  if (!res.ok && body?.error)
    console.log(`${''.padEnd(16)}error: ${String(body.error).slice(0, 160)}`);
  return rows;
}

const props = await probe('properties', '/properties?includeAllRooms=true', '(R1)');

const propertyId = props?.[0]?.id;
const roomId = props?.[0]?.roomTypes?.[0]?.id ?? props?.[0]?.rooms?.[0]?.id;

if (!propertyId) {
  console.log(
    '\nNo properties yet. Create one in Beds24 (no Airbnb connection needed) and re-run.',
  );
  process.exit(0);
}

const bookings = await probe(
  'bookings',
  `/bookings?propertyId=${propertyId}&includeGuests=true`,
  '(R2)',
);

const today = new Date().toISOString().slice(0, 10);
const plus30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
if (roomId) {
  await probe(
    'calendar',
    `/inventory/rooms/calendar?roomId=${roomId}&startDate=${today}&endDate=${plus30}` +
      '&includePrices=true&includeNumAvail=true&includeMinStay=true',
    '(R3 — note: includeX flags are REQUIRED or the response is empty)',
  );
} else {
  console.log('calendar        skipped — no roomId on the first property');
}

// R4: the decisive one. A 401/403 here on the discounted plan is the answer to
// the question in docs/beds24-questions.md.
const bookingId = bookings?.[0]?.id;
await probe(
  'messages',
  bookingId ? `/bookings/messages?bookingId=${bookingId}` : '/bookings/messages?maxAge=30',
  '(R4 — 401/403 means the plan excludes guest messaging)',
);

console.log(`
Not attempted by this script:
  R5 send — POST /bookings/messages would put a real message in a real thread.
            Do that manually against a test booking once, and confirm where it lands.
  Airbnb  — connecting Airbnb here DISCONNECTS it from Hospitable. Do not, until cutover.
`);
