import * as cloudflare from '@pulumi/cloudflare';
import { accountId, zoneId, emailRouting, slug } from './config';
import { importId } from './adopt';

// Enabling Email Routing (and its auto-managed MX/SPF/DKIM records). Adopted via
// import — never recreated.
export const settings = emailRouting.enabled
  ? new cloudflare.EmailRoutingSettings(
      'email-settings',
      { zoneId },
      { import: importId('email-settings') },
    )
  : undefined;

// Verified forwarding destinations (account-level). Creating an unverified one
// triggers Cloudflare's verification email.
export const destinations = emailRouting.destinations.map(
  (email) =>
    new cloudflare.EmailRoutingAddress(
      `dest-${slug(email)}`,
      { accountId, email },
      { import: importId(`dest-${slug(email)}`) },
    ),
);

// Per-address forwarding rules: match "to: <address>" → forward to <forwardTo>.
export const rules = emailRouting.rules.map(
  (r) =>
    new cloudflare.EmailRoutingRule(
      `rule-${slug(r.address)}`,
      {
        zoneId,
        name: r.name ?? `Forward ${r.address}`,
        enabled: r.enabled ?? true,
        matchers: [{ type: 'literal', field: 'to', value: r.address }],
        actions: [{ type: 'forward', values: [r.forwardTo] }],
      },
      { import: importId(`rule-${slug(r.address)}`) },
    ),
);

// Catch-all: what happens to every other address at the domain. Gated on the
// same `enabled` flag as `settings` so the resource set and the generated import
// map (which keys catch-all off live routing being enabled) can never diverge.
export const catchAll = emailRouting.enabled
  ? new cloudflare.EmailRoutingCatchAll(
      'catch-all',
      {
        zoneId,
        name: 'Catch-all',
        enabled: emailRouting.catchAll.enabled,
        matchers: [{ type: 'all' }],
        actions:
          emailRouting.catchAll.action === 'forward'
            ? [{ type: 'forward', values: emailRouting.catchAll.forwardTo ?? [] }]
            : [{ type: 'drop' }],
      },
      { import: importId('catch-all') },
    )
  : undefined;
