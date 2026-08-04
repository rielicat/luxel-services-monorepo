# Channel provider — decision record

Research date: 2026-08-02. Every vendor claim below is from primary documentation.
Figures marked UNVERIFIED need a sales call or a live API key.

## The constraint that outranks vendor choice

Airbnb allows **one** connected PMS or channel manager per Airbnb account, and a
**co-host cannot connect software** — only the listing owner can.

- Hostex: "Each Airbnb account only allows authorizing one PMS."
- Channex: "If there is already another channel manager or PMS connected to
  Airbnb the connection will not complete."
- Hostaway: "Airbnb doesn't allow software to connect to their API via a co-host.
  It can only be connected by the account/listing owner."

Two consequences for the business, independent of which vendor wins:

1. Every host must personally run the connect flow on their own owner account.
   Onboarding cannot be fully automated, and it has a real drop-off point.
2. A host already using another PMS must disconnect it first. The pitch is
   "replace your PMS", not "add a tool".

Hospitable's "invite hosts" flow worked without Luxel being a co-host. That is an
unusual capability, not the norm — which is why the move away from it costs more
than the price difference suggests.

## The seven requirements

| #   | Requirement                                                                   |
| --- | ----------------------------------------------------------------------------- |
| R1  | List listings with identity sufficient to attribute each to one host customer |
| R2  | Reservations with arrival/departure and a stable id                           |
| R3  | Nightly calendar: availability and published price                            |
| R4  | Read the guest message thread                                                 |
| R5  | Send into that thread, delivered to the guest on Airbnb                       |
| R6  | Webhooks preferred, polling acceptable                                        |
| R7  | Central account, or per-host scoped access — never the host's password        |

R5 is the eliminator. Check-in link delivery and AI replies both depend on it.

## Scored

| Vendor        | R5                                                             | ~Cost at 10 listings       | Verdict                                          |
| ------------- | -------------------------------------------------------------- | -------------------------- | ------------------------------------------------ |
| **Beds24**    | yes — `POST /bookings/messages`, per-channel Airbnb mime types | **~EUR 29**                | Best fit, one open question                      |
| **Hostex**    | yes                                                            | ~USD 49–70                 | Viable fallback, two real defects                |
| Hospitable    | yes — running in production today                              | ~USD 30–40                 | The incumbent; works                             |
| Guesty Pro    | yes                                                            | UNVERIFIED, sales-gated    | 13-month term; see below                         |
| Hostaway      | yes — `communicationType: "channel"`                           | USD 250–1,000, sales-gated | Full PMS overlap, no API-only SKU                |
| Uplisting     | reply-only to existing threads                                 | ~USD 1,000 across hosts    | USD 100/mo floor **per host account**            |
| Channex       | yes, paid per-property add-on                                  | ~USD 140 (USD 130 floor)   | Best tenancy model; blocked by ARI certification |
| Airbnb direct | yes, but access blocked                                        | n/a                        | "We are not accepting new access requests"       |

## Why Guesty is the wrong shape here

Technically it works. Commercially it is the most expensive way to lose
flexibility:

- **13-month initial term**, auto-renewing 12 months, 30 days' notice to exit
  (ToS 4.1). Early termination fee = minimum monthly fee x remaining months (4.4).
- Pro pricing is entirely unpublished. A contractual Minimum Monthly Fee (3.3)
  sets a dollar floor regardless of listing count.
- USD 3 minimum per reservation, USD 1/month per listing that books nothing,
  USD 3 per cancellation (3.10–3.12). On a USD 150–250 Santiago stay the "1%" is
  USD 1.50–2.50, so the floor binds — an effective 1.2–2%.
- **No per-listing host identity.** Attribution must be rebuilt on Guesty `Owner`
  objects; there is no `platform_email` equivalent.
- **The host-invite flow is UI-only.** No API. Onboarding stays manual forever.
- Open question for their partnerships team: does reselling a branded product on
  top of Guesty count as sublicensing under §12? Customer terms may not cover it.

