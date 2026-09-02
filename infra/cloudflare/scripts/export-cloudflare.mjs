import { cf, cfAll, ZONE_ID, ACCOUNT_ID } from './cf-api.mjs';

if (!ZONE_ID) {
  console.error('Missing CF_ZONE_ID.');
  process.exit(1);
}

const records = await cfAll(`/zones/${ZONE_ID}/dns_records`);
const rules = await cfAll(`/zones/${ZONE_ID}/email/routing/rules`).catch(() => []);
const catchAll = await cf(`/zones/${ZONE_ID}/email/routing/rules/catch_all`).catch(() => null);
const settings = await cf(`/zones/${ZONE_ID}/email/routing`).catch(() => null);
const addresses = ACCOUNT_ID
  ? await cfAll(`/accounts/${ACCOUNT_ID}/email/routing/addresses`).catch(() => [])
  : [];

const dns = records.map((r) => ({
  id: r.id,
  type: r.type,
  name: r.name,
  content: r.content,
  ttl: r.ttl,
  proxied: r.proxied,
  priority: r.priority,
}));

console.log('# ===== DNS records =====');
console.log(JSON.stringify(dns, null, 2));
console.log('\n# ===== Email Routing settings =====');
console.log(JSON.stringify({ enabled: settings?.enabled, status: settings?.status }, null, 2));
console.log('\n# ===== Email Routing destinations (verified addresses) =====');
console.log(
  JSON.stringify(
    addresses.map((a) => ({ email: a.email, verified: a.verified })),
    null,
    2,
  ),
);
console.log('\n# ===== Email Routing rules =====');
console.log(
  JSON.stringify(
    (rules || [])
      .filter((r) => r.matchers?.[0]?.type === 'literal')
      .map((r) => ({
        address: r.matchers?.[0]?.value,
        forwardTo: r.actions?.[0]?.value?.[0],
        action: r.actions?.[0]?.type,
        enabled: r.enabled,
      })),
    null,
    2,
  ),
);
console.log('\n# ===== Catch-all =====');
console.log(
  JSON.stringify(
    {
      enabled: catchAll?.enabled,
      action: catchAll?.actions?.[0]?.type,
      forwardTo: catchAll?.actions?.[0]?.value,
    },
    null,
    2,
  ),
);
console.log(
  '\n# Copy the rules/destinations/catchAll above into `emailRouting` in Pulumi.prod.yaml,',
);
console.log('# then run `pnpm --filter @luxel/infra-cloudflare import` to generate imports.json.');
