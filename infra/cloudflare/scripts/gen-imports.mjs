// Generates imports.json ({ pulumiResourceName: cloudflareImportId }) by matching
// the live Cloudflare account against this program's resource-naming convention.
// Run once, then adopt with: LUXEL_CF_ADOPT=1 pulumi up
//
//   CLOUDFLARE_API_TOKEN=... CF_ZONE_ID=... CF_ACCOUNT_ID=... \
//   CF_ZONE_NAME=serviciosluxel.cl \
//     pnpm --filter @luxel/infra-cloudflare import

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { cf, cfAll, ZONE_ID, ACCOUNT_ID } from './cf-api.mjs';

const ZONE_NAME = process.env.CF_ZONE_NAME || 'serviciosluxel.cl';
if (!ZONE_ID) {
  console.error('Missing CF_ZONE_ID.');
  process.exit(1);
}

// Must match slug() in config.ts exactly.
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const imports = {};

const records = await cfAll(`/zones/${ZONE_ID}/dns_records`);
for (const r of records) {
  if (r.type === 'CNAME' && r.name === ZONE_NAME) {
    imports['apex'] = `${ZONE_ID}/${r.id}`;
  } else if (r.type === 'CNAME' && r.name === `www.${ZONE_NAME}`) {
    imports['www'] = `${ZONE_ID}/${r.id}`;
  } else if (r.type === 'TXT' && r.name === `_dmarc.${ZONE_NAME}`) {
    imports['dmarc'] = `${ZONE_ID}/${r.id}`;
  }
}

// Email Routing: settings + catch-all are keyed by zone; rules/addresses by tag/id.
// Do NOT swallow API errors here — a transient failure or missing token scope
// would otherwise produce a PARTIAL imports.json, and a missing key silently
// turns adoption into a CREATE (re-provisioning routing / overwriting the live
// catch-all). Any throw aborts before imports.json is written.
const settings = await cf(`/zones/${ZONE_ID}/email/routing`);
if (settings?.enabled) {
  // settings + catch-all are the two per-zone singletons; both always exist when
  // routing is enabled, and email.ts declares both under the same condition.
  imports['email-settings'] = ZONE_ID;
  imports['catch-all'] = ZONE_ID;

  const rules = await cfAll(`/zones/${ZONE_ID}/email/routing/rules`);
  for (const rule of rules) {
    // Same structural predicate as export-cloudflare.mjs: literal = a real
    // forwarding rule; the "all" matcher is the catch-all, handled above.
    if (rule.matchers?.[0]?.type !== 'literal') continue;
    const address = rule.matchers[0].value;
    if (!address) continue;
    imports[`rule-${slug(address)}`] = `${ZONE_ID}/${rule.tag ?? rule.id}`;
  }

  if (ACCOUNT_ID) {
    const addresses = await cfAll(`/accounts/${ACCOUNT_ID}/email/routing/addresses`);
    for (const a of addresses) {
      imports[`dest-${slug(a.email)}`] = `${ACCOUNT_ID}/${a.tag ?? a.id}`;
    }
  }
} else {
  console.warn(
    'Email Routing reports disabled for this zone — no email-settings/catch-all/rule import ids written.',
  );
}

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'imports.json');
fs.writeFileSync(out, JSON.stringify(imports, null, 2) + '\n');
console.log(`Wrote ${Object.keys(imports).length} import ids → ${out}`);
console.log(JSON.stringify(imports, null, 2));
console.log(
  '\nNext:  LUXEL_CF_ADOPT=1 pulumi up   (adopts these; then `pulumi preview` should show no changes)',
);
