# Data and security rules

Compacted from `AGENTS.md` section "Data and security rules". These are hard
rules. Do not add code paths that break them.

- Properties are an import-only mirror of Hospitable. No manual property
  create or edit path. Do not add one.
- `property_contacts` (conserjes, cleaning crew) is an import-only mirror of
  Hospitable Teammates, rewritten on every sync pass (`mirrorTeammates`).
  Service Cleaning or Laundry maps to role `cleaning`. Concierge, Check-in, or
  Check-out maps to role `concierge`. All services map to both. Owner,
  Manager, or Maintenance map to no row. No host-facing contacts UI. Luxel
  operators manage teammates in Hospitable → Operations → Teammates. Do not
  add a manual contact form.
- Cleanings are a Luxel-run operation. The sync pass creates one per imported
  checkout (`suggestCleaningsFromCheckouts`), schedules it
  (`autoConfirmSuggested`), and sends the `cleaning_confirm` template to the
  crew (`lib/cleaning/notify.ts`). Hosts have no cleaning controls and no
  guest inbox. `guest_threads` status `needs_host` means "needs a Luxel
  human". Do not add host-facing crew or inbox surfaces.
- Plans live in `plan_subscriptions`: `plan` is `fixed`, `hybrid`, or
  `commission`; `status` is `requested`, `active`, or `cancelled`. The host
  requests a plan (`requestPlan`); a Luxel operator activates it. No billing
  code, no checkout. Do not add one.
- Webhook payloads are identifiers only. Every value acted on is fetched back
  from Hospitable with our credential
  (`app/api/channels/[provider]/route.ts`). Webhook auth is Hospitable's
  source-IP range, never a secret in the URL.
- No guest messages from our code. Every guest message is a Hospitable rule
  authored in its dashboard: the booking message with the check-in link on "New
  reservation", the reminder, the check-in details at T-3, the check-out
  message and the review request. Our code only mirrors reservations into
  `checkins` rows, and the `reservation.created` webhook writes the row at once
  so the link never lands before it. There is no cron either; code handles
  events only.
- Door codes and wifi passwords live in Hospitable custom codes and in
  `property_access`; the AI redacts them (`lib/ai/redact.ts`). Never log them.
  The guest receives the door code only through Hospitable's T-3 message
  rule. Never show it on the check-in page or send it from our code.
- Guest documents are encrypted with `LUXEL_PII_KEY`, nulled 90 days after
  departure by the sync pass, and reach conserjes only through the approved
  WhatsApp template.
- Secrets never enter the repo. `.env*` files stay untracked. Operators set
  Vercel vars and `wrangler secret put`.
