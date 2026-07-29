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

## The architecture Luxel uses

**Hosts never touch Hospitable.** All listings live inside Luxel's ONE Hospitable
account (each host's Airbnb connected into it as an additional channel), so
Luxel's single token sees every managed listing and Luxel's own app is the host's
only interface. The single-account token scope above is therefore not a
limitation — it is the premise: one account, many connected channels.

The host-facing flow is:

1. Customer signs in, starts the trial or buys.
2. Luxel shows instructions to connect their Airbnb.
3. Their listings appear in Luxel — imported into the central account and
   attributed to them via `listing_assignments`.
4. They choose which automations to enable.

Tenancy is enforced entirely on Luxel's side: `listing_assignments` maps each
listing to exactly one customer, `scopeToCustomer` filters every central fetch to
that set, and ownership is re-verified on every action.

**The customer never visits the channel vendor.** No host-facing OAuth, no
vendor login or consent screen, no token for them to paste. Luxel's app is the
whole interface.

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
  operator when a host's listings first appear. Candidate fields for automating
  it — `listings[].platform_user_id` ("the id of the user the listing belongs
  to") and `GET /v2/channels` → `user_id` — identify the connected Airbnb
  account, but neither is verified as a reliable per-owner key yet, so an
  operator confirms attribution rather than the code guessing it.
- Webhooks carry **no account identifier** (`id`, `data`, `action`, `triggers`,
  `created`, `version` only). Attribute events by resolving the property or
  reservation uuid against our mirror. Whitelist source range `38.80.170.0/24`.

PriceLabs is different and unchanged: its Customer API is one key per account,
so Luxel's single PriceLabs account with the ownership-scoped resolver in
`lib/pricelabs/link.ts` is correct as built.

## Still unverified — ask `team-platform@hospitable.com`

1. Does the authorize URL accept a `scope` parameter, or are scopes fixed per
   approved client?
2. Is `user` populated in Property webhooks?
3. Does `include=user` work, given the enum omission?
4. Which plan tier includes API access? The help centre says all paid plans; the
   pricing page renders it as Professional and Mogul only.
5. With Luxel as a full-access secondary user, can Luxel initiate the
   PriceLabs↔Hospitable connection from inside the host's account so those
   listings land in **Luxel's** PriceLabs account? This is the one open question
   in the pricing chain.