## Channex — the near miss, and the condition that would change it

Channex is the best-behaved vendor in the set and still the wrong one, so the
reason matters.

What it gets right, better than anyone else here:

- **Tenancy is solved properly.** The "Copy Link" flow lets a host authorise
  Channex's Airbnb OAuth app themselves, landing the connection in the operator's
  account: "If you have no access to the Airbnb account but need to setup on
  behalf of the host. Copy the link and provide to them." No password handover,
  no co-host requirement.
- Pricing is fully published. No minimum property count, no fixed term, 30 days'
  notice, no setup or certification fee, free staging with no sales call.
- Messaging is confirmed OTA-routed: `POST /api/v1/message_threads/:id/messages`.

Two things disqualify it for this product as it stands.

**1. Certification presumes you are a rate-management PMS.** Production access
requires a live screenshare: "We ask you to perform several actions… ('change
this price to 250 and this min-stay to 3'). We watch the Channex API calls fire
from your real update paths in real time." Pre-flight requires an ARI change
detector — "not a polling loop" — an outbox queue, retry/backoff and a rate
mapping layer. Building a facade to pass is explicitly rejected: a "certification
UI built solely to trigger the test events" fails, because "We read your code
during review."

**2. Connecting makes Luxel the pricing authority.** Once connected, Airbnb
listing prices "are now **not** editable in Airbnb". `GET /api/v1/restrictions`
returns the values _Channex holds and pushes_, not an independent read of what
Airbnb publishes. That removes the published-versus-recommended comparison the
property calendar is built on, because there is no longer a published price the
product did not set.

**The condition that flips this:** if Luxel decides to own pricing end to end —
PriceLabs recommends, Luxel pushes, Channex distributes — the ARI machinery stops
being overhead and becomes the product, certification becomes a milestone rather
than a wall, and USD 130 + ~USD 1/unit is cheap for owning the whole stack. That
is a decision about what business this is, not a vendor comparison.

## Decision (2026-08-03): Hospitable now, Channex at scale

Beds24 was built, verified against a live account, and set aside. The evidence
accumulated in one direction:

- The multi-host surfaces are exactly the immature ones — `/properties` Beta,
  `/accounts` Alpha, `/organizations/users` "Coming soon".
- No per-listing host identity, so attribution becomes a permanent operator step.
- Refresh tokens die after 30 days idle; an idle host connection lapses silently.
- Guest messaging on the discounted plan was never confirmed.
- **No picture write endpoint in API V2 at all**, which also strands the
  video-to-listing feature — its photographs have no API path to the guest.

Channex is the destination once pricing is owned end to end: its Copy Link flow
solves tenancy without password handover, pricing is published with no minimum
and no term, and the ARI certification that disqualified it stops being a wall
the moment Luxel is the one pushing rates.

Hospitable is the short-term answer because it works and the mirror is already
keyed to it. Note its subscription is currently INACTIVE (every endpoint returns
`402 Subscription not active`), and Airbnb permits one PMS per account — so
returning to it means reactivating billing AND disconnecting Beds24 from Airbnb
first.

Nothing built for Beds24 is wasted. The provider contract, the confirmation-code
capture, the disjoint-set prune guard and `relinkByConfirmationCode` are all
provider-agnostic, and the Channex migration reuses the relink verbatim. The
Beds24 adapter stays as a working reference implementation.

## Earlier recommendation (superseded)

**Beds24 primary, Hostex fallback**, pending one test each.

Beds24 is cheapest by a wide margin, sells a channel-management-only plan that
matches what this product actually needs, and its messaging endpoint is confirmed
in the OpenAPI spec rather than inferred. Open questions:

- Does the channel-management-only plan include `/bookings/messages`? The quoted
  plan excludes "Guest Management" and nobody has confirmed what that covers.
  **This decides everything.**
- Refresh tokens expire after 30 days of disuse. Every host connection must be
  exercised monthly or it drops silently — that is a scheduled job to own.
