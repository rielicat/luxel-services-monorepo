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
- A cleaning **walkthrough video** is Luxel-owned and short-lived. The crew
  records it in the browser; the browser sends it straight to the Cloudflare
  Worker, which puts it in the R2 bucket `luxel-cleaning-media`. It never passes
  through a Next.js route, and no host-facing or public surface may show it.
  `cleaning_walkthrough` holds the object key, the bytes, the duration, who
  recorded it, when, the cleaning, and `retention_until`. RLS is on with no
  policy, so the table is service-role only. The worker chooses the object key
  (`walkthrough/<cleaning id>/<32 hex>.<mp4|webm>`); the caller never names it,
  and there is no list route, so a leaked key reaches one object. The upload and
  read tickets are sealed with AES-GCM, keyed by `CLEANING_MEDIA_KEY` (falling
  back to `INTERNAL_SEND_TOKEN` while it is unset), so a ticket is opaque and the
  object key cannot be read back from a URL, a Workers Log or `wrangler tail`.
  Each names one key and one operation and expires in 15 and 10 minutes. The
  upload leg sends the ticket in the `x-luxel-ticket` header; only the read leg
  keeps it in the URL, because a `<video>` element cannot set a header. The media
  routes accept the media secret alone once it is set. Never log an object key, a ticket or a media URL: the video
  shows the inside of a home. Retention is the worker's nightly cron
  (`purgeExpiredWalkthroughs`), backed by an R2 lifecycle rule in
  `infra/cloudflare`. It is never a Vercel cron.
- The **crew flow** lives on one page, `/cleaning/confirm/[token]`. The confirm
  token stays the only credential and the only key: every server action takes the
  token and derives the cleaning itself, so one crew member never reaches another
  property's stay. After the crew confirms attendance the page shows three steps:
  the checklist (`cleaning_checklist`), the walkthrough video, and the inventory.
  Every step is server state, so a reload lands the crew back where they were. A
  recording that has not been uploaded yet is held in IndexedDB and rehydrated,
  and the page warns before it goes. The link closes three days after the
  cleaning date: past that the page renders nothing but a closed notice, and
  every action and the model route refuse. The page is `noindex`.
- The crew's browser does all the video work. It constrains `getUserMedia` to
  960x540 at 12 fps, caps `MediaRecorder` at 800 kbps and stops at
  `WALKTHROUGH_MAX_SECONDS`, so two minutes lands near 11 MB. Safari defaults to
  10 Mbps, so the bitrate is not optional. The MIME type is negotiated MP4 first
  and `video/x-matroska` is never accepted. Nothing is transcoded, here or on a
  server. The crew sees the size before the upload, and a failed upload retries
  from the same recording.
- The walkthrough **inventory** is a two-table review gate, like the guest reply
  drafts. Gemini writes `cleaning_inventory_draft` (`pending`, `ready`,
  `unavailable`, `failed`) and sends nothing anywhere. Only the crew's
  confirmation writes `cleaning_inventory`, and that row is the record. `source`
  is `ai` only when a `ready` draft exists and the confirmed items match it
  exactly; any correction, and any hand-written list, is `crew`. Confirming is
  what moves `cleanings.status` to `done` — the only writer of that value. The
  baseline the model compares against is the **previous confirmed inventory** for
  that property, never the previous video: it survives the video being purged,
  and the first cleaning of a property simply has no baseline.
- The model is reached from `POST /api/cleaning/inventory`, keyed by the same
  token, claimed with a compare-and-swap on `claimed_at` so two tabs cannot run
  it twice. `store: false` on every call, and the uploaded file is deleted after
  the run. Never log the model's raw description: it describes a home interior.
  Without a Gateway credential the draft is written `unavailable` and the crew fills
  the inventory by hand — no crash, no dead end. The key must come from a
  billing-enabled Google project; see [`DEPLOY.md`](./DEPLOY.md).
- After the crew confirms, a durable review compares the walkthrough against the
  property's previous confirmed inventory. It is asynchronous and never blocks
  the crew. `cleaning_review` is one row per cleaning (`queued`, `running`,
  `done`, `skipped`, `failed`); the Cloudflare Workflow `cleaning-review` drives
  it and owns the backoff. One instance per start, with an id unique to that call
  (`rev-<run id>-<epoch ms>-<random>`), so a retry or the nightly sweep can always
  start a fresh one; a refused start answers 503 and the sweep then runs the
  attempt directly. The instance calls
  `POST /api/cleaning/review` with `INTERNAL_SEND_TOKEN`. Findings merge the exact
  diff of the two confirmed inventories (`compare`) with Gemini re-reading the
  video (`video`), deduped on kind + room + name. A settled run writes nothing, so
  a replay adds nothing. The first cleaning of a property is `skipped` with reason
  `no_baseline` and zero findings; it never invents one. An exhausted run is
  `failed`, keeps the compare findings and is retryable at `/cleanings`. The
  nightly cron re-drives queued runs. Findings reach a Luxel operator over
  `sendWhatsAppViaWorker`, at most once, and never reach the host. Never log a
  finding's text.
