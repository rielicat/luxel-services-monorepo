import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { cf, cfAll, ZONE_ID, ACCOUNT_ID } from './cf-api.mjs';

const ZONE_NAME = process.env.CF_ZONE_NAME || 'serviciosluxel.cl';
if (!ZONE_ID) {
  console.error('Missing CF_ZONE_ID.');
  process.exit(1);
}

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
  } else if (r.type === 'CNAME' && r.name === `t.${ZONE_NAME}`) {
    imports['posthog'] = `${ZONE_ID}/${r.id}`;
  }
}

const settings = await cf(`/zones/${ZONE_ID}/email/routing`);
if (settings?.enabled) {
  imports['email-settings'] = ZONE_ID;
  imports['catch-all'] = ZONE_ID;

  const rules = await cfAll(`/zones/${ZONE_ID}/email/routing/rules`);
  for (const rule of rules) {
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
