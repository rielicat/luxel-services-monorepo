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
- Crew is **Luxel-owned**, not mirrored. `crew_member` (internal or external)
  and `crew_assignment` (member, property, role) are operator-managed in
  `apps/admin` at `/crew`. The sync never touches them. `recipients()` in
  `packages/core/src/crew/index.ts` decides who is notified: assigned crew
  first, the Hospitable teammate mirror only when the assignment reaches
  nobody. Both notifiers call it; neither queries `property_contacts`.
- Cleanings are a Luxel-run operation. The sync pass creates one per imported
  checkout (`suggestCleaningsFromCheckouts`), schedules it
  (`autoConfirmSuggested`), and sends the `cleaning_confirm` template to the
  crew (`lib/cleaning/notify.ts`). Hosts have no cleaning controls and no
  guest inbox. `guest_threads` status `needs_host` means "needs a Luxel
  human". Do not add host-facing crew or inbox surfaces.
- A stay outside Airbnb is operator-created, at `/stays` in `apps/admin`. The
  action blocks the nights in Hospitable first with a calendar `PUT`. It records
  nothing locally until that call succeeds. It then writes a `calendar_blocks`
  row (`source` `import`, `origin` `manual`) and a `checkins` row (`origin`
  `manual`). Both carry the reference `manual:<uuid>` and leave
  `confirmation_code` null. The sync skips them: its revoke pass, its check-in
  delete, its calendar prune and `rekeyCheckinsByConfirmationCode` all filter
  `origin = 'channel'`. The trigger `tg_manual_block_no_overlap` refuses a manual
  block that overlaps another block on that property. It never blocks an imported
  row. Cancelling releases the nights in Hospitable first, then revokes the
  check-in and deletes the block. Our code sends the guest nothing. The operator
  hands over the `/checkin/<token>` link. The host cannot create or cancel one,
  but the stay does show on their calendar as an occupied stay with no revenue.
  Deleting a property that holds a `manual` row is refused: the foreign keys
  cascade, so `deletablePropertyIds` in `lib/channels/manual-stays.ts` guards the
  prune and both listing reassignment paths.
- Lux replies to guests behind a review gate. `properties.ai_reviews` defaults to
  `true`. The pipeline stores the AI reply in `guest_reply_drafts` with status
  `pending` and sends nothing. A Luxel operator reviews it at `/inbox` in `apps/admin`,
  edits it if needed, and approves it. Only then does the message reach the
  guest. An approved text that differs from the draft is stored as `host`, not
  `ai`. `simulateThreadReply` drafts a reply for a thread already on record
  without sending it. `ai_replies` and `ai_reviews` are operator-managed in
  `apps/admin` at `/ai`, one property at a time, over a checkbox selection, or
  over every property at once. There is no
  host-facing switch, and the web inbox only shows the mode. One pending draft
  per thread: a newer guest message supersedes the older draft.
- Plans live in `plan_subscriptions`: `plan` is always `commission`, the only
  plan; `status` is `requested`, `active`, or `cancelled`. The host requests the
  plan (`requestPlan`); a Luxel operator activates it. No billing code, no
  checkout. Do not add one.
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
- Door codes are secret; wifi passwords are not. `accessSecrets` in
  `lib/ai/grounding.ts` feeds only `property_access.keyless_code` to
  `redactSecrets`, so Lux may give a guest the wifi password and never the door
  code. Never log either. The guest receives the door code only through
  Hospitable's T-3 message rule. Never show it on the check-in page or send it
  from our code. The host may write the wifi network and password into the
  property context form; that text reaches Lux.
- Guest documents are encrypted with `LUXEL_PII_KEY`, nulled 90 days after
  departure by the sync pass, and reach conserjes only through the approved
  WhatsApp template.
- Secrets never enter the repo. `.env*` files stay untracked. Operators set
  Vercel vars and `wrangler secret put`.