- Operators watch all of this at `/cleanings` in `apps/admin`: state per
  property and per cleaning, the video behind a button that mints a read ticket
  on demand, the confirmed inventory, the review state and its findings. It is
  operator-only. The host never sees the crew, the video, the inventory or the
  findings.
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
- Lux is one eve agent at `apps/web/agent/`, mounted by `withEve()`. Two
  surfaces, told apart by the authenticated principal and never by model input:
  `web` and `guest`. Tools, instructions and memory scope follow that principal,
  so the guest surface never reaches a pricing or lead tool.
- eve cannot import a module carrying `import 'server-only'`. That marker is the
  agent/domain boundary. Agent-facing code lives in `packages/core/src/agent/`
  and stays marker-free; marked domain logic is reached over
  `POST /api/agent/tools` with `INTERNAL_SEND_TOKEN`. Never delete a marker to
  make a build pass.
- Route auth also enforces session ownership. `agent/channels/eve.ts` reads the
  session id from the request URL and refuses a caller who does not own the
  `lux_agent_session` row. The browser never creates a session directly;
  `POST /api/agent/session` creates it and claims ownership first.
- Memory has three tiers, all service-role only (RLS on, no policy), all written
  through `sanitizeForMemory` (redacts known door codes, emails, phones). Global
  playbook, per-property facts by hybrid Spanish full-text plus pgvector rank,
  and eve's durable session as the conversation tier. A property with no history
  falls back to global digests and never cites another property as its own.
  Hosts never see any of it.
- The nightly distillation writes the global tier, from the Cloudflare Worker's
  cron via `/api/agent/distill`. Never a Vercel cron: `withEve` writes no
  `crons` key, so an eve schedule never registers.
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
  `lib/agent/store.ts` feeds only `property_access.keyless_code` to
  `redactSecrets`, so Lux may give a guest the wifi password and never the door
  code. Never log either. The guest receives the door code only through
  Hospitable's T-3 message rule. Never show it on the check-in page or send it
  from our code. The host may write the wifi network and password into the
  property context form; that text reaches Lux.
- Guest documents are encrypted with `LUXEL_PII_KEY`, nulled 90 days after
  departure by the sync pass, and reach conserjes only through the approved
  WhatsApp template.
- The guest check-in form is **one screen**. It lists every guest as an editable
  row. The guest fixes any row in place. There are no per-guest steps. A party
  size screen comes first only when the reservation carried no headcount. The
  **party must match**: when `checkins.expected_guests` is set, the number of
  rows equals it, and the guest cannot add or remove a row. When it is null, the
  count the guest chose is the target, and add and remove move the target with
  the list. `submitCheckin` enforces the same rule and answers `party_size`. The
  target for a direct booking is read back from the draft, so a resumed session
  keeps it.
- The check-in form remembers progress on the server. `checkin_draft` holds one
  row per check-in, keyed by `checkin_id`, with a `rev` counter and a jsonb
  payload. RLS is on with no policy, so the table is service-role only.
  `saveCheckinDraft` takes the check-in token and derives the check-in itself. It
  never trusts a client id. The browser saves on blur, on a chip choice, and on
  an add or a remove. It never saves on a keystroke. Every write states the `rev`
  it read, and `writeCheckinDraft` refuses a write that does not match the stored
  `rev`. A stale tab is refused, never applied, so it cannot wipe newer work. The
  page then stops saving, says so, and offers a reload. A refused save is always
  visible; it is never silent. A document number in the draft is encrypted with
  the same `encryptPII` the submitted rows use. The draft never holds a raw
  number. Each guest row carries a client `uid`, so a remembered document follows
  its own row through an add or a remove. On resume `readCheckinDraft` decrypts
  and returns the complete number, so the guest finishes the form rather than
  retyping. That makes the check-in link a reader of the documents in its own
  unsent draft: the owner asked for it, and the privacy policy says so. A number
  that cannot be decrypted comes back empty rather than throwing.
  `submitCheckin` still refuses a masked string, because a tab opened before this
  change can still post one. A successful submit deletes the draft. The draft dies
  with the check-in row by cascade. The page stops reading the draft after the
  departure date, the same window `saveCheckinDraft` applies to the write.
  `purgeExpiredGuestDocuments` clears it 90 days after departure.
- Secrets never enter the repo. `.env*` files stay untracked. Operators set
  Vercel vars and `wrangler secret put`.
