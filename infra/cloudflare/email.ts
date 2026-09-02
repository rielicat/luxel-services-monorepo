import * as cloudflare from '@pulumi/cloudflare';
import { accountId, zoneId, emailRouting, slug } from './config';
import { importId } from './adopt';

export const settings = emailRouting.enabled
  ? new cloudflare.EmailRoutingSettings(
      'email-settings',
      { zoneId },
      { import: importId('email-settings') },
    )
  : undefined;

export const destinations = emailRouting.destinations.map(
  (email) =>
    new cloudflare.EmailRoutingAddress(
      `dest-${slug(email)}`,
      { accountId, email },
      { import: importId(`dest-${slug(email)}`) },
    ),
);

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
