# Multi-tenant channel access — verified constraints

Business model: Luxel manages hosts centrally. A host grants Luxel access to
their own account; Luxel runs the automation; each host sees only their own
properties.

Researched July 2026 against Hospitable's published OpenAPI spec (the document
`developer.hospitable.com` renders) and their help centre.

## The constraint that shapes everything

**A Hospitable API token is scoped to exactly ONE account.**

- Authentication page, verbatim: _"These tokens are scoped to your Hospitable
  account only."_
- `GET /v2/user` → `acting_user` is documented as the secondary user acting
  _"on behalf of the team owner"_; the token resolves to one team owner.
- `GET /v2/properties/search` → _"always return all properties in **the
  account**."_
- No account/team/tenant parameter exists in any of the 49 documented paths.
  There is no `GET /v2/accounts` and no `GET /v2/teams`.

This is a constraint on _accounts_, not on listings. One token does not span
Hospitable accounts — adding Luxel as a manager on a host's OWN account gives
Luxel UI access (one login, account switcher) but not API access to it. The way
to have one token cover many hosts is therefore to have the listings live in ONE
account: Luxel's.

## The architecture Luxel uses — verified supported

All listings live inside Luxel's ONE Hospitable account; each host's Airbnb is
connected into it as an additional channel. Verbatim from their docs: _"You can
connect multiple Airbnb accounts, including co-host accounts, to a single
Hospitable account."_ So the single-account token scope is not a limitation — it
is the premise: one account, many connected channels.

**The host gets no Hospitable account, no login and no dashboard access.** The
mechanism is Hospitable's **"Invite hosts"** flow (Connected accounts → Invite
hosts), which works _"even if you haven't connected your co-hosted listing to
Hospitable, or if you are not a co-host on their listing at all"_. Honest caveat:
the host does click through a Hospitable-hosted authorize page. What is
documented is that they never create an account and the invite _"does not grant
them access to your Hospitable account"_ — not the domain they land on.

Onboarding a host client:

| #   | Who         | Action                                                                                         |
| --- | ----------- | ---------------------------------------------------------------------------------------------- |
| 1   | Customer    | Signs in and requests a plan                                                                   |
| 2   | Luxel staff | Connected accounts → **Invite hosts** → host's full name + email                               |
| 3   | Hospitable  | Emails the host, Luxel cc'd                                                                    |
| 4   | **Host**    | Clicks "Connect my Airbnb account", logs into **Airbnb**, authorises. Done — they never return |
| 5   | Hospitable  | Imports **every** listing on that Airbnb account                                               |
| 6   | Luxel staff | Assigns the managed listings to that customer; mutes any Luxel doesn't manage                  |
| 7   | Customer    | Picks which automations to enable, in Luxel's app                                              |

Two behaviours that shape step 6: connecting **imports all listings** on the
account (there is no selective import — exclude by muting, and _"muted listings
are removed from all Hospitable automations and do not count toward your
billing"_), and an invited account is **locked to the full PMS connection** —
attempting to downgrade it _"will result in an account disconnection"_.

Tenancy is enforced entirely on Luxel's side: `listing_assignments` maps each
listing to exactly one customer, `scopeToCustomer` filters every central fetch to
that set, and ownership is re-verified on every action. Because every listing on a
connected account imports whether or not Luxel manages it, "unassigned means
invisible" is not just defensive — it is the normal state of most imports.

### Host prerequisites (confirm before inviting)

- No other PMS connected to their Airbnb (Airbnb allows one source of truth):
  Airbnb → Account → Privacy & sharing → Services.
- Their Airbnb account isn't already connected to another Hospitable account. One
  Airbnb account maps to one Hospitable account, and listings from it cannot be
  split across two.
- Google/Facebook login → they must set an Airbnb password first.
- Verified email, photo and phone on the Airbnb profile; no holds or pending
  identity verification.

### Plan requirement

Essentials has **no API access**, and Host caps at 2 properties — so Luxel needs
**Professional** ($59 + $15/extra property) or **Mogul** ($99 + $30/extra, which
is what unlocks Owner Statements and Owner Portals). Billing counts _properties_,
not owners: 50 properties on Professional works out around $779/month at
published rates.

**No host-facing OAuth and no token to paste.** After the one-time Airbnb
authorisation, Luxel's app is the host's whole interface.

## The one case that still needs `own` scope

A host who already had their own channel connection keeps it: their stored token
is their own boundary, and everything it returns is theirs. This is legacy
support, not an onboarding path — new customers are always central.

## What this means for the code

- `central` scope is the steady state: Luxel's token, filtered by assignments.
- `own` scope remains supported for a host who already had their own connection.
- `central` scope is NOT an all-tenant key. It is one account's operator token,
  and `listing_assignments` is what prevents its listings being mis-attributed
  to a customer they don't belong to. `hospitableAccess` therefore withholds it
  from customers with no assignments — otherwise the strict mirror would prune
  their whole tree.
- Tenant attribution is OURS to record (`listing_assignments`), set by an
  operator when a host's listings first appear. The automation hint is
  `listings[].platform_user_id` ("the id of the user the listing belongs to",
  via `?include=listings`) matched against `GET /v2/channels` → `user_id`. Both
  fields are documented, but the JOIN between them is **inferred, not stated**,
  and Hospitable merges same-address listings — so one property can carry
  listings with different `platform_user_id`s, i.e. different owners. An operator
  therefore confirms attribution; the code never guesses it.
- Webhooks carry **no account identifier** (`id`, `data`, `action`, `triggers`,
  `created`, `version` only). Attribute events by resolving the property or
  reservation uuid against our mirror. Whitelist source range `38.80.170.0/24`.

PriceLabs is different and unchanged: its Customer API is one key per account,
so Luxel's single PriceLabs account with the ownership-scoped resolver in
`lib/pricelabs/link.ts` is correct as built.

## Still open

**Get in writing from Hospitable sales — it changes the unit economics.** Their
own docs contradict each other on what an "active property" is: the pricing
article says a property with at least one check-in in the billing cycle, while
the billing article says check-in **and** Dynamic Pricing enabled. On a
50-property portfolio that is a materially different bill.

Undocumented — treat silence as unknown, not as permission:

1. Any cap on connected channel accounts per Hospitable account.
2. Whether `listings[].platform_user_id === channels[].user_id` is guaranteed.
   Verify empirically against Luxel's live account before automating attribution.
3. Whether the "Invite hosts" feature is gated to a plan tier.
4. Whether PriceLabs meters or attributes listings differently when they all
   arrive through one shared PMS connection (asked in the partner email).