- `/properties` is Beta, `/properties/rooms` and `/organizations/users` are
  "Coming soon", `/accounts` is Alpha. The multi-host surfaces are the least
  mature ones.

Hostex is self-serve and cheap, and its conversations model covers pre-booking
inquiries, which matters for an auto-reply product. Two defects to price in:

- Send is **non-idempotent and returns no message id**; on timeout the vendor
  cannot say whether the guest received it. Their own advice is to retry and
  accept duplicates, so a dedupe layer keyed on content plus a time window is
  mandatory, not optional.
- Their built-in AI writes into the same thread as `HostGPT`. Without suppression
  our AI will reply to theirs.

## What to do before writing migration code

1. Answer the Beds24 "Guest Management" question in writing.
2. Prove R5 live on a trial account: post a message and confirm it lands in a real
   Airbnb thread. Documentation is not proof.
3. Confirm whether a Guesty contract has already been signed. A 13-month term with
   a multiplied early-termination fee changes the decision from "pick the best" to
   "make the one we are committed to work".
4. Only then build the provider abstraction. The interface is worth building
   regardless — see below.

## Verified against a live Beds24 account (2026-08-02)

Imported the real Airbnb listing with `POST /channels/airbnb`,
`action: importAsNewProperty`, **`connect: "none"`** — which brings the listing in
as a Beds24 property WITHOUT making Beds24 authoritative for the live calendar.
The example in their docs uses `connect: "full"`, which would have handed over
availability and rates on a listing actively taking bookings.

| Check                       | Result                                                                   |
| --------------------------- | ------------------------------------------------------------------------ |
| auth                        | ok; access token `expiresIn` 86400s, not the 3600 the spec example shows |
| `/properties`               | 1 row; carries `account`, `currency`, `checkInStart/End`, `checkOutEnd`  |
| `/bookings`                 | 13 rows — the real reservations                                          |
| `/inventory/rooms/calendar` | prices present; `includeX` flags are REQUIRED or the body is empty       |
| `/bookings/messages`        | HTTP 200 (not 403) — reachable on this account                           |

Findings that change the adapter:

- **`apiReference` is the Airbnb confirmation code** (e.g. `HMKK4JSJZB`), with
  `apiSource: "Airbnb"` and `apiSourceId: 46`. Hospitable exposes the same code
  as `code`. This is the cross-provider stay key, so a cutover map can be built
  from an identifier Airbnb owns rather than by matching on dates.
- **`airbnbUserId` (431503103) is the cross-provider HOST key.** Hospitable
  reports the identical value as `platform_user_id`. Attribution should key on
  this, not on `platform_email` — Beds24 exposes no host email at all
  (`airbnbUser` carries only `airbnbUserId`, `firstName`, `picture`).
- **The calendar is range-compressed**: `{from, to, numAvail, minStay, price1}`
  spanning many nights, not one row per night. The adapter must expand ranges.
- **`price1` is whole currency units** (166450 CLP). Hospitable returned cents.
  A copied ÷100 would show prices 100x too low.
- **No guest email addresses** on Airbnb bookings; phone is present. The guest
  thread remains the only dependable way to reach a guest.
- Booking `status` is Beds24's own vocabulary (`new`), not the OTA's — which is
  why `ReservationState` is normalised in the contract rather than passed through.

Still unresolved: with `connect: "none"` there is no live channel link, so no
message threads sync and `/bookings/messages` returns 0 rows. A 200 proves the
endpoint exists on a TRIAL, which is the full product — it does not prove the
Channel Management Only plan includes it. That still needs the written answer in
`beds24-questions.md`.

## The durable lesson

The expensive part of this migration is not the client. It is that
`checkins.reservation_uid` stores `hosp:<id>`, `properties.external_listing_id`
holds Hospitable UUIDs, and `listing_assignments` — the tenant boundary — is keyed
on those UUIDs. Provider identity leaked into the data model.

Whatever wins, the fix is the same: one interface, adapters named for the vendor
they speak to, and provider-neutral keys in the database. The seams renamed in
`a0de257` are the start of that.
