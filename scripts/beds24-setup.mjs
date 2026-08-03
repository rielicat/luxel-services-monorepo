#!/usr/bin/env node
/**
 * Exchanges a Beds24 invite code for a long-lived refresh token and writes it
 * straight into apps/web/.env.local.
 *
 * RUN THIS YOURSELF, in your own terminal. It never prints the token — the
 * whole point is that neither the credential nor the invite code ends up in a
 * chat transcript or a shell history file shared with anyone.
 *
 *   BEDS24_INVITE_CODE=xxxx node scripts/beds24-setup.mjs
 *
 * Generate the invite code at:
 *   https://beds24.com/control3.php?pagetype=apiv2  →  "generate invite code"
 *
 * Grant exactly these scopes and no more:
 *   properties         read the listings
 *   bookings           reservations and the guest message thread
 *   bookings-personal  guest name/contact on a booking
 *   inventory          nightly calendar, read and write
 *
 * Deliberately NOT granted: bookings-financial (payment data we never use) and
 * accounts (Alpha, and not needed for a single-account trial).
 */
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = resolve(ROOT, 'apps/web/.env.local');
const BASE = 'https://beds24.com/api/v2';

const code = process.env.BEDS24_INVITE_CODE;
if (!code) {
  console.error('Set BEDS24_INVITE_CODE. See the header of this file.');
  process.exit(1);
}

const res = await fetch(`${BASE}/authentication/setup`, {
  headers: { code, accept: 'application/json' },
});
const body = await res.json().catch(() => ({}));

if (!res.ok || !body?.refreshToken) {
  // Print the shape, never the body — an error response can echo the code back.
  console.error(`Setup failed: HTTP ${res.status}. Keys returned: ${Object.keys(body).join(', ')}`);
  console.error('Invite codes are single-use and short-lived — generate a fresh one and retry.');
  process.exit(1);
}

if (existsSync(ENV_PATH) && readFileSync(ENV_PATH, 'utf8').includes('BEDS24_REFRESH_TOKEN=')) {
  console.error('BEDS24_REFRESH_TOKEN already present in apps/web/.env.local — remove it first.');
  process.exit(1);
}

appendFileSync(ENV_PATH, `\nBEDS24_REFRESH_TOKEN=${body.refreshToken}\n`);
console.log('Saved BEDS24_REFRESH_TOKEN to apps/web/.env.local (value not printed).');
console.log(`Access token lifetime reported by Beds24: ${body.expiresIn ?? 'unknown'}s`);
console.log('\nRefresh tokens die after 30 days unused. Exercise it at least monthly.');
