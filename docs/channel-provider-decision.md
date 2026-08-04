# Channel provider — decision record

**Decision (2026-08-04): Hospitable, as the only registered plugin.**

Research date 2026-08-02. Every vendor claim below is from primary
documentation. This file is kept for one reason: if the provider is ever
reconsidered, the constraint and the requirements below are what made the
decision, and they cost a week to establish.

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

Hospitable's "invite hosts" flow works without Luxel being a co-host. That is an
unusual capability, not the norm — which is why moving away from it would cost
more than any price difference suggests.

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

| Vendor         | R5                                   | ~Cost at 10 listings       | Verdict                                                          |
| -------------- | ------------------------------------ | -------------------------- | ---------------------------------------------------------------- |
| **Hospitable** | yes — running in production today    | ~USD 30–40                 | **Chosen.** Only vendor whose host-invite flow needs no co-host  |
| Hostex         | yes                                  | ~USD 49–70                 | Fallback; send is non-idempotent and returns no message id       |
| Beds24         | yes — `POST /bookings/messages`      | ~EUR 29                    | Cheapest, evaluated and rejected — see below                     |
| Guesty Pro     | yes                                  | UNVERIFIED, sales-gated    | 13-month term, unpublished pricing, no per-listing host identity |
| Hostaway       | yes — `communicationType: "channel"` | USD 250–1,000, sales-gated | Full PMS overlap, no API-only SKU                                |
| Uplisting      | reply-only to existing threads       | ~USD 1,000 across hosts    | USD 100/mo floor **per host account**                            |
| Channex        | yes, paid per-property add-on        | ~USD 140 (USD 130 floor)   | Best tenancy model; blocked by ARI certification                 |
| Airbnb direct  | yes, but access blocked              | n/a                        | "We are not accepting new access requests"                       |

## Why Beds24 was built and then dropped

An adapter was written and verified against a live Beds24 account before the
decision reversed. The evidence accumulated in one direction:

- The multi-host surfaces are exactly the immature ones — `/properties` Beta,
  `/accounts` Alpha, `/organizations/users` "Coming soon".
- No per-listing host identity, so attribution becomes a permanent operator step.
- Refresh tokens die after 30 days idle; an idle host connection lapses silently.
- Guest messaging on the discounted Channel-Management-Only plan was never
  confirmed in writing.
- No picture write endpoint in API V2 at all.

Two findings from that work outlived it and are now load-bearing here:

- **The Airbnb confirmation code is the cross-provider stay key.** Hospitable
  exposes it as `code`; every other vendor reports the same value under its own
  name. It belongs to Airbnb, so it survives a change of PMS when no vendor id
  does. The mirror captures it on every sync for exactly this reason.
- **`airbnbUserId` / `platform_user_id` is the cross-provider HOST key**, and a
  better attribution basis than `platform_email` if attribution is ever redone.

## Channex — the destination if pricing is ever owned end to end

What it gets right, better than anyone else evaluated:

- **Tenancy is solved properly.** The "Copy Link" flow lets a host authorise
  Channex's Airbnb OAuth app themselves, landing the connection in the operator's
  account: "If you have no access to the Airbnb account but need to setup on
  behalf of the host. Copy the link and provide to them." No password handover,
  no co-host requirement.
- Pricing is fully published. No minimum property count, no fixed term, 30 days'
  notice, no setup or certification fee.
- Messaging is confirmed OTA-routed: `POST /api/v1/message_threads/:id/messages`.

Two things disqualify it for the product as it stands.

**1. Certification presumes you are a rate-management PMS.** Production access
requires a live screenshare: "We ask you to perform several actions… ('change
this price to 250 and this min-stay to 3'). We watch the Channex API calls fire
from your real update paths in real time." Building a facade to pass is
explicitly rejected — "We read your code during review."

**2. Connecting makes Luxel the pricing authority.** Once connected, Airbnb
listing prices "are now **not** editable in Airbnb", and `GET /api/v1/restrictions`
returns the values _Channex holds and pushes_, not an independent read of what
Airbnb publishes. That removes the published-versus-recommended comparison the
property calendar is built on.

**The condition that flips this:** if Luxel decides to own pricing end to end,
the ARI machinery stops being overhead and becomes the product, and certification
becomes a milestone rather than a wall. That is a decision about what business
this is, not a vendor comparison.

## What migrating actually costs

Not the client. The expensive part is that provider identity leaked into the
data: `checkins.reservation_uid` stores `hosp:<id>`, `properties.external_listing_id`
holds Hospitable ids, and `listing_assignments` — the tenant boundary — is keyed
on those ids.

That is now contained rather than solved, which is the most that can be done
while one provider exists:

- `lib/channels/types.ts` owns the ref codec and the `ChannelPlugin` contract,
  and lists the four edits that add a provider. No prefix is string-concatenated
  at a call site any more.
- `lib/channels/registry.ts` resolves a plugin by id from a static map. An
  unregistered `CHANNEL_PROVIDER` is a 500, never a silent fallback.
- `lib/channels/hospitable-plugin.ts` is the only file tying vendor modules to
  the scheduler. A second provider is a sibling of it.
- `lib/channels/relink.ts` re-keys properties, assignments and check-ins from one
  provider's ids to another's, bridging on the Airbnb confirmation code. It runs
  on every sync that finds a stored listing the account does not have, so it is
  live code rather than a migration script waiting to rot.
- `pruneWouldWipeEverything` is the floor beneath all of it: a remote set sharing
  nothing with the stored set is a provider change, not a list of removals, and
  is never pruned on.
